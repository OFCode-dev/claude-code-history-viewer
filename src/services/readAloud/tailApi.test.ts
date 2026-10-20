import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/services/api", () => ({ api }));

import { fetchSessionTail } from "./tailApi";

describe("fetchSessionTail", () => {
  it("calls read_session_tail with camelCase args and the signal", async () => {
    const tail = { blocks: [], nextOffset: 10, fileLen: 10, reset: false };
    api.mockResolvedValue(tail);
    const signal = new AbortController().signal;

    await expect(fetchSessionTail("/p/s.jsonl", 4, signal)).resolves.toBe(tail);
    expect(api).toHaveBeenCalledWith(
      "read_session_tail",
      { sessionPath: "/p/s.jsonl", fromOffset: 4 },
      { signal },
    );
  });

  it("sends null for a baseline", async () => {
    api.mockResolvedValue({ blocks: [], nextOffset: 0, fileLen: 0, reset: false });
    await fetchSessionTail("/p/s.jsonl", null);
    expect(api).toHaveBeenLastCalledWith(
      "read_session_tail",
      { sessionPath: "/p/s.jsonl", fromOffset: null },
      { signal: undefined },
    );
  });
});
