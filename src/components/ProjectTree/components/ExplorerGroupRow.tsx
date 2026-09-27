// src/components/ProjectTree/components/ExplorerGroupRow.tsx
import React from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ExplorerGroup } from "../../../utils/explorerModel";

const GROUP_LABEL_KEYS: Record<ExplorerGroup["id"], string> = {
  other: "project.group.other",
  temporary: "project.group.temporary",
  unavailable: "project.group.unavailable",
};

interface ExplorerGroupRowProps {
  group: ExplorerGroup;
  isExpanded: boolean;
  /** Id of the `role="group"` holding the rows (`aria-owns`). */
  ownsId: string;
  onToggle: () => void;
}

/** "Other locations", "Temporary", "Unavailable": a quiet row with the location count. */
export const ExplorerGroupRow: React.FC<ExplorerGroupRowProps> = ({
  group,
  isExpanded,
  ownsId,
  onToggle,
}) => {
  const { t } = useTranslation();
  const label = t(GROUP_LABEL_KEYS[group.id]);

  return (
    <button
      type="button"
      role="treeitem"
      data-tree-node="group"
      data-tree-key={group.key}
      data-tree-expandable="true"
      data-typeahead={label}
      data-testid={`${group.id}-group`}
      aria-level={1}
      aria-expanded={isExpanded}
      aria-owns={isExpanded ? ownsId : undefined}
      aria-label={`${label}, ${t("project.locationCount", { count: group.locationCount })}`}
      tabIndex={-1}
      onClick={onToggle}
      className={cn(
        "relative flex h-7 w-full items-center gap-1 pl-2 pr-2 text-left outline-none",
        "text-px12 font-medium transition-colors hover:bg-muted/50",
        "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
        "data-[revealed=true]:ring-1 data-[revealed=true]:ring-inset data-[revealed=true]:ring-accent",
        group.id === "unavailable" ? "text-warning" : "text-muted-foreground"
      )}
    >
      <ChevronRight
        aria-hidden="true"
        className={cn("size-3.5 shrink-0 transition-transform duration-150", isExpanded && "rotate-90")}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="min-w-7 shrink-0 text-right text-px10-5 font-normal tabular-nums">
        {group.locationCount}
      </span>
    </button>
  );
};
