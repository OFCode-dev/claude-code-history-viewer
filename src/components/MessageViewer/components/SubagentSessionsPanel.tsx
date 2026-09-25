import { memo, useCallback, useId } from "react";
import { Bot, ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SubagentList } from "@/components/subagents/SubagentList";
import type { SubagentSession } from "@/types";

interface SubagentSessionsPanelProps {
  subagentSessions: SubagentSession[];
  navigateToSubagent: (subagent: SubagentSession) => Promise<void>;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Collapsible list of the current session's subagent transcripts, shown above
 * the conversation. The open state is owned by MessageViewer so it survives
 * filter-driven re-renders.
 */
export const SubagentSessionsPanel = memo(function SubagentSessionsPanel({
  subagentSessions,
  navigateToSubagent,
  isOpen,
  onToggle,
}: SubagentSessionsPanelProps) {
  const { t } = useTranslation();
  const listId = useId();
  const title = t("subagent.listTitle");
  const ChevronIcon = isOpen ? ChevronDown : ChevronRight;

  const handleSelect = useCallback(
    (subagent: SubagentSession) => {
      void navigateToSubagent(subagent);
    },
    [navigateToSubagent],
  );

  return (
    <section className="border-b border-border/50 px-4 py-2 bg-muted/30" aria-label={t("subagent.listAria")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        className="flex items-center gap-2 w-full text-left rounded-sm hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronIcon className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
        <Bot className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <span className="text-px10 text-muted-foreground/80 bg-muted rounded-full px-1.5 tabular-nums">
          {subagentSessions.length}
        </span>
      </button>
      {isOpen && (
        // About two rows: the sessions pane has the full list, so the panel
        // must not take much of the conversation.
        <div id={listId} className="mt-1.5 max-h-28 overflow-y-auto pr-1">
          <SubagentList subagents={subagentSessions} onSelect={handleSelect} layout="grid" />
        </div>
      )}
    </section>
  );
});
