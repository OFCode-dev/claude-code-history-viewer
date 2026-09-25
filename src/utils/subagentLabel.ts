import type { SubagentSession } from "@/types";

type SubagentLabelSource = Pick<SubagentSession, "agent_id" | "summary"> &
  Partial<Pick<SubagentSession, "description">>;

/**
 * Human-readable name for a subagent transcript: the task description given
 * when it was spawned, else its summary (usually the first prompt line), else
 * a short form of its id.
 */
export function getSubagentLabel(subagent: SubagentLabelSource): string {
  const description = subagent.description?.trim();
  if (description) return description;
  const summary = subagent.summary?.replace(/\s+/g, " ").trim();
  if (summary) return summary;
  return `Agent ${subagent.agent_id.slice(0, 8)}`;
}
