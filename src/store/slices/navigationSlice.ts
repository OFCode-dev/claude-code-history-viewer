import type { StateCreator } from "zustand";
import type { FullAppStore } from "./types";
import {
    type WebUINavigationOptions,
    writeWebUIDeepLink,
} from "@/utils/webuiDeepLink";

/**
 * A request for the explorer to show a location: switch to directory grouping,
 * expand the ancestors of `path`, scroll it into view and focus it. `nonce`
 * makes repeated requests for the same path distinct.
 */
export interface ExplorerRevealRequest {
    path: string;
    nonce: number;
}

export interface NavigationSliceState {
    targetMessageUuid: string | null;
    shouldHighlightTarget: boolean;
    explorerRevealRequest: ExplorerRevealRequest | null;
}

export interface NavigationSliceActions {
    navigateToMessage: (uuid: string, options?: WebUINavigationOptions) => void;
    clearTargetMessage: () => void;
    /** Ask the explorer to reveal a directory or project path (absolute). */
    requestExplorerReveal: (path: string) => void;
    clearExplorerRevealRequest: () => void;
}

export type NavigationSlice = NavigationSliceState & NavigationSliceActions;

export const createNavigationSlice: StateCreator<
    FullAppStore,
    [],
    [],
    NavigationSlice
> = (set, get) => ({
    targetMessageUuid: null,
    shouldHighlightTarget: false,
    explorerRevealRequest: null,

    navigateToMessage: (uuid, options) => {
        set({
            targetMessageUuid: uuid,
            shouldHighlightTarget: true
        });

        const session = get().selectedSession;
        const sessionId = session?.actual_session_id || session?.session_id;
        // Inside a subagent transcript the URL keeps the parent session (see
        // selectSession): a subagent id is not resolvable as a deep link.
        const inSubagent = (get().parentSessionStack?.length ?? 0) > 0;
        if (sessionId && !inSubagent) {
            writeWebUIDeepLink(
                { sessionId, messageId: uuid },
                options?.history ?? "push",
            );
        }
    },

    clearTargetMessage: () => set({
        targetMessageUuid: null,
        shouldHighlightTarget: false
    }),

    requestExplorerReveal: (path) => set((state) => ({
        explorerRevealRequest: {
            path,
            nonce: (state.explorerRevealRequest?.nonce ?? 0) + 1,
        },
    })),

    clearExplorerRevealRequest: () => set({ explorerRevealRequest: null }),
});
