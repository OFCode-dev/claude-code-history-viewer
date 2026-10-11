export type TaskState = "running" | "completed" | "failed" | "stopped" | "unknown";

export interface BackgroundTask {
  id: string;
  kind: "monitor" | "shell";
  toolUseId: string;
  startUuid: string;
  description?: string;
  command?: string;
  /** A started receipt alone does not prove the task is still running. */
  state: TaskState;
  events: Array<{ uuid: string; text: string; timestamp?: string }>;
  endUuid?: string;
  stopUuid?: string;
}

export interface OrchestrationIndex {
  byId: Map<string, BackgroundTask>;
  byToolUseId: Map<string, BackgroundTask>;
}
