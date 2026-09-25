import type { StateCreator } from "zustand";
import type { FullAppStore } from "./types";

/**
 * Layout of the three collapsible side panels, captured when focus mode starts
 * so leaving it can put every panel back exactly as it was.
 */
export interface PanelLayoutSnapshot {
  explorerCollapsed: boolean;
  sessionsPaneCollapsed: boolean;
  navigatorOpen: boolean;
}

export interface LayoutSliceState {
  /** Project explorer shown as its narrow rail. */
  isExplorerCollapsed: boolean;
  /** Sessions pane shown as its narrow rail. */
  isSessionsPaneCollapsed: boolean;
  /** Non-null while focus mode is on: the layout to restore when it ends. */
  focusModeSnapshot: PanelLayoutSnapshot | null;
}

export interface LayoutSliceActions {
  toggleExplorerCollapsed: () => void;
  setExplorerCollapsed: (collapsed: boolean) => void;
  toggleSessionsPaneCollapsed: () => void;
  setSessionsPaneCollapsed: (collapsed: boolean) => void;
  /**
   * First use collapses explorer, sessions pane and navigator to their rails;
   * second use restores the layout from before the first.
   */
  toggleFocusMode: () => void;
}

export type LayoutSlice = LayoutSliceState & LayoutSliceActions;

export const EXPLORER_COLLAPSED_KEY = "explorer-collapsed";
export const SESSIONS_PANE_COLLAPSED_KEY = "sessions-pane-collapsed";
export const FOCUS_MODE_KEY = "focus-mode-restore";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage unavailable: the flag simply does not survive a reload */
  }
}

function isPanelLayoutSnapshot(value: unknown): value is PanelLayoutSnapshot {
  if (value == null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.explorerCollapsed === "boolean" &&
    typeof candidate.sessionsPaneCollapsed === "boolean" &&
    typeof candidate.navigatorOpen === "boolean"
  );
}

function readSnapshot(): PanelLayoutSnapshot | null {
  try {
    const raw = localStorage.getItem(FOCUS_MODE_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPanelLayoutSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: PanelLayoutSnapshot | null): void {
  try {
    if (snapshot == null) {
      localStorage.removeItem(FOCUS_MODE_KEY);
    } else {
      localStorage.setItem(FOCUS_MODE_KEY, JSON.stringify(snapshot));
    }
  } catch {
    /* storage unavailable: focus mode still works for this page load */
  }
}

export const createLayoutSlice: StateCreator<
  FullAppStore,
  [],
  [],
  LayoutSlice
> = (set, get) => {
  const setExplorerCollapsed = (collapsed: boolean) => {
    writeFlag(EXPLORER_COLLAPSED_KEY, collapsed);
    set({ isExplorerCollapsed: collapsed });
  };

  const setSessionsPaneCollapsed = (collapsed: boolean) => {
    writeFlag(SESSIONS_PANE_COLLAPSED_KEY, collapsed);
    set({ isSessionsPaneCollapsed: collapsed });
  };

  return {
    isExplorerCollapsed: readFlag(EXPLORER_COLLAPSED_KEY),
    isSessionsPaneCollapsed: readFlag(SESSIONS_PANE_COLLAPSED_KEY),
    focusModeSnapshot: readSnapshot(),

    setExplorerCollapsed,
    toggleExplorerCollapsed: () =>
      setExplorerCollapsed(!get().isExplorerCollapsed),

    setSessionsPaneCollapsed,
    toggleSessionsPaneCollapsed: () =>
      setSessionsPaneCollapsed(!get().isSessionsPaneCollapsed),

    toggleFocusMode: () => {
      const state = get();
      const snapshot = state.focusModeSnapshot;

      if (snapshot != null) {
        setExplorerCollapsed(snapshot.explorerCollapsed);
        setSessionsPaneCollapsed(snapshot.sessionsPaneCollapsed);
        state.setNavigatorOpen(snapshot.navigatorOpen);
        writeSnapshot(null);
        set({ focusModeSnapshot: null });
        return;
      }

      const next: PanelLayoutSnapshot = {
        explorerCollapsed: state.isExplorerCollapsed,
        sessionsPaneCollapsed: state.isSessionsPaneCollapsed,
        navigatorOpen: state.isNavigatorOpen,
      };
      writeSnapshot(next);
      set({ focusModeSnapshot: next });
      setExplorerCollapsed(true);
      setSessionsPaneCollapsed(true);
      state.setNavigatorOpen(false);
    },
  };
};
