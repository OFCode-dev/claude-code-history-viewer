// src/components/ProjectTree/hooks/useProjectTreeState.ts
import { useState, useCallback, useRef, useEffect } from "react";
import type { ClaudeProject } from "../../../types";
import type { GroupingMode } from "../../../types/metadata.types";
import type { ContextMenuState } from "../types";

/** Folder / bucket / worktree-group expansion, persisted across launches. */
export const EXPANDED_GROUPS_STORAGE_KEY = "projectTree.expandedGroups";

interface StoredExpansion {
  keys: string[];
  /** The directory roots were expanded once by default; the user owns them since. */
  rootsInitialized: boolean;
}

/** Group rows (`dir:` folders, `group:` buckets and worktree groups), not projects. */
export function isGroupExpansionKey(key: string): boolean {
  return key.startsWith("dir:") || key.startsWith("group:");
}

function loadStoredExpansion(): StoredExpansion | null {
  try {
    const raw = localStorage.getItem(EXPANDED_GROUPS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredExpansion>;
    if (!Array.isArray(parsed.keys)) return null;
    return {
      keys: parsed.keys.filter(
        (key): key is string => typeof key === "string" && isGroupExpansionKey(key)
      ),
      rootsInitialized: parsed.rootsInitialized === true,
    };
  } catch {
    return null;
  }
}

function saveStoredExpansion(value: StoredExpansion) {
  try {
    localStorage.setItem(EXPANDED_GROUPS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable; expansion then lasts for the session.
  }
}

function groupKeysOf(set: Set<string>): Set<string> {
  return new Set(Array.from(set).filter(isGroupExpansionKey));
}

export function useProjectTreeState(groupingMode: GroupingMode) {
  const [initialExpansion] = useState(loadStoredExpansion);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(initialExpansion?.keys ?? [])
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const rootsInitializedRef = useRef(initialExpansion?.rootsInitialized ?? false);

  // Grouping mode change: project rows belong to the old layout, group keys
  // are namespaced and persisted, so only project expansion is reset.
  const prevGroupingMode = useRef(groupingMode);
  useEffect(() => {
    if (prevGroupingMode.current !== groupingMode) {
      setExpandedProjects((prev) => groupKeysOf(prev));
      prevGroupingMode.current = groupingMode;
    }
  }, [groupingMode]);

  useEffect(() => {
    saveStoredExpansion({
      keys: Array.from(groupKeysOf(expandedProjects)),
      rootsInitialized: rootsInitializedRef.current,
    });
  }, [expandedProjects]);

  const toggleProject = useCallback((projectPath: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectPath)) {
        next.delete(projectPath);
      } else {
        next.add(projectPath);
      }
      return next;
    });
  }, []);

  /** Expand a project row and the group rows it sits in. */
  const ensureProjectExpanded = useCallback(
    (projectPath: string, groupKeys?: string | string[]) => {
      if (!projectPath) return;
      const keys = [projectPath, ...(groupKeys == null ? [] : [groupKeys].flat())];

      setExpandedProjects((prev) => {
        if (keys.every((key) => prev.has(key))) {
          return prev;
        }
        return new Set([...prev, ...keys]);
      });
    },
    []
  );

  /** Expand group rows (reveal, Right arrow, `*`). */
  const expandGroups = useCallback((groupKeys: string[]) => {
    if (groupKeys.length === 0) return;
    setExpandedProjects((prev) =>
      groupKeys.every((key) => prev.has(key)) ? prev : new Set([...prev, ...groupKeys])
    );
  }, []);

  const collapseGroup = useCallback((groupKey: string) => {
    setExpandedProjects((prev) => {
      if (!prev.has(groupKey)) return prev;
      const next = new Set(prev);
      next.delete(groupKey);
      return next;
    });
  }, []);

  /** First run only: open the directory roots; later launches keep the user's state. */
  const expandDefaultRoots = useCallback((rootKeys: string[]) => {
    if (rootsInitializedRef.current || rootKeys.length === 0) return;
    rootsInitializedRef.current = true;
    // Always a new Set so the persist effect records `rootsInitialized`.
    setExpandedProjects((prev) => new Set([...prev, ...rootKeys]));
  }, []);

  /** Collapse every group row; expanded projects stay as they are. */
  const collapseAllGroups = useCallback(() => {
    setExpandedProjects((prev) => {
      const next = new Set(Array.from(prev).filter((key) => !isGroupExpansionKey(key)));
      return next.size === prev.size ? prev : next;
    });
  }, []);

  const isProjectExpanded = useCallback(
    (projectPath: string) => {
      return expandedProjects.has(projectPath);
    },
    [expandedProjects]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, project: ClaudeProject, providerSiblings?: ClaudeProject[]) => {
      e.preventDefault();
      const boundary = e.currentTarget
        .closest<HTMLElement>("[data-menu-boundary]")
        ?.getBoundingClientRect() ?? null;
      // Keyboard-opened menus (ContextMenu key / Shift+F10) carry no pointer
      // position; anchor them to the row instead.
      const anchor = e.currentTarget.getBoundingClientRect();
      const x = e.clientX || anchor.left + 24;
      const y = e.clientY || anchor.bottom;
      setContextMenu({
        project,
        providerSiblings,
        position: { x, y, boundary },
      });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return {
    expandedProjects,
    setExpandedProjects,
    toggleProject,
    ensureProjectExpanded,
    expandGroups,
    collapseGroup,
    expandDefaultRoots,
    collapseAllGroups,
    isProjectExpanded,
    contextMenu,
    handleContextMenu,
    closeContextMenu,
  };
}
