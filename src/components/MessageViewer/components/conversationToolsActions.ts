/**
 * Opening and folding the conversation tools from outside their component:
 * the chips, the toggle buttons and Mod+F all come through here.
 */
import { useAppStore } from "@/store/useAppStore";
import { changeLayout } from "@/layouts/collapsibleAreas";
import type { ChipTarget } from "./TopStripChips";

export const CONVERSATION_TOOLS_ID = "conversation-tools";
export const CONVERSATION_TOOLS_PANEL_ID = "conversation-tools-panel";

/** Marks the controls a chip or Mod+F focuses (search field, Dialogue, filters). */
export const TOOL_FOCUS_ATTR = "data-tool-focus";

/** The conversation search field, when a conversation is showing (also while collapsed). */
export function getConversationSearchInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[${TOOL_FOCUS_ATTR}="search"]`);
}

/**
 * Expands the tools if they are collapsed (keeping the reader's place),
 * then focuses `target`'s control; the search field gets its text selected.
 */
export function openConversationTool(target: ChipTarget): void {
  const store = useAppStore.getState();
  if (store.isConversationToolsCollapsed) {
    changeLayout(() => store.setConversationToolsCollapsed(false));
  }
  const control = document.querySelector<HTMLElement>(
    `#${CONVERSATION_TOOLS_PANEL_ID} [${TOOL_FOCUS_ATTR}="${target}"]:not(:disabled)`
  );
  if (!control) return;
  control.focus({ preventScroll: true });
  if (control instanceof HTMLInputElement) control.select();
}

export function setConversationToolsCollapsed(collapsed: boolean): void {
  changeLayout(() => useAppStore.getState().setConversationToolsCollapsed(collapsed));
}
