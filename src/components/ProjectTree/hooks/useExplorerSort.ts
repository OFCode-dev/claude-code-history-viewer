// src/components/ProjectTree/hooks/useExplorerSort.ts
import { useCallback, useState } from "react";
import type { ExplorerSort } from "../../../utils/explorerModel";

export const SORT_STORAGE_KEY = "projectTree.sort";

function loadSort(): ExplorerSort {
  try {
    return localStorage.getItem(SORT_STORAGE_KEY) === "recent" ? "recent" : "name";
  } catch {
    return "name";
  }
}

/** The explorer's sort ("name" by default), persisted across launches. */
export function useExplorerSort(): [ExplorerSort, (sort: ExplorerSort) => void] {
  const [sort, setSortState] = useState<ExplorerSort>(loadSort);

  const setSort = useCallback((next: ExplorerSort) => {
    setSortState(next);
    try {
      localStorage.setItem(SORT_STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable; the choice then lasts for the session.
    }
  }, []);

  return [sort, setSort];
}
