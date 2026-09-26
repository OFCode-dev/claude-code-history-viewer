import i18n from "../i18n";
import type { SubagentSession } from "@/types";

type SubagentLabelSource = Pick<SubagentSession, "agent_id" | "summary"> &
  Partial<Pick<SubagentSession, "description">>;

/**
 * Human-readable name for a subagent transcript: the task description given
 * when it was spawned, else its summary (usually the first prompt line), else
 * a short form of its id. Uses the singleton i18n instance so non-React
 * callers (store, breadcrumb model) get the active UI language too.
 */
export function getSubagentLabel(subagent: SubagentLabelSource): string {
  const description = subagent.description?.trim();
  if (description) return description;
  const summary = subagent.summary?.replace(/\s+/g, " ").trim();
  if (summary) return summary;
  return i18n.t("subagent.fallbackLabel", { id: subagent.agent_id.slice(0, 8) });
}
