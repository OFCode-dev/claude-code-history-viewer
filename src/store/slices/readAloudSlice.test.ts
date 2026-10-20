import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { create } from "zustand";
import type { StateCreator } from "zustand";

import { createReadAloudSlice, type ReadAloudSlice } from "./readAloudSlice";
import type { FullAppStore } from "./types";

type Creator = StateCreator<FullAppStore, [], [], ReadAloudSlice>;

/** Fresh store per test: the slice reads localStorage in its initializer. */
const makeStore = () =>
  create<ReadAloudSlice>()((set, get, api) =>
    createReadAloudSlice(
      set as unknown as Parameters<Creator>[0],
      get as unknown as Parameters<Creator>[1],
      api as unknown as Parameters<Creator>[2]
    )
  );

describe("readAloudSlice", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with the documented defaults", () => {
    const s = makeStore().getState();

    expect(s.readAloudIncludeThinking).toBe(true);
    expect(s.readAloudBaseRate).toBe(1);
    expect(s.readAloudVoiceURI).toBe("auto");
    expect(s.readAloudPolicy).toBe("speedUp");
    expect(s.readAloudMaxRate).toBe(1.6);
    expect(s.readAloudCatchUpThresholdSec).toBe(20);
    expect(s.readAloudAvailability).toBe("unknown");
  });

  it("persists every preference and reads it back in a fresh store", () => {
    const s = makeStore().getState();
    s.setReadAloudIncludeThinking(false);
    s.setReadAloudBaseRate(1.25);
    s.setReadAloudVoiceURI("com.apple.voice.compact.tr-TR.Yelda");
    s.setReadAloudPolicy("readAll");
    s.setReadAloudMaxRate(2);
    s.setReadAloudCatchUpThresholdSec(40);

    const fresh = makeStore().getState();
    expect(fresh.readAloudIncludeThinking).toBe(false);
    expect(fresh.readAloudBaseRate).toBe(1.25);
    expect(fresh.readAloudVoiceURI).toBe("com.apple.voice.compact.tr-TR.Yelda");
    expect(fresh.readAloudPolicy).toBe("readAll");
    expect(fresh.readAloudMaxRate).toBe(2);
    expect(fresh.readAloudCatchUpThresholdSec).toBe(40);
  });

  it("never persists availability (it is probed per page load)", () => {
    makeStore().getState().setReadAloudAvailability("noLocalVoice");

    expect(makeStore().getState().readAloudAvailability).toBe("unknown");
  });

  it("ignores values outside the offered options", () => {
    const store = makeStore();
    store.getState().setReadAloudBaseRate(3);
    store.getState().setReadAloudMaxRate(1.7);
    store.getState().setReadAloudCatchUpThresholdSec(15);
    store.getState().setReadAloudPolicy("shout" as never);
    store.getState().setReadAloudVoiceURI("");

    const s = store.getState();
    expect(s.readAloudBaseRate).toBe(1);
    expect(s.readAloudMaxRate).toBe(1.6);
    expect(s.readAloudCatchUpThresholdSec).toBe(20);
    expect(s.readAloudPolicy).toBe("speedUp");
    expect(s.readAloudVoiceURI).toBe("auto");
  });

  it("falls back to defaults for corrupt stored values", () => {
    localStorage.setItem("read-aloud-base-rate", "fast");
    localStorage.setItem("read-aloud-max-rate", "9");
    localStorage.setItem("read-aloud-policy", "loud");
    localStorage.setItem("read-aloud-catch-up-threshold-sec", "");
    localStorage.setItem("read-aloud-voice", "");

    const s = makeStore().getState();
    expect(s.readAloudBaseRate).toBe(1);
    expect(s.readAloudMaxRate).toBe(1.6);
    expect(s.readAloudPolicy).toBe("speedUp");
    expect(s.readAloudCatchUpThresholdSec).toBe(20);
    expect(s.readAloudVoiceURI).toBe("auto");
  });

  it("tolerates a throwing localStorage on read and on write", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const store = makeStore();
    expect(store.getState().readAloudIncludeThinking).toBe(true);
    expect(() => store.getState().setReadAloudIncludeThinking(false)).not.toThrow();
    expect(store.getState().readAloudIncludeThinking).toBe(false);
  });
});
