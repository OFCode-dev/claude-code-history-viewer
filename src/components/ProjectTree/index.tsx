// src/components/ProjectTree/index.tsx
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "../../store/useAppStore";
import type { ClaudeProject, ClaudeSession } from "../../types";
import {
  buildExplorerModel,
  filterExplorerModel,
  findRowForProject,
  OTHER_LOCATIONS_GROUP_KEY,
  type ExplorerLabelText,
  type ExplorerRow,
} from "../../utils/explorerModel";
import { getClaudeFolderHome } from "../../utils/pathUtils";
import { formatTimeAgo as formatTimeAgoUtil } from "../../utils/time";
import { ProjectContextMenu } from "../ProjectContextMenu";
import { ActiveFilterChips } from "./components/ActiveFilterChips";
import { CollapsedExplorerRail } from "./components/CollapsedExplorerRail";
import { ExplorerHeader } from "./components/ExplorerHeader";
import { ExplorerSearch } from "./components/ExplorerSearch";
import { ExplorerTreeView } from "./components/ExplorerTreeView";
import { GlobalStatsRow } from "./components/GlobalStatsRow";
import { SessionList } from "./components/SessionList";
import { useExplorerFilters } from "./hooks/useExplorerFilters";
import { useExplorerReveal } from "./hooks/useExplorerReveal";
import { useExplorerSort } from "./hooks/useExplorerSort";
import { isGroupExpansionKey, useProjectTreeState } from "./hooks/useProjectTreeState";
import {
  initialSearchExpansion,
  useSearchExpansion,
  type SearchExpansionState,
} from "./hooks/useSearchExpansion";
import { useSelectionSync } from "./hooks/useSelectionSync";
import { useTreeNavigation } from "./hooks/useTreeNavigation";
import type { ProjectTreeProps } from "./types";

const sameItems = <T,>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * `next`, or the previous array while it holds the same items: the caller
 * filters on every render, and the tree is memoized on this array.
 */
function useStableArray<T>(next: T[]): T[] {
  const [stable, setStable] = useState(next);
  if (stable === next || sameItems(stable, next)) return stable;
  // Adjusting state during render (React's "storing information from previous renders").
  setStable(next);
  return next;
}

/** Keeps only the `dir:` / `group:` keys: closes every inline session list. */
const onlyGroupKeys = (prev: Set<string>) => {
  const next = new Set(Array.from(prev).filter(isGroupExpansionKey));
  return next.size === prev.size ? prev : next;
};

export const ProjectTree: React.FC<ProjectTreeProps> = ({
  projects,
  sessions,
  sessionsTotal = sessions.length,
  hasMoreSessions = false,
  selectedProject,
  selectedSession,
  onProjectSelect,
  onSessionSelect,
  onSessionHover,
  onLoadMoreSessions = () => {},
  onGlobalStatsClick,
  isLoading,
  isLoadingMoreSessions = false,
  isViewingGlobalStats,
  inlineSessions = true,
  width,
  isResizing,
  onResizeStart,
  onHideProject,
  onUnhideProject,
  isProjectHidden,
  isCollapsed = false,
  onToggleCollapse,
  asideId = "project-explorer",
  onClose,
}) => {
  const { t } = useTranslation();
  const keyboardHelpId = `${asideId}-keyboard-help`;
  const claudePath = useAppStore((state) => state.claudePath);
  const selectedProjectPath = selectedProject?.path ?? null;

  // Hidden projects are gone before anything else looks at the list.
  const visibleProjects = useStableArray(
    isProjectHidden ? projects.filter((project) => !isProjectHidden(project.actual_path)) : projects
  );
  const filters = useExplorerFilters({
    projects: visibleProjects,
    selectedProject,
    isViewingGlobalStats,
  });
  const { matchesProviderFilter } = filters;

  const [sort, setSort] = useExplorerSort();
  const [searchTerm, setSearchTerm] = useState("");
  // The input echoes each keystroke at once; filtering runs as a deferred render.
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const normalizedSearchTerm = deferredSearchTerm.trim().toLowerCase();
  const clearSearch = useCallback(() => setSearchTerm(""), []);

  const labelText = useMemo<ExplorerLabelText>(
    () => ({ job: (id) => t("project.label.job", { id }) }),
    [t]
  );
  const shownProjects = useMemo(
    () => visibleProjects.filter(matchesProviderFilter),
    [matchesProviderFilter, visibleProjects]
  );
  const model = useMemo(
    () =>
      buildExplorerModel(shownProjects, {
        sort,
        homeHint: getClaudeFolderHome(claudePath),
        text: labelText,
      }),
    [claudePath, labelText, shownProjects, sort]
  );
  const filtered = useMemo(
    () => filterExplorerModel(model, normalizedSearchTerm),
    [model, normalizedSearchTerm]
  );

  const searchExpansionRef = useRef<SearchExpansionState>(initialSearchExpansion());
  const {
    expandedProjects,
    setExpandedProjects,
    toggleExpansion,
    ensureProjectExpanded,
    expandGroups,
    collapseGroup,
    expandDefaultRoots,
    collapseAllGroups,
    contextMenu,
    handleContextMenu,
    closeContextMenu,
  } = useProjectTreeState(searchExpansionRef);

  // "Other locations" starts open the first time it appears.
  const hasOtherLocations = model.groups.some((group) => group.key === OTHER_LOCATIONS_GROUP_KEY);
  useEffect(() => {
    if (hasOtherLocations) expandDefaultRoots([OTHER_LOCATIONS_GROUP_KEY]);
  }, [expandDefaultRoots, hasOtherLocations]);

  const getSelectionAncestorKeys = useCallback(
    () =>
      selectedProjectPath ? (findRowForProject(model, selectedProjectPath)?.ancestorKeys ?? []) : [],
    [model, selectedProjectPath]
  );
  useSearchExpansion({
    stateRef: searchExpansionRef,
    searchTerm: normalizedSearchTerm,
    revealKeys: filtered.revealKeys,
    expandedKeys: expandedProjects,
    expandGroups,
    setExpandedKeys: setExpandedProjects,
    selectedProjectPath,
    getSelectionAncestorKeys,
  });

  const treeRef = useRef<HTMLDivElement>(null);
  const { announcement, handleTreeKeyDown, handleTreeFocus, syncRovingTabIndex } =
    useTreeNavigation({
      treeRef,
      expandGroups,
      collapseGroup,
      model: filtered.model,
      expandedKeys: expandedProjects,
      selectionKey: selectedProjectPath,
    });

  useSelectionSync({
    model,
    visibleModel: filtered.model,
    selectedProject,
    selectedSessionPath: selectedSession?.file_path ?? null,
    expandedKeys: expandedProjects,
    ensureProjectExpanded,
    treeRef,
  });

  useExplorerReveal({
    visibleModel: filtered.model,
    searchTerm,
    deferredSearchTerm,
    clearSearch,
    isCollapsed,
    onToggleCollapse,
    expandGroups,
    expandedKeys: expandedProjects,
    treeRef,
    syncRovingTabIndex,
  });

  /** Select a provider project; the selected one is never re-selected (that would clear it). */
  const selectProject = useCallback(
    (project: ClaudeProject) => {
      if (project.path === selectedProjectPath) return;
      // Accordion: only the newly selected project's inline sessions are open.
      setExpandedProjects((prev) => new Set([...onlyGroupKeys(prev), project.path]));
      onProjectSelect(project);
    },
    [onProjectSelect, selectedProjectPath, setExpandedProjects]
  );

  /**
   * A location row selects its primary project (or keeps the provider already
   * selected there). On the selected row it toggles the inline sessions, if
   * any, and otherwise does nothing.
   */
  const activateRow = useCallback(
    (row: ExplorerRow) => {
      const location = row.location;
      if (!location) return;
      const current = location.projects.find((project) => project.path === selectedProjectPath);
      if (!current) {
        selectProject(location.primary);
        return;
      }
      if (inlineSessions) toggleExpansion(current.path);
    },
    [inlineSessions, selectProject, selectedProjectPath, toggleExpansion]
  );

  const openContextMenu = useCallback(
    (event: React.MouseEvent, row: ExplorerRow) => {
      const location = row.location;
      if (!location) return;
      const lead =
        location.projects.find((project) => project.path === selectedProjectPath) ??
        location.primary;
      handleContextMenu(
        event,
        lead,
        location.projects.filter((project) => project !== lead)
      );
    },
    [handleContextMenu, selectedProjectPath]
  );

  const handleGlobalStatsClick = useCallback(() => {
    // Global statistics closes the inline session lists; folders stay as they are.
    setExpandedProjects(onlyGroupKeys);
    onGlobalStatsClick();
  }, [onGlobalStatsClick, setExpandedProjects]);

  // Picking a session also closes the mobile drawer.
  const handleSessionSelect = useCallback(
    (session: ClaudeSession) => {
      onSessionSelect(session);
      onClose?.();
    },
    [onSessionSelect, onClose]
  );

  // Re-created per render so relative times follow the active language.
  const formatTimeAgo = (dateStr: string) => formatTimeAgoUtil(dateStr);

  if (isCollapsed) {
    return (
      <CollapsedExplorerRail
        asideId={asideId}
        projectCount={shownProjects.length}
        isViewingGlobalStats={isViewingGlobalStats}
        isResizing={isResizing}
        onExpand={onToggleCollapse}
        onGlobalStatsClick={handleGlobalStatsClick}
      />
    );
  }

  const renderSessions = (level: number) => (
    <div style={{ paddingLeft: level * 14 }}>
      <SessionList
        sessions={sessions}
        sessionsTotal={sessionsTotal}
        hasMoreSessions={hasMoreSessions}
        selectedSession={selectedSession}
        isLoading={isLoading}
        isLoadingMoreSessions={isLoadingMoreSessions}
        onSessionSelect={handleSessionSelect}
        onSessionHover={onSessionHover}
        onLoadMoreSessions={onLoadMoreSessions}
        formatTimeAgo={formatTimeAgo}
      />
    </div>
  );

  const isEmpty = filtered.model.main.length === 0 && filtered.model.groups.length === 0;

  return (
    <aside
      id={asideId}
      aria-label={t("project.explorer")}
      tabIndex={-1}
      data-menu-boundary
      className={cn(
        "relative flex h-full shrink-0",
        !width && (!onToggleCollapse && onClose ? "w-full" : "w-64"),
        isResizing && "select-none"
      )}
      style={width ? { width: `${width}px` } : undefined}
    >
      <div className="flex min-w-0 flex-1 flex-col border-r border-border/50 bg-sidebar">
        <ExplorerHeader
          sort={sort}
          onSortChange={setSort}
          onCollapseAll={collapseAllGroups}
          onToggleCollapse={onToggleCollapse}
          onClose={onClose}
        />
        <GlobalStatsRow isActive={isViewingGlobalStats} onClick={handleGlobalStatsClick} />
        <ExplorerSearch value={searchTerm} onChange={setSearchTerm} filters={filters} />
        <ActiveFilterChips filters={filters} />

        <OverlayScrollbarsComponent
          // min-h-0 lets this flex child shrink instead of growing to its
          // content, so the scrollbar measures the real viewport (#101).
          className="relative min-h-0 flex-1 border-t border-border/40 pt-1"
          options={{
            scrollbars: { theme: "os-theme-custom", autoHide: "leave", autoHideDelay: 400 },
            overflow: { x: "hidden" },
          }}
        >
          {isEmpty ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              {normalizedSearchTerm ? t("project.noMatches") : t("project.notFound")}
            </p>
          ) : (
            <ExplorerTreeView
              model={filtered.model}
              matches={filtered.matches}
              expandedKeys={expandedProjects}
              selectedProject={selectedProject}
              showProviderBadge={filters.showProviderBadge}
              inlineSessions={inlineSessions}
              renderSessions={renderSessions}
              onToggleKey={toggleExpansion}
              onActivateRow={activateRow}
              onToggleSessions={activateRow}
              onSelectProject={selectProject}
              onContextMenu={openContextMenu}
              treeRef={treeRef}
              treeLabel={t("project.explorer")}
              describedBy={keyboardHelpId}
              onTreeKeyDown={handleTreeKeyDown}
              onTreeFocus={handleTreeFocus}
            />
          )}
        </OverlayScrollbarsComponent>

        <p id={keyboardHelpId} className="sr-only">
          {t("project.a11y.keyboardHelp")} {t("project.a11y.keyboardHelpFolders")}
        </p>
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>
      </div>

      {/* A thin sash over the border rather than a gutter: every pixel of the
          explorer's width goes to names. */}
      {onResizeStart && (
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-y-0 -right-1 z-30 w-1.5 cursor-col-resize transition-colors",
            "hover:bg-accent/30 active:bg-accent/40",
            isResizing && "bg-accent/40"
          )}
          onMouseDown={onResizeStart}
        />
      )}

      {contextMenu && onHideProject && onUnhideProject && isProjectHidden && (
        <ProjectContextMenu
          project={contextMenu.project}
          position={contextMenu.position}
          onClose={closeContextMenu}
          onHide={onHideProject}
          onUnhide={onUnhideProject}
          isHidden={isProjectHidden(contextMenu.project.actual_path)}
          providerSiblings={contextMenu.providerSiblings}
          onSelectProject={selectProject}
        />
      )}
    </aside>
  );
};
