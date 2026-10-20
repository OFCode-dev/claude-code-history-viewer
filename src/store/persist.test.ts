import { describe, expect, it, vi } from "vitest";
import { readStr, writeStr } from "./persist";

describe("readStr", () => {
  it("returns the stored value or the fallback", () => {
    expect(readStr("persist-test", "auto")).toBe("auto");
    writeStr("persist-test", "voice://x");
    expect(readStr("persist-test", "auto")).toBe("voice://x");
  });

  it("returns the fallback when storage throws", () => {
    const spy = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStr("persist-test", "auto")).toBe("auto");
    spy.mockRestore();
  });
});
