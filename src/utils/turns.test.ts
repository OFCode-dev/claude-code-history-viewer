import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import type { ClaudeMessage } from "@/types";
import { buildTurnAnchors, findTurnForIndex } from "./turns";
import { getSubagentLabel } from "./subagentLabel";

let seq = 0;
const msg = (type: "user" | "assistant", content: unknown): ClaudeMessage =>
  ({
    uuid: `m${++seq}`,
    sessionId: "s1",
    timestamp: `2026-09-24T10:00:${String(seq).padStart(2, "0")}.000Z`,
    type,
    role: type,
    content,
  }) as ClaudeMessage;

describe("buildTurnAnchors", () => {
  it("anchors only human prompts and numbers them", () => {
    const list = [
      msg("user", "First question"),
      msg("assistant", [{ type: "text", text: "Answer" }]),
      msg("user", [{ type: "tool_result", tool_use_id: "t", content: "x" }]),
      msg("user", "<task-notification>done</task-notification>"),
      msg("user", "Second question"),
      msg("assistant", [{ type: "text", text: "Answer 2" }]),
    ];
    const anchors = buildTurnAnchors(list);
    expect(anchors.map((a) => [a.messageIndex, a.turnNumber])).toEqual([
      [0, 1],
      [4, 2],
    ]);
    expect(anchors[1]!.uuid).toBe(list[4]!.uuid);
  });

  it("starts a turn at a message sent while Claude was working", () => {
    const queued = { ...msg("user", "Also check the retry limit."), queued: true } as ClaudeMessage;
    const hiddenRow = {
      uuid: "reminder",
      sessionId: "s1",
      timestamp: "2026-09-24T10:00:59.000Z",
      type: "attachment",
    } as unknown as ClaudeMessage;
    const list = [
      msg("user", "Fix the billing retries"),
      msg("assistant", [{ type: "tool_use", id: "t1", name: "Bash", input: {} }]),
      msg("user", [{ type: "tool_result", tool_use_id: "t1", content: "ok" }]),
      queued,
      hiddenRow,
      msg("assistant", [{ type: "text", text: "I'll cap the retries as well." }]),
    ];
    expect(buildTurnAnchors(list).map((a) => [a.uuid, a.messageIndex, a.turnNumber])).toEqual([
      [list[0]!.uuid, 0, 1],
      [queued.uuid, 3, 2],
    ]);
  });
});

describe("findTurnForIndex", () => {
  const anchors = [
    { uuid: "a", messageIndex: 2, turnNumber: 1, timestamp: "" },
    { uuid: "b", messageIndex: 10, turnNumber: 2, timestamp: "" },
    { uuid: "c", messageIndex: 25, turnNumber: 3, timestamp: "" },
  ];

  it("returns null before the first prompt", () => {
    expect(findTurnForIndex(anchors, 1)).toBeNull();
  });

  it.each([
    [2, "a"],
    [9, "a"],
    [10, "b"],
    [24, "b"],
    [25, "c"],
    [400, "c"],
  ])("index %i belongs to turn %s", (index, uuid) => {
    expect(findTurnForIndex(anchors, index)?.uuid).toBe(uuid);
  });

  it("handles an empty anchor list", () => {
    expect(findTurnForIndex([], 3)).toBeNull();
  });
});

describe("getSubagentLabel", () => {
  it("prefers the spawn description", () => {
    expect(
      getSubagentLabel({ agent_id: "a940d6eb27c2ef3ce", summary: "You are fact-checking", description: " Verify audit claims " })
    ).toBe("Verify audit claims");
  });

  it("falls back to the summary, then the id", () => {
    expect(getSubagentLabel({ agent_id: "a940d6eb27c2ef3ce", summary: "You are\nfact-checking" })).toBe(
      "You are fact-checking"
    );
    expect(getSubagentLabel({ agent_id: "a940d6eb27c2ef3ce", summary: null, description: null })).toBe(
      "Agent a940d6eb"
    );
  });

  it("translates the id fallback into the app language", async () => {
    await i18n.changeLanguage("ko");
    try {
      expect(getSubagentLabel({ agent_id: "a940d6eb27c2ef3ce", summary: "  ", description: null })).toBe(
        "에이전트 a940d6eb"
      );
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});
