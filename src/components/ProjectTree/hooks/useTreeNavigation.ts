// src/components/ProjectTree/hooks/useTreeNavigation.ts
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildTreeItemAnnouncement,
  findFirstChildTreeItemIndex,
  findParentTreeItemIndex,
  findSiblingTreeItemIndexes,
  findTypeaheadMatchIndex,
  getNextTreeItemIndex,
  type TreeNavigationKey,
} from "../treeKeyboard";

interface UseTreeNavigationArgs {
  treeRef: React.RefObject<HTMLDivElement | null>;
  expandGroups: (keys: string[]) => void;
  collapseGroup: (key: string) => void;
  /**
   * The rendered rows follow the model and the expansion: when either
   * changes, the tree must still have exactly one tab stop.
   */
  model: unknown;
  expandedKeys: unknown;
  /** The selected project's path, announced when it changes. */
  selectionKey: string | null;
}

const treeItemsOf = (container: HTMLElement | null) =>
  Array.from(container?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []);

/**
 * ARIA tree keyboard model: roving tabindex, arrows (Right opens or moves to
 * the first child, Left closes or moves to the parent), Home/End, type-ahead,
 * `*` for collapsed siblings, and polite announcements.
 */
export function useTreeNavigation({
  treeRef,
  expandGroups,
  collapseGroup,
  model,
  expandedKeys,
  selectionKey,
}: UseTreeNavigationArgs) {
  const { t } = useTranslation();
  const typeaheadQueryRef = useRef("");
  const typeaheadTimeoutRef = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const announce = useCallback((message: string) => {
    if (!message) return;
    // A trailing space makes a repeated message a change the live region reads.
    setAnnouncement((previous) => (previous === message ? `${message} ` : message));
  }, []);

  const describeTreeItem = useCallback(
    (item: HTMLElement) =>
      buildTreeItemAnnouncement(
        item.getAttribute("aria-label") || item.textContent || "",
        {
          ariaExpanded: item.getAttribute("aria-expanded") as "true" | "false" | null,
          ariaSelected: item.getAttribute("aria-selected") as "true" | "false" | null,
        },
        {
          expanded: t("project.a11y.expandedState"),
          collapsed: t("project.a11y.collapsedState"),
          selected: t("project.a11y.selectedState"),
        },
        t("project.explorer")
      ),
    [t]
  );

  const syncRovingTabIndex = useCallback(
    (preferredItem?: HTMLElement) => {
      const treeItems = treeItemsOf(treeRef.current);
      if (treeItems.length === 0) return;
      const active = document.activeElement;
      const focusedItem =
        active instanceof HTMLElement ? active.closest<HTMLElement>('[role="treeitem"]') : null;
      const selectedItem = treeItems.find((item) => item.getAttribute("aria-selected") === "true");
      const tabStop =
        preferredItem ??
        (focusedItem && treeItems.includes(focusedItem) ? focusedItem : null) ??
        selectedItem ??
        treeItems[0];
      for (const item of treeItems) item.tabIndex = item === tabStop ? 0 : -1;
    },
    [treeRef]
  );

  // Collapsing a folder can unmount the row holding the tab stop.
  useEffect(() => {
    const frameId = requestAnimationFrame(() => syncRovingTabIndex());
    return () => cancelAnimationFrame(frameId);
  }, [syncRovingTabIndex, model, expandedKeys, selectionKey]);

  useEffect(() => {
    const selectedItem = treeRef.current?.querySelector<HTMLElement>(
      '[role="treeitem"][aria-selected="true"]'
    );
    if (!selectedItem) return;
    announce(t("project.currentSelection", { item: describeTreeItem(selectedItem) }));
  }, [announce, describeTreeItem, selectionKey, t, treeRef]);

  useEffect(
    () => () => {
      if (typeaheadTimeoutRef.current) window.clearTimeout(typeaheadTimeoutRef.current);
    },
    []
  );

  const handleTreeFocus = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const treeItem = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
      if (!treeItem) return;
      syncRovingTabIndex(treeItem);
      announce(describeTreeItem(treeItem));
    },
    [announce, describeTreeItem, syncRovingTabIndex]
  );

  const handleTreeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const treeItems = treeItemsOf(event.currentTarget);
      const currentItem = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
      const currentIndex = currentItem ? treeItems.indexOf(currentItem) : -1;
      if (!currentItem || currentIndex < 0) return;

      const levels = treeItems.map((item) => Number(item.getAttribute("aria-level") ?? "1"));
      const focusItem = (index: number) => {
        const nextItem = treeItems[index];
        if (!nextItem) return;
        event.preventDefault();
        syncRovingTabIndex(nextItem);
        nextItem.focus();
        announce(describeTreeItem(nextItem));
      };

      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        // Rows whose expansion is their inline session list handle this themselves.
        if (event.defaultPrevented) return;
        const key = currentItem.dataset.treeKey;
        const isExpandable = currentItem.dataset.treeExpandable === "true";
        const expanded = currentItem.getAttribute("aria-expanded");
        if (event.key === "ArrowRight") {
          if (isExpandable && key && expanded === "false") {
            event.preventDefault();
            expandGroups([key]);
          } else if (expanded === "true") {
            focusItem(findFirstChildTreeItemIndex(levels, currentIndex));
          }
          return;
        }
        if (isExpandable && key && expanded === "true") {
          event.preventDefault();
          collapseGroup(key);
          return;
        }
        focusItem(findParentTreeItemIndex(levels, currentIndex));
        return;
      }

      if (event.key === "*") {
        event.preventDefault();
        const collapsedSiblings = findSiblingTreeItemIndexes(levels, currentIndex)
          .map((index) => treeItems[index])
          .filter(
            (item): item is HTMLElement =>
              item?.dataset.treeExpandable === "true" &&
              item.getAttribute("aria-expanded") === "false"
          );
        expandGroups(
          collapsedSiblings
            .map((item) => item.dataset.treeKey)
            .filter((key): key is string => Boolean(key))
        );
        announce(t("project.expandedSiblingGroups", { count: collapsedSiblings.length }));
        return;
      }

      if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
        const query = `${typeaheadQueryRef.current}${event.key.toLowerCase()}`;
        typeaheadQueryRef.current = query;
        if (typeaheadTimeoutRef.current) window.clearTimeout(typeaheadTimeoutRef.current);
        typeaheadTimeoutRef.current = window.setTimeout(() => {
          typeaheadQueryRef.current = "";
          typeaheadTimeoutRef.current = null;
        }, 500);
        const labels = treeItems.map((item) => item.dataset.typeahead ?? item.textContent ?? "");
        const matchIndex = findTypeaheadMatchIndex(labels, currentIndex, query);
        if (matchIndex >= 0) focusItem(matchIndex);
        return;
      }

      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        const nextIndex = getNextTreeItemIndex(
          currentIndex,
          treeItems.length,
          event.key as TreeNavigationKey
        );
        if (nextIndex !== currentIndex && nextIndex >= 0) focusItem(nextIndex);
      }
    },
    [announce, collapseGroup, describeTreeItem, expandGroups, syncRovingTabIndex, t]
  );

  return { announcement, handleTreeKeyDown, handleTreeFocus, syncRovingTabIndex };
}
