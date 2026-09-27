// src/components/ProjectTree/hooks/useSearchExpansion.ts
import { useEffect } from "react";
import type { TransientGroupKeys } from "./useProjectTreeState";

/** Rows the current filter opened; they stay out of storage until it clears. */
export interface SearchExpansionState extends TransientGroupKeys {
  term: string;
  opened: string[];
  /**
   * Every row this search has already revealed (opened or found open). A
   * row the user closes stays closed; only rows above new matches (the
   * projects changed mid-search) open.
   */
  revealed: Set<string>;
  /** The selection when the search started, to tell a pick made while searching. */
  selectionAtStart: string | null;
}

export const initialSearchExpansion = (): SearchExpansionState => ({
  term: "",
  opened: [],
  revealed: new Set(),
  selectionAtStart: null,
});

interface UseSearchExpansionArgs {
  stateRef: { current: SearchExpansionState };
  /** Normalised, deferred query the filtered model was built from. */
  searchTerm: string;
  /** Ancestors of the filter's matches (`filterExplorerModel`). */
  revealKeys: string[];
  expandedKeys: ReadonlySet<string>;
  expandGroups: (keys: string[]) => void;
  setExpandedKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedProjectPath: string | null;
  /** Rows above the selected project's row in the unfiltered model. */
  getSelectionAncestorKeys: () => string[];
}

/**
 * While filtering, open the rows above every match; when the filter clears,
 * close them again, except the ancestors of a project picked while searching.
 * Each row is revealed once per query, so closing a row mid-search sticks,
 * while a match that appears later (projects reloaded) still gets its rows.
 */
export function useSearchExpansion({
  stateRef,
  searchTerm,
  revealKeys,
  expandedKeys,
  expandGroups,
  setExpandedKeys,
  selectedProjectPath,
  getSelectionAncestorKeys,
}: UseSearchExpansionArgs) {
  useEffect(() => {
    const search = stateRef.current;
    const reveal = (keys: string[]) => {
      for (const key of keys) search.revealed.add(key);
      const opened = keys.filter((key) => !expandedKeys.has(key));
      search.opened = [...new Set([...search.opened, ...opened])];
      expandGroups(opened);
    };

    if (search.term === searchTerm) {
      if (searchTerm) reveal(revealKeys.filter((key) => !search.revealed.has(key)));
      return;
    }
    if (!search.term) search.selectionAtStart = selectedProjectPath;
    search.term = searchTerm;
    search.revealed = new Set();

    if (searchTerm) {
      reveal(revealKeys);
      return;
    }

    const pickedWhileSearching = selectedProjectPath !== search.selectionAtStart;
    const keep = new Set(pickedWhileSearching ? getSelectionAncestorKeys() : []);
    const close = search.opened.filter((key) => !keep.has(key));
    const hadOpened = search.opened.length > 0;
    search.opened = [];
    if (!hadOpened) return;
    // Always a new Set, so kept ancestors (left out of storage while
    // searching) are persisted even when nothing closes.
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      for (const key of close) next.delete(key);
      return next;
    });
  }, [
    expandGroups,
    expandedKeys,
    getSelectionAncestorKeys,
    revealKeys,
    searchTerm,
    selectedProjectPath,
    setExpandedKeys,
    stateRef,
  ]);
}
