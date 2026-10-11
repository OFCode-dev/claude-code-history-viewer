import { describe, expect, it } from "vitest";
import type { ClaudeMessage } from "../types";
import { parseTaskNotifications } from "../components/MessageViewer/helpers/messageKinds";
import { buildOrchestrationIndex } from "./orchestrationIndex";

const makeMessage = (
  uuid: string,
  type: "assistant" | "user",
  content: unknown,
  toolUseResult?: Record<string, unknown>,
): ClaudeMessage => ({
  uuid,
  type,
  role: type,
  sessionId: "S",
  timestamp: "2026-10-11T08:00:00.000Z",
  content,
  toolUseResult,
} as unknown as ClaudeMessage);

const MONITOR_EVENT = [
  "<task-notification>",
  "<task-id>m7k2p9xq1</task-id>",
  "<summary>Monitor event</summary>",
  "<event>reply from owner: ship it after the tests pass</event>",
  "</task-notification>",
].join("\n");

const SHELL_COMPLETION = [
  "<task-notification>",
  "<task-id>b4hq2rz8c</task-id>",
  "<tool-use-id>toolu_BG1</tool-use-id>",
  "<status>completed</status>",
  "<summary>Background command completed (exit code 0)</summary>",
  "</task-notification>",
].join("\n");

const messages = [
  makeMessage("a1", "assistant", [{
    type: "tool_use", id: "toolu_MON1", name: "Monitor",
    input: {
      command: "python3 -u ~/bin/tg_listen.py --chat owner --since now",
      description: "Watch Telegram for the owner's replies",
      timeout_ms: 1800000,
    },
  }]),
  makeMessage("u1", "user", [{
    type: "tool_result", tool_use_id: "toolu_MON1",
    content: "Monitor started (task m7k2p9xq1, expires in 30m).",
  }], { taskId: "m7k2p9xq1", timeoutMs: 1800000, persistent: false }),
  makeMessage("u2", "user", MONITOR_EVENT),
  makeMessage("a2", "assistant", [{
    type: "tool_use", id: "toolu_BG1", name: "Bash",
    input: {
      command: "timeout 900 codex exec --skip-git-repo-check -m gpt-6.1-sol --json -o review.out",
      description: "Ask Codex for an independent review of the patch",
      run_in_background: true,
    },
  }]),
  makeMessage("u3", "user", [{
    type: "tool_result", tool_use_id: "toolu_BG1",
    content: "Command running in background with ID: b4hq2rz8c.",
  }], { backgroundTaskId: "b4hq2rz8c", stdout: "", stderr: "" }),
  makeMessage("u4", "user", [{ type: "text", text: SHELL_COMPLETION }]),
  makeMessage("a3", "assistant", [{
    type: "tool_use", id: "toolu_SH2", name: "Bash",
    input: { command: "timeout 600 agy --model gemini-3.1-pro", description: "Ask Gemini to verify" },
  }]),
  makeMessage("u5", "user", [{
    type: "tool_result", tool_use_id: "toolu_SH2", content: "VERDICT: confirmed.",
  }], { stdout: "VERDICT: confirmed.", stderr: "", interrupted: false }),
  makeMessage("a4", "assistant", [{
    type: "tool_use", id: "toolu_SH3", name: "Bash",
    input: { command: 'claude -p "Summarise the diff in three bullets" --model haiku' },
  }]),
  makeMessage("a5", "assistant", [{
    type: "tool_use", id: "toolu_STOP", name: "TaskStop",
    input: { task_id: "m7k2p9xq1" },
  }]),
  makeMessage("u6", "user", [{
    type: "tool_result", tool_use_id: "toolu_STOP", content: "Successfully stopped task: m7k2p9xq1",
  }], { task_id: "m7k2p9xq1", task_type: "local_bash" }),
];

describe("buildOrchestrationIndex", () => {
  it("links Monitor events and successful stops", () => {
    const index = buildOrchestrationIndex(messages);
    expect(index.byId.get("m7k2p9xq1")).toMatchObject({
      kind: "monitor",
      toolUseId: "toolu_MON1",
      startUuid: "a1",
      description: "Watch Telegram for the owner's replies",
      command: "python3 -u ~/bin/tg_listen.py --chat owner --since now",
      state: "stopped",
      stopUuid: "u6",
      events: [{
        uuid: "u2",
        text: "reply from owner: ship it after the tests pass",
        timestamp: "2026-10-11T08:00:00.000Z",
      }],
    });
  });

  it("links background shells to their completion notifications", () => {
    const index = buildOrchestrationIndex(messages);
    const task = index.byId.get("b4hq2rz8c");
    expect(task).toMatchObject({ kind: "shell", state: "completed", endUuid: "u4" });
    expect(index.byToolUseId.get("toolu_BG1")).toBe(task);
  });

  it("does not index foreground Bash or headless Claude commands", () => {
    const index = buildOrchestrationIndex(messages);
    expect(index.byId.size).toBe(2);
    expect(index.byToolUseId.has("toolu_SH2")).toBe(false);
    expect(index.byToolUseId.has("toolu_SH3")).toBe(false);
  });

  it("keeps Monitor state unchanged when TaskStop fails", () => {
    const index = buildOrchestrationIndex([
      ...messages.filter((message) => message.uuid !== "u6"),
      makeMessage("failed-stop", "user", [{
        type: "tool_result", tool_use_id: "toolu_STOP", is_error: true, content: "Task not found.",
      }], { task_id: "m7k2p9xq1", task_type: "local_bash" }),
    ]);
    const task = index.byId.get("m7k2p9xq1");
    expect(task?.state).toBe("unknown");
    expect(task?.stopUuid).toBeUndefined();
    expect(task?.events).toHaveLength(1);
  });

  it("ignores unknown notifications and leaves started shells unknown", () => {
    const index = buildOrchestrationIndex([
      ...messages.filter((message) => message.uuid === "a2" || message.uuid === "u3"),
      makeMessage("unknown", "user",
        "<task-notification><task-id>missing</task-id><status>failed</status></task-notification>"),
    ]);
    expect(index.byId.size).toBe(1);
    expect(index.byToolUseId.size).toBe(1);
    expect(index.byId.has("missing")).toBe(false);
    expect(index.byId.get("b4hq2rz8c")).toMatchObject({ state: "unknown", events: [] });
    expect(index.byId.get("b4hq2rz8c")?.endUuid).toBeUndefined();
  });

  it("creates a shell when the background flag is missing", () => {
    const index = buildOrchestrationIndex([
      makeMessage("call", "assistant", [{
        type: "tool_use", id: "bash", name: "Bash", input: { command: "sleep 10" },
      }]),
      makeMessage("receipt", "user", [{
        type: "tool_result", tool_use_id: "bash", content: "Command running in background.",
      }], { backgroundTaskId: "shell" }),
    ]);
    expect(index.byId.get("shell")).toMatchObject({
      kind: "shell", toolUseId: "bash", startUuid: "call", state: "unknown",
    });
  });

  it("falls back to tool-use ids and applies the last terminal record", () => {
    const failed = makeMessage("failed", "user",
      "<task-notification><task-id>missing</task-id><tool-use-id>toolu_MON1</tool-use-id><status>failed</status></task-notification>");
    const completed = makeMessage("completed", "user", [
      "<task-notification><task-id>m7k2p9xq1</task-id><status>completed</status></task-notification>",
      "<task-notification><tool-use-id>toolu_BG1</tool-use-id><status>stopped</status></task-notification>",
    ].join("\n"));
    expect(buildOrchestrationIndex([...messages, failed]).byId.get("m7k2p9xq1")).toMatchObject({
      state: "failed", endUuid: "failed", stopUuid: "u6",
    });
    const index = buildOrchestrationIndex([...messages, failed, completed]);
    expect(index.byId.get("m7k2p9xq1")).toMatchObject({
      state: "completed", endUuid: "completed", stopUuid: "u6",
    });
    expect(index.byId.get("b4hq2rz8c")).toMatchObject({ state: "stopped", endUuid: "completed" });
  });

  it("keeps Monitor events from ending a task", () => {
    const index = buildOrchestrationIndex([
      ...messages.filter((message) => message.uuid === "a1" || message.uuid === "u1"),
      makeMessage("event", "user",
        MONITOR_EVENT.replace("</task-notification>", "<status>completed</status></task-notification>")),
    ]);
    expect(index.byId.get("m7k2p9xq1")?.state).toBe("unknown");
    expect(index.byId.get("m7k2p9xq1")?.events).toHaveLength(1);
    expect(index.byId.get("m7k2p9xq1")?.endUuid).toBeUndefined();
  });
});

describe("parseTaskNotifications", () => {
  it("returns tool-use ids and Monitor events", () => {
    const notifications = parseTaskNotifications(`${MONITOR_EVENT}\n${SHELL_COMPLETION}`);
    expect(notifications).toHaveLength(2);
    expect(notifications[0]).toMatchObject({
      taskId: "m7k2p9xq1", event: "reply from owner: ship it after the tests pass",
    });
    expect(notifications[1]).toMatchObject({
      taskId: "b4hq2rz8c", toolUseId: "toolu_BG1", status: "completed",
    });
  });
});
