import { describe, expect, it } from "vitest";
import {
  EMPTY_BACKLOG,
  catchUp,
  dequeue,
  effectiveRate,
  enqueueBlock,
  queuedChars,
  type Backlog,
  type BacklogOptions,
} from "./backlog";
import type { SpeechChunk, SpeechCues } from "./types";

const cues: SpeechCues = {
  code: "Code.",
  table: "Table.",
  thinking: "Thinking:",
  restSkipped: "Rest skipped.",
  skipped: (n) => (n === 1 ? "1 reply skipped." : `${n} replies skipped.`),
};

const opts = (overrides: Partial<BacklogOptions> = {}): BacklogOptions => ({
  policy: "speedUp",
  baseRate: 1,
  maxRate: 1.6,
  catchUpThresholdSec: 20,
  cues,
  ...overrides,
});

/** A block of `n` chunks, each exactly `size` chars, tagged with `tag`. */
const block = (tag: string, n = 1, size = 100): SpeechChunk[] =>
  Array.from({ length: n }, (_, i) => {
    const text = `${tag}${i}`.padEnd(size, ".");
    return { text, body: text, lang: "en" as const };
  });

const enqueueAll = (blocks: SpeechChunk[][], o: BacklogOptions, start: Backlog = EMPTY_BACKLOG) => {
  let backlog = start;
  let dropped = 0;
  for (const chunks of blocks) {
    const result = enqueueBlock(backlog, chunks, o);
    backlog = result.backlog;
    dropped += result.dropped;
  }
  return { backlog, dropped };
};

const drain = (start: Backlog): string[] => {
  const out: string[] = [];
  let backlog = start;
  for (;;) {
    const next = dequeue(backlog, cues);
    backlog = next.backlog;
    if (!next.chunk) return out;
    out.push(next.chunk.text.replace(/\.+$/, ""));
  }
};

describe("enqueue + dequeue", () => {
  it("keeps order within the budget", () => {
    const { backlog, dropped } = enqueueAll([block("a", 2), block("b"), block("c")], opts());
    expect(dropped).toBe(0);
    expect(drain(backlog)).toEqual(["a0", "a1", "b0", "c0"]);
  });

  it("ignores empty blocks", () => {
    expect(enqueueBlock(EMPTY_BACKLOG, [], opts()).backlog).toBe(EMPTY_BACKLOG);
  });
});

describe("skipToLatest policy (60 s budget)", () => {
  const o = opts({ policy: "skipToLatest" });

  it("drops the oldest queued blocks and keeps the newest", () => {
    // budget = 900 chars at 1x; three 500-char blocks
    const { backlog, dropped } = enqueueAll([block("a", 5), block("b", 5), block("c", 5)], o);
    expect(dropped).toBe(2);
    expect(backlog.pendingSkip).toBe(2);
    expect(drain(backlog)).toEqual(["2 replies skipped", "c0", "c1", "c2", "c3", "c4"]);
  });

  it("protects the remainder of the block currently playing", () => {
    let backlog = enqueueAll([block("a", 5)], o).backlog;
    backlog = dequeue(backlog, cues).backlog; // a0 is playing
    backlog = enqueueAll([block("b", 6), block("c", 6)], o, backlog).backlog;
    expect(drain(backlog)).toEqual(["a1", "a2", "a3", "a4", "1 reply skipped", "c0", "c1", "c2", "c3", "c4", "c5"]);
  });

  it("truncates an oversized newest block with one rest-skipped cue", () => {
    const { backlog } = enqueueAll([block("x", 130)], o); // 13,000 chars
    const spoken = drain(backlog);
    expect(spoken).toHaveLength(10);
    expect(spoken.at(-1)).toBe("Rest skipped");
  });

  it("scales the budget with the base rate", () => {
    const { dropped } = enqueueAll([block("a", 6), block("b", 6)], opts({ policy: "skipToLatest", baseRate: 1.5 }));
    expect(dropped).toBe(0);
  });

  it("collapses many drop events into one pending cue", () => {
    let backlog = enqueueAll([block("a", 3)], o).backlog;
    backlog = dequeue(backlog, cues).backlog; // a is playing
    for (let i = 0; i < 11; i++) backlog = enqueueBlock(backlog, block(`n${i}-`, 9), o).backlog;
    expect(backlog.pendingSkip).toBe(10);
    expect(drain(backlog).filter((t) => t.includes("skipped"))).toEqual(["10 replies skipped"]);
  });

  it("gives the skip cue the voice language of the next block", () => {
    let backlog = enqueueAll([block("a", 9), block("b", 9)], o).backlog;
    backlog = enqueueBlock(backlog, [{ text: "merhaba", body: "merhaba", lang: "tr" }], o).backlog;
    const first = dequeue(backlog, cues).chunk;
    expect(first).toEqual({ text: "2 replies skipped.", body: "", lang: "tr" });
  });
});

describe("speedUp policy", () => {
  it("does not drop below three minutes at the max rate", () => {
    // 180 s * 15 chars * 1.6 = 4,320 chars
    const { dropped } = enqueueAll(Array.from({ length: 4 }, (_, i) => block(`b${i}`, 10)), opts());
    expect(dropped).toBe(0);
  });

  it("drops the oldest whole blocks once over three minutes at the max rate", () => {
    const { backlog, dropped } = enqueueAll(
      Array.from({ length: 6 }, (_, i) => block(`b${i}-`, 10)),
      opts(),
    );
    expect(dropped).toBe(2);
    expect(queuedChars(backlog)).toBe(4000);
  });

  it("never drops the newest block, even when it alone is over the limit", () => {
    const { backlog, dropped } = enqueueAll([block("a"), block("huge", 60)], opts());
    expect(dropped).toBe(1);
    expect(queuedChars(backlog)).toBe(6000);
  });

  it("counts the rest of the block playing toward the three-minute limit (same Q as the rate)", () => {
    // 5,000 chars left in the current block + 2 × 1,500 queued + 100 new = 8,100 > 4,320.
    const start: Backlog = { current: { chunks: block("cur", 50) }, queued: [], pendingSkip: 0 };
    const { backlog, dropped } = enqueueAll([block("q1-", 15), block("q2-", 15), block("new")], opts(), start);
    expect(dropped).toBe(2);
    expect(backlog.current?.chunks).toHaveLength(50); // the playing block is never cut
    expect(drain(backlog).at(-1)).toBe("new0");
  });

  it("weighs CJK text by its slower speech rate", () => {
    // 1,200 Han chars ≈ 300 s of Mandarin: over the limit although far below 4,320 chars.
    const han = (n: number): SpeechChunk[] =>
      Array.from({ length: n }, () => ({ text: "汉".repeat(100), body: "汉", lang: "zh" as const }));
    const { backlog, dropped } = enqueueAll([han(6), han(6), han(1)], opts());
    expect(dropped).toBe(1);
    expect(queuedChars(backlog)).toBe(700 * (15 / 4));
  });
});

describe("skipToLatest budget", () => {
  it("still excludes the block playing", () => {
    const start: Backlog = { current: { chunks: block("cur", 50) }, queued: [], pendingSkip: 0 };
    const { dropped } = enqueueAll([block("q1-", 4), block("new", 4)], opts({ policy: "skipToLatest" }), start);
    expect(dropped).toBe(0);
  });
});

describe("readAll policy", () => {
  it("never drops or truncates", () => {
    const { backlog, dropped } = enqueueAll(
      [block("a", 130), block("b", 130)],
      opts({ policy: "readAll" }),
    );
    expect(dropped).toBe(0);
    expect(queuedChars(backlog)).toBe(26000);
  });
});

describe("effectiveRate", () => {
  // Q = chars / (15 * baseRate); T = 20 s → ramp from 300 chars to 900 chars at 1x
  it("stays at the base rate up to the threshold", () => {
    expect(effectiveRate(300, opts())).toBe(1);
    expect(effectiveRate(0, opts({ baseRate: 1.25 }))).toBe(1.25);
  });

  it("ramps linearly to maxRate at three times the threshold", () => {
    expect(effectiveRate(600, opts())).toBeCloseTo(1.3);
    expect(effectiveRate(900, opts())).toBeCloseTo(1.6);
    expect(effectiveRate(5000, opts())).toBeCloseTo(1.6);
  });

  it("never goes below the base rate when maxRate is lower", () => {
    expect(effectiveRate(5000, opts({ baseRate: 1.5, maxRate: 1.25 }))).toBe(1.5);
  });

  it("caps at 2.0", () => {
    expect(effectiveRate(1e6, opts({ baseRate: 1.5, maxRate: 2.5 }))).toBe(2);
  });

  it("uses the base rate for the other policies", () => {
    expect(effectiveRate(5000, opts({ policy: "readAll" }))).toBe(1);
    expect(effectiveRate(5000, opts({ policy: "skipToLatest", baseRate: 1.25 }))).toBe(1.25);
  });
});

describe("catchUp", () => {
  it("leaves only the newest block and clears the pending cue", () => {
    let backlog = enqueueAll([block("a", 3), block("b"), block("c", 2)], opts()).backlog;
    backlog = dequeue(backlog, cues).backlog;
    backlog = { ...backlog, pendingSkip: 3 };
    expect(drain(catchUp(backlog))).toEqual(["c0", "c1"]);
  });

  it("is a no-op when nothing newer is queued", () => {
    let backlog = enqueueAll([block("a", 3)], opts()).backlog;
    backlog = dequeue(backlog, cues).backlog;
    expect(catchUp(backlog)).toBe(backlog);
  });
});
