import { describe, expect, it } from "vitest";
import { supportsSessionBoard } from "./sessionBoard";

describe("supportsSessionBoard", () => {
  it("allows Claude projects, including ones without a provider", () => {
    expect(supportsSessionBoard({ provider: "claude" })).toBe(true);
    expect(supportsSessionBoard({ provider: undefined })).toBe(true);
    expect(supportsSessionBoard(null)).toBe(true);
  });

  it("rejects other providers, whose board would only show a warning", () => {
    expect(supportsSessionBoard({ provider: "codex" })).toBe(false);
    expect(supportsSessionBoard({ provider: "opencode" })).toBe(false);
  });
});
