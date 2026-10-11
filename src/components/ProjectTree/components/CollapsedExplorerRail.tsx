// src/components/ProjectTree/components/CollapsedExplorerRail.tsx
import React from "react";
import { BarChart3, PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { railButtonClass, railClass, railCountClass } from "@/components/ui/rail";
import { AREA_TOGGLE_ATTR, RAIL_ATTR } from "@/layouts/areaToggleAttr";
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
 * The folded explorer: expand, global statistics, the project count and,
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
      {...{ [RAIL_ATTR]: "" }}
      className={cn(railClass, "border-r border-border/50", isResizing && "select-none")}
    >
      {onExpand && (
        <button
          type="button"
          onClick={onExpand}
          {...{ [AREA_TOGGLE_ATTR]: "" }}
          aria-label={t("project.expandSidebar")}
          title={t("project.expandSidebar")}
          className={railButtonClass}
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
        className={cn(railButtonClass, isViewingGlobalStats && "bg-accent/15 text-accent")}
      >
        <BarChart3 className="size-4" aria-hidden="true" />
      </button>
      <span className={railCountClass} title={countLabel} aria-hidden="true">
        {projectCount}
      </span>
      <span className="sr-only">{countLabel}</span>
      {showSubagents && onExpand && <SubagentsRailButton onExpand={onExpand} />}
    </aside>
  );
};
