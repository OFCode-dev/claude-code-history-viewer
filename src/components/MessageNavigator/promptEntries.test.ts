import { describe, expect, it } from "vitest";
import type { ClaudeMessage } from "../../types";
import {
  buildPromptEntries,
  buildPromptListRows,
  getSubagentSpawns,
} from "./promptEntries";

let counter = 0;
const user = (content: unknown, uuid = `u${++counter}`): ClaudeMessage =>
  ({ uuid, type: "user", content, timestamp: "2026-09-25T10:00:00Z" }) as unknown as ClaudeMessage;
const assistant = (content: unknown, uuid = `a${++counter}`): ClaudeMessage =>
  ({ uuid, type: "assistant", content, timestamp: "2026-09-25T10:01:00Z" }) as unknown as ClaudeMessage;
const progress = (uuid = `p${++counter}`): ClaudeMessage =>
  ({ uuid, type: "progress", content: "…", timestamp: "2026-09-25T10:01:00Z" }) as unknown as ClaudeMessage;

const toolResult = () =>
  user([{ type: "tool_result", tool_use_id: "t1", content: "ok" }]);

describe("buildPromptEntries", () => {
  it("lists human prompts only, skipping system-injected user records", () => {
    const messages = [
      user("Fix the login bug", "p1"),
      assistant([{ type: "text", text: "Looking." }]),
      toolResult(),
      user("<command-name>/clear</command-name>"),
      user("<local-command-stdout>cleared</local-command-stdout>"),
      user("<task-notification><task-id>x</task-id></task-notification>"),
      user("<system-reminder>be nice</system-reminder>"),
      user("[Request interrupted by user]"),
      user("This session is being continued from a previous conversation…"),
      user("Now add a test", "p2"),
    ];

    const entries = buildPromptEntries(messages);

    expect(entries.map((entry) => entry.uuid)).toEqual(["p1", "p2"]);
    expect(entries.map((entry) => entry.turnNumber)).toEqual([1, 2]);
    expect(entries[0]!.preview).toBe("Fix the login bug");
  });

  it("counts the non-noise records of each turn as steps", () => {
    const messages = [
      user("First", "p1"),
      assistant([{ type: "text", text: "a" }]),
      progress(),
      toolResult(),
      assistant([]), // empty → noise
      user("Second", "p2"),
    ];

    const [first, second] = buildPromptEntries(messages);

    expect(first!.steps).toBe(2);
    expect(second!.steps).toBe(0);
  });

  it("shows the closing question of a long pasted prompt", () => {
    const pasted = `${"log line\n".repeat(80)}\nWhy does the build fail here?`;
    const [entry] = buildPromptEntries([user(pasted)]);

    expect(entry!.fromTail).toBe(true);
    expect(entry!.preview).toBe("Why does the build fail here?");
  });

  it("collects Agent and Task spawns with their description", () => {
    const messages = [
      user("Review the repo", "p1"),
      assistant(
        [
          { type: "text", text: "Spawning" },
          { type: "tool_use", id: "t-1", name: "Agent", input: { description: "Audit auth" } },
          { type: "tool_use", id: "t-2", name: "Task", input: { subagent_type: "explorer" } },
          { type: "tool_use", id: "t-3", name: "Bash", input: { description: "not a spawn" } },
        ],
        "a-spawn"
      ),
    ];

    const [entry] = buildPromptEntries(messages);

    expect(entry!.spawns).toEqual([
      { toolUseId: "t-1", messageUuid: "a-spawn", label: "Audit auth" },
      { toolUseId: "t-2", messageUuid: "a-spawn", label: "explorer" },
    ]);
  });
});

describe("getSubagentSpawns", () => {
  it("ignores user records and falls back to the tool name", () => {
    expect(getSubagentSpawns(user("Agent"))).toEqual([]);
    expect(
      getSubagentSpawns(assistant([{ type: "tool_use", id: "t", name: "Task", input: {} }], "m"))
    ).toEqual([{ toolUseId: "t", messageUuid: "m", label: "Task" }]);
  });
});

describe("buildPromptListRows", () => {
  const entries = buildPromptEntries([
    user("Deploy the api", "p1"),
    assistant([{ type: "tool_use", id: "t-1", name: "Agent", input: { description: "Check migrations" } }], "a1"),
    user("Write the changelog", "p2"),
  ]);

  it("places spawn rows right after their prompt", () => {
    expect(buildPromptListRows(entries).map((row) => row.kind)).toEqual([
      "prompt",
      "spawn",
      "prompt",
    ]);
  });

  it("filters prompts by their text or their spawn labels", () => {
    expect(buildPromptListRows(entries, "changelog").map((row) => row.key)).toEqual(["p2"]);
    expect(buildPromptListRows(entries, "MIGRATIONS").map((row) => row.key)).toEqual([
      "p1",
      "p1:t-1",
    ]);
  });
});
