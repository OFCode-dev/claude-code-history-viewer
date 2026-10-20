/**
 * Web Speech engine for read-aloud, LOCAL voices only (session text never
 * leaves the machine through an online voice).
 *
 * Robustness rules (review verdicts 7–9, 15):
 * - one utterance in flight; no native pre-queueing;
 * - the voice is re-resolved from a fresh getVoices() before every speak, and
 *   utterance.voice + utterance.lang are always set to a local voice;
 * - no onstart within 3 s → cancel and retry once, then skip; started but no
 *   end within est*2+5 s → cancel and skip (a wedged synth); `est` uses the
 *   language's speech rate, so a slow CJK chunk is not cut off mid-sentence;
 * - after cancel(), the next speak() waits 50 ms (Safari/Chrome drop a speak
 *   issued right after cancel);
 * - interrupted/canceled events caused by our own cancel() are not errors.
 * The guarantee is exactly-once enqueue, not exactly-once audio.
 */

import { guessLang, pickVoice } from "./langGuess";
import { CHARS_PER_SECOND, speechChars } from "./backlog";
import type {
  EngineAvailability,
  EngineSnapshot,
  LocalVoiceInfo,
  SpeakOutcome,
  SpeakRequest,
  SpeechEngine,
} from "./types";

export type SynthLike = Pick<
  SpeechSynthesis,
  "getVoices" | "speak" | "cancel" | "resume" | "paused" | "addEventListener"
>;

export interface EngineDeps {
  synth: () => SynthLike | null;
  createUtterance: (text: string) => SpeechSynthesisUtterance;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
  languages: () => readonly string[];
}

const VOICE_POLL_MS = 100;
const VOICE_WAIT_MS = 2000;
const START_TIMEOUT_MS = 3000;
const AFTER_CANCEL_GAP_MS = 50;
const PRIME_RELEASE_MS = 5000;

const browserDeps = (): EngineDeps => ({
  synth: () => (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null),
  createUtterance: (text) => new SpeechSynthesisUtterance(text),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  languages: () =>
    typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language],
});

interface Active {
  utterance: SpeechSynthesisUtterance;
  timer: unknown;
}

interface Pending {
  request: SpeakRequest;
  onDone: (outcome: SpeakOutcome) => void;
  generation: number;
}

export class WebSpeechEngine implements SpeechEngine {
  private readonly deps: EngineDeps;
  private snapshot: EngineSnapshot = Object.freeze({ availability: "unknown", voices: Object.freeze([]) });
  private readonly listeners = new Set<() => void>();
  private probed = false;
  /** Bumped by every speak() and cancel(); callbacks from older generations are ignored. */
  private generation = 0;
  private active: Active | null = null;
  private primeUtterance: SpeechSynthesisUtterance | null = null;
  private pending: Pending | null = null;
  private needsGap = false;

  constructor(deps: EngineDeps = browserDeps()) {
    this.deps = deps;
  }

  getSnapshot = (): EngineSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  probe(): void {
    if (this.probed) return;
    this.probed = true;
    const synth = this.deps.synth();
    if (!synth) {
      this.setSnapshot("noApi", []);
      return;
    }
    // Kept for the page's lifetime: voices can appear late (or come back).
    synth.addEventListener("voiceschanged", () => this.refreshVoices(synth, true));
    if (this.refreshVoices(synth, false)) return;

    let waited = 0;
    const poll = () => {
      if (this.snapshot.availability !== "unknown") return;
      waited += VOICE_POLL_MS;
      if (this.refreshVoices(synth, waited >= VOICE_WAIT_MS)) return;
      if (waited < VOICE_WAIT_MS) this.deps.setTimer(poll, VOICE_POLL_MS);
    };
    this.deps.setTimer(poll, VOICE_POLL_MS);
  }

  prime(text: string, voiceURI: SpeakRequest["voiceURI"]): void {
    this.probe();
    const synth = this.deps.synth();
    if (!synth) return;
    const voice = pickVoice(synth.getVoices(), voiceURI, guessLang(text), this.deps.languages());
    if (!voice) return;
    if (synth.paused) synth.resume();

    const utterance = this.deps.createUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    const release = () => {
      if (this.primeUtterance !== utterance) return;
      this.primeUtterance = null;
      this.flushPending();
    };
    utterance.onend = release;
    utterance.onerror = release;
    this.primeUtterance = utterance;
    this.deps.setTimer(release, PRIME_RELEASE_MS);
    synth.speak(utterance);
  }

  speak(request: SpeakRequest, onDone: (outcome: SpeakOutcome) => void): void {
    if (this.active) this.cancel();
    const pending = { request, onDone, generation: ++this.generation };
    if (this.primeUtterance) {
      this.pending = pending;
      return;
    }
    this.startAfterGap(pending, 1);
  }

  cancel(): void {
    this.generation++;
    this.pending = null;
    this.primeUtterance = null;
    if (this.active) this.deps.clearTimer(this.active.timer);
    this.active = null;
    this.deps.synth()?.cancel();
    this.needsGap = true;
  }

  private setSnapshot(availability: EngineAvailability, voices: LocalVoiceInfo[]): void {
    const prev = this.snapshot;
    const same =
      prev.availability === availability &&
      prev.voices.length === voices.length &&
      prev.voices.every((v, i) => {
        const next = voices[i];
        return next != null && v.voiceURI === next.voiceURI && v.lang === next.lang && v.name === next.name && v.isDefault === next.isDefault;
      });
    if (same) return;
    this.snapshot = Object.freeze({ availability, voices: Object.freeze(voices) });
    this.listeners.forEach((listener) => listener());
  }

  /** Returns true once the voice list is known (non-empty, or `final`). */
  private refreshVoices(synth: SynthLike, final: boolean): boolean {
    const all = synth.getVoices();
    if (all.length === 0 && !final) return false;
    const local = all
      .filter((v) => v.localService)
      .map((v) => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang, isDefault: v.default }))
      .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
    this.setSnapshot(local.length > 0 ? "ok" : "noLocalVoice", local);
    return true;
  }

  private flushPending(): void {
    const pending = this.pending;
    this.pending = null;
    if (pending && pending.generation === this.generation) this.startAfterGap(pending, 1);
  }

  private startAfterGap(pending: Pending, attempt: number): void {
    if (!this.needsGap) {
      this.start(pending, attempt);
      return;
    }
    this.needsGap = false;
    this.deps.setTimer(() => {
      if (pending.generation === this.generation) this.start(pending, attempt);
    }, AFTER_CANCEL_GAP_MS);
  }

  private start(pending: Pending, attempt: number): void {
    const { request, onDone, generation } = pending;
    const synth = this.deps.synth();
    if (!synth) {
      onDone({ type: "error", code: "no-api" });
      return;
    }
    const voice = pickVoice(synth.getVoices(), request.voiceURI, request.lang, this.deps.languages());
    if (!voice) {
      onDone({ type: "error", code: "no-local-voice" });
      return;
    }
    if (synth.paused) synth.resume();

    const utterance = this.deps.createUtterance(request.text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = request.rate;

    const isCurrent = () => this.active?.utterance === utterance && generation === this.generation;
    const finish = (outcome: SpeakOutcome) => {
      if (!isCurrent()) return;
      this.deps.clearTimer(this.active?.timer);
      this.active = null;
      onDone(outcome);
    };
    /** Cancel the stuck utterance without bumping the generation the caller holds. */
    const abandon = () => {
      this.active = null;
      synth.cancel();
      this.needsGap = true;
    };

    const active: Active = {
      utterance,
      timer: this.deps.setTimer(() => {
        if (!isCurrent()) return;
        abandon();
        if (attempt === 1) this.startAfterGap(pending, 2);
        else onDone({ type: "skipped" });
      }, START_TIMEOUT_MS),
    };

    utterance.onstart = () => {
      if (!isCurrent()) return;
      this.deps.clearTimer(active.timer);
      const estimateMs = (speechChars(request.text, request.lang) / (CHARS_PER_SECOND * request.rate)) * 1000;
      active.timer = this.deps.setTimer(() => {
        if (!isCurrent()) return;
        abandon();
        onDone({ type: "skipped" });
      }, estimateMs * 2 + 5000);
    };
    utterance.onend = () => finish({ type: "end" });
    utterance.onerror = (event) => {
      // Not caused by our cancel() (that changes the generation first): someone else
      // interrupted the synth, so move on without flagging an error.
      const interrupted = event.error === "interrupted" || event.error === "canceled";
      finish(interrupted ? { type: "skipped" } : { type: "error", code: event.error });
    };

    this.active = active;
    synth.speak(utterance);
  }
}
