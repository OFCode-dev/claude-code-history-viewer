import type { StateCreator } from "zustand";
import type { FullAppStore } from "./types";
import { RECENT_EDITS_DOCK_OPEN_KEY } from "./recentEditsPanelSlice";

/** The three panel groups reading mode can hide at the window edges. */
export type PanelGroup = "left" | "right" | "top";
export const PANEL_GROUPS: readonly PanelGroup[] = ["left", "right", "top"];

/** In reading mode, each group either hides at its edge or stays pinned in flow. */
export type GroupMode = "autohide" | "pinned";
export type ReadingProfile = Record<PanelGroup, GroupMode>;

/** What a group looks like on screen right now. */
export type EffectiveGroupMode = "normal" | GroupMode;

/** How fast a hidden panel reveals when the pointer rests on its handle. */
export type HoverRevealSetting = "off" | "standard" | "slow";

/**
 * How an auto-hidden panel was opened; it decides what keeps it open.
 * `sticky` is a touch tap, a pen tap without hover, or any open while hover
 * reveal is off: it stays until dismissed.
 */
export type RevealSource = "hover" | "click" | "sticky" | "keyboard";

export interface RevealedPanel {
  group: PanelGroup;
  source: RevealSource;
  /** Warm re-entry: slide in faster. */
  quick?: boolean;
}

/** A short message for the app's polite live region. */
export interface LayoutAnnouncement {
  text: string;
  /** Changes on every announcement, so a repeat is still announced. */
  id: number;
}

export interface LayoutSliceState {
  /** Project explorer shown as its narrow rail. */
  isExplorerCollapsed: boolean;
  /** Sessions pane shown as its narrow rail. */
  isSessionsPaneCollapsed: boolean;
  /** Reading mode: panels follow `readingProfile` instead of the normal layout. */
  isReadingMode: boolean;
  /** The recent-edits dock was open when reading mode started (reopen it on exit). */
  readingRestoreDock: boolean;
  readingProfile: ReadingProfile;
  hoverReveal: HoverRevealSetting;
  /** The auto-hidden panel currently shown as an overlay. Never persisted. */
  revealed: RevealedPanel | null;
  layoutAnnouncement: LayoutAnnouncement | null;
}

export interface LayoutSliceActions {
  toggleExplorerCollapsed: () => void;
  setExplorerCollapsed: (collapsed: boolean) => void;
  toggleSessionsPaneCollapsed: () => void;
  setSessionsPaneCollapsed: (collapsed: boolean) => void;
  /**
   * Enters or leaves reading mode. Entering closes the recent-edits dock and
   * remembers it was open; leaving reopens it if it is still closed. The
   * normal layout (rails, navigator, widths) is never written.
   */
  toggleReadingMode: () => void;
  /** Pins a group in reading mode (`true`) or lets it hide at its edge. */
  setReadingPin: (group: PanelGroup, pinned: boolean) => void;
  /**
   * Shows an auto-hidden group as an overlay. A hover reveal never replaces
   * another open overlay; an explicit one does. Returns whether it applied.
   */
  revealPanel: (group: PanelGroup, source: RevealSource, quick?: boolean) => boolean;
  /** Hides the overlay of `group` (any overlay when omitted). */
  concealPanel: (group?: PanelGroup) => void;
  setHoverReveal: (value: HoverRevealSetting) => void;
  announceLayout: (text: string) => void;
  clearLayoutAnnouncement: (id: number) => void;
}

export type LayoutSlice = LayoutSliceState & LayoutSliceActions;

export const EXPLORER_COLLAPSED_KEY = "explorer-collapsed";
export const SESSIONS_PANE_COLLAPSED_KEY = "sessions-pane-collapsed";
/** Legacy focus-mode snapshot; migrated into reading mode once. */
export const FOCUS_MODE_KEY = "focus-mode-restore";
export const READING_MODE_KEY = "reading-mode";
export const READING_PROFILE_KEY = "reading-profile";
export const HOVER_REVEAL_KEY = "panel-hover-reveal";
export const READING_HINT_SEEN_KEY = "reading-mode-hint-seen";
const NAVIGATOR_OPEN_KEY = "navigator-open";

export const DEFAULT_READING_PROFILE: Readonly<ReadingProfile> = Object.freeze({
  left: "autohide",
  right: "autohide",
  top: "autohide",
});
export const DEFAULT_HOVER_REVEAL: HoverRevealSetting = "standard";

// ---------------------------------------------------------------------------
// Storage: every read validated, every access guarded.
// ---------------------------------------------------------------------------

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the value simply does not survive a reload */
  }
}

function readJson(key: string): unknown {
  const raw = readRaw(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function readFlag(key: string): boolean {
  return readRaw(key) === "true";
}

function writeFlag(key: string, value: boolean): void {
  writeRaw(key, String(value));
}

interface StoredReadingMode {
  on: boolean;
  restoreDock: boolean;
}

function isStoredReadingMode(value: unknown): value is StoredReadingMode {
  if (value == null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.on === "boolean" && typeof candidate.restoreDock === "boolean";
}

function readReadingMode(): StoredReadingMode {
  const parsed = readJson(READING_MODE_KEY);
  return isStoredReadingMode(parsed) ? parsed : { on: false, restoreDock: false };
}

function writeReadingMode(value: StoredReadingMode): void {
  writeRaw(READING_MODE_KEY, JSON.stringify(value));
}

const isGroupMode = (value: unknown): value is GroupMode =>
  value === "autohide" || value === "pinned";

function readReadingProfile(): ReadingProfile {
  const parsed = readJson(READING_PROFILE_KEY);
  if (parsed == null || typeof parsed !== "object") return { ...DEFAULT_READING_PROFILE };
  const candidate = parsed as Record<string, unknown>;
  // Validated per group: one bad entry falls back alone, the rest are kept.
  return {
    left: isGroupMode(candidate.left) ? candidate.left : DEFAULT_READING_PROFILE.left,
    right: isGroupMode(candidate.right) ? candidate.right : DEFAULT_READING_PROFILE.right,
    top: isGroupMode(candidate.top) ? candidate.top : DEFAULT_READING_PROFILE.top,
  };
}

export const isHoverRevealSetting = (value: unknown): value is HoverRevealSetting =>
  value === "off" || value === "standard" || value === "slow";

function readHoverReveal(): HoverRevealSetting {
  const raw = readRaw(HOVER_REVEAL_KEY);
  return isHoverRevealSetting(raw) ? raw : DEFAULT_HOVER_REVEAL;
}

interface LegacyFocusSnapshot {
  explorerCollapsed: boolean;
  sessionsPaneCollapsed: boolean;
  navigatorOpen: boolean;
}

function isLegacyFocusSnapshot(value: unknown): value is LegacyFocusSnapshot {
  if (value == null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.explorerCollapsed === "boolean" &&
    typeof candidate.sessionsPaneCollapsed === "boolean" &&
    typeof candidate.navigatorOpen === "boolean"
  );
}

/**
 * One-time upgrade from focus mode. Focus mode folded the panels to rails
 * and kept the layout from before in `focus-mode-restore`. That snapshot
 * becomes the normal layout again, and the person continues in reading
 * mode, which replaced focus mode. Runs before any slice reads storage
 * (see useAppStore), so every slice starts from the migrated values.
 */
export function migrateLegacyFocusMode(): void {
  const parsed = readJson(FOCUS_MODE_KEY);
  if (readRaw(FOCUS_MODE_KEY) == null) return;
  writeRaw(FOCUS_MODE_KEY, null);
  if (!isLegacyFocusSnapshot(parsed)) return;

  writeFlag(EXPLORER_COLLAPSED_KEY, parsed.explorerCollapsed);
  writeFlag(SESSIONS_PANE_COLLAPSED_KEY, parsed.sessionsPaneCollapsed);
  writeFlag(NAVIGATOR_OPEN_KEY, parsed.navigatorOpen);
  const dockOpen = readFlag(RECENT_EDITS_DOCK_OPEN_KEY);
  if (dockOpen) writeFlag(RECENT_EDITS_DOCK_OPEN_KEY, false);
  writeReadingMode({ on: true, restoreDock: dockOpen });
}

/** Whether the one-time reading-mode hint was already shown. */
export function hasSeenReadingHint(): boolean {
  return readFlag(READING_HINT_SEEN_KEY);
}

export function markReadingHintSeen(): void {
  writeFlag(READING_HINT_SEEN_KEY, true);
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/**
 * What `group` looks like now. Below 768 px (`isMobile`) the drawers take
 * over and reading mode does not apply, though it stays on for wider windows.
 */
export function effectiveGroupMode(
  state: Pick<LayoutSliceState, "isReadingMode" | "readingProfile">,
  group: PanelGroup,
  isMobile: boolean
): EffectiveGroupMode {
  if (!state.isReadingMode || isMobile) return "normal";
  return state.readingProfile[group];
}

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

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

  const storedReadingMode = readReadingMode();
  let announcementId = 0;

  return {
    isExplorerCollapsed: readFlag(EXPLORER_COLLAPSED_KEY),
    isSessionsPaneCollapsed: readFlag(SESSIONS_PANE_COLLAPSED_KEY),
    isReadingMode: storedReadingMode.on,
    readingRestoreDock: storedReadingMode.on && storedReadingMode.restoreDock,
    readingProfile: readReadingProfile(),
    hoverReveal: readHoverReveal(),
    revealed: null,
    layoutAnnouncement: null,

    setExplorerCollapsed,
    toggleExplorerCollapsed: () =>
      setExplorerCollapsed(!get().isExplorerCollapsed),

    setSessionsPaneCollapsed,
    toggleSessionsPaneCollapsed: () =>
      setSessionsPaneCollapsed(!get().isSessionsPaneCollapsed),

    toggleReadingMode: () => {
      const state = get();
      if (!state.isReadingMode) {
        const restoreDock = state.isRecentEditsDockOpen;
        if (restoreDock) state.setRecentEditsDockOpen(false);
        writeReadingMode({ on: true, restoreDock });
        set({ isReadingMode: true, readingRestoreDock: restoreDock, revealed: null });
        return;
      }
      // A dock opened during reading mode simply stays open.
      if (state.readingRestoreDock && !state.isRecentEditsDockOpen) {
        state.setRecentEditsDockOpen(true);
      }
      writeReadingMode({ on: false, restoreDock: false });
      set({ isReadingMode: false, readingRestoreDock: false, revealed: null });
    },

    setReadingPin: (group, pinned) => {
      const current = get().readingProfile;
      const mode: GroupMode = pinned ? "pinned" : "autohide";
      if (current[group] === mode) return;
      const next: ReadingProfile = { ...current, [group]: mode };
      writeRaw(READING_PROFILE_KEY, JSON.stringify(next));
      const revealed = get().revealed;
      set({
        readingProfile: next,
        revealed: revealed?.group === group ? null : revealed,
      });
    },

    revealPanel: (group, source, quick = false) => {
      const state = get();
      if (!state.isReadingMode || state.readingProfile[group] !== "autohide") return false;
      const current = state.revealed;
      // Hover never evicts: the other overlay may be in active use.
      if (source === "hover" && current != null && current.group !== group) return false;
      if (current?.group === group && current.source === source && !!current.quick === quick) {
        return true;
      }
      set({ revealed: { group, source, quick } });
      return true;
    },

    concealPanel: (group) => {
      const current = get().revealed;
      if (current == null) return;
      if (group != null && current.group !== group) return;
      set({ revealed: null });
    },

    setHoverReveal: (value) => {
      writeRaw(HOVER_REVEAL_KEY, value);
      set({ hoverReveal: value });
    },

    announceLayout: (text) => {
      announcementId += 1;
      set({ layoutAnnouncement: { text, id: announcementId } });
    },

    clearLayoutAnnouncement: (id) => {
      if (get().layoutAnnouncement?.id === id) set({ layoutAnnouncement: null });
    },
  };
};
