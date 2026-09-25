import { beforeEach, describe, expect, it } from "vitest";
import {
  READING_POSITION_CAPACITY,
  clearReadingPositions,
  forgetReadingPosition,
  recallReadingPosition,
  rememberReadingPosition,
} from "./readingPositions";
import { pendingRestoreFor } from "./slices/navigatorSlice";

describe("reading positions", () => {
  beforeEach(() => clearReadingPositions());

  it("remembers and forgets a position per session", () => {
    rememberReadingPosition("/a.jsonl", { uuid: "m1", offset: -12 });
    expect(recallReadingPosition("/a.jsonl")).toEqual({ uuid: "m1", offset: -12 });

    forgetReadingPosition("/a.jsonl");
    expect(recallReadingPosition("/a.jsonl")).toBeNull();
  });

  it("evicts the least recently recorded session beyond the capacity", () => {
    for (let i = 0; i < READING_POSITION_CAPACITY; i++) {
      rememberReadingPosition(`/s${i}.jsonl`, { uuid: `m${i}`, offset: 0 });
    }
    // Refresh the oldest so it survives.
    rememberReadingPosition("/s0.jsonl", { uuid: "m0b", offset: 0 });
    rememberReadingPosition("/new.jsonl", { uuid: "n", offset: 0 });

    expect(recallReadingPosition("/s0.jsonl")?.uuid).toBe("m0b");
    expect(recallReadingPosition("/s1.jsonl")).toBeNull();
    expect(recallReadingPosition("/new.jsonl")?.uuid).toBe("n");
  });

  it("queues a restore only for sessions with a position", () => {
    rememberReadingPosition("/a.jsonl", { uuid: "m1", offset: 4 });

    expect(pendingRestoreFor("/a.jsonl")).toEqual({
      sessionPath: "/a.jsonl",
      uuid: "m1",
      offset: 4,
    });
    expect(pendingRestoreFor("/b.jsonl")).toBeNull();
  });
});
