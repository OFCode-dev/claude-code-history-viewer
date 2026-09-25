import { describe, expect, it } from "vitest";
import type { ClaudeMessage } from "@/types";
import { getPromptTurnNumbers } from "./promptTurnNumber";

const record = (uuid: string, type: string, content: unknown, isSidechain = false): ClaudeMessage =>
  ({
    uuid,
    sessionId: "s1",
    timestamp: "2026-09-24T10:00:00.000Z",
    type,
    role: type,
    content,
    isSidechain,
  }) as unknown as ClaudeMessage;

const messages = [
  record("p1", "user", "First question"),
  record("a1", "assistant", [{ type: "text", text: "Answer" }]),
  record("tr", "user", [{ type: "tool_result", tool_use_id: "t", content: "ok" }]),
  record("side", "user", "Subagent task prompt", true),
  record("cmd", "user", "<command-name>/model</command-name>"),
  record("p2", "user", "Second question"),
];

describe("getPromptTurnNumbers", () => {
  it("numbers human prompts only and skips sidechain records in the main session", () => {
    const numbers = getPromptTurnNumbers(messages, false);
    expect([...numbers.entries()]).toEqual([
      ["p1", 1],
      ["p2", 2],
    ]);
  });

  it("counts sidechain prompts inside a subagent transcript", () => {
    expect(getPromptTurnNumbers(messages, true).get("p2")).toBe(3);
  });

  it("computes once per messages array", () => {
    expect(getPromptTurnNumbers(messages, false)).toBe(getPromptTurnNumbers(messages, false));
    expect(getPromptTurnNumbers([...messages], false)).not.toBe(getPromptTurnNumbers(messages, false));
  });
});
