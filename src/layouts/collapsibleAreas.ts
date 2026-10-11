/**
 * The four collapsible areas of the layout: explorer, sessions pane, prompts
 * navigator and conversation tools. Each keeps its element id in both forms
 * (expanded, and folded to its thin bar), and each form has one toggle
 * button marked with `AREA_TOGGLE_ATTR`.
 */
import { keepReadingPlace } from "@/components/MessageViewer/hooks/useReadingPosition";
import { focusMainContent, isFocusLost } from "@/utils/focus";
import { AREA_TOGGLE_ATTR } from "./areaToggleAttr";

const COLLAPSIBLE_AREA_IDS = [
  "project-explorer",
  "sessions-pane",
  "message-navigator",
  "conversation-tools",
] as const;

function areaHoldingFocus(): string | null {
  const active = document.activeElement;
  if (!(active instanceof Element)) return null;
  return COLLAPSIBLE_AREA_IDS.find((id) => active.closest(`#${id}`) != null) ?? null;
}

/** Focus that was removed with its element, or sits in a now-hidden subtree. */
function focusWasLost(): boolean {
  const active = document.activeElement;
  return isFocusLost() || (active instanceof Element && active.closest("[hidden]") != null);
}

/**
 * Applies a collapse or expand (of one area or all four) as one step: the
 * reader stays on the same message, and focus that was inside a changed
 * area, whose element is now gone or hidden, moves to that area's toggle in
 * its new form, so a second Enter undoes the first.
 */
export function changeLayout(change: () => void): void {
  const area = areaHoldingFocus();
  keepReadingPlace(change);
  if (area == null || !focusWasLost()) return;
  const toggle = document.querySelector<HTMLElement>(`#${area} [${AREA_TOGGLE_ATTR}]`);
  if (toggle) toggle.focus({ preventScroll: true });
  else focusMainContent();
}
