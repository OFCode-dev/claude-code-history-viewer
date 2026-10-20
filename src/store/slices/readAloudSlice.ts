/**
 * Read-aloud preferences (persisted) and engine availability (probed per load).
 *
 * Runtime state (on/off, status, queue) lives in the controller snapshot, not
 * here; `useReadAloud` pushes these preferences into `readAloudHandle`.
 * The mode itself is never persisted: speech needs a user gesture each load.
 */

import type { StateCreator } from "zustand";
import type { FullAppStore } from "./types";
import { readBool, readStr, writeStr } from "../persist";
import type { BacklogPolicy, EngineAvailability } from "@/services/readAloud";

export const READ_ALOUD_BASE_RATES = [1, 1.25, 1.5] as const;
export const READ_ALOUD_MAX_RATES = [1.25, 1.5, 1.6, 2] as const;
export const READ_ALOUD_THRESHOLDS_SEC = [10, 20, 40] as const;
export const READ_ALOUD_POLICIES: readonly BacklogPolicy[] = ["speedUp", "skipToLatest", "readAll"];

export interface ReadAloudSliceState {
  readAloudIncludeThinking: boolean;
  readAloudBaseRate: number;
  /** "auto" or the voiceURI of a local voice. */
  readAloudVoiceURI: string;
  readAloudPolicy: BacklogPolicy;
  readAloudMaxRate: number;
  readAloudCatchUpThresholdSec: number;
  readAloudAvailability: EngineAvailability;
}

export interface ReadAloudSliceActions {
  setReadAloudIncludeThinking: (value: boolean) => void;
  setReadAloudBaseRate: (value: number) => void;
  setReadAloudVoiceURI: (value: string) => void;
  setReadAloudPolicy: (value: BacklogPolicy) => void;
  setReadAloudMaxRate: (value: number) => void;
  setReadAloudCatchUpThresholdSec: (value: number) => void;
  setReadAloudAvailability: (value: EngineAvailability) => void;
}

export type ReadAloudSlice = ReadAloudSliceState & ReadAloudSliceActions;

const KEYS = {
  includeThinking: "read-aloud-include-thinking",
  baseRate: "read-aloud-base-rate",
  voiceURI: "read-aloud-voice",
  policy: "read-aloud-policy",
  maxRate: "read-aloud-max-rate",
  threshold: "read-aloud-catch-up-threshold-sec",
} as const;

/** A stored number counts only when it is one of the offered options. */
function readOption<T extends number>(key: string, options: readonly T[], fallback: T): T {
  const stored = Number(readStr(key, ""));
  return options.find((option) => option === stored) ?? fallback;
}

function readPolicy(): BacklogPolicy {
  const stored = readStr(KEYS.policy, "");
  return READ_ALOUD_POLICIES.find((policy) => policy === stored) ?? "speedUp";
}

const isOption = (options: readonly number[], value: number) => options.includes(value);

export const createReadAloudSlice: StateCreator<
  FullAppStore,
  [],
  [],
  ReadAloudSlice
> = (set) => ({
  readAloudIncludeThinking: readBool(KEYS.includeThinking, true),
  readAloudBaseRate: readOption(KEYS.baseRate, READ_ALOUD_BASE_RATES, 1),
  readAloudVoiceURI: readStr(KEYS.voiceURI, "") || "auto",
  readAloudPolicy: readPolicy(),
  readAloudMaxRate: readOption(KEYS.maxRate, READ_ALOUD_MAX_RATES, 1.6),
  readAloudCatchUpThresholdSec: readOption(KEYS.threshold, READ_ALOUD_THRESHOLDS_SEC, 20),
  readAloudAvailability: "unknown",

  setReadAloudIncludeThinking: (value) => {
    writeStr(KEYS.includeThinking, String(value));
    set({ readAloudIncludeThinking: value });
  },

  setReadAloudBaseRate: (value) => {
    if (!isOption(READ_ALOUD_BASE_RATES, value)) return;
    writeStr(KEYS.baseRate, String(value));
    set({ readAloudBaseRate: value });
  },

  setReadAloudVoiceURI: (value) => {
    if (!value) return;
    writeStr(KEYS.voiceURI, value);
    set({ readAloudVoiceURI: value });
  },

  setReadAloudPolicy: (value) => {
    if (!READ_ALOUD_POLICIES.includes(value)) return;
    writeStr(KEYS.policy, value);
    set({ readAloudPolicy: value });
  },

  setReadAloudMaxRate: (value) => {
    if (!isOption(READ_ALOUD_MAX_RATES, value)) return;
    writeStr(KEYS.maxRate, String(value));
    set({ readAloudMaxRate: value });
  },

  setReadAloudCatchUpThresholdSec: (value) => {
    if (!isOption(READ_ALOUD_THRESHOLDS_SEC, value)) return;
    writeStr(KEYS.threshold, String(value));
    set({ readAloudCatchUpThresholdSec: value });
  },

  setReadAloudAvailability: (value) => set({ readAloudAvailability: value }),
});
