import { describe, expect, it } from "vitest";
import type { ClaudeMessage } from "../../../types";
import type { MessageFilter } from "../../../store/slices/filterSlice";
import { linearSearchMessages } from "../../../utils/searchIndex";
import { filterSearchMatches } from "./searchMatchVisibility";

const record = (uuid: string, type: string, content: unknown): ClaudeMessage =>
  ({ uuid, sessionId: "s1", timestamp: "2026-09-24T10:00:00.000Z", type, role: type, content }) as unknown as ClaudeMessage;

const messages = [
  record("prompt", "user", "Why does the retry loop time out?"),
  record("call", "assistant", [
    { type: "text", text: "Checking the retry settings." },
    { type: "tool_use", id: "t1", name: "Bash", input: { command: "grep retry config.yaml" } },
  ]),
  record("result", "user", [{ type: "tool_result", tool_use_id: "t1", content: "retry: 3\nretry_delay: 5s" }]),
  record("reply", "assistant", [{ type: "text", text: "The retry delay is too short." }]),
];

const filter = (overrides: Partial<MessageFilter> & { toolCalls?: boolean } = {}): MessageFilter => ({
  roles: { user: true, assistant: true },
  contentTypes: {
    text: true,
    thinking: true,
    toolCalls: overrides.toolCalls ?? true,
    commands: true,
    parallelTasks: true,
  },
  dialogue: overrides.dialogue ?? false,
});

const search = (query: string) =>
  linearSearchMessages(messages, query).map(({ messageUuid, messageIndex, matchIndex, matchCount }) => ({
    messageUuid,
    messageIndex,
    matchIndex,
    matchCount,
  }));

describe("filterSearchMatches", () => {
  it("keeps every match when nothing is filtered", () => {
    const matches = search("retry");
    expect(filterSearchMatches(matches, messages, filter(), "retry", "content")).toEqual({
      visible: matches,
      hiddenCount: 0,
    });
  });

  it("hides matches in tool results when tool calls are hidden", () => {
    const matches = search("retry_delay");
    expect(matches.map((m) => m.messageUuid)).toEqual(["result"]);
    const { visible, hiddenCount } = filterSearchMatches(
      matches,
      messages,
      filter({ toolCalls: false }),
      "retry_delay",
      "content",
    );
    expect(visible).toEqual([]);
    expect(hiddenCount).toBe(1);
  });

  it("in the dialogue view, keeps only matches in the displayed prose", () => {
    const matches = search("retry");
    const { visible, hiddenCount } = filterSearchMatches(matches, messages, filter({ dialogue: true }), "retry", "content");

    // The tool result is hidden entirely; the tool call input of "call" is
    // trimmed away, only its prose match remains.
    // (Search results come newest first; the order is preserved.)
    expect(visible.map((m) => [m.messageUuid, m.matchIndex])).toEqual([
      ["reply", 0],
      ["call", 0],
      ["prompt", 0],
    ]);
    expect(visible.find((m) => m.messageUuid === "call")).toMatchObject({ messageIndex: 1, matchCount: 1 });
    const total = matches.length;
    expect(hiddenCount).toBe(total - visible.length);
    expect(hiddenCount).toBeGreaterThan(0);
  });
});
