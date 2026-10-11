import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { usePlatform } from "@/contexts/platform";
import { useAppStore } from "@/store/useAppStore";
import { areAllCollapsed } from "@/store/slices/layoutSlice";
import { changeLayout } from "@/layouts/collapsibleAreas";

/**
 * "Reading mode" as a command, for the header button and Mod+Shift+F: folds
 * all four areas to their bars while any is open, otherwise opens all four.
 * No earlier combination is remembered, so the same press on the same
 * screen always does the same thing. Below 768 px the drawers stay as they are.
 */
export function useCollapseAll(): () => void {
  const { t } = useTranslation();
  const { isMobile } = usePlatform();

  return useCallback(() => {
    if (isMobile) return;
    const store = useAppStore.getState();
    const collapsing = !areAllCollapsed(store);
    changeLayout(collapsing ? store.collapseAll : store.expandAll);
    store.announceLayout(
      t(collapsing ? "readingMode.announce.collapsed" : "readingMode.announce.expanded")
    );
  }, [isMobile, t]);
}
