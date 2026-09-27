// src/components/ProjectTree/hooks/useProjectTreeState.ts
import { useState, useCallback, useRef, useEffect } from "react";
import type { ClaudeProject } from "../../../types";
import type { ContextMenuState } from "../types";

/** Folder and group expansion, persisted across launches. */
export const EXPANDED_GROUPS_STORAGE_KEY = "projectTree.expandedGroups";

interface StoredExpansion {
  keys: string[];
  /**
   * Rows already expanded once by default ("Other locations"); the user owns
   * their state since.
   */
  seenRoots: string[];
}

/** Bounds the stored lists; folders that no longer exist are never pruned otherwise. */
const MAX_STORED_GROUP_KEYS = 500;
const MAX_STORED_ROOTS = 50;

const onlyStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** Rows with children (`dir:`) and groups (`group:`), not a project's inline sessions. */
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
      keys: onlyStrings(parsed.keys).filter(isGroupExpansionKey),
      seenRoots: onlyStrings(parsed.seenRoots),
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

/** Group keys opened for the moment (by a search) that must not outlive it in storage. */
export interface TransientGroupKeys {
  opened: readonly string[];
}

/**
 * Expansion state of the explorer: persisted `dir:` / `group:` keys, plus the
 * store path of a project whose inline sessions are open (never persisted).
 */
export function useProjectTreeState(transientGroupsRef?: { readonly current: TransientGroupKeys }) {
  const [initialExpansion] = useState(loadStoredExpansion);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(initialExpansion?.keys ?? [])
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const seenRootsRef = useRef<string[]>(initialExpansion?.seenRoots ?? []);

  useEffect(() => {
    // Folders a search opened are closed again when it clears, but the tree can
    // unmount first (the mobile drawer closes on a session pick): keep them out.
    const transient = new Set(transientGroupsRef?.current.opened ?? []);
    // Set order is insertion order, so the most recently opened keys survive the cap.
    saveStoredExpansion({
      keys: Array.from(groupKeysOf(expandedProjects))
        .filter((key) => !transient.has(key))
        .slice(-MAX_STORED_GROUP_KEYS),
      seenRoots: seenRootsRef.current.slice(-MAX_STORED_ROOTS),
    });
  }, [expandedProjects, transientGroupsRef]);

  /** Open or close one key: a row's children, a group, or inline sessions. */
  const toggleExpansion = useCallback((key: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
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

  const collapseGroups = useCallback((groupKeys: string[]) => {
    setExpandedProjects((prev) => {
      if (!groupKeys.some((key) => prev.has(key))) return prev;
      const next = new Set(prev);
      for (const key of groupKeys) next.delete(key);
      return next;
    });
  }, []);

  const collapseGroup = useCallback(
    (groupKey: string) => collapseGroups([groupKey]),
    [collapseGroups]
  );

  /** Open each of these rows the first time it appears; after that the user owns it. */
  const expandDefaultRoots = useCallback((rootKeys: string[]) => {
    const unseen = rootKeys.filter((key) => !seenRootsRef.current.includes(key));
    if (unseen.length === 0) return;
    seenRootsRef.current = [...seenRootsRef.current, ...unseen];
    // Always a new Set so the persist effect records the seen roots.
    setExpandedProjects((prev) => new Set([...prev, ...unseen]));
  }, []);

  /** Collapse every group row; expanded projects stay as they are. */
  const collapseAllGroups = useCallback(() => {
    setExpandedProjects((prev) => {
      const next = new Set(Array.from(prev).filter((key) => !isGroupExpansionKey(key)));
      return next.size === prev.size ? prev : next;
    });
  }, []);

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
    toggleExpansion,
    ensureProjectExpanded,
    expandGroups,
    collapseGroup,
    collapseGroups,
    expandDefaultRoots,
    collapseAllGroups,
    contextMenu,
    handleContextMenu,
    closeContextMenu,
  };
}
