import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthRequiredError } from "@/services/api";
import {
  BACKOFF_MS,
  DEFAULT_READ_ALOUD_PREFS,
  createReadAloudController,
  type ReadAloudControllerDeps,
  type ReadAloudHandle,
} from "./controller";
import { toSpeechChunks } from "./speechText";
import type {
  EngineAvailability,
  EngineSnapshot,
  SessionTail,
  SpeakOutcome,
  SpeakRequest,
  SpeechEngine,
  TailBlock,
} from "./types";

class FakeEngine implements SpeechEngine {
  snapshot: EngineSnapshot = { availability: "ok", voices: [] };
  spoken: Array<{ request: SpeakRequest; onDone: (o: SpeakOutcome) => void }> = [];
  cancels = 0;
  primed: string[] = [];
  private listeners = new Set<() => void>();
  probe = vi.fn();
  getSnapshot = () => this.snapshot;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  prime(text: string) {
    this.primed.push(text);
  }
  speak(request: SpeakRequest, onDone: (o: SpeakOutcome) => void) {
    this.spoken.push({ request, onDone });
  }
  cancel() {
    this.cancels++;
  }
  setAvailability(availability: EngineAvailability) {
    this.snapshot = { availability, voices: [] };
    this.listeners.forEach((l) => l());
  }
  get texts() {
    return this.spoken.map((s) => s.request.text);
  }
  /** Finish the latest utterance. */
  end(outcome: SpeakOutcome = { type: "end" }) {
    this.spoken[this.spoken.length - 1]?.onDone(outcome);
  }
}

interface Call {
  path: string;
  from: number | null;
  signal: AbortSignal;
  resolve: (tail: SessionTail) => void;
  reject: (error: unknown) => void;
}

let engine: FakeEngine;
let calls: Call[];
let handle: ReadAloudHandle;

const tail = (nextOffset: number, blocks: TailBlock[] = [], reset = false): SessionTail => ({
  blocks,
  nextOffset,
  fileLen: nextOffset,
  reset,
});
const text = (t: string): TailBlock => ({ kind: "text", text: t });
const lastCall = (): Call => {
  const call = calls[calls.length - 1];
  if (!call) throw new Error("no fetch yet");
  return call;
};
/** Resolve the latest fetch and let its promise callbacks run. */
const respond = async (result: SessionTail) => {
  lastCall().resolve(result);
  await vi.advanceTimersByTimeAsync(0);
};
const fail = async (error: unknown = new Error("network")) => {
  lastCall().reject(error);
  await vi.advanceTimersByTimeAsync(0);
};

const SOURCE = { path: "/home/u/.claude/projects/-p/abc.jsonl", title: "My session" };

/** Started, baseline at 100, poll timer armed. */
const startListening = async () => {
  handle.start(SOURCE);
  await respond(tail(100));
};

const makeHandle = (extra: Partial<ReadAloudControllerDeps> = {}) =>
  createReadAloudController({
    engine,
    fetchTail: (path, from, signal) =>
      new Promise<SessionTail>((resolve, reject) => {
        calls.push({ path, from, signal, resolve, reject });
      }),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    ...extra,
  });

beforeEach(() => {
  vi.useFakeTimers();
  engine = new FakeEngine();
  calls = [];
  handle = makeHandle();
});

afterEach(() => {
  handle.stop();
  vi.useRealTimers();
});

describe("start and baseline", () => {
  it("starts with a baseline fetch and shows 'starting' until it lands", async () => {
    handle.start(SOURCE);
    expect(engine.probe).toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(lastCall().from).toBeNull();
    expect(handle.getSnapshot()).toMatchObject({ status: "starting", sourceTitle: "My session" });

    await respond(tail(100, [text("History that must not be spoken.")]));
    expect(handle.getSnapshot().status).toBe("listening");
    expect(engine.spoken).toHaveLength(0);
  });

  it("polls from the cursor every 300 ms and speaks new blocks in order", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    expect(calls).toHaveLength(2);
    expect(lastCall().from).toBe(100);

    await respond(tail(200, [text("First reply."), text("Second reply.")]));
    expect(engine.texts).toEqual(["First reply."]);
    expect(handle.getSnapshot().status).toBe("speaking");
    engine.end();
    expect(engine.texts).toEqual(["First reply.", "Second reply."]);
    engine.end();
    expect(handle.getSnapshot().status).toBe("listening");

    await vi.advanceTimersByTimeAsync(300);
    expect(lastCall().from).toBe(200);
  });

  it("does not let start() cancel the prime confirmation", () => {
    handle.prime("Read aloud on");
    handle.start(SOURCE);
    expect(engine.primed).toEqual(["Read aloud on"]);
    expect(engine.cancels).toBe(0);
  });

  it("skips thinking blocks when the preference is off", async () => {
    handle.setPrefs({ includeThinking: false });
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(200, [{ kind: "thinking", text: "Hmm, let me see." }, text("Answer.")]));
    expect(engine.texts).toEqual(["Answer."]);
  });

  it("prefixes thinking with the cue when the preference is on", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(200, [{ kind: "thinking", text: "Let me see." }]));
    expect(engine.texts).toEqual(["Thinking: Let me see."]);
  });
});

describe("single flight", () => {
  it("collapses pokes during an in-flight request into exactly one rerun", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    expect(calls).toHaveLength(2);
    handle.poke(SOURCE.path);
    handle.poke(SOURCE.path);
    handle.onVisible();
    expect(calls).toHaveLength(2);

    await respond(tail(100));
    expect(calls).toHaveLength(3);
    await respond(tail(100));
    expect(calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(300);
    expect(calls).toHaveLength(4);
  });

  it("fetches immediately on a matching poke between polls", async () => {
    await startListening();
    handle.poke(SOURCE.path);
    expect(calls).toHaveLength(2);
  });

  it("matches a poke by the trailing <projectDir>/<file>.jsonl and ignores other paths", async () => {
    await startListening();
    handle.poke("/home/u/.claude/projects/-p/other.jsonl");
    handle.poke("/elsewhere/other-project/abc.jsonl");
    expect(calls).toHaveLength(1);
    handle.poke("C:\\Users\\u\\.claude\\projects\\-p\\abc.jsonl");
    expect(calls).toHaveLength(2);
  });

  it("abandons a request that never resolves after 4 s and ignores its late result", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    const hung = lastCall();
    await vi.advanceTimersByTimeAsync(4000);
    expect(hung.signal.aborted).toBe(true);
    expect(handle.getSnapshot().status).toBe("reconnecting");

    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0]);
    expect(calls).toHaveLength(3);
    expect(lastCall().from).toBe(100);

    hung.resolve(tail(500, [text("Late and stale.")]));
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.spoken).toHaveLength(0);

    await respond(tail(150, [text("Fresh.")]));
    expect(engine.texts).toEqual(["Fresh."]);
    expect(handle.getSnapshot().status).toBe("speaking");
  });
});

describe("cursor", () => {
  it("never moves backwards except on reset, and a reset speaks nothing", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(90));
    await vi.advanceTimersByTimeAsync(300);
    expect(lastCall().from).toBe(100);

    await respond(tail(40, [text("Should not be spoken.")], true));
    expect(engine.spoken).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(lastCall().from).toBe(40);
  });
});

describe("stop", () => {
  it("drops a result that lands after stop()", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    const inFlight = lastCall();
    handle.stop();
    expect(inFlight.signal.aborted).toBe(true);
    expect(handle.getSnapshot().status).toBe("off");
    inFlight.resolve(tail(200, [text("Too late.")]));
    await vi.advanceTimersByTimeAsync(1000);
    expect(engine.spoken).toHaveLength(0);
    expect(calls).toHaveLength(2);
  });

  it("cancels speech and clears the queue", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(200, [text("One."), text("Two.")]));
    handle.stop();
    expect(engine.cancels).toBeGreaterThan(0);
    engine.end();
    expect(engine.texts).toEqual(["One."]);
  });

  it("stops on AuthRequiredError", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    await fail(new AuthRequiredError());
    expect(handle.getSnapshot().status).toBe("off");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(2);
  });
});

describe("backoff", () => {
  it("backs off 1/2/5/10/30 s while reconnecting and recovers", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    const delays = [...BACKOFF_MS, 30_000];
    for (const delay of delays) {
      await fail();
      expect(handle.getSnapshot().status).toBe("reconnecting");
      const before = calls.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(calls).toHaveLength(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toHaveLength(before + 1);
    }
    await respond(tail(100));
    expect(handle.getSnapshot().status).toBe("listening");
    await vi.advanceTimersByTimeAsync(300);
    expect(lastCall().from).toBe(100);
  });

  it("ignores pokes while backing off", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    await fail();
    handle.poke(SOURCE.path);
    expect(calls).toHaveLength(2);
  });

  it("retries a failed baseline and shows reconnecting", async () => {
    handle.start(SOURCE);
    await fail();
    expect(handle.getSnapshot().status).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(1000);
    expect(lastCall().from).toBeNull();
  });
});

describe("skip to latest", () => {
  it("keeps only the newest reply without a double advance from a late cancelled callback", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(200, [text("A."), text("B."), text("C.")]));
    expect(engine.texts).toEqual(["A."]);
    expect(handle.getSnapshot().queuedReplies).toBe(2);
    const cancelledA = engine.spoken[0]!;

    handle.skipToLatest();
    expect(handle.getSnapshot().queuedReplies).toBe(0);
    expect(engine.cancels).toBe(1);
    expect(engine.texts).toEqual(["A.", "C."]);

    cancelledA.onDone({ type: "skipped" });
    expect(engine.texts).toEqual(["A.", "C."]);
    engine.end();
    expect(engine.texts).toEqual(["A.", "C."]);
    expect(handle.getSnapshot().status).toBe("listening");
  });

  it("is a no-op when nothing newer is queued", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(200, [text("Only.")]));
    expect(handle.getSnapshot().queuedReplies).toBe(0);
    handle.skipToLatest();
    expect(engine.cancels).toBe(0);
  });
});

describe("source follow", () => {
  it("re-baselines a different path and cancels the old speech and queue", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(200, [text("Old one."), text("Old two.")]));

    handle.setSource({ path: "/home/u/.claude/projects/-p/new.jsonl", title: "New" });
    expect(engine.cancels).toBe(1);
    expect(lastCall()).toMatchObject({ path: "/home/u/.claude/projects/-p/new.jsonl", from: null });
    expect(handle.getSnapshot()).toMatchObject({ status: "starting", sourceTitle: "New" });
    engine.end();
    expect(engine.texts).toEqual(["Old one."]);
  });

  it("drops a response from the previous source", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    const old = lastCall();
    handle.setSource({ path: "/x/-p/new.jsonl", title: "New" });
    old.resolve(tail(300, [text("From the old file.")]));
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.spoken).toHaveLength(0);
  });

  it("treats the same path with a new object as a no-op", async () => {
    await startListening();
    const snap = handle.getSnapshot();
    handle.setSource({ ...SOURCE });
    expect(calls).toHaveLength(1);
    expect(handle.getSnapshot()).toBe(snap);
  });

  it("idles with notClaude for another provider and resumes on a Claude session", async () => {
    await startListening();
    handle.setSource({ path: "/home/u/.codex/sessions/rollout-1.jsonl", title: "Codex", provider: "codex" });
    expect(handle.getSnapshot()).toMatchObject({ status: "idle", idleReason: "notClaude" });
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1);

    handle.setSource({ ...SOURCE, provider: "claude" });
    expect(lastCall().from).toBeNull();
    expect(handle.getSnapshot().status).toBe("starting");
  });

  it("idles with noSource when the selection is cleared", async () => {
    await startListening();
    handle.setSource(null);
    expect(handle.getSnapshot()).toMatchObject({ status: "idle", idleReason: "noSource" });
  });

  it("ignores setSource while off", () => {
    handle.setSource(SOURCE);
    expect(calls).toHaveLength(0);
    expect(handle.getSnapshot().status).toBe("off");
  });
});

describe("rate, language and backlog", () => {
  it("speeds up as the queue grows (speedUp policy)", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    const long = Array.from({ length: 12 }, () => "This sentence pads the queue with some text.").join(" ");
    await respond(tail(200, [text(long), text(long), text(long)]));
    expect(engine.spoken[0]!.request.rate).toBeGreaterThan(1);
    expect(handle.getSnapshot().effectiveRate).toBeGreaterThan(1);
    expect(handle.getSnapshot().queuedSeconds).toBeGreaterThan(20);
  });

  it("keeps the base rate for readAll", async () => {
    handle.setPrefs({ policy: "readAll", baseRate: 1.25 });
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    const long = Array.from({ length: 30 }, () => "Padding sentence for the queue.").join(" ");
    await respond(tail(200, [text(long), text(long)]));
    expect(engine.spoken[0]!.request.rate).toBe(1.25);
  });

  it("counts replies skipped by the policy", async () => {
    handle.setPrefs({ policy: "skipToLatest" });
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    const long = Array.from({ length: 30 }, () => "Padding sentence for the queue.").join(" ");
    await respond(tail(200, [text("Playing."), text(long), text(long)]));
    expect(handle.getSnapshot().skippedCount).toBe(1);
    engine.end();
    expect(engine.texts[1]).toBe("1 reply skipped.");
  });

  it("guesses a language per chunk and gives cue-only chunks the block language", async () => {
    handle.setPrefs({ voiceURI: "auto" });
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(200, [text("Değişiklikleri kaydettim.\n\n```\ncode\n```")]));
    engine.end();
    expect(engine.spoken.map((s) => [s.request.text, s.request.lang, s.request.voiceURI])).toEqual([
      ["Değişiklikleri kaydettim.", "tr", "auto"],
      ["Code.", "tr", "auto"],
    ]);
  });

  it("uses the cues from prefs", async () => {
    handle.setPrefs({ cues: { ...DEFAULT_READ_ALOUD_PREFS.cues, code: "Kod." } });
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(200, [text("```\nx\n```")]));
    expect(engine.texts).toEqual(["Kod."]);
  });

  it("records a real engine error and clears it after a good utterance", async () => {
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(200, [text("One."), text("Two.")]));
    engine.end({ type: "error", code: "synthesis-failed" });
    expect(handle.getSnapshot().engineError).toBe("synthesis-failed");
    engine.end();
    expect(handle.getSnapshot().engineError).toBeUndefined();
  });
});

describe("engine availability", () => {
  it("idles while no local voice exists and resumes when voices appear", async () => {
    engine.snapshot = { availability: "unknown", voices: [] };
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(200, [text("Queued while loading.")]));
    expect(engine.spoken).toHaveLength(0);
    engine.setAvailability("ok");
    expect(engine.texts).toEqual(["Queued while loading."]);

    engine.end();
    engine.setAvailability("noLocalVoice");
    expect(handle.getSnapshot()).toMatchObject({ status: "idle", idleReason: "noLocalVoice" });
  });

  it("exposes the engine snapshot and forwards prime with the voice preference", () => {
    expect(handle.getAvailability()).toBe(engine.snapshot);
    handle.setPrefs({ voiceURI: "yelda" });
    const spy = vi.spyOn(engine, "prime");
    handle.prime("On");
    expect(spy).toHaveBeenCalledWith("On", "yelda");
  });
});

describe("snapshot", () => {
  it("is frozen and referentially stable while nothing changes", async () => {
    const listener = vi.fn();
    handle.subscribe(listener);
    await startListening();
    const snap = handle.getSnapshot();
    expect(Object.isFrozen(snap)).toBe(true);
    listener.mockClear();

    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(100));
    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(100));
    expect(handle.getSnapshot()).toBe(snap);
    expect(listener).not.toHaveBeenCalled();
  });

  it("returns to the shared off snapshot after stop", async () => {
    const off = handle.getSnapshot();
    await startListening();
    handle.stop();
    expect(handle.getSnapshot()).toBe(off);
  });
});

describe("a block that throws", () => {
  it("skips a block whose conversion throws, speaks the rest and keeps polling", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    handle = makeHandle({
      toChunks: (input, options) => {
        if (input === "bad") throw new Error("Infinite loop on byte");
        return toSpeechChunks(input, options);
      },
    });
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(200, [text("bad"), text("Good reply.")]));

    expect(engine.texts).toEqual(["Good reply."]);
    expect(warn).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(calls).toHaveLength(3);
    expect(lastCall().from).toBe(200);
    warn.mockRestore();
  });

  it("does not stay 'speaking' when the engine throws on speak", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const speak = vi.spyOn(engine, "speak").mockImplementationOnce(() => {
      throw new Error("synth gone");
    });
    await startListening();
    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(200, [text("First reply.")]));

    expect(handle.getSnapshot()).toMatchObject({ status: "listening", engineError: "speak-failed" });
    await vi.advanceTimersByTimeAsync(300);
    await respond(tail(300, [text("Next reply.")]));
    expect(speak).toHaveBeenCalledTimes(2);
    expect(engine.texts).toEqual(["Next reply."]);
    warn.mockRestore();
  });
});
