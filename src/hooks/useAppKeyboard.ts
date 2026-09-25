import { useEffect } from "react";
import { useModal } from "@/contexts/modal";
import { usePlatform } from "@/contexts/platform";
import { useAppStore } from "@/store/useAppStore";
import { isEditableTarget } from "@/utils/editableTarget";
import { jumpToAdjacentPrompt } from "@/utils/promptNavigation";

/**
 * Global keyboard shortcuts for the app.
 * - Cmd+K: open global search
 * - Cmd+Shift+M: toggle message navigator (desktop only)
 * - Alt+Up / Alt+Down: previous / next prompt of the open conversation
 *   (ignored while typing in a field)
 */
export function useAppKeyboard() {
  const { openModal } = useModal();
  const { isMobile } = usePlatform();
  const toggleNavigator = useAppStore((s) => s.toggleNavigator);

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
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        !isEditableTarget(e.target) &&
        jumpToAdjacentPrompt(e.key === "ArrowUp" ? "previous" : "next")
      ) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openModal, toggleNavigator, isMobile]);
}
