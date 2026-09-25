import type { StateCreator } from "zustand";
import type { FullAppStore } from "./types";
import { recallReadingPosition, type ReadingPosition } from "../readingPositions";

/** Prompts: one row per human prompt. All: every non-noise record. */
export type NavigatorMode = "prompts" | "all";

/** A remembered reading position waiting for its session to render. */
export interface PendingPositionRestore extends ReadingPosition {
    sessionPath: string;
}

export interface NavigatorSliceState {
    /** Whether the right sidebar navigator is expanded */
    isNavigatorOpen: boolean;
    navigatorMode: NavigatorMode;
    pendingPositionRestore: PendingPositionRestore | null;
}

export interface NavigatorSliceActions {
    toggleNavigator: () => void;
    setNavigatorOpen: (open: boolean) => void;
    setNavigatorMode: (mode: NavigatorMode) => void;
    clearPendingPositionRestore: () => void;
}

export type NavigatorSlice = NavigatorSliceState & NavigatorSliceActions;

const STORAGE_KEY = "navigator-open";
const MODE_STORAGE_KEY = "navigator-mode";

/**
 * The restore to queue when `sessionPath` is (re)selected — its last reading
 * position, or null to clear a stale one. `selectSession` stores it in
 * `pendingPositionRestore`; the message viewer consumes it unless an explicit
 * target (deep link, search hit) takes over.
 */
export function pendingRestoreFor(sessionPath: string): PendingPositionRestore | null {
    const position = recallReadingPosition(sessionPath);
    return position ? { sessionPath, ...position } : null;
}

function readStoredMode(): NavigatorMode {
    try {
        return localStorage.getItem(MODE_STORAGE_KEY) === "all" ? "all" : "prompts";
    } catch {
        return "prompts";
    }
}

export const createNavigatorSlice: StateCreator<
    FullAppStore,
    [],
    [],
    NavigatorSlice
> = (set) => ({
    isNavigatorOpen: (() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored === null ? true : stored === "true";
        } catch {
            return true;
        }
    })(),
    navigatorMode: readStoredMode(),
    pendingPositionRestore: null,

    toggleNavigator: () => set((state) => {
        const next = !state.isNavigatorOpen;
        try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
        return { isNavigatorOpen: next };
    }),

    setNavigatorOpen: (open) => {
        try { localStorage.setItem(STORAGE_KEY, String(open)); } catch { /* ignore */ }
        set({ isNavigatorOpen: open });
    },

    setNavigatorMode: (mode) => {
        try { localStorage.setItem(MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
        set({ navigatorMode: mode });
    },

    clearPendingPositionRestore: () => set({ pendingPositionRestore: null }),
});
