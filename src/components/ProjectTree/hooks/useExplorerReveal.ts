// src/components/ProjectTree/hooks/useExplorerReveal.ts
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../../store/useAppStore";
import { locateInExplorer, type ExplorerModel } from "../../../utils/explorerModel";

/** How long a revealed row keeps its highlight ring. */
const REVEAL_HIGHLIGHT_MS = 1600;

interface UseExplorerRevealArgs {
  /** The unfiltered model: which row the path means. */
  model: ExplorerModel;
  /** The rendered (filtered) model. */
  visibleModel: ExplorerModel;
  searchTerm: string;
  deferredSearchTerm: string;
  clearSearch: () => void;
  isCollapsed: boolean;
  onToggleCollapse?: () => void;
  expandGroups: (keys: string[]) => void;
  expandedKeys: ReadonlySet<string>;
  treeRef: React.RefObject<HTMLDivElement | null>;
  syncRovingTabIndex: (preferredItem?: HTMLElement) => void;
}

/**
 * Header breadcrumb reveals: unfold the explorer, clear a filter that hides
 * the row, open the rows above it, then scroll to, focus and briefly
 * highlight it. Each step that changes state resumes on the next run.
 */
export function useExplorerReveal({
  model,
  visibleModel,
  searchTerm,
  deferredSearchTerm,
  clearSearch,
  isCollapsed,
  onToggleCollapse,
  expandGroups,
  expandedKeys,
  treeRef,
  syncRovingTabIndex,
}: UseExplorerRevealArgs) {
  const request = useAppStore((state) => state.explorerRevealRequest);
  const clearRequest = useAppStore((state) => state.clearExplorerRevealRequest);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const handledNonceRef = useRef<number | null>(null);
  // Unfolding the sidebar is asked once per request, however often this re-runs.
  const unfoldedForNonceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!request || handledNonceRef.current === request.nonce) return;

    if (isCollapsed && onToggleCollapse) {
      if (unfoldedForNonceRef.current !== request.nonce) {
        unfoldedForNonceRef.current = request.nonce;
        onToggleCollapse();
      }
      return;
    }

    const wanted = locateInExplorer(model, request.path);
    if (!wanted) {
      // Nothing in the tree stands for the path: leave the filter alone.
      handledNonceRef.current = request.nonce;
      clearRequest();
      return;
    }
    // The breadcrumb asks to show this path: keep a filter that already shows
    // its row, otherwise clear it and wait for the deferred filter to catch up.
    if (searchTerm || deferredSearchTerm) {
      const settled = deferredSearchTerm === searchTerm;
      const visible = settled ? locateInExplorer(visibleModel, request.path) : null;
      if (visible?.key !== wanted.key) {
        if (settled) clearSearch();
        return;
      }
    }

    handledNonceRef.current = request.nonce;
    const target = locateInExplorer(visibleModel, request.path) ?? wanted;
    expandGroups(target.ancestorKeys);
    setFocusKey(target.key);
  }, [
    clearRequest,
    clearSearch,
    deferredSearchTerm,
    expandGroups,
    isCollapsed,
    model,
    onToggleCollapse,
    request,
    searchTerm,
    visibleModel,
  ]);

  // `:focus-visible` skips a focus that follows a click on the crumb, so the
  // revealed row gets a short-lived ring of its own (`data-revealed`).
  const highlightRef = useRef<{ row: HTMLElement; timer: number } | null>(null);
  useEffect(
    () => () => {
      if (highlightRef.current) window.clearTimeout(highlightRef.current.timer);
    },
    []
  );

  useEffect(() => {
    if (!focusKey) return;
    const frameId = requestAnimationFrame(() => {
      const row = Array.from(
        treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []
      ).find((item) => item.dataset.treeKey === focusKey);
      if (row) {
        row.scrollIntoView?.({ block: "nearest" });
        syncRovingTabIndex(row);
        row.focus();
        const previous = highlightRef.current;
        if (previous) {
          window.clearTimeout(previous.timer);
          delete previous.row.dataset.revealed;
        }
        row.dataset.revealed = "true";
        const timer = window.setTimeout(() => {
          delete row.dataset.revealed;
          highlightRef.current = null;
        }, REVEAL_HIGHLIGHT_MS);
        highlightRef.current = { row, timer };
      }
      setFocusKey(null);
      clearRequest();
    });
    return () => cancelAnimationFrame(frameId);
  }, [clearRequest, expandedKeys, focusKey, syncRovingTabIndex, treeRef]);
}
