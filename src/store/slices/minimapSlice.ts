import type { StateCreator } from "zustand";
import type { FullAppStore } from "./types";
import { readBool, writeStr } from "../persist";

export interface MinimapSliceState {
    /** Whether the session minimap strip is shown */
    isMinimapOpen: boolean;
}

export interface MinimapSliceActions {
    toggleMinimap: () => void;
    setMinimapOpen: (open: boolean) => void;
}

export type MinimapSlice = MinimapSliceState & MinimapSliceActions;

const STORAGE_KEY = "minimap-open";

export const createMinimapSlice: StateCreator<
    FullAppStore,
    [],
    [],
    MinimapSlice
> = (set) => ({
    isMinimapOpen: readBool(STORAGE_KEY, false),

    toggleMinimap: () => set((state) => {
        const next = !state.isMinimapOpen;
        writeStr(STORAGE_KEY, String(next));
        return { isMinimapOpen: next };
    }),

    setMinimapOpen: (open) => {
        writeStr(STORAGE_KEY, String(open));
        set({ isMinimapOpen: open });
    },
});
