import type React from "react";

/** Marks a session row's "open session" button. */
export const SESSION_OPEN_ATTR = "data-session-open";
/** Marks the element holding one list of session rows. */
export const SESSION_LIST_ATTR = "data-session-list";

const STEP: Record<string, number | "first" | "last"> = {
  ArrowDown: 1,
  ArrowUp: -1,
  Home: "first",
  End: "last",
};

/**
 * One tab stop per session list (the selected row's button, or the first
 * row's): ↑/↓, Home and End move between the rows' open buttons, Enter or
 * Space opens one.
 */
export function moveSessionFocus(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const step = STEP[event.key];
  if (step === undefined) return;
  const list = event.currentTarget.closest(`[${SESSION_LIST_ATTR}]`);
  if (!list) return;
  const buttons = Array.from(list.querySelectorAll<HTMLElement>(`[${SESSION_OPEN_ATTR}]`));
  const index = buttons.indexOf(event.currentTarget);
  const nextIndex =
    step === "first" ? 0 : step === "last" ? buttons.length - 1 : index + step;
  const next = buttons[nextIndex];
  // Handled here, not by an enclosing tree or the prompt-jump shortcut.
  event.preventDefault();
  event.stopPropagation();
  next?.focus();
}
