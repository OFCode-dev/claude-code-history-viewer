/**
 * Read-aloud controller: polls the open session file's tail and speaks new
 * assistant text. Pure TS (no React/zustand); the UI talks to it through
 * `readAloudHandle` and renders `getSnapshot()` via useSyncExternalStore.
 *
 * Exactly-once ingestion comes from a byte cursor, an epoch and single-flight:
 * - activation = a successful baseline at EOF; anything appended before that
 *   baseline lands is history and is never spoken;
 * - the cursor only advances from a response whose request token AND epoch are
 *   both current, so a failed, timed-out or stale fetch never repeats speech;
 * - the epoch is bumped on start/stop/source change; one request at a time,
 *   with ticks during a request collapsed into a single rerun.
 * Audio is best effort (see engine.ts): exactly-once enqueue, not exactly-once audio.
 */

import { AuthRequiredError } from "@/services/api";
import {
  EMPTY_BACKLOG,
  catchUp,
  dequeue,
  effectiveRate,
  enqueueBlock,
  queuedChars,
  queuedSeconds,
  speechChars,
} from "./backlog";
import { WebSpeechEngine } from "./engine";
import { guessLang } from "./langGuess";
import { toSpeechChunks } from "./speechText";
import { fetchSessionTail } from "./tailApi";
import type {
  EngineSnapshot,
  ReadAloudIdleReason,
  ReadAloudPrefs,
  ReadAloudSnapshot,
  ReadAloudSource,
  ReadAloudStatus,
  SessionTail,
  SpeechChunk,
  SpeechEngine,
} from "./types";

export const POLL_INTERVAL_MS = 300;
export const REQUEST_TIMEOUT_MS = 4000;
export const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000] as const;

export const DEFAULT_READ_ALOUD_PREFS: ReadAloudPrefs = Object.freeze({
  includeThinking: true,
  baseRate: 1,
  voiceURI: "auto",
  policy: "speedUp",
  maxRate: 1.6,
  catchUpThresholdSec: 20,
  // English fallbacks; the UI replaces them with t() strings through setPrefs().
  cues: Object.freeze({
    code: "Code.",
    table: "Table.",
    thinking: "Thinking:",
    restSkipped: "Rest skipped.",
    skipped: (count: number) => (count === 1 ? "1 reply skipped." : `${count} replies skipped.`),
  }),
});

export interface ReadAloudControllerDeps {
  fetchTail: (sessionPath: string, fromOffset: number | null, signal: AbortSignal) => Promise<SessionTail>;
  engine: SpeechEngine;
  toChunks?: typeof toSpeechChunks;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
}

export interface ReadAloudHandle {
  /** Turn the mode on for `source` (call `prime()` first, inside the click handler). */
  start(source: ReadAloudSource): void;
  stop(): void;
  /** Follow the open main session; same path is a no-op, null idles with `noSource`. */
  setSource(source: ReadAloudSource | null): void;
  /** Drop everything but the newest queued reply. No-op when nothing newer is queued. */
  skipToLatest(): void;
  /** File-change hint (WebUI SSE); ignored unless it matches the source. */
  poke(path: string): void;
  /** The tab became visible: fetch now instead of waiting for a throttled timer. */
  onVisible(): void;
  setPrefs(prefs: Partial<ReadAloudPrefs>): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): ReadAloudSnapshot;
  /** Speak a confirmation synchronously inside the enabling user gesture. */
  prime(text: string): void;
  /** Start voice detection (idempotent). */
  probe(): void;
  getAvailability(): EngineSnapshot;
  subscribeAvailability(listener: () => void): () => void;
}

const OFF_SNAPSHOT: ReadAloudSnapshot = Object.freeze({
  status: "off",
  queuedSeconds: 0,
  queuedReplies: 0,
  effectiveRate: DEFAULT_READ_ALOUD_PREFS.baseRate,
  skippedCount: 0,
});

const isClaude = (source: ReadAloudSource) => (source.provider ?? "claude") === "claude";

/** `<projectDir>/<file>.jsonl`, so a poke with a differently rooted path still matches. */
const trailingSessionPath = (path: string) => path.split(/[\\/]/).filter(Boolean).slice(-2).join("/");

function samePath(a: string, b: string): boolean {
  if (a === b) return true;
  const tail = trailingSessionPath(a);
  return tail.endsWith(".jsonl") && tail.includes("/") && tail === trailingSessionPath(b);
}

function sameSnapshot(a: ReadAloudSnapshot, b: ReadAloudSnapshot): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof ReadAloudSnapshot>;
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

/** Per-chunk language; cue-only chunks (and chunks without letters) reuse the block's language. */
function withLanguages(chunks: readonly SpeechChunk[]): SpeechChunk[] {
  const blockLang = guessLang(chunks.map((c) => c.body).join(" "));
  return chunks.map((c) => ({ ...c, lang: (c.body ? guessLang(c.body) : null) ?? blockLang }));
}

type Settled = { tail: SessionTail } | { error: unknown } | { timeout: true };

export function createReadAloudController(deps: ReadAloudControllerDeps): ReadAloudHandle {
  const { engine, setTimer, clearTimer } = deps;
  const toChunks = deps.toChunks ?? toSpeechChunks;
  const listeners = new Set<() => void>();

  let prefs: ReadAloudPrefs = DEFAULT_READ_ALOUD_PREFS;
  let on = false;
  let source: ReadAloudSource | null = null;
  let idleReason: Extract<ReadAloudIdleReason, "notClaude" | "noSource"> | undefined;
  let epoch = 0;
  let cursor: number | null = null;
  let request: { token: number; abort: AbortController; timer: unknown } | null = null;
  let requestSeq = 0;
  let rerun = false;
  let pollTimer: unknown = null;
  let failures = 0;
  let backlog = EMPTY_BACKLOG;
  let speaking: { token: number; rate: number } | null = null;
  let utteranceSeq = 0;
  let skippedCount = 0;
  let engineError: string | undefined;
  let snapshot = OFF_SNAPSHOT;

  const engineIdleReason = (): ReadAloudIdleReason | undefined => {
    const availability = engine.getSnapshot().availability;
    return availability === "noApi" || availability === "noLocalVoice" ? availability : undefined;
  };

  function deriveStatus(): { status: ReadAloudStatus; idleReason?: ReadAloudIdleReason } {
    if (!on) return { status: "off" };
    const reason = idleReason ?? engineIdleReason();
    if (reason) return { status: "idle", idleReason: reason };
    if (speaking) return { status: "speaking" };
    if (failures > 0) return { status: "reconnecting" };
    if (cursor === null) return { status: "starting" };
    return { status: "listening" };
  }

  function emit(): void {
    if (!on) {
      if (snapshot === OFF_SNAPSHOT) return;
      snapshot = OFF_SNAPSHOT;
    } else {
      const next: ReadAloudSnapshot = {
        ...deriveStatus(),
        ...(source ? { sourceTitle: source.title } : {}),
        queuedSeconds: Math.round(queuedSeconds(queuedChars(backlog), prefs.baseRate)),
        queuedReplies: backlog.queued.length,
        effectiveRate: speaking ? Math.round(speaking.rate * 100) / 100 : prefs.baseRate,
        skippedCount,
        ...(engineError ? { engineError } : {}),
      };
      if (sameSnapshot(snapshot, next)) return;
      snapshot = Object.freeze(next);
    }
    listeners.forEach((listener) => listener());
  }

  /** Invalidate the utterance in flight. The engine is left alone when idle so a prime() survives start(). */
  function cancelSpeech(): void {
    utteranceSeq++;
    if (!speaking) return;
    speaking = null;
    engine.cancel();
  }

  /** Forget everything tied to the current source; in-flight results become stale. */
  function resetRun(): void {
    epoch++;
    if (request) {
      clearTimer(request.timer);
      request.abort.abort();
      request = null;
    }
    if (pollTimer != null) clearTimer(pollTimer);
    pollTimer = null;
    rerun = false;
    failures = 0;
    cursor = null;
    backlog = EMPTY_BACKLOG;
    skippedCount = 0;
    engineError = undefined;
    cancelSpeech();
  }

  const canPoll = () => on && source != null && idleReason == null;

  function schedule(ms: number): void {
    if (pollTimer != null) clearTimer(pollTimer);
    pollTimer = setTimer(() => {
      pollTimer = null;
      tick();
    }, ms);
  }

  function tickNow(): void {
    if (pollTimer != null) clearTimer(pollTimer);
    pollTimer = null;
    tick();
  }

  function tick(): void {
    if (!canPoll() || !source) return;
    if (request) {
      rerun = true;
      return;
    }
    const token = ++requestSeq;
    const requestEpoch = epoch;
    const abort = new AbortController();
    const timer = setTimer(() => settle(token, requestEpoch, { timeout: true }), REQUEST_TIMEOUT_MS);
    request = { token, abort, timer };

    let pending: Promise<SessionTail>;
    try {
      pending = deps.fetchTail(source.path, cursor, abort.signal);
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
      (tail) => settle(token, requestEpoch, { tail }),
      (error: unknown) => settle(token, requestEpoch, { error }),
    );
  }

  function settle(token: number, requestEpoch: number, result: Settled): void {
    // Stale: abandoned by the timeout, superseded, or from before a stop/source change.
    if (!on || !request || request.token !== token || epoch !== requestEpoch) return;
    clearTimer(request.timer);
    if ("timeout" in result) request.abort.abort();
    request = null;

    if ("tail" in result) {
      failures = 0;
      ingest(result.tail);
    } else if ("error" in result && result.error instanceof AuthRequiredError) {
      handle.stop();
      return;
    } else {
      failures++;
    }

    if (failures > 0) {
      rerun = false;
      schedule(BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1] ?? POLL_INTERVAL_MS);
    } else if (rerun) {
      rerun = false;
      tick();
    } else {
      schedule(POLL_INTERVAL_MS);
    }
    emit();
  }

  function ingest(tail: SessionTail): void {
    if (cursor === null || tail.reset) {
      // Baseline (first fetch, or the file was truncated/rewritten): never speak history.
      cursor = tail.nextOffset;
      return;
    }
    cursor = Math.max(cursor, tail.nextOffset);
    if (engineIdleReason()) return;

    for (const block of tail.blocks) {
      if (block.kind === "thinking" && !prefs.includeThinking) continue;
      // The cursor has already moved past this batch: one bad block (a markdown
      // lexer throw, say) is skipped instead of ending the poll loop.
      try {
        const chunks = toChunks(block.text, { kind: block.kind, cues: prefs.cues });
        if (chunks.length === 0) continue;
        const result = enqueueBlock(backlog, withLanguages(chunks), prefs);
        backlog = result.backlog;
        skippedCount += result.dropped;
      } catch (error) {
        console.warn("[readAloud] skipped a block that could not be prepared for speech", error);
        continue;
      }
      // Start speaking right away so the first block of a batch is the protected "current" one.
      pump();
    }
  }

  /** Hand the next chunk to the engine; one utterance in flight at a time. */
  function pump(): void {
    if (!on || speaking || idleReason || engine.getSnapshot().availability !== "ok") return;
    const next = dequeue(backlog, prefs.cues);
    backlog = next.backlog;
    const chunk = next.chunk;
    if (!chunk) return;

    // Computed per utterance, right before speak(); a submitted utterance is never changed.
    const rate = effectiveRate(queuedChars(backlog) + speechChars(chunk.text, chunk.lang), prefs);
    const token = ++utteranceSeq;
    const speakEpoch = epoch;
    speaking = { token, rate };
    try {
      engine.speak({ text: chunk.text, lang: chunk.lang ?? null, voiceURI: prefs.voiceURI, rate }, (outcome) => {
        if (token !== utteranceSeq || epoch !== speakEpoch || speaking?.token !== token) return;
        speaking = null;
        if (outcome.type === "error") engineError = outcome.code;
        else if (outcome.type === "end") engineError = undefined;
        pump();
        emit();
      });
    } catch (error) {
      // Lose this chunk rather than sit in "speaking" forever; the next block pumps again.
      console.warn("[readAloud] speech engine threw", error);
      speaking = null;
      engineError = "speak-failed";
    }
  }

  function activate(next: ReadAloudSource): void {
    resetRun();
    source = next;
    idleReason = isClaude(next) ? undefined : "notClaude";
    emit();
    tickNow();
  }

  engine.subscribe(() => {
    pump();
    emit();
  });

  const handle: ReadAloudHandle = {
    start(next) {
      on = true;
      engine.probe();
      activate(next);
    },

    stop() {
      if (!on) return;
      resetRun();
      engine.cancel();
      on = false;
      source = null;
      idleReason = undefined;
      emit();
    },

    setSource(next) {
      if (!on) return;
      if (next == null) {
        resetRun();
        source = null;
        idleReason = "noSource";
        emit();
        return;
      }
      if (source && source.path === next.path) {
        if (source.title !== next.title) {
          source = { ...source, title: next.title };
          emit();
        }
        return;
      }
      activate(next);
    },

    skipToLatest() {
      if (!on) return;
      const next = catchUp(backlog);
      if (next === backlog) return;
      backlog = next;
      if (speaking) cancelSpeech();
      pump();
      emit();
    },

    poke(path) {
      if (!canPoll() || !source || failures > 0 || !samePath(path, source.path)) return;
      tickNow();
    },

    onVisible() {
      if (canPoll()) tickNow();
    },

    setPrefs(next) {
      prefs = { ...prefs, ...next };
      emit();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot: () => snapshot,
    prime: (text) => engine.prime(text, prefs.voiceURI),
    probe: () => engine.probe(),
    getAvailability: () => engine.getSnapshot(),
    subscribeAvailability: (listener) => engine.subscribe(listener),
  };

  return handle;
}

/** App-wide controller instance (nothing touches speechSynthesis until probe/prime/start). */
export const readAloudHandle: ReadAloudHandle = createReadAloudController({
  fetchTail: fetchSessionTail,
  engine: new WebSpeechEngine(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
});
