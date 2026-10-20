/**
 * Backlog policy for queued speech (pure).
 *
 * Queued time is estimated as Q = chars / (CHARS_PER_SECOND * baseRate), where
 * chars are weighted by language (see `speechChars`): CJK voices say far fewer
 * characters per second than Latin ones.
 * - speedUp (default): the rate ramps from baseRate at T = catchUpThresholdSec
 *   to maxRate at 3T (hard cap 2.0); only when the queue still exceeds three
 *   minutes at that rate are the oldest whole queued blocks dropped.
 * - skipToLatest: a 60 s budget; the oldest queued blocks are dropped and an
 *   oversized newest block is cut with one "rest skipped" cue.
 * - readAll: never drops, truncates or speeds up.
 *
 * The remainder of the block that is playing is never cut (speedUp still counts
 * it toward Q, skipToLatest's budget leaves it out), the newest block is never
 * dropped, and drops collapse into one pending "N replies skipped" cue spoken
 * before the next kept block.
 */

import type { BacklogPolicy, SpeechChunk, SpeechCues, SpeechLang } from "./types";

/** Rough speech rate of a Latin-script TTS voice at 1x; the unit of every estimate here. */
export const CHARS_PER_SECOND = 15;
/** Rough chars/s at 1x per language: one Han character is a whole syllable. */
const CHARS_PER_SECOND_BY_LANG: Record<SpeechLang, number> = { en: 15, tr: 15, ko: 7, ja: 6, zh: 4 };
const SKIP_TO_LATEST_BUDGET_SEC = 60;
const SPEED_UP_DROP_SEC = 180;
const RATE_CAP = 2;

export interface QueuedBlock {
  /** Chunks not yet handed to the engine. */
  chunks: readonly SpeechChunk[];
}

export interface Backlog {
  /** The block being spoken; its remainder is protected from drops. */
  current: QueuedBlock | null;
  queued: readonly QueuedBlock[];
  /** Replies dropped since the last skip cue was spoken. */
  pendingSkip: number;
}

export interface BacklogOptions {
  policy: BacklogPolicy;
  baseRate: number;
  maxRate: number;
  catchUpThresholdSec: number;
  cues: SpeechCues;
}

export const EMPTY_BACKLOG: Backlog = Object.freeze({ current: null, queued: [], pendingSkip: 0 });

/** `text` in Latin-speech characters, so the same CHARS_PER_SECOND estimate fits every language. */
export function speechChars(text: string, lang: SpeechLang | null | undefined): number {
  return (text.length * CHARS_PER_SECOND) / CHARS_PER_SECOND_BY_LANG[lang ?? "en"];
}

const chunkChars = (chunks: readonly SpeechChunk[]) => chunks.reduce((sum, c) => sum + speechChars(c.text, c.lang), 0);
const blocksChars = (blocks: readonly QueuedBlock[]) => blocks.reduce((sum, b) => sum + chunkChars(b.chunks), 0);

/** Speech characters still waiting to be spoken (the in-flight chunk is not included). */
export function queuedChars(backlog: Backlog): number {
  return (backlog.current ? chunkChars(backlog.current.chunks) : 0) + blocksChars(backlog.queued);
}

export function queuedSeconds(chars: number, baseRate: number): number {
  return chars / (CHARS_PER_SECOND * baseRate);
}

const topRate = (o: Pick<BacklogOptions, "baseRate" | "maxRate">) =>
  Math.min(RATE_CAP, Math.max(o.baseRate, o.maxRate));

/** Rate for the next utterance, given everything still queued (including that utterance). */
export function effectiveRate(chars: number, o: Omit<BacklogOptions, "cues">): number {
  if (o.policy !== "speedUp") return o.baseRate;
  const threshold = o.catchUpThresholdSec;
  const q = queuedSeconds(chars, o.baseRate);
  const ramp = Math.min(1, Math.max(0, (q - threshold) / (2 * threshold)));
  return Math.min(RATE_CAP, o.baseRate + ramp * (topRate(o) - o.baseRate));
}

/** Keep leading chunks within `budget` chars (at least one), then a "rest skipped" cue. */
function truncate(chunks: readonly SpeechChunk[], budget: number, cues: SpeechCues): SpeechChunk[] {
  const kept: SpeechChunk[] = [];
  let used = 0;
  for (const chunk of chunks) {
    const chars = speechChars(chunk.text, chunk.lang);
    if (kept.length > 0 && used + chars > budget) break;
    kept.push(chunk);
    used += chars;
  }
  if (kept.length < chunks.length) kept.push({ text: cues.restSkipped, body: "", lang: chunks[0]?.lang });
  return kept;
}

/** Add one block (the chunks of one assistant content block) and apply the policy. */
export function enqueueBlock(
  backlog: Backlog,
  chunks: readonly SpeechChunk[],
  o: BacklogOptions,
): { backlog: Backlog; dropped: number } {
  if (chunks.length === 0) return { backlog, dropped: 0 };

  let limit = Infinity;
  let newest = chunks;
  // skipToLatest's budget leaves the playing block out; speedUp measures the same Q as effectiveRate.
  let playing = 0;
  if (o.policy === "skipToLatest") {
    limit = SKIP_TO_LATEST_BUDGET_SEC * CHARS_PER_SECOND * o.baseRate;
    if (chunkChars(chunks) > limit) newest = truncate(chunks, limit, o.cues);
  } else if (o.policy === "speedUp") {
    limit = SPEED_UP_DROP_SEC * CHARS_PER_SECOND * topRate(o);
    playing = backlog.current ? chunkChars(backlog.current.chunks) : 0;
  }

  const queued = [...backlog.queued, { chunks: newest }];
  let dropped = 0;
  while (queued.length > 1 && playing + blocksChars(queued) > limit) {
    queued.shift();
    dropped++;
  }
  return {
    backlog: { current: backlog.current, queued, pendingSkip: backlog.pendingSkip + dropped },
    dropped,
  };
}

/**
 * Take the next chunk to speak. Before a new block starts, a pending skip cue
 * comes first, spoken with the language of the block that follows it.
 */
export function dequeue(backlog: Backlog, cues: SpeechCues): { backlog: Backlog; chunk: SpeechChunk | null } {
  const current = backlog.current;
  if (current && current.chunks.length > 0) {
    const [chunk, ...rest] = current.chunks;
    return { backlog: { ...backlog, current: { chunks: rest } }, chunk: chunk ?? null };
  }

  const [next, ...queued] = backlog.queued;
  if (!next) {
    return { backlog: current ? { ...backlog, current: null } : backlog, chunk: null };
  }
  if (backlog.pendingSkip > 0) {
    return {
      backlog: { ...backlog, current: null, pendingSkip: 0 },
      chunk: { text: cues.skipped(backlog.pendingSkip), body: "", lang: next.chunks[0]?.lang },
    };
  }
  const [chunk, ...rest] = next.chunks;
  return { backlog: { current: { chunks: rest }, queued, pendingSkip: 0 }, chunk: chunk ?? null };
}

/** "Skip to latest": keep only the newest queued block. No-op when nothing newer is queued. */
export function catchUp(backlog: Backlog): Backlog {
  const newest = backlog.queued[backlog.queued.length - 1];
  if (!newest) return backlog;
  return { current: null, queued: [newest], pendingSkip: 0 };
}
