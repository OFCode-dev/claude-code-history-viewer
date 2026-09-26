/**
 * Jumping between human prompts of the open conversation — shared by the
 * sticky prompt bar and the Alt+Up / Alt+Down shortcuts.
 */
import { useAppStore } from "../store/useAppStore";
import {
  useViewportAnchorStore,
  type PromptJumpDirection,
} from "../store/viewportAnchorStore";
import { formatTimeShort } from "./time";

/** Marks the sticky prompt bar, whose buttons disappear when their jump lands. */
export const PROMPT_BAR_ATTRIBUTE = "data-sticky-prompt-bar";

/** Just after the viewer's last scroll pass (450 ms): the prompt row is mounted. */
export const FOCUS_AFTER_JUMP_MS = 500;

let pendingFocusTimer: ReturnType<typeof setTimeout> | null = null;

function isInPromptBar(element: Element | null): boolean {
  return element?.closest(`[${PROMPT_BAR_ATTRIBUTE}]`) != null;
}

/**
 * A jump started from the sticky bar lands on its prompt, which hides the bar
 * and takes the focused button with it. Move focus to the prompt card instead
 * of leaving it on <body>, so keyboard and screen-reader users keep their place.
 */
function focusPromptAfterJump(uuid: string): void {
  if (pendingFocusTimer != null) clearTimeout(pendingFocusTimer);
  pendingFocusTimer = setTimeout(() => {
    pendingFocusTimer = null;
    const active = document.activeElement;
    // The reader has moved focus somewhere else meanwhile: leave it there.
    if (active && active !== document.body && !isInPromptBar(active)) return;

    const row = document.querySelector<HTMLElement>(
      `[data-message-uuid="${CSS.escape(uuid)}"]`
    );
    const target = row?.querySelector<HTMLElement>("[data-prompt-card]") ?? row;
    if (!target) return;

    const addedTabIndex = !target.hasAttribute("tabindex");
    if (addedTabIndex) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    // The app hides the default focus outline; draw one while keyboard focus
    // sits on the card, and undo everything when it leaves.
    let isFocusVisible = true;
    try {
      isFocusVisible = target.matches(":focus-visible");
    } catch {
      // Engines without :focus-visible: keep the ring.
    }
    if (isFocusVisible) {
      target.style.outline = "2px solid var(--ring)";
      target.style.outlineOffset = "2px";
    }
    target.addEventListener(
      "blur",
      () => {
        target.style.outline = "";
        target.style.outlineOffset = "";
        if (addedTabIndex) target.removeAttribute("tabindex");
      },
      { once: true }
    );
  }, FOCUS_AFTER_JUMP_MS);
}

/**
 * Scroll the conversation to a prompt. The URL is replaced rather than pushed
 * so stepping through prompts does not flood the browser history. The jump is
 * recorded so a quick Alt+Up/Down afterwards continues from this prompt.
 */
export function jumpToPrompt(uuid: string): void {
  const fromPromptBar = isInPromptBar(document.activeElement);
  useViewportAnchorStore.getState().recordPromptJump(uuid);
  useAppStore.getState().navigateToMessage(uuid, { history: "replace" });
  if (fromPromptBar) focusPromptAfterJump(uuid);
}

/** Jump to the previous / next prompt; false when there is none. */
export function jumpToAdjacentPrompt(direction: PromptJumpDirection): boolean {
  const uuid = useViewportAnchorStore.getState().takePromptJump(direction);
  if (!uuid) return false;
  jumpToPrompt(uuid);
  return true;
}

/** A prompt's time in the app language, or "" for a missing or invalid timestamp. */
export function formatPromptTime(timestamp: string | null | undefined): string {
  if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) return "";
  return formatTimeShort(timestamp);
}
