/**
 * Keyboard focus around subagent navigation.
 *
 * Opening a subagent replaces the conversation, so the control that opened it
 * (a subagent panel row, an Agent card's "Open transcript", a Workflow card
 * row) unmounts and focus falls to <body>. These helpers move it to the
 * subagent context bar instead.
 */
import type { SubagentSession } from "@/types";
import { isFocusLost } from "@/utils/focus";

// One implementation, shared with the "Back" focus handling.
export { isFocusLost };

/** Attribute on the context bar's "Back" button, the landing spot after entering a subagent. */
export const SUBAGENT_BACK_ATTR = "data-subagent-back";

/**
 * If focus was dropped, put it on the subagent context bar's "Back" button,
 * or on the main content region when the bar is not shown.
 */
export function restoreFocusAfterEnteringSubagent(): void {
  if (!isFocusLost()) return;
  const target =
    document.querySelector<HTMLElement>(`[${SUBAGENT_BACK_ATTR}]`) ??
    document.getElementById("main-content");
  target?.focus({ preventScroll: true });
}

/**
 * Open a subagent transcript and keep keyboard focus on the page. The check
 * runs a frame later so the transcript and its context bar are committed.
 */
export async function openSubagentKeepingFocus(
  navigateToSubagent: (subagent: SubagentSession) => Promise<void>,
  subagent: SubagentSession,
): Promise<void> {
  await navigateToSubagent(subagent);
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      restoreFocusAfterEnteringSubagent();
      resolve();
    });
  });
}
