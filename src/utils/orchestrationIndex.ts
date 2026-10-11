import type { ClaudeMessage } from "../types";
import type { BackgroundTask, OrchestrationIndex } from "../types/orchestration";
import { parseTaskNotifications } from "../components/MessageViewer/helpers/messageKinds";

type TaskStart = Pick<
  BackgroundTask,
  "kind" | "toolUseId" | "startUuid" | "description" | "command"
>;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Receipts identify tasks; only later notifications or successful stops end them. */
export function buildOrchestrationIndex(messages: ClaudeMessage[]): OrchestrationIndex {
  const index: OrchestrationIndex = { byId: new Map(), byToolUseId: new Map() };
  const starts = new Map<string, TaskStart>();
  const stops = new Map<string, string>();

  for (const message of messages) {
    const blocks = typeof message.content === "string"
      ? [{ type: "text", text: message.content }]
      : Array.isArray(message.content) ? message.content : [];
    const result = "toolUseResult" in message ? asRecord(message.toolUseResult) : undefined;

    for (const item of blocks) {
      const block = asRecord(item);
      if (!block) continue;

      if (message.type === "assistant" && block.type === "tool_use") {
        const toolUseId = readString(block.id);
        const input = asRecord(block.input);
        if (!toolUseId) continue;

        if (block.name === "Monitor" || block.name === "Bash") {
          // A Bash receipt can reveal a background task even when the flag was missing.
          starts.set(toolUseId, {
            kind: block.name === "Monitor" ? "monitor" : "shell",
            toolUseId,
            startUuid: message.uuid,
            description: readString(input?.description),
            command: readString(input?.command),
          });
        } else if (block.name === "TaskStop") {
          const taskId = readString(input?.task_id);
          if (taskId) stops.set(toolUseId, taskId);
        }
      } else if (block.type === "tool_result") {
        const toolUseId = readString(block.tool_use_id);
        if (!toolUseId || block.is_error === true) continue;

        const stopId = stops.get(toolUseId);
        const stoppedTask = stopId ? index.byId.get(stopId) : undefined;
        if (stoppedTask) {
          stoppedTask.state = "stopped";
          stoppedTask.stopUuid = message.uuid;
          continue;
        }

        const start = starts.get(toolUseId);
        if (!start) continue;
        const taskId = readString(
          start.kind === "monitor" ? result?.taskId : result?.backgroundTaskId,
        );
        if (!taskId) continue;
        const task: BackgroundTask = { ...start, id: taskId, state: "unknown", events: [] };
        index.byId.set(taskId, task);
        index.byToolUseId.set(toolUseId, task);
      } else if (message.type === "user" && block.type === "text" && typeof block.text === "string") {
        for (const notification of parseTaskNotifications(block.text)) {
          const task = (notification.taskId ? index.byId.get(notification.taskId) : undefined)
            ?? (notification.toolUseId ? index.byToolUseId.get(notification.toolUseId) : undefined);
          if (!task) continue;
          if (notification.event !== undefined) {
            task.events.push({
              uuid: message.uuid,
              text: notification.event,
              timestamp: message.timestamp,
            });
          } else if (
            notification.status === "completed"
            || notification.status === "failed"
            || notification.status === "stopped"
          ) {
            task.state = notification.status;
            task.endUuid = message.uuid;
          }
        }
      }
    }
  }

  return index;
}
