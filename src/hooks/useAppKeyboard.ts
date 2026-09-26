import { useEffect } from "react";
import { useModal } from "@/contexts/modal";
import { usePlatform } from "@/contexts/platform";
import { useAppStore } from "@/store/useAppStore";
import { isEditableTarget, isInArrowKeyWidget } from "@/utils/editableTarget";
import { jumpToAdjacentPrompt } from "@/utils/promptNavigation";

/** Panels that focus mode folds to rails. */
const SIDE_PANEL_SELECTOR = "#project-explorer, #sessions-pane, #message-navigator";

/**
 * Global keyboard shortcuts for the app.
 * - Cmd+K: open global search
 * - Cmd+Shift+M: toggle message navigator (desktop only)
 * - Cmd+Shift+F: toggle focus mode (desktop only, not while typing)
 * - Alt+Up / Alt+Down: previous / next prompt of the open conversation
 *   (ignored while typing in a field, inside dialogs and menus or other
 *   widgets that use the arrow keys, and when a widget already handled it)
 */
export function useAppKeyboard() {
  const { openModal } = useModal();
  const { isMobile } = usePlatform();
  const toggleNavigator = useAppStore((s) => s.toggleNavigator);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openModal("globalSearch");
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "m"
      ) {
        e.preventDefault();
        if (!isMobile) toggleNavigator();
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "f" &&
        !isMobile &&
        !isEditableTarget(e.target)
      ) {
        e.preventDefault();
        // Focus mode folds the side panels to rails, which unmounts whatever
        // was focused inside them; hand focus to the transcript instead of
        // letting it fall back to <body>.
        const active = document.activeElement;
        const inPanel =
          active instanceof Element && active.closest(SIDE_PANEL_SELECTOR) != null;
        toggleFocusMode();
        if (inPanel) {
          requestAnimationFrame(() => {
            if (!active.isConnected || document.activeElement === document.body) {
              document.getElementById("main-content")?.focus({ preventScroll: true });
            }
          });
        }
      }
      if (
        !e.defaultPrevented &&
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        !isEditableTarget(e.target) &&
        !isInArrowKeyWidget(e.target) &&
        jumpToAdjacentPrompt(e.key === "ArrowUp" ? "previous" : "next")
      ) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openModal, toggleNavigator, toggleFocusMode, isMobile]);
}
