// src/components/ProjectTree/components/CollapsedExplorerRail.tsx
import React from "react";
import { BarChart3, Folder, PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { SubagentsRailButton } from "@/components/SessionsPane/SubagentsRailButton";

interface CollapsedExplorerRailProps {
  asideId: string;
  projectCount: number;
  isViewingGlobalStats: boolean;
  isResizing?: boolean;
  onExpand?: () => void;
  onGlobalStatsClick: () => void;
  /** The explorer lists sessions inline, so the subagent list is docked in it. */
  showSubagents?: boolean;
}

/**
 * The folded explorer: expand, global statistics and the project count, and,
 * while the explorer lists sessions inline, the way to its subagent list.
 */
export const CollapsedExplorerRail: React.FC<CollapsedExplorerRailProps> = ({
  asideId,
  projectCount,
  isViewingGlobalStats,
  isResizing,
  onExpand,
  onGlobalStatsClick,
  showSubagents = false,
}) => {
  const { t } = useTranslation();
  const countLabel = t("project.locationCount", { count: projectCount });

  return (
    <aside
      id={asideId}
      aria-label={t("project.explorer")}
      tabIndex={-1}
      data-menu-boundary
      className={cn(
        "flex h-full w-12 shrink-0 flex-col items-center gap-2 border-r border-border/50 bg-sidebar py-2",
        isResizing && "select-none"
      )}
    >
      {onExpand && (
        <button
          type="button"
          onClick={onExpand}
          aria-label={t("project.expandSidebar")}
          title={t("project.expandSidebar")}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <PanelLeft className="size-4" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={onGlobalStatsClick}
        aria-pressed={isViewingGlobalStats}
        aria-label={t("project.globalStats")}
        title={t("project.globalStats")}
        className={cn(
          "flex size-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          isViewingGlobalStats
            ? "bg-accent/15 text-accent"
            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        )}
      >
        <BarChart3 className="size-4" aria-hidden="true" />
      </button>
      <div className="mt-1 flex flex-col items-center gap-1 text-muted-foreground" title={countLabel}>
        <Folder className="size-3.5" aria-hidden="true" />
        <span className="text-2xs tabular-nums" aria-hidden="true">
          {projectCount}
        </span>
        <span className="sr-only">{countLabel}</span>
      </div>
      {showSubagents && onExpand && <SubagentsRailButton onExpand={onExpand} className="mt-1" />}
    </aside>
  );
};
