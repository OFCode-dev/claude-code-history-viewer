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
    expect(result).toContain(proseAndTool);
  });

  it("keeps tool-result user records while tool calls are shown", () => {
    const result = applyMessageDisplayFilter(all, filter({ contentTypes: { thinking: false } }));
    expect(result).toContain(toolResult);
    expect(result).not.toContain(thinkingOnly);
  });

  it("shows only human prompts and assistant prose in the dialogue view", () => {
    const result = applyMessageDisplayFilter(all, filter({ dialogue: true }));
    expect(result).toEqual([prompt, imagePrompt, prose, proseAndTool]);
  });

  it("ignores the individual toggles while the dialogue view is on", () => {
    const result = applyMessageDisplayFilter(
      all,
      filter({
        dialogue: true,
        contentTypes: { text: false, toolCalls: true, parallelTasks: false },
      }),
    );
    expect(result).toEqual([prompt, imagePrompt, prose, proseAndTool]);
  });

  it("ignores the role toggles too, since they are disabled in the dialogue view", () => {
    expect(
      applyMessageDisplayFilter(all, filter({ dialogue: true, roles: { user: false, assistant: true } })),
    ).toEqual([prompt, imagePrompt, prose, proseAndTool]);
  });
});
