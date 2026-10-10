import { useEffect } from "react";
import { useModal } from "@/contexts/modal";
import { usePlatform } from "@/contexts/platform";
import { useAppStore } from "@/store/useAppStore";
import { effectiveGroupMode } from "@/store/slices/layoutSlice";
import { isEditableTarget, isInArrowKeyWidget } from "@/utils/editableTarget";
import { isActionModifier, isMacOS } from "@/utils/platform";
import { jumpToAdjacentPrompt } from "@/utils/promptNavigation";
import {
  focusGroupPrimary,
  getConversationSearchInput,
  panelDomIds,
  revealPanel,
  togglePanel,
} from "@/components/AutoHide/panelActions";
import { useReadingModeToggle } from "@/components/AutoHide/useLayoutSwitches";

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
 * Normal layout: unfold whichever rail holds the target of Mod+Shift+E, the
 * explorer and, when a session is selected and the sessions pane is shown,
 * that pane (the selected session row lives there).
 */
function unfoldLeftRails(): void {
  const state = useAppStore.getState();
  if (state.isExplorerCollapsed) state.setExplorerCollapsed(false);
  const sessionsPaneShown = document.getElementById("sessions-pane") != null;
  if (state.selectedSession && sessionsPaneShown && state.isSessionsPaneCollapsed) {
    state.setSessionsPaneCollapsed(false);
  }
}

/** After the layout has rendered (a rail may first have to unfold). */
function afterRender(callback: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(callback));
}

/**
 * Global keyboard shortcuts for the app.
 * - Mod+K: open global search
 * - Mod+Shift+F: reading mode on or off (desktop only, not while typing)
 * - Mod+Shift+E: explorer and sessions (reading mode: toggle its overlay)
 * - Mod+Shift+M: prompts navigator (reading mode: toggle its overlay)
 * - Mod+F: focus the conversation search (reading mode: reveal it)
 * - Mod+G / F3, with Shift for previous: next search match, revealing nothing
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
  const toggleReadingMode = useReadingModeToggle();

  useEffect(() => {
    const handlePanelShortcut = (e: KeyboardEvent): boolean => {
      const letter = keyLetter(e);
      if (isMobile) {
        // No side panels below 768 px; still keep Chrome's profile menu shut.
        return isModChord(e) && e.shiftKey && letter === "m";
      }
      if (isInDialogOrMenu(e.target)) return false;
      const state = useAppStore.getState();

      if (isModChord(e) && e.shiftKey) {
        if (letter === "f") {
          if (e.repeat || isEditableTarget(e.target)) return false;
          toggleReadingMode();
          return true;
        }
        if (letter === "e") {
          if (e.repeat) return true;
          const mode = effectiveGroupMode(state, "left", false);
          if (mode === "autohide") {
            togglePanel("left", "keyboard");
          } else {
            if (mode === "normal") unfoldLeftRails();
            afterRender(() => focusGroupPrimary("left"));
          }
          return true;
        }
        if (letter === "m") {
          if (e.repeat) return true;
          const mode = effectiveGroupMode(state, "right", false);
          if (mode === "normal") {
            toggleNavigator();
          } else if (document.getElementById(panelDomIds.region("right"))) {
            if (mode === "autohide") togglePanel("right", "keyboard");
            else focusGroupPrimary("right");
          }
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
      const state = useAppStore.getState();
      if (effectiveGroupMode(state, "top", false) === "autohide") {
        revealPanel("top", "keyboard", { focus: "search" });
      } else {
        input.focus();
        input.select();
      }
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
  }, [openModal, toggleNavigator, toggleReadingMode, isMobile]);
}
