// src/components/ProjectTree/index.tsx
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Folder,
  Database,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  List,
  FolderTree,
  GitBranch,
  PanelLeftClose,
  PanelLeft,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatTimeAgo as formatTimeAgoUtil } from "../../utils/time";
import { isProjectTemporary } from "../../utils/pathUtils";
import { ProjectContextMenu } from "../ProjectContextMenu";
import { useProjectTreeState } from "./hooks/useProjectTreeState";
import { GroupedProjectList } from "./components/GroupedProjectList";
import type { ProjectTreeProps } from "./types";
import type { ProviderId, ClaudeProject, ClaudeSession } from "../../types";
import type { DirectoryGroup } from "../../utils/worktreeUtils";
import { useAppStore } from "../../store/useAppStore";
import {
  buildTreeItemAnnouncement,
  findFirstChildTreeItemIndex,
  findParentTreeItemIndex,
  findSiblingTreeItemIndexes,
  findTypeaheadMatchIndex,
  getNextTreeItemIndex,
  type TreeNavigationKey,
} from "./treeKeyboard";
import {
  buildDirectoryTree,
  getAllFolderKeys,
  getProjectExpansionKeys,
  locateInDirectoryTree,
  TEMPORARY_BUCKET_KEY,
  UNAVAILABLE_BUCKET_KEY,
} from "../../utils/directoryTree";
import {
  DEFAULT_PROVIDER_ID,
  getProviderId,
  getProviderLabel,
  normalizeProviderIds,
  PROVIDER_IDS,
} from "../../utils/providers";
import {
  ENTRYPOINT_FILTER_LABEL_KEYS,
  ENTRYPOINT_FILTER_OPTIONS,
} from "../../utils/entrypoint";

type ProviderTabId = "all" | ProviderId;

const PROVIDER_FILTERS_OPEN_STORAGE_KEY = "projectTree.providerFiltersOpen";

const loadProviderFiltersOpenState = () => {
  try {
    return localStorage.getItem(PROVIDER_FILTERS_OPEN_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

/** A reveal that asked for directory grouping gives up if the mode never changes. */
const REVEAL_MODE_SWITCH_TIMEOUT_MS = 3000;

const sameItems = <T,>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * The projects of `directoryGroups` as one array that keeps its identity while
 * the projects do. The caller rebuilds the groups on every store update, and
 * the directory tree is memoized on this array.
 */
function useStableDirectoryProjects(groups: DirectoryGroup[]): ClaudeProject[] {
  const next = useMemo(() => groups.flatMap((group) => group.projects), [groups]);
  const [stable, setStable] = useState(next);
  if (stable === next || sameItems(stable, next)) return stable;
  // Adjusting state during render (React's "storing information from previous renders").
  setStable(next);
  return next;
}

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
  groupingMode = "none",
  worktreeGroups = [],
  directoryGroups = [],
  ungroupedProjects,
  onGroupingModeChange,
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
  const activeProviders = useAppStore((state) => state.activeProviders);
  const detectedProviders = useAppStore((state) => state.providers);
  const isDetectingProviders = useAppStore((state) => state.isDetectingProviders);
  const isLoadingProjects = useAppStore((state) => state.isLoadingProjects);
  const discoverProviders = useAppStore((state) => state.discoverProviders);
  const setActiveProviders = useAppStore((state) => state.setActiveProviders);
  const sessionEntrypointFilter = useAppStore((state) => state.sessionEntrypointFilter);
  const setSessionEntrypointFilter = useAppStore((state) => state.setSessionEntrypointFilter);
  const loadGlobalStats = useAppStore((state) => state.loadGlobalStats);
  const clearProjectSelection = useAppStore(
    (state) => state.clearProjectSelection
  );
  const explorerRevealRequest = useAppStore((state) => state.explorerRevealRequest);
  const clearExplorerRevealRequest = useAppStore(
    (state) => state.clearExplorerRevealRequest
  );

  const {
    expandedProjects,
    setExpandedProjects,
    isProjectExpanded,
    ensureProjectExpanded,
    expandGroups,
    collapseGroup,
    collapseGroups,
    expandDefaultRoots,
    collapseAllGroups,
    contextMenu,
    handleContextMenu,
    closeContextMenu,
  } = useProjectTreeState(groupingMode);

  const [searchTerm, setSearchTerm] = useState("");
  const [areProviderFiltersOpen, setAreProviderFiltersOpen] = useState(
    loadProviderFiltersOpenState
  );
  const searchInputId = React.useId();

  useEffect(() => {
    try {
      localStorage.setItem(
        PROVIDER_FILTERS_OPEN_STORAGE_KEY,
        String(areProviderFiltersOpen)
      );
    } catch {
      // localStorage may be unavailable; the collapsed default still works.
    }
  }, [areProviderFiltersOpen]);

  // Wrap session select to also close mobile drawer
  const handleSessionSelect = useCallback(
    (session: ClaudeSession) => {
      onSessionSelect(session);
      onClose?.();
    },
    [onSessionSelect, onClose]
  );

  const providerCounts = useMemo(() => {
    const counts: Record<ProviderTabId, number> = {
      all: projects.length,
      aider: 0,
      amazonq: 0,
      antigravity: 0,
      claude: 0,
      cline: 0,
      codebuddy: 0,
      codex: 0,
      continue: 0,
      "copilot": 0,
      crush: 0,
      cursor: 0,
      "cursor-agent": 0,
      forgecode: 0,
      gemini: 0,
      goose: 0,
      grok: 0,
      kimi: 0,
      kiro: 0,
      llm: 0,
      opencode: 0,
      openhands: 0,
      openinterpreter: 0,
      ompi: 0,
      pi: 0,
      pearai: 0,
      qwen: 0,
      trae: 0,
      vibe: 0,
      zed: 0,
    };

    for (const project of projects) {
      counts[getProviderId(project.provider)] += 1;
    }

    return counts;
  }, [projects]);

  const selectableProviderIds = useMemo<ProviderId[]>(() => {
    const detected = detectedProviders
      .filter((provider) => provider.is_available)
      .map((provider) => provider.id as ProviderId);
    const discoveredFromProjects = PROVIDER_IDS.filter((id) => providerCounts[id] > 0);
    const ordered = PROVIDER_IDS.filter((id) =>
      detected.includes(id) || discoveredFromProjects.includes(id)
    );
    return ordered.length > 0 ? ordered : [DEFAULT_PROVIDER_ID];
  }, [detectedProviders, providerCounts]);

  const selectedProviderFilters = useMemo<ProviderId[]>(
    () => PROVIDER_IDS.filter((id) => activeProviders.includes(id) && selectableProviderIds.includes(id)),
    [activeProviders, selectableProviderIds]
  );

  const isAllProvidersSelected = useMemo(
    () =>
      // While provider detection is in progress, treat as "all selected"
      // to avoid a brief flash of incorrect filter state.
      isDetectingProviders ||
      (selectableProviderIds.length > 0 &&
        selectableProviderIds.every((provider) => selectedProviderFilters.includes(provider))),
    [isDetectingProviders, selectableProviderIds, selectedProviderFilters]
  );

  const showProviderBadge = isAllProvidersSelected
    ? selectableProviderIds.length > 1
    : selectedProviderFilters.length !== 1;

  const providerFilterSummary = useMemo(() => {
    let summary: string;
    if (isAllProvidersSelected) {
      summary = t("session.board.controls.all", "ALL");
    } else {
      const labels = selectedProviderFilters
        .slice(0, 2)
        .map((providerId) =>
          getProviderLabel((key, fallback) => t(key, fallback), providerId)
        );
      const remainingCount = selectedProviderFilters.length - labels.length;
      summary =
        remainingCount > 0
          ? `${labels.join(", ")} +${remainingCount}`
          : labels.join(", ");
    }

    // The source (entrypoint) filter sits in the same collapsible panel, so an
    // active one is surfaced in the collapsed summary instead of hiding behind it.
    return sessionEntrypointFilter === "all"
      ? summary
      : `${summary} · ${t(ENTRYPOINT_FILTER_LABEL_KEYS[sessionEntrypointFilter])}`;
  }, [isAllProvidersSelected, selectedProviderFilters, sessionEntrypointFilter, t]);

  const areFiltersAtDefault =
    isAllProvidersSelected && sessionEntrypointFilter === "all";

  const providerFilterCount = useMemo(
    () =>
      isAllProvidersSelected
        ? providerCounts.all
        : selectedProviderFilters.reduce(
            (count, providerId) => count + providerCounts[providerId],
            0
          ),
    [isAllProvidersSelected, providerCounts, selectedProviderFilters]
  );

  const matchesProviderFilter = useCallback(
    (project: (typeof projects)[number]) =>
      isAllProvidersSelected || selectedProviderFilters.includes(getProviderId(project.provider)),
    [isAllProvidersSelected, selectedProviderFilters]
  );

  const applyProviderSelection = useCallback(
    async (nextProviders: ProviderId[]) => {
      const normalized = normalizeProviderIds(nextProviders);
      if (normalized.length === 0) {
        return;
      }

      const current = normalizeProviderIds(activeProviders);
      const isUnchanged =
        current.length === normalized.length &&
        current.every((id, index) => id === normalized[index]);
      if (isUnchanged) {
        return;
      }

      const previousSelectedProjectPath = selectedProject?.path;
      const shouldClearSelection =
        selectedProject !== null &&
        !normalized.includes(getProviderId(selectedProject.provider));

      try {
        setActiveProviders(normalized);

        if (isViewingGlobalStats) {
          await loadGlobalStats();
        }

        // Clear selection only after provider switch finishes successfully.
        // This prevents rollback paths from leaving cleared selection behind.
        if (shouldClearSelection) {
          const latestSelectedProject = useAppStore.getState().selectedProject;
          if (latestSelectedProject?.path === previousSelectedProjectPath) {
            clearProjectSelection();
          }
        }
      } catch (error) {
        console.error("Failed to apply provider selection:", error);
        setActiveProviders(current);
        toast.error(t("common.provider.filterApplyError", "Failed to apply provider filter"));
      }
    },
    [
      activeProviders,
      clearProjectSelection,
      isViewingGlobalStats,
      loadGlobalStats,
      selectedProject,
      setActiveProviders,
      t,
    ]
  );

  const handleProviderTabClick = useCallback(async (provider: ProviderTabId) => {
    if (provider === "all") {
      await applyProviderSelection(selectableProviderIds);
      return;
    }

    if (isAllProvidersSelected) {
      await applyProviderSelection([provider]);
      return;
    }

    if (selectedProviderFilters.includes(provider)) {
      const next = selectedProviderFilters.filter((id) => id !== provider);
      if (next.length === 0) {
        await applyProviderSelection(selectableProviderIds);
        return;
      }
      await applyProviderSelection(next);
      return;
    }

    const next = PROVIDER_IDS.filter(
      (id) => selectableProviderIds.includes(id) && (selectedProviderFilters.includes(id) || id === provider)
    );
    await applyProviderSelection(next.length > 0 ? next : [provider]);
  }, [applyProviderSelection, isAllProvidersSelected, selectableProviderIds, selectedProviderFilters]);

  const handleDiscoverProviders = useCallback(() => {
    void discoverProviders().catch((error) => {
      console.error("Failed to discover providers:", error);
      toast.error(t("common.provider.detectError"));
    });
  }, [discoverProviders, t]);

  // Defer the filtering work: the input echoes each keystroke immediately
  // while re-filtering hundreds/thousands of projects runs as an
  // interruptible low-priority render (no per-keystroke jank).
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const normalizedSearchTerm = useMemo(
    () => deferredSearchTerm.trim().toLowerCase(),
    [deferredSearchTerm]
  );

  const matchesSearch = useCallback(
    (project: (typeof projects)[number]) => {
      if (!normalizedSearchTerm) return true;
      const name = (project.name ?? "").toLowerCase();
      const path = (project.actual_path ?? project.path ?? "").toLowerCase();
      return name.includes(normalizedSearchTerm) || path.includes(normalizedSearchTerm);
    },
    [normalizedSearchTerm]
  );

  const filteredProjects = useMemo(
    () => projects.filter((p) => matchesProviderFilter(p) && matchesSearch(p)),
    [projects, matchesProviderFilter, matchesSearch]
  );

  // `directoryGroups` (visible projects only) is authoritative for directory
  // mode; the tree below is rebuilt only when its projects or filters change.
  const directoryProjects = useStableDirectoryProjects(directoryGroups);

  const filteredDirectoryProjects = useMemo(
    () =>
      isAllProvidersSelected && !normalizedSearchTerm
        ? directoryProjects
        : directoryProjects.filter((p) => matchesProviderFilter(p) && matchesSearch(p)),
    [directoryProjects, isAllProvidersSelected, matchesProviderFilter, matchesSearch, normalizedSearchTerm]
  );

  const directoryTree = useMemo(
    () => (groupingMode === "directory" ? buildDirectoryTree(filteredDirectoryProjects) : null),
    [filteredDirectoryProjects, groupingMode]
  );

  const { filteredWorktreeGroups, filteredUngroupedProjects } = useMemo(() => {
    const baseUngrouped = ungroupedProjects ?? projects;
    const filterFn = (p: (typeof projects)[number]) =>
      matchesProviderFilter(p) && matchesSearch(p);

    if (isAllProvidersSelected && !normalizedSearchTerm) {
      return {
        filteredWorktreeGroups: worktreeGroups,
        filteredUngroupedProjects: baseUngrouped,
      };
    }

    const nextGroups: typeof worktreeGroups = [];
    const movedChildren: (typeof projects)[number][] = [];

    for (const group of worktreeGroups) {
      const includeParent = filterFn(group.parent);
      const matchingChildren = group.children.filter(filterFn);

      if (includeParent) {
        nextGroups.push({
          ...group,
          children: matchingChildren,
        });
      } else if (matchingChildren.length > 0) {
        movedChildren.push(...matchingChildren);
      }
    }

    const baseFiltered = baseUngrouped.filter(filterFn);
    const seenPaths = new Set(baseFiltered.map((project) => project.path));
    const movedChildrenToAdd = movedChildren.filter((child) => {
      if (seenPaths.has(child.path)) {
        return false;
      }
      seenPaths.add(child.path);
      return true;
    });
    const nextUngrouped = [...baseFiltered, ...movedChildrenToAdd];

    return {
      filteredWorktreeGroups: nextGroups,
      filteredUngroupedProjects: nextUngrouped,
    };
  }, [worktreeGroups, ungroupedProjects, projects, isAllProvidersSelected, matchesProviderFilter, matchesSearch, normalizedSearchTerm]);

  const providerTabs = useMemo(
    () => {
      const base = [
        {
          id: "all" as const,
          label: t("session.board.controls.all", "ALL"),
          count: providerCounts.all,
        },
      ];

      const providerTabs = PROVIDER_IDS.map((id) => ({
        id,
        label: getProviderLabel((key, fallback) => t(key, fallback), id),
        count: providerCounts[id],
      }));

      return [...base, ...providerTabs];
    },
    [providerCounts, t]
  );

  // Re-created per render so the label follows the active language.
  const formatTimeAgo = (dateStr: string) => formatTimeAgoUtil(dateStr);

  // Unified project click handler: syncs expand state with selection + accordion behavior
  const handleProjectClick = useCallback(
    (project: typeof selectedProject) => {
      if (!project) return;

      const isCurrentlySelected = selectedProject?.path === project.path;

      if (isCurrentlySelected) {
        // Deselecting: also collapse
        setExpandedProjects((prev) => {
          const next = new Set(prev);
          next.delete(project.path);
          return next;
        });
      } else {
        // Selecting new project: collapse all other projects (accordion), expand this one
        setExpandedProjects((prev) => {
          const next = new Set<string>();
          // Preserve group-level expansions (dir:, group: prefixed keys)
          for (const key of prev) {
            if (key.startsWith("dir:") || key.startsWith("group:")) {
              next.add(key);
            }
          }
          next.add(project.path);
          return next;
        });
      }

      onProjectSelect(project);
    },
    [selectedProject, onProjectSelect, setExpandedProjects]
  );

  /**
   * Group rows that must be open for the selected project's row to show, or
   * null when the current (filtered) tree has no row for it.
   */
  const getSelectedProjectGroupKeys = useCallback((): string[] | null => {
    if (!selectedProject) return [];

    if (selectedProject.path_status === "unavailable") {
      return [UNAVAILABLE_BUCKET_KEY];
    }
    // Temporary-location projects render under their own bucket in every
    // grouping mode, so that bucket (not the directory group) must open.
    if (isProjectTemporary(selectedProject)) {
      return [TEMPORARY_BUCKET_KEY];
    }

    if (groupingMode === "directory" && directoryTree) {
      return getProjectExpansionKeys(
        directoryTree,
        selectedProject.actual_path || selectedProject.path
      );
    }

    if (groupingMode === "worktree") {
      const group = worktreeGroups.find(
        (candidate) =>
          candidate.parent.path === selectedProject.path ||
          candidate.children.some((project) => project.path === selectedProject.path)
      );
      return group ? [`group:${group.parent.path}`] : [];
    }

    return [];
  }, [directoryTree, groupingMode, selectedProject, worktreeGroups]);

  // Global search and deep-link flows select projects through the store rather
  // than through handleProjectClick, so the tree's local expansion state would
  // otherwise stay collapsed (#486). Re-apply the selected project/session to
  // the tree and include its containing groups (every ancestor folder) when grouped.
  // Only a new selection (or grouping mode) does this: a tree rebuilt by a
  // search or filter change must not re-open folders the user collapsed.
  const appliedSelectionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedProject?.path) {
      appliedSelectionRef.current = null;
      return;
    }
    const signature = [groupingMode, selectedProject.path, selectedSession?.file_path ?? ""].join("\n");
    if (appliedSelectionRef.current === signature) return;

    const groupKeys = getSelectedProjectGroupKeys();
    if (groupKeys === null) {
      // Filtered out of the tree for now; open its ancestors once it is back.
      ensureProjectExpanded(selectedProject.path);
      return;
    }
    appliedSelectionRef.current = signature;
    ensureProjectExpanded(selectedProject.path, groupKeys);
  }, [
    ensureProjectExpanded,
    getSelectedProjectGroupKeys,
    groupingMode,
    selectedProject?.path,
    selectedSession?.file_path,
  ]);

  // A directory root starts expanded the first time it appears (persisted from then on).
  useEffect(() => {
    if (directoryTree && directoryTree.roots.length > 0) {
      expandDefaultRoots(directoryTree.roots.map((root) => root.key));
    }
  }, [directoryTree, expandDefaultRoots]);

  // Searching in directory mode opens every folder of the filtered tree so the
  // matches are visible; clearing the search closes the folders it opened,
  // except the ancestors of a project selected while searching. Runs once per
  // search term, so collapsing a folder while searching sticks.
  const searchExpansionRef = useRef<{ term: string; opened: string[]; selectionAtStart: string | null }>({
    term: "",
    opened: [],
    selectionAtStart: null,
  });
  useEffect(() => {
    const search = searchExpansionRef.current;
    if (!directoryTree || search.term === normalizedSearchTerm) return;
    if (!search.term) search.selectionAtStart = selectedProject?.path ?? null;
    search.term = normalizedSearchTerm;

    if (normalizedSearchTerm) {
      const opened = getAllFolderKeys(directoryTree).filter((key) => !expandedProjects.has(key));
      search.opened = [...new Set([...search.opened, ...opened])];
      expandGroups(opened);
      return;
    }
    const selectedWhileSearching = (selectedProject?.path ?? null) !== search.selectionAtStart;
    const keep = new Set(selectedWhileSearching ? getSelectedProjectGroupKeys() ?? [] : []);
    collapseGroups(search.opened.filter((key) => !keep.has(key)));
    search.opened = [];
  }, [
    collapseGroups,
    directoryTree,
    expandGroups,
    expandedProjects,
    getSelectedProjectGroupKeys,
    normalizedSearchTerm,
    selectedProject?.path,
  ]);

  const handleGlobalStatsClick = useCallback(() => {
    // Global stats 진입 시 현재 열려 있는 프로젝트 확장을 닫는다.
    setExpandedProjects((prev) => {
      if (prev.size === 0) {
        return prev;
      }

      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        if (key.startsWith("dir:") || key.startsWith("group:")) {
          next.add(key);
          continue;
        }
        changed = true;
      }

      return changed ? next : prev;
    });

    onGlobalStatsClick();
  }, [onGlobalStatsClick, setExpandedProjects]);

  const sidebarStyle = isCollapsed ? { width: "48px" } : width ? { width: `${width}px` } : undefined;
  const treeRef = useRef<HTMLDivElement>(null);
  const typeaheadQueryRef = useRef("");
  const typeaheadTimeoutRef = useRef<number | null>(null);
  const [treeAnnouncement, setTreeAnnouncement] = useState("");

  const announceTree = useCallback((message: string) => {
    if (!message) return;
    setTreeAnnouncement((previous) => (previous === message ? `${message} ` : message));
  }, []);

  const describeTreeItem = useCallback((item: HTMLElement) => {
    const rawLabel = item.getAttribute("aria-label") || item.textContent || "";
    return buildTreeItemAnnouncement(
      rawLabel,
      {
        ariaExpanded: item.getAttribute("aria-expanded") as "true" | "false" | null,
        ariaSelected: item.getAttribute("aria-selected") as "true" | "false" | null,
      },
      {
        expanded: t("project.a11y.expandedState", "expanded"),
        collapsed: t("project.a11y.collapsedState", "collapsed"),
        selected: t("project.a11y.selectedState", "selected"),
      },
      t("project.explorer")
    );
  }, [t]);

  const syncRovingTabIndex = useCallback((preferredItem?: HTMLElement) => {
    const tree = treeRef.current;
    if (!tree) return;

    const treeItems = Array.from(
      tree.querySelectorAll<HTMLElement>('[role="treeitem"]')
    );
    if (treeItems.length === 0) {
      return;
    }

    const activeElement = document.activeElement;
    const focusedItem = activeElement instanceof HTMLElement
      ? activeElement.closest<HTMLElement>('[role="treeitem"]')
      : null;

    const selectedItem = treeItems.find((item) => item.getAttribute("aria-selected") === "true");
    const fallbackItem = selectedItem ?? treeItems[0];
    const nextTabStop = preferredItem ?? focusedItem ?? fallbackItem;

    for (const item of treeItems) {
      item.tabIndex = item === nextTabStop ? 0 : -1;
    }
  }, []);

  // Expansion changes too: collapsing a folder unmounts the row that held the
  // tab stop, and the tree must keep exactly one.
  useEffect(() => {
    const frameId = requestAnimationFrame(() => syncRovingTabIndex());
    return () => cancelAnimationFrame(frameId);
  }, [
    syncRovingTabIndex,
    filteredProjects.length,
    directoryTree,
    filteredWorktreeGroups.length,
    filteredUngroupedProjects.length,
    expandedProjects,
    groupingMode,
    selectedProject?.path,
    isViewingGlobalStats,
  ]);

  // Scroll to the selection when it changes, once its row exists (its
  // ancestors may open a render later) — not on every expand/collapse, which
  // would pull the list away from the folder the user just opened.
  const pendingSelectionScrollRef = useRef<string | null>(null);
  useEffect(() => {
    pendingSelectionScrollRef.current = selectedProject?.path ?? null;
  }, [selectedProject?.path, selectedSession?.file_path]);

  useEffect(() => {
    const target = pendingSelectionScrollRef.current;
    if (!target || !treeRef.current) return;

    const frameId = requestAnimationFrame(() => {
      const projectItem = Array.from(
        treeRef.current?.querySelectorAll<HTMLElement>(
          '[data-tree-node="project"]'
        ) ?? []
      ).find((item) => item.dataset.projectPath === target);
      if (!projectItem) return;

      pendingSelectionScrollRef.current = null;
      projectItem.scrollIntoView?.({ block: "nearest" });
    });

    return () => cancelAnimationFrame(frameId);
  }, [expandedProjects, directoryTree, selectedProject?.path, selectedSession?.file_path]);

  // Reveal requests (header breadcrumb): show the directory tree, open the
  // ancestors of the requested path, then scroll to and focus its row. Each
  // step that changes props/state returns and resumes on the next run.
  const [revealFocusKey, setRevealFocusKey] = useState<string | null>(null);
  const handledRevealNonceRef = useRef<number | null>(null);
  // Side effects already requested for a nonce; the effect re-runs until the
  // props catch up and must not toggle the sidebar or save settings again.
  const revealStepsRef = useRef<{ nonce: number; expandedSidebar: boolean; switchedMode: boolean }>({
    nonce: -1,
    expandedSidebar: false,
    switchedMode: false,
  });

  useEffect(() => {
    const request = explorerRevealRequest;
    if (!request || handledRevealNonceRef.current === request.nonce) return;
    if (revealStepsRef.current.nonce !== request.nonce) {
      revealStepsRef.current = { nonce: request.nonce, expandedSidebar: false, switchedMode: false };
    }
    const steps = revealStepsRef.current;
    const abandon = () => {
      handledRevealNonceRef.current = request.nonce;
      clearExplorerRevealRequest();
    };

    if (isCollapsed && onToggleCollapse) {
      if (!steps.expandedSidebar) {
        steps.expandedSidebar = true;
        onToggleCollapse();
      }
      return;
    }
    if (groupingMode !== "directory") {
      if (!onGroupingModeChange) {
        abandon();
        return;
      }
      if (!steps.switchedMode) {
        steps.switchedMode = true;
        onGroupingModeChange("directory");
      }
      // If saving the grouping mode fails, drop the request instead of letting
      // it fire whenever the user later picks directory mode by hand.
      const timer = window.setTimeout(abandon, REVEAL_MODE_SWITCH_TIMEOUT_MS);
      return () => window.clearTimeout(timer);
    }
    // The breadcrumb is an explicit request to show this path: keep the
    // user's search when it already shows the row, otherwise clear it (and
    // wait for the deferred filter to catch up).
    if (searchTerm || normalizedSearchTerm) {
      const settled = deferredSearchTerm === searchTerm;
      const visible =
        settled && directoryTree ? locateInDirectoryTree(directoryTree, request.path) : null;
      if (visible?.match !== "exact") {
        if (settled) setSearchTerm("");
        return;
      }
    }

    handledRevealNonceRef.current = request.nonce;
    const target = directoryTree ? locateInDirectoryTree(directoryTree, request.path) : null;
    if (!target) {
      clearExplorerRevealRequest();
      return;
    }
    expandGroups(target.ancestorKeys);
    setRevealFocusKey(target.key);
  }, [
    clearExplorerRevealRequest,
    deferredSearchTerm,
    directoryTree,
    expandGroups,
    explorerRevealRequest,
    groupingMode,
    isCollapsed,
    normalizedSearchTerm,
    onGroupingModeChange,
    onToggleCollapse,
    searchTerm,
  ]);

  useEffect(() => {
    if (!revealFocusKey) return;

    const frameId = requestAnimationFrame(() => {
      const row = Array.from(
        treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []
      ).find((item) => item.dataset.treeKey === revealFocusKey);
      if (row) {
        row.scrollIntoView?.({ block: "nearest" });
        syncRovingTabIndex(row);
        row.focus();
      }
      setRevealFocusKey(null);
      clearExplorerRevealRequest();
    });

    return () => cancelAnimationFrame(frameId);
  }, [clearExplorerRevealRequest, expandedProjects, revealFocusKey, syncRovingTabIndex]);

  const handleTreeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const treeItems = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]')
    );
    if (treeItems.length === 0) {
      return;
    }

    const currentItem = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    const currentIndex = currentItem ? treeItems.indexOf(currentItem) : -1;
    if (currentIndex < 0) {
      return;
    }

    const levels = treeItems.map((item) => Number(item.getAttribute("aria-level") ?? "1"));
    const focusItem = (index: number) => {
      const nextItem = treeItems[index];
      if (!nextItem) return;
      syncRovingTabIndex(nextItem);
      nextItem.focus();
      announceTree(describeTreeItem(nextItem));
    };

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      // Project rows expand/collapse their inline sessions themselves.
      if (event.defaultPrevented || !currentItem) return;
      const isGroupRow = currentItem.getAttribute("data-tree-node") === "group";
      const groupKey = currentItem.getAttribute("data-tree-key");
      const ariaExpanded = currentItem.getAttribute("aria-expanded");

      let nextIndex = -1;
      if (event.key === "ArrowRight") {
        if (isGroupRow && groupKey && ariaExpanded === "false") {
          event.preventDefault();
          expandGroups([groupKey]);
          return;
        }
        if (ariaExpanded === "true") {
          nextIndex = findFirstChildTreeItemIndex(levels, currentIndex);
        }
      } else {
        if (isGroupRow && groupKey && ariaExpanded === "true") {
          event.preventDefault();
          collapseGroup(groupKey);
          return;
        }
        nextIndex = findParentTreeItemIndex(levels, currentIndex);
      }
      if (nextIndex >= 0) {
        event.preventDefault();
        focusItem(nextIndex);
      }
      return;
    }

    if (event.key === "*") {
      event.preventDefault();
      const siblingGroups = findSiblingTreeItemIndexes(levels, currentIndex)
        .map((index) => treeItems[index])
        .filter(
          (item): item is HTMLElement =>
            item !== undefined &&
            item.getAttribute("data-tree-expandable") === "true" &&
            item.getAttribute("aria-expanded") === "false"
        );

      const siblingGroupKeys = siblingGroups
        .map((item) => item.getAttribute("data-tree-key"))
        .filter((key): key is string => Boolean(key));

      expandGroups(siblingGroupKeys);
      announceTree(
        t(
          "project.expandedSiblingGroups",
          "Expanded {{count}} sibling groups",
          { count: siblingGroups.length }
        )
      );
      return;
    }

    if (
      event.key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const nextQuery = `${typeaheadQueryRef.current}${event.key.toLowerCase()}`;
      typeaheadQueryRef.current = nextQuery;
      if (typeaheadTimeoutRef.current) {
        window.clearTimeout(typeaheadTimeoutRef.current);
      }
      typeaheadTimeoutRef.current = window.setTimeout(() => {
        typeaheadQueryRef.current = "";
        typeaheadTimeoutRef.current = null;
      }, 500);

      const labels = treeItems.map((item) => item.textContent ?? "");
      const matchIndex = findTypeaheadMatchIndex(labels, currentIndex, nextQuery);
      if (matchIndex >= 0) {
        event.preventDefault();
        const nextItem = treeItems[matchIndex];
        syncRovingTabIndex(nextItem);
        nextItem?.focus();
        if (nextItem) {
          announceTree(describeTreeItem(nextItem));
        }
      }
      return;
    }

    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    const nextIndex = getNextTreeItemIndex(
      currentIndex,
      treeItems.length,
      event.key as TreeNavigationKey
    );
    if (nextIndex === currentIndex || nextIndex < 0) {
      return;
    }

    event.preventDefault();
    focusItem(nextIndex);
  }, [announceTree, collapseGroup, describeTreeItem, expandGroups, syncRovingTabIndex, t]);

  useEffect(() => () => {
    if (typeaheadTimeoutRef.current) {
      window.clearTimeout(typeaheadTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;

    const selectedItem = tree.querySelector<HTMLElement>('[role="treeitem"][aria-selected="true"]');
    if (!selectedItem) return;

    announceTree(
      t("project.currentSelection", "Selected: {{item}}", {
        item: describeTreeItem(selectedItem),
      })
    );
  }, [announceTree, describeTreeItem, isViewingGlobalStats, selectedProject?.path, t]);

  // Collapsed View
  if (isCollapsed) {
    return (
      <aside
        id={asideId}
        aria-label={t("project.explorer")}
        tabIndex={-1}
        data-menu-boundary
        className={cn("flex-shrink-0 bg-sidebar border-r-0 flex h-full", isResizing && "select-none")}
        style={sidebarStyle}
      >
        <div className="flex-1 flex flex-col items-center py-3 gap-2 relative">
          {/* Right accent border */}
          <div className="absolute right-0 inset-y-0 w-[2px] bg-gradient-to-b from-accent/40 via-accent/60 to-accent/40" />

          {/* Expand Button */}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                "bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
              )}
              title={t("project.expandSidebar", "Expand sidebar")}
              aria-label={t("project.expandSidebar", "Expand sidebar")}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}

          <div className="w-6 h-px bg-accent/20" />

          {/* Global Stats Icon */}
          <button
            onClick={handleGlobalStatsClick}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
              isViewingGlobalStats ? "bg-accent/20 text-accent" : "text-muted-foreground hover:bg-accent/10 hover:text-accent"
            )}
            aria-label={t("project.globalStats")}
            title={t("project.globalStats")}
          >
            <Database className="w-4 h-4" />
          </button>

          <div className="w-6 h-px bg-accent/20" />

          {/* Projects Count */}
          <div className="flex flex-col items-center gap-1">
            <Folder className="w-4 h-4 text-muted-foreground" />
            <span className="text-2xs font-mono text-muted-foreground">{filteredProjects.length}</span>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      id={asideId}
      aria-label={t("project.explorer")}
      tabIndex={-1}
      data-menu-boundary
      className={cn("flex-shrink-0 bg-sidebar border-r-0 flex h-full", !width && (!onToggleCollapse && onClose ? "w-full" : "w-64"), isResizing && "select-none")}
      style={sidebarStyle}
    >
      {/* Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Right accent border */}
        <div className="absolute right-0 inset-y-0 w-[2px] bg-gradient-to-b from-accent/40 via-accent/60 to-accent/40" />

        {/* Sidebar Header */}
        <div className="px-4 py-3 bg-accent/5 border-b border-accent/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Collapse Button (desktop) */}
              {onToggleCollapse && (
                <button
                  onClick={onToggleCollapse}
                  className={cn(
                    "p-1 rounded-md transition-colors",
                    "text-muted-foreground hover:text-accent hover:bg-accent/10"
                  )}
                  title={t("project.collapseSidebar", "Collapse sidebar")}
                  aria-label={t("project.collapseSidebar", "Collapse sidebar")}
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              )}
              {/* Close Button (mobile drawer) */}
              {!onToggleCollapse && onClose && (
                <button
                  onClick={onClose}
                  className={cn(
                    "p-1 rounded-md transition-colors",
                    "text-muted-foreground hover:text-accent hover:bg-accent/10"
                  )}
                  title={t("common.close", "Close")}
                  aria-label={t("common.close", "Close")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-widest text-accent">
                {t("project.explorer")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Grouping Mode Tabs */}
              {onGroupingModeChange && (
                <div className="flex items-center bg-muted/30 rounded-md p-0.5 gap-0.5">
                  {/* Flat (No Grouping) */}
                  <button
                    onClick={() => onGroupingModeChange("none")}
                    className={cn(
                      "p-1 rounded transition-all duration-200",
                      groupingMode === "none" ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-accent hover:bg-accent/10"
                    )}
                    title={t("project.groupingNone", "Flat list")}
                    aria-label={t("project.groupingNone", "Flat list")}
                  >
                    <List className="w-3 h-3" />
                  </button>
                  {/* Directory Grouping */}
                  <button
                    onClick={() => onGroupingModeChange("directory")}
                    className={cn(
                      "p-1 rounded transition-all duration-200",
                      groupingMode === "directory"
                        ? "bg-blue-500/20 text-blue-500"
                        : "text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10"
                    )}
                    title={t("project.groupingDirectory", "Group by directory")}
                    aria-label={t("project.groupingDirectory", "Group by directory")}
                  >
                    <FolderTree className="w-3 h-3" />
                  </button>
                  {/* Worktree Grouping */}
                  <button
                    onClick={() => onGroupingModeChange("worktree")}
                    className={cn(
                      "p-1 rounded transition-all duration-200",
                      groupingMode === "worktree"
                        ? "bg-emerald-500/20 text-emerald-500"
                        : "text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10"
                    )}
                    title={t("project.groupingWorktree", "Group by worktree")}
                    aria-label={t("project.groupingWorktree", "Group by worktree")}
                  >
                    <GitBranch className="w-3 h-3" />
                  </button>
                </div>
              )}
              <span className="text-xs font-mono text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                {filteredProjects.length}
              </span>
            </div>
          </div>
          <Collapsible
            open={areProviderFiltersOpen}
            onOpenChange={setAreProviderFiltersOpen}
            className="mt-2"
          >
            <div className="flex items-center gap-1.5">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 py-1",
                    "bg-muted/30 text-left text-2xs font-medium text-muted-foreground transition-colors",
                    "hover:bg-accent/8 hover:text-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
                  )}
                  title={providerFilterSummary}
                  aria-label={`${areProviderFiltersOpen
                    ? t("common.collapse", "Collapse")
                    : t("common.expand", "Expand")}: ${providerFilterSummary} (${providerFilterCount})`}
                >
                  {areProviderFiltersOpen ? (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {providerFilterSummary}
                  </span>
                  <span className="rounded bg-accent/15 px-1 py-0.5 font-mono text-px10 leading-none text-accent">
                    {providerFilterCount}
                  </span>
                </button>
              </CollapsibleTrigger>
              <button
                onClick={() => {
                  void applyProviderSelection(selectableProviderIds);
                  if (sessionEntrypointFilter !== "all") {
                    void setSessionEntrypointFilter("all");
                  }
                }}
                disabled={areFiltersAtDefault}
                className={cn(
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors",
                  areFiltersAtDefault
                    ? "border-transparent bg-muted/20 text-muted-foreground/50 cursor-not-allowed"
                    : "border-transparent bg-muted/30 hover:bg-accent/8 hover:text-accent"
                )}
                title={t("project.resetProviderFilters", "Reset")}
                aria-label={t("project.resetProviderFilters", "Reset")}
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              {/* In this row rather than next to the grouping tabs: the title
                  row has no room left at the minimum explorer width. */}
              {groupingMode !== "none" && (
                <button
                  type="button"
                  onClick={collapseAllGroups}
                  className={cn(
                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent",
                    "bg-muted/30 text-muted-foreground transition-colors hover:bg-accent/8 hover:text-accent",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                  title={t("project.collapseAll", "Collapse all")}
                  aria-label={t("project.collapseAll", "Collapse all")}
                >
                  <ChevronsDownUp className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
            <CollapsibleContent>
              <div className="mt-2 space-y-2 max-h-52 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={handleDiscoverProviders}
                  disabled={isDetectingProviders || isLoadingProjects}
                  className={cn(
                    "inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-2xs font-medium transition-colors",
                    isDetectingProviders || isLoadingProjects
                      ? "cursor-not-allowed border-transparent bg-muted/20 text-muted-foreground/50"
                      : "border-accent/20 bg-accent/5 text-accent hover:bg-accent/10"
                  )}
                  title={t("project.discoverProviders", "Find other providers")}
                  aria-label={t("project.discoverProviders", "Find other providers")}
                >
                  <Search className="h-3 w-3" aria-hidden="true" />
                  <span>
                    {isDetectingProviders || isLoadingProjects
                      ? t("project.discoveringProviders", "Searching for providers...")
                      : t("project.discoverProviders", "Find other providers")}
                  </span>
                </button>
                <div
                  className="flex flex-wrap items-center gap-1"
                  role="group"
                  aria-label={t("project.providerFilterLabel", "Provider")}
                >
                  <span className="mr-1 text-2xs text-muted-foreground">
                    {t("project.providerFilterLabel", "Provider")}
                  </span>
                  {providerTabs.map((tab) => {
                    const isActive = tab.id === "all"
                      ? isAllProvidersSelected
                      : !isAllProvidersSelected && selectedProviderFilters.includes(tab.id);
                    const isDisabled = tab.id !== "all" && !selectableProviderIds.includes(tab.id);

                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          void handleProviderTabClick(tab.id);
                        }}
                        disabled={isDisabled}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-2xs font-medium transition-colors",
                          isDisabled
                            ? "bg-muted/20 text-muted-foreground/50 border-transparent cursor-not-allowed"
                            : isActive
                            ? "bg-accent/15 text-accent border-accent/30"
                            : "bg-muted/30 text-muted-foreground border-transparent hover:bg-accent/8 hover:text-accent"
                        )}
                        title={tab.label}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={cn(
                            "px-1 py-0.5 rounded text-px10 font-mono leading-none",
                            isActive ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Source sits outside the scrollable provider list so it stays
                  visible however many providers are listed above it. */}
              <div
                className="mt-2 flex flex-wrap items-center gap-1 border-t border-accent/10 pt-2"
                role="group"
                aria-label={t("session.filter.source.label")}
              >
                <span className="mr-1 text-2xs text-muted-foreground">
                  {t("session.filter.source.label")}
                </span>
                {ENTRYPOINT_FILTER_OPTIONS.map((option) => {
                  const isActive = sessionEntrypointFilter === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        void setSessionEntrypointFilter(option);
                      }}
                      aria-pressed={isActive}
                      className={cn(
                        "inline-flex items-center px-2 py-1 rounded-md border text-2xs font-medium transition-colors",
                        isActive
                          ? "bg-accent/15 text-accent border-accent/30"
                          : "bg-muted/30 text-muted-foreground border-transparent hover:bg-accent/8 hover:text-accent"
                      )}
                    >
                      {t(ENTRYPOINT_FILTER_LABEL_KEYS[option])}
                    </button>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-accent/10">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" aria-hidden="true" focusable="false" />
            <label htmlFor={searchInputId} className="sr-only">
              {t("project.searchPlaceholder", "Search projects...")}
            </label>
            <input
              id={searchInputId}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("project.searchPlaceholder", "Search projects...")}
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-muted/30 border border-transparent rounded-md placeholder:text-muted-foreground/40 focus:outline-none focus:border-accent/30 focus:bg-muted/50 transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                aria-label={t("common.clear", "Clear")}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Projects List */}
        <OverlayScrollbarsComponent
          // min-h-0 lets this flex child shrink to its basis instead of growing
          // to full content height (default min-height:auto). Without it,
          // OverlayScrollbars measures a skewed content/viewport ratio and the
          // thumb never reaches the bottom on long project lists (issue #101).
          className="relative flex-1 min-h-0 py-2"
          options={{
            scrollbars: {
              theme: "os-theme-custom",
              autoHide: "leave",
              autoHideDelay: 400,
            },
            overflow: {
              x: "scroll",
            },
          }}
        >
          {filteredProjects.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/30 flex items-center justify-center">
                <Folder className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">{t("project.notFound")}</p>
            </div>
          ) : (
            <div
              ref={treeRef}
              role="tree"
              aria-label={t("project.explorer")}
              aria-describedby={keyboardHelpId}
              onKeyDown={handleTreeKeyDown}
              onFocusCapture={(event) => {
                const target = event.target as HTMLElement;
                const treeItem = target.closest<HTMLElement>('[role="treeitem"]');
                if (treeItem) {
                  syncRovingTabIndex(treeItem);
                  announceTree(describeTreeItem(treeItem));
                }
              }}
              className="space-y-0.5 animate-stagger"
            >
              {/* Global Stats Button */}
              <button
                onClick={handleGlobalStatsClick}
                role="treeitem"
                data-tree-node="global"
                aria-level={1}
                aria-selected={isViewingGlobalStats}
                tabIndex={-1}
                className={cn(
                  "sidebar-item w-full flex items-center gap-3 mx-2 group",
                  "text-left transition-all duration-300",
                  isViewingGlobalStats && "active"
                )}
                style={{ width: "calc(100% - 16px)" }}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300",
                    "bg-accent/10 text-accent",
                    "group-hover:bg-accent/20 group-hover:shadow-sm group-hover:shadow-accent/20",
                    isViewingGlobalStats && "bg-accent/20 shadow-glow"
                  )}
                >
                  <span title={t("project.globalStats")}>
                    <Database className="w-4 h-4 transition-transform group-hover:scale-110" />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-sidebar-foreground">
                    {t("project.globalStats")}
                  </div>
                  <div className="text-2xs text-muted-foreground">
                    {t("project.globalStatsDescription")}
                  </div>
                </div>
              </button>

              {/* Divider */}
              <div className="my-2 mx-4 h-px bg-sidebar-border" />

              {/* Grouped Project List */}
              <GroupedProjectList
                groupingMode={groupingMode}
                projects={filteredProjects}
                directoryGroups={directoryGroups}
                directoryTree={directoryTree}
                worktreeGroups={filteredWorktreeGroups}
                ungroupedProjects={filteredUngroupedProjects}
                showProviderBadge={showProviderBadge}
                sessions={sessions}
                sessionsTotal={sessionsTotal}
                hasMoreSessions={hasMoreSessions}
                selectedProject={selectedProject}
                selectedSession={selectedSession}
                isLoading={isLoading}
                isLoadingMoreSessions={isLoadingMoreSessions}
                expandedProjects={expandedProjects}
                setExpandedProjects={setExpandedProjects}
                isProjectExpanded={isProjectExpanded}
                handleProjectClick={handleProjectClick}
                handleContextMenu={handleContextMenu}
                onSessionSelect={handleSessionSelect}
                onSessionHover={onSessionHover}
                onLoadMoreSessions={onLoadMoreSessions}
                formatTimeAgo={formatTimeAgo}
                inlineSessions={inlineSessions}
              />
            </div>
          )}
        </OverlayScrollbarsComponent>

        <p id={keyboardHelpId} className="sr-only">
          {t(
            "project.a11y.keyboardHelp",
            "Keyboard: use arrow keys to move, Home and End to jump, type letters to search, and star to expand collapsed sibling groups."
          )}{" "}
          {t(
            "project.a11y.keyboardHelpFolders",
            "Right arrow expands a folder or moves to its first item; Left arrow collapses it or moves to the parent folder."
          )}
        </p>

        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {treeAnnouncement}
        </div>
      </div>

      {/* Resize Handle - Outside scroll area */}
      {onResizeStart && (
        <div
          className={cn(
            "w-3 cursor-col-resize flex-shrink-0",
            "hover:bg-accent/20 active:bg-accent/30 transition-colors",
            isResizing && "bg-accent/30"
          )}
          onMouseDown={onResizeStart}
        />
      )}

      {/* Context Menu */}
      {contextMenu && onHideProject && onUnhideProject && isProjectHidden && (
        <ProjectContextMenu
          project={contextMenu.project}
          position={contextMenu.position}
          onClose={closeContextMenu}
          onHide={onHideProject}
          onUnhide={onUnhideProject}
          isHidden={isProjectHidden(contextMenu.project.actual_path)}
          providerSiblings={contextMenu.providerSiblings}
          onSelectProject={handleProjectClick}
        />
      )}
    </aside>
  );
};
