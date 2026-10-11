import { Bot } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { requestSubagentsFocus, useSessionSubagents } from "./useSessionSubagents";

interface SubagentsRailButtonProps {
  /** Expands the collapsed column; its "Subagents" section then takes focus. */
  onExpand: () => void;
}

/**
 * The way to the subagent list while the column that holds it (the sessions
 * pane, or the explorer listing sessions inline) is folded to its rail: a
 * Bot icon with the count. Hidden when there is nothing to list.
 */
export function SubagentsRailButton({ onExpand }: SubagentsRailButtonProps) {
  const { t } = useTranslation();
  const count = useSessionSubagents().length;
  if (count === 0) return null;

  const label = t("subagent.showList", { count });
  return (
    <button
      type="button"
      onClick={() => {
        requestSubagentsFocus();
        onExpand();
      }}
      aria-label={label}
      title={label}
      data-subagents-rail-button=""
      className={cn(
        // Rail width: 24 px, 44 px on touch; the ring is inset so the rail cannot clip it.
        "flex w-6 flex-col items-center gap-0.5 rounded-md py-1 text-muted-foreground transition-colors pointer-coarse:w-11",
        "hover:bg-muted/70 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      )}
    >
      <Bot className="size-4" aria-hidden="true" />
      <span className="text-2xs font-mono tabular-nums" aria-hidden="true">
        {count}
      </span>
    </button>
  );
}
