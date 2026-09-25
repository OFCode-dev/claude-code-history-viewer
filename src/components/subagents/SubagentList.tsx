import { memo, useCallback, useMemo, type KeyboardEvent } from "react";
import { Bot, Workflow as WorkflowIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getSubagentLabel } from "@/utils/subagentLabel";
import { groupSubagentsForDisplay } from "@/utils/subagentNavigation";
import { formatTimeAgo } from "@/utils/time";
import { getSubagentStyle } from "@/utils/agentStyles";
import type { SubagentSession } from "@/types";
import { SubagentMetaBadges } from "./SubagentMetaBadges";

const ITEM_SELECTOR = "[data-subagent-item]";

interface SubagentListProps {
  subagents: readonly SubagentSession[];
  /** `file_path` of the subagent on screen, highlighted with `aria-current`. */
  activeFilePath?: string | null;
  onSelect: (subagent: SubagentSession) => void;
  /** `grid` fills wide containers with several columns; `list` is one column. */
  layout?: "grid" | "list";
  className?: string;
}

/**
 * Subagents of a session: flat subagents first, then one group per workflow
 * run. Every row is a button; Up/Down/Home/End move focus between rows.
 */
export const SubagentList = memo(function SubagentList({
  subagents,
  activeFilePath,
  onSelect,
  layout = "list",
  className,
}: SubagentListProps) {
  const { t } = useTranslation();
  const groups = useMemo(() => groupSubagentsForDisplay(subagents), [subagents]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else if (current < 0) next = 0;
    else next = e.key === "ArrowDown"
      ? Math.min(items.length - 1, current + 1)
      : Math.max(0, current - 1);
    e.preventDefault();
    items[next]?.focus();
  }, []);

  return (
    <div className={cn("flex flex-col gap-2", className)} onKeyDown={handleKeyDown}>
      {groups.map((group) => {
        const groupKey = group.workflowRunId ?? "__flat__";
        return (
          <div key={groupKey} className="flex flex-col gap-1">
            {group.workflowRunId != null && (
              <div className="flex items-center gap-1.5 px-1 text-px10 font-medium uppercase tracking-wide text-muted-foreground">
                <WorkflowIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate font-mono normal-case tracking-normal">
                  {t("subagent.workflowGroup", { runId: group.workflowRunId })}
                </span>
              </div>
            )}
            <ul
              className={cn(
                "grid gap-1",
                layout === "grid"
                  ? "grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]"
                  : "grid-cols-1",
              )}
              aria-label={
                group.workflowRunId != null
                  ? t("subagent.workflowGroup", { runId: group.workflowRunId })
                  : undefined
              }
            >
              {group.subagents.map((subagent) => (
                <li key={subagent.file_path} className="min-w-0">
                  <SubagentListItem
                    subagent={subagent}
                    isActive={subagent.file_path === activeFilePath}
                    onSelect={onSelect}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
});

interface SubagentListItemProps {
  subagent: SubagentSession;
  isActive: boolean;
  onSelect: (subagent: SubagentSession) => void;
}

const SubagentListItem = memo(function SubagentListItem({
  subagent,
  isActive,
  onSelect,
}: SubagentListItemProps) {
  const { t } = useTranslation();
  const label = getSubagentLabel(subagent);
  const lastTime = subagent.last_message_time ?? subagent.first_message_time;
  const hasMeta = Boolean(subagent.agent_type?.trim() || subagent.model?.trim());
  const typeStyle = subagent.agent_type?.trim() ? getSubagentStyle(subagent.agent_type) : null;
  const RowIcon = typeStyle?.icon ?? Bot;

  return (
    <button
      type="button"
      data-subagent-item=""
      onClick={() => onSelect(subagent)}
      aria-current={isActive ? "true" : undefined}
      title={label}
      className={cn(
        "group w-full min-w-0 flex items-start gap-2 px-2 py-1.5 text-left rounded-md border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "bg-accent/10 border-accent/40"
          : "bg-background border-border/50 hover:border-primary/40 hover:bg-primary/5",
      )}
    >
      <RowIcon
        className={cn(
          "w-3.5 h-3.5 mt-0.5 shrink-0",
          typeStyle?.text ?? (isActive ? "text-accent" : "text-muted-foreground"),
        )}
        aria-hidden="true"
      />
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span
          className={cn(
            "text-xs leading-4 truncate",
            isActive ? "font-semibold text-foreground" : "font-medium text-foreground/90",
          )}
        >
          {label}
        </span>
        <span className="flex items-center gap-1.5 min-w-0 overflow-hidden text-px10 leading-4 text-muted-foreground">
          {hasMeta && (
            <>
              <SubagentMetaBadges subagent={subagent} variant="text" className="min-w-0 shrink" />
              <span className="shrink-0" aria-hidden="true">·</span>
            </>
          )}
          <span className="shrink-0 tabular-nums">
            {t("renderers.agentTool.messages", {
              count: subagent.message_count,
              defaultValue: "{{count}} messages",
            })}
          </span>
          {/* Lowest priority: the separator and time truncate together. */}
          {lastTime && (
            <span className="min-w-0 truncate shrink-[10]">
              <span aria-hidden="true">· </span>
              <time
                dateTime={lastTime}
                title={t("subagent.lastActivity", { time: new Date(lastTime).toLocaleString() })}
              >
                {formatTimeAgo(lastTime)}
              </time>
            </span>
          )}
        </span>
      </span>
    </button>
  );
});
