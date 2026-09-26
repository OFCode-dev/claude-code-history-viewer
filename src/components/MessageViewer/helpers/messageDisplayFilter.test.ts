import { describe, expect, it } from "vitest";
import type { ClaudeMessage } from "../../../types";
import type { MessageFilter } from "../../../store/slices/filterSlice";
import { applyMessageDisplayFilter } from "./messageDisplayFilter";

let counter = 0;
const record = (type: string, extra: Record<string, unknown>): ClaudeMessage =>
  ({
    uuid: `m${++counter}`,
    sessionId: "s1",
    timestamp: "2026-09-24T10:00:00.000Z",
    type,
    ...extra,
  }) as unknown as ClaudeMessage;

const user = (content: unknown, extra: Record<string, unknown> = {}) =>
  record("user", { role: "user", content, ...extra });
const assistant = (content: unknown[]) => record("assistant", { role: "assistant", content });

const prompt = user("Why does the build fail on CI?");
const toolResult = user([{ type: "tool_result", tool_use_id: "t1", content: "ok" }]);
const command = user("<command-message>model</command-message>\n<command-name>/model</command-name>");
const commandOutput = user("<local-command-stdout>Set model to Opus</local-command-stdout>");
const notification = user("<task-notification>\n<task-id>b1</task-id>\n</task-notification>");
const interrupt = user("[Request interrupted by user]");
const compactSummary = user("This session is being continued from a previous conversation.");
const systemContext = user("<system-reminder>Remember the plan.</system-reminder>");
const imagePrompt = user([{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } }]);
const prose = assistant([{ type: "text", text: "The lockfile is out of date." }]);
const thinkingOnly = assistant([{ type: "thinking", thinking: "Let me check." }]);
const toolOnly = assistant([{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }]);
const proseAndTool = assistant([
  { type: "text", text: "Checking the logs." },
  { type: "tool_use", id: "t2", name: "Bash", input: { command: "cat ci.log" } },
]);
const progress = record("progress", { data: { type: "hook_progress" } });
const system = record("system", { subtype: "compact_boundary", content: "Conversation compacted" });
const summary = record("summary", { content: "Earlier work" });

const all = [
  prompt,
  toolResult,
  command,
  commandOutput,
  notification,
  interrupt,
  compactSummary,
  systemContext,
  imagePrompt,
  prose,
  thinkingOnly,
  toolOnly,
  proseAndTool,
  progress,
  system,
  summary,
];

const filter = (overrides: Partial<MessageFilter> & {
  contentTypes?: Partial<MessageFilter["contentTypes"]>;
} = {}): MessageFilter => ({
  roles: { user: true, assistant: true, ...overrides.roles },
  contentTypes: {
    text: true,
    thinking: true,
    toolCalls: true,
    commands: true,
    parallelTasks: true,
    ...overrides.contentTypes,
  },
  dialogue: overrides.dialogue ?? false,
});

describe("applyMessageDisplayFilter", () => {
  it("returns every record when nothing is filtered", () => {
    expect(applyMessageDisplayFilter(all, filter())).toEqual(all);
  });

  it("hides tool-result user records together with tool calls", () => {
    const result = applyMessageDisplayFilter(all, filter({ contentTypes: { toolCalls: false } }));
    expect(result).not.toContain(toolResult);
    expect(result).not.toContain(toolOnly);
    // Everything else a person or the harness sent stays visible.
    expect(result).toEqual(expect.arrayContaining([prompt, command, commandOutput, notification, interrupt]));
    // A mixed record stays, without its hidden tool call.
    const shownMixed = result.find((m) => m.uuid === proseAndTool.uuid);
    expect(shownMixed?.content).toEqual([{ type: "text", text: "Checking the logs." }]);
    // Records with nothing hidden are passed through untouched.
    expect(result).toContain(prose);
  });

  describe("content toggles trim what they hide from kept assistant records", () => {
    const mixed = assistant([
      { type: "thinking", thinking: "The flaky test needs a seed." },
      { type: "text", text: "Pinning the seed." },
      { type: "tool_use", id: "t4", name: "edit", input: { filePath: "a.test.ts" } },
      { type: "command", command: "/model" },
    ]);
    const shown = (contentTypes: Partial<MessageFilter["contentTypes"]>) =>
      applyMessageDisplayFilter([mixed], filter({ contentTypes }))[0] as ClaudeMessage & {
        content: Array<{ type: string }>;
      };

    it("drops thinking blocks while thinking is hidden", () => {
      expect(shown({ thinking: false }).content.map((b) => b.type)).toEqual(["text", "tool_use", "command"]);
    });

    it("drops tool blocks while tool calls are hidden", () => {
      expect(shown({ toolCalls: false }).content.map((b) => b.type)).toEqual(["thinking", "text", "command"]);
    });

    it("drops command and text blocks while those are hidden", () => {
      expect(shown({ commands: false, text: false }).content.map((b) => b.type)).toEqual(["thinking", "tool_use"]);
    });

    it("leaves the original record unchanged", () => {
      shown({ thinking: false, toolCalls: false });
      expect((mixed as unknown as { content: unknown[] }).content).toHaveLength(4);
    });

    it("drops legacy tool fields while tool calls are hidden", () => {
      const legacy = record("assistant", {
        role: "assistant",
        content: "Running the tests now.",
        toolUse: { name: "Bash", input: { command: "pnpm test" } },
        toolUseResult: { stdout: "ok" },
      });
      const result = applyMessageDisplayFilter([legacy], filter({ contentTypes: { toolCalls: false } }))[0];
      expect(result).toMatchObject({ uuid: legacy.uuid, content: "Running the tests now." });
      expect(result).not.toHaveProperty("toolUse", expect.anything());
      expect(result).not.toHaveProperty("toolUseResult", expect.anything());
    });
  });

  it("keeps tool-result user records while tool calls are shown", () => {
    const result = applyMessageDisplayFilter(all, filter({ contentTypes: { thinking: false } }));
    expect(result).toContain(toolResult);
    expect(result).not.toContain(thinkingOnly);
  });

  it("shows only human prompts and assistant prose in the dialogue view", () => {
    const result = applyMessageDisplayFilter(all, filter({ dialogue: true }));
    expect(uuids(result)).toEqual(uuids([prompt, imagePrompt, prose, proseAndTool]));
    // Records that are prose already are passed through untouched.
    expect(result[0]).toBe(prompt);
    expect(result[2]).toBe(prose);
  });

  it("keeps a message sent while Claude was working in the dialogue view", () => {
    const queued = user("Also check the retry limit.", { queued: true });
    const hiddenRow = record("attachment", {});
    const result = applyMessageDisplayFilter([prompt, toolOnly, queued, hiddenRow, prose], filter({ dialogue: true }));
    expect(uuids(result)).toEqual(uuids([prompt, queued, prose]));
    // Passed through as-is, so the card still knows it was queued.
    expect(result[1]).toBe(queued);
  });

  it("ignores the individual toggles while the dialogue view is on", () => {
    const result = applyMessageDisplayFilter(
      all,
      filter({
        dialogue: true,
        contentTypes: { text: false, toolCalls: true, parallelTasks: false },
      }),
    );
    expect(uuids(result)).toEqual(uuids([prompt, imagePrompt, prose, proseAndTool]));
  });

  it("ignores the role toggles too, since they are disabled in the dialogue view", () => {
    expect(
      uuids(applyMessageDisplayFilter(all, filter({ dialogue: true, roles: { user: false, assistant: true } }))),
    ).toEqual(uuids([prompt, imagePrompt, prose, proseAndTool]));
  });

  describe("dialogue view: assistant prose only", () => {
    const dialogue = (records: ClaudeMessage[]) =>
      applyMessageDisplayFilter(records, filter({ dialogue: true }));

    it("drops assistant records whose only blocks are not prose (e.g. OpenCode steps)", () => {
      const openCodeToolStep = assistant([
        { type: "tool_use", id: "t3", name: "read", input: { filePath: "a.ts" } },
        { type: "opencode_step", cost: 0.01, tokens: { input: 10, output: 2 } },
      ]);
      const stepOnly = assistant([{ type: "opencode_step", cost: 0.01 }]);
      const otherBlocks = assistant([
        { type: "advisor_tool_result", content: "…" },
        { type: "container_upload", file_id: "f1" },
        { type: "some_future_block" },
      ]);
      expect(dialogue([openCodeToolStep, stepOnly, otherBlocks])).toEqual([]);
    });

    it("drops assistant records whose text blocks are empty or whitespace", () => {
      const emptyTextAndTool = assistant([
        { type: "text", text: "" },
        { type: "tool_use", id: "t4", name: "Bash", input: { command: "ls" } },
      ]);
      const whitespaceOnly = assistant([{ type: "text", text: "  \n\t " }]);
      const emptyString = record("assistant", { role: "assistant", content: "   " });
      expect(dialogue([emptyTextAndTool, whitespaceOnly, emptyString])).toEqual([]);
    });

    it("keeps only the prose blocks of a mixed record", () => {
      const [shown] = dialogue([proseAndTool]);
      expect(shown?.uuid).toBe(proseAndTool.uuid);
      expect(shown?.content).toEqual([{ type: "text", text: "Checking the logs." }]);
      // The source record is not mutated.
      expect(proseAndTool.content).toHaveLength(2);
    });

    it("strips task-board and step blocks so groupers cannot replace the prose", () => {
      const proseAndTodo = assistant([
        { type: "text", text: "Here is the plan." },
        { type: "tool_use", id: "t5", name: "TodoWrite", input: { todos: [] } },
        { type: "opencode_step", cost: 0.02 },
        { type: "text", text: "   " },
      ]);
      const [shown] = dialogue([proseAndTodo]);
      expect(shown?.content).toEqual([{ type: "text", text: "Here is the plan." }]);
    });

    it("drops legacy tool fields from kept assistant records", () => {
      const legacy = record("assistant", {
        role: "assistant",
        content: "Running the tests now.",
        toolUse: { name: "Bash" },
        toolUseResult: { stdout: "ok" },
      });
      const [shown] = dialogue([legacy]);
      expect(shown?.content).toBe("Running the tests now.");
      expect((shown as { toolUse?: unknown }).toolUse).toBeUndefined();
      expect((shown as { toolUseResult?: unknown }).toolUseResult).toBeUndefined();
    });
  });
});

function uuids(records: ClaudeMessage[]): string[] {
  return records.map((r) => r.uuid);
}
