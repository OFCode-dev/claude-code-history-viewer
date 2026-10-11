import { useEffect } from "react";
import { useModal } from "@/contexts/modal";
import { usePlatform } from "@/contexts/platform";
import { useAppStore } from "@/store/useAppStore";
import { isEditableTarget, isInArrowKeyWidget } from "@/utils/editableTarget";
import { isActionModifier, isMacOS } from "@/utils/platform";
import { jumpToAdjacentPrompt } from "@/utils/promptNavigation";
import { changeLayout } from "@/layouts/collapsibleAreas";
import {
  getConversationSearchInput,
  openConversationTool,
} from "@/components/MessageViewer/components/conversationToolsActions";
import { SESSION_OPEN_ATTR } from "@/components/SessionItem/sessionRowFocus";
import { useCollapseAll } from "./useCollapseAll";

/** Panel shortcuts never act behind a dialog or inside a menu. */
const DIALOG_OR_MENU_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="menubar"], [aria-modal="true"]';

/**
 * The letter of a key press: `e.key` when it is an ASCII letter, otherwise
 * the physical key (`e.code`), so Cyrillic or Hangul layouts still match.
 */
export function keyLetter(event: KeyboardEvent): string | null {
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase();
  const physical = /^Key([A-Z])$/.exec(event.code)?.[1];
  return physical ? physical.toLowerCase() : null;
}

/** Mod alone (Cmd on macOS, Ctrl elsewhere): not the other one, not Alt. */
function isModChord(event: KeyboardEvent): boolean {
  const other = isMacOS() ? event.ctrlKey : event.metaKey;
  return isActionModifier(event) && !other && !event.altKey;
}

function isInDialogOrMenu(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(DIALOG_OR_MENU_SELECTOR) != null;
}

/** Keep Mod+F for browser find when the search field is focused and fully selected or empty. */
function shouldPassFindToBrowser(input: HTMLInputElement, target: EventTarget | null): boolean {
  if (target !== input) return false;
  const { value, selectionStart, selectionEnd } = input;
  return value === "" || (selectionStart === 0 && selectionEnd === value.length);
}

/**
 * Mod+Shift+E: unfold whichever rail holds the target, the explorer and,
 * when a session is selected and the sessions pane is shown, that pane (the
 * selected session row lives there).
 */
function unfoldLeftRails(): void {
  const state = useAppStore.getState();
  const sessionsPaneShown = document.getElementById("sessions-pane") != null;
  const unfoldSessions =
    state.selectedSession != null && sessionsPaneShown && state.isSessionsPaneCollapsed;
  if (!state.isExplorerCollapsed && !unfoldSessions) return;
  changeLayout(() => {
    if (state.isExplorerCollapsed) state.setExplorerCollapsed(false);
    if (unfoldSessions) state.setSessionsPaneCollapsed(false);
  });
}

/** After the unfolded panels have rendered and laid out their rows. */
function afterRender(callback: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(callback));
}

/**
 * The selected session row (sessions pane first, else inline in the tree),
 * then the selected tree row, then the first row, then the explorer itself.
 */
function focusSelectedRow(): void {
  const selectors = [
    `#sessions-pane [${SESSION_OPEN_ATTR}][aria-current="true"]`,
    `#project-explorer [${SESSION_OPEN_ATTR}][aria-current="true"]`,
    '#project-explorer [role="treeitem"][aria-selected="true"]',
    '#project-explorer [role="treeitem"][tabindex="0"]',
    '#project-explorer [role="treeitem"]',
    "#project-explorer",
  ];
  for (const selector of selectors) {
    const target = document.querySelector<HTMLElement>(selector);
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView?.({ block: "nearest" });
      return;
    }
  }
}

/**
 * Global keyboard shortcuts for the app.
 * - Mod+K: open global search
 * - Mod+Shift+F: reading mode, i.e. collapse all areas, or expand all when
 *   all are collapsed (desktop only, not while typing)
 * - Mod+Shift+E: unfold explorer and sessions, focus the selected row
 * - Mod+Shift+M: prompts navigator open or folded
 * - Mod+F: focus the conversation search (expanding the tools if collapsed)
 * - Mod+G / F3, with Shift for previous: next search match, expanding nothing
 * - Alt+Up / Alt+Down: previous / next prompt of the open conversation
 *   (ignored while typing in a field, inside dialogs and menus or other
 *   widgets that use the arrow keys, and when a widget already handled it)
 *
 * Mod is Cmd on macOS and Ctrl elsewhere. Panel shortcuts ignore key repeat
 * for toggles, IME composition, and presses inside dialogs and menus.
 */
export function useAppKeyboard() {
  const { openModal } = useModal();
  const { isMobile } = usePlatform();
  const toggleNavigator = useAppStore((s) => s.toggleNavigator);
  const collapseOrExpandAll = useCollapseAll();

  useEffect(() => {
    const handlePanelShortcut = (e: KeyboardEvent): boolean => {
      const letter = keyLetter(e);
      if (isMobile) {
        // No side panels below 768 px; still keep Chrome's profile menu shut.
        return isModChord(e) && e.shiftKey && letter === "m";
      }
      if (isInDialogOrMenu(e.target)) return false;

      if (isModChord(e) && e.shiftKey) {
        if (letter === "f") {
          if (e.repeat || isEditableTarget(e.target)) return false;
          collapseOrExpandAll();
          return true;
        }
        if (letter === "e") {
          if (e.repeat) return true;
          unfoldLeftRails();
          afterRender(focusSelectedRow);
          return true;
        }
        if (letter === "m") {
          if (e.repeat) return true;
          changeLayout(toggleNavigator);
          return true;
        }
        if (letter === "g") return stepMatch("previous");
        return false;
      }

      if (isModChord(e) && !e.shiftKey) {
        if (letter === "f") return focusConversationSearch(e);
        if (letter === "g") return stepMatch("next");
        return false;
      }

      if (e.key === "F3" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        return stepMatch(e.shiftKey ? "previous" : "next");
      }
      return false;
    };

    /** Mod+F: taken only while a conversation is showing. */
    const focusConversationSearch = (e: KeyboardEvent): boolean => {
      const input = getConversationSearchInput();
      if (!input || shouldPassFindToBrowser(input, e.target)) return false;
      openConversationTool("search");
      return true;
    };

    /** Taken only while a conversation search is active; otherwise browser find-next. */
    const stepMatch = (direction: "next" | "previous"): boolean => {
      const state = useAppStore.getState();
      if (!state.sessionSearch.query || !getConversationSearchInput()) return false;
      if (direction === "next") state.goToNextMatch();
      else state.goToPrevMatch();
      return true;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openModal("globalSearch");
        return;
      }
      if (handlePanelShortcut(e)) {
        e.preventDefault();
        return;
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
  }, [openModal, toggleNavigator, collapseOrExpandAll, isMobile]);
}
