import type { StateCreator } from "zustand";
import type { FullAppStore } from "./types";
import { readBool, writeStr } from "../persist";

/** A short message for the app's polite live region. */
export interface LayoutAnnouncement {
  text: string;
  /** Changes on every announcement, so a repeat is still announced. */
  id: number;
}

/**
 * The four collapsible areas of the one layout. Each collapses to a thin bar
 * in flow (a 24 px rail at the side, a 24 px strip above the conversation);
 * the prompts navigator keeps its own `isNavigatorOpen` in the navigator slice.
 */
export interface LayoutSliceState {
  /** Project explorer shown as its rail. */
  isExplorerCollapsed: boolean;
  /** Sessions pane shown as its rail. */
  isSessionsPaneCollapsed: boolean;
  /** Search toolbar and filter row shown as the strip with status chips. */
  isConversationToolsCollapsed: boolean;
  layoutAnnouncement: LayoutAnnouncement | null;
}

export interface LayoutSliceActions {
  toggleExplorerCollapsed: () => void;
  setExplorerCollapsed: (collapsed: boolean) => void;
  toggleSessionsPaneCollapsed: () => void;
  setSessionsPaneCollapsed: (collapsed: boolean) => void;
  toggleConversationToolsCollapsed: () => void;
  setConversationToolsCollapsed: (collapsed: boolean) => void;
  /** Collapses all four areas. No snapshot: expanding again opens all four. */
  collapseAll: () => void;
  expandAll: () => void;
  announceLayout: (text: string) => void;
  clearLayoutAnnouncement: (id: number) => void;
}

export type LayoutSlice = LayoutSliceState & LayoutSliceActions;

export const EXPLORER_COLLAPSED_KEY = "explorer-collapsed";
export const SESSIONS_PANE_COLLAPSED_KEY = "sessions-pane-collapsed";
export const CONVERSATION_TOOLS_COLLAPSED_KEY = "conversation-tools-collapsed";

/**
 * Written by focus mode and reading mode, which this layout replaced. Removed
 * once per store creation so stale state cannot linger in people's storage.
 */
export const OBSOLETE_LAYOUT_KEYS: readonly string[] = [
  "focus-mode-restore",
  "reading-mode",
  "reading-profile",
  "panel-hover-reveal",
  "reading-mode-hint-seen",
];

function forgetObsoleteLayoutKeys(): void {
  for (const key of OBSOLETE_LAYOUT_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable: nothing to clean up */
    }
  }
}

/** Whether every area is folded to its bar (the header button's pressed state). */
export function areAllCollapsed(
  state: Pick<
    FullAppStore,
    | "isExplorerCollapsed"
    | "isSessionsPaneCollapsed"
    | "isConversationToolsCollapsed"
    | "isNavigatorOpen"
  >
): boolean {
  return (
    state.isExplorerCollapsed &&
    state.isSessionsPaneCollapsed &&
    state.isConversationToolsCollapsed &&
    !state.isNavigatorOpen
  );
}

export const createLayoutSlice: StateCreator<
  FullAppStore,
  [],
  [],
  LayoutSlice
> = (set, get) => {
  forgetObsoleteLayoutKeys();

  const setExplorerCollapsed = (collapsed: boolean) => {
    writeStr(EXPLORER_COLLAPSED_KEY, String(collapsed));
    set({ isExplorerCollapsed: collapsed });
  };

  const setSessionsPaneCollapsed = (collapsed: boolean) => {
    writeStr(SESSIONS_PANE_COLLAPSED_KEY, String(collapsed));
    set({ isSessionsPaneCollapsed: collapsed });
  };

  const setConversationToolsCollapsed = (collapsed: boolean) => {
    writeStr(CONVERSATION_TOOLS_COLLAPSED_KEY, String(collapsed));
    set({ isConversationToolsCollapsed: collapsed });
  };

  const setAllCollapsed = (collapsed: boolean) => {
    setExplorerCollapsed(collapsed);
    setSessionsPaneCollapsed(collapsed);
    setConversationToolsCollapsed(collapsed);
    get().setNavigatorOpen(!collapsed);
  };

  let announcementId = 0;

  return {
    isExplorerCollapsed: readBool(EXPLORER_COLLAPSED_KEY, false),
    isSessionsPaneCollapsed: readBool(SESSIONS_PANE_COLLAPSED_KEY, false),
    isConversationToolsCollapsed: readBool(CONVERSATION_TOOLS_COLLAPSED_KEY, false),
    layoutAnnouncement: null,

    setExplorerCollapsed,
    toggleExplorerCollapsed: () =>
      setExplorerCollapsed(!get().isExplorerCollapsed),

    setSessionsPaneCollapsed,
    toggleSessionsPaneCollapsed: () =>
      setSessionsPaneCollapsed(!get().isSessionsPaneCollapsed),

    setConversationToolsCollapsed,
    toggleConversationToolsCollapsed: () =>
      setConversationToolsCollapsed(!get().isConversationToolsCollapsed),

    collapseAll: () => setAllCollapsed(true),
    expandAll: () => setAllCollapsed(false),

    announceLayout: (text) => {
      announcementId += 1;
      set({ layoutAnnouncement: { text, id: announcementId } });
    },

    clearLayoutAnnouncement: (id) => {
      if (get().layoutAnnouncement?.id === id) set({ layoutAnnouncement: null });
    },
  };
};
