import { CheckCircle2, Circle, Loader2, Trash2 } from "lucide-react";

export const TASK_STATUS_CONFIG: Record<string, { icon: typeof Circle; color: string }> = {
  pending: { icon: Circle, color: "text-muted-foreground" },
  in_progress: { icon: Loader2, color: "text-info" },
  completed: { icon: CheckCircle2, color: "text-success" },
  deleted: { icon: Trash2, color: "text-destructive" },
};

const TASK_STATUS_LABEL_KEYS: Record<string, string> = {
  pending: "taskOperation.pending",
  in_progress: "taskOperation.inProgress",
  completed: "taskOperation.completed",
  deleted: "taskOperation.deleted",
};

/** i18n key of a task status label; unknown statuses read as pending. */
export const getTaskStatusLabelKey = (status: string): string =>
  TASK_STATUS_LABEL_KEYS[status] ?? "taskOperation.pending";
