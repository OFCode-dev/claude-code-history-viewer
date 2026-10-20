/**
 * Shared types for read-aloud mode.
 *
 * The wire types mirror the Rust `read_session_tail` command (camelCase JSON).
 */

export type TailBlockKind = "text" | "thinking";

export interface TailBlock {
  kind: TailBlockKind;
  text: string;
}

/** Response of `read_session_tail`. */
export interface SessionTail {
  blocks: TailBlock[];
  /** Byte offset right after the last consumed '\n'; pass it back as `fromOffset`. */
  nextOffset: number;
  fileLen: number;
  /** The cursor was invalid (file truncated or not on a line boundary); this is a fresh baseline. */
  reset: boolean;
}

/** Language codes the voice picker understands (see langGuess.ts). */
export type SpeechLang = "en" | "tr" | "ko" | "ja" | "zh";

/**
 * One utterance worth of text.
 * `body` is the content without cue prefixes and drives the language guess;
 * it is empty for cue-only chunks ("Code.", "3 replies skipped"), which reuse
 * the voice of the surrounding block.
 */
export interface SpeechChunk {
  text: string;
  body: string;
  /** Assigned by the controller before enqueueing. */
  lang?: SpeechLang | null;
}

/** Spoken cues, built by the UI from `t()` in the UI locale. */
export interface SpeechCues {
  code: string;
  table: string;
  thinking: string;
  restSkipped: string;
  skipped: (count: number) => string;
}

export type BacklogPolicy = "speedUp" | "skipToLatest" | "readAll";

export interface ReadAloudPrefs {
  includeThinking: boolean;
  /** 1, 1.25 or 1.5. */
  baseRate: number;
  /** "auto" picks a local voice per chunk from the guessed language. */
  voiceURI: "auto" | (string & {});
  policy: BacklogPolicy;
  /** 1.25, 1.5, 1.6 or 2.0; only used by the speedUp policy. */
  maxRate: number;
  /** 10, 20 or 40 seconds of queued speech before speedUp starts ramping. */
  catchUpThresholdSec: number;
  cues: SpeechCues;
}

export interface ReadAloudSource {
  path: string;
  title: string;
  /** Session provider; undefined means Claude (same convention as the rest of the app). */
  provider?: string;
}

export type ReadAloudStatus = "off" | "starting" | "listening" | "speaking" | "reconnecting" | "idle";

export type ReadAloudIdleReason = "notClaude" | "noSource" | "noApi" | "noLocalVoice";

export interface ReadAloudSnapshot {
  status: ReadAloudStatus;
  idleReason?: ReadAloudIdleReason;
  sourceTitle?: string;
  /** Whole seconds of queued speech at the base rate. */
  queuedSeconds: number;
  /** Replies waiting behind the one playing; "Skip to latest" has an effect only when > 0. */
  queuedReplies: number;
  /** Rate of the utterance in flight, or the base rate when nothing is playing. */
  effectiveRate: number;
  /** Replies dropped by the backlog policy since the source was (re)started. */
  skippedCount: number;
  /** Last real engine error code; cleared when an utterance starts fine. */
  engineError?: string;
}

export type EngineAvailability = "unknown" | "ok" | "noApi" | "noLocalVoice";

export interface LocalVoiceInfo {
  voiceURI: string;
  name: string;
  lang: string;
  isDefault: boolean;
}

export interface EngineSnapshot {
  availability: EngineAvailability;
  /** Local voices only, sorted by language then name. */
  voices: readonly LocalVoiceInfo[];
}

export interface SpeakRequest {
  text: string;
  lang: SpeechLang | null;
  voiceURI: ReadAloudPrefs["voiceURI"];
  rate: number;
}

/**
 * - `end`: spoken to the end.
 * - `skipped`: never started (twice) or wedged; the engine moved on.
 * - `error`: a real synthesis error (`code` carries the browser error).
 */
export type SpeakOutcome = { type: "end" } | { type: "skipped" } | { type: "error"; code: string };

export interface SpeechEngine {
  /** Start detecting voices; idempotent. */
  probe(): void;
  getSnapshot(): EngineSnapshot;
  subscribe(listener: () => void): () => void;
  /** Speak a short confirmation synchronously inside a user gesture (Chrome activation + warm-up). */
  prime(text: string, voiceURI: ReadAloudPrefs["voiceURI"]): void;
  /** One utterance at a time; `onDone` fires once unless `cancel()` comes first. */
  speak(request: SpeakRequest, onDone: (outcome: SpeakOutcome) => void): void;
  cancel(): void;
}
