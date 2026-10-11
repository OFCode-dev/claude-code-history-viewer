import type { StateCreator } from "zustand";
import type { FullAppStore } from "./types";
import type { DateFilter } from "../../types/board.types";

export interface MessageFilterRoles {
    user: boolean;
    assistant: boolean;
}

export interface MessageFilterContentTypes {
    text: boolean;
    thinking: boolean;
    toolCalls: boolean;
    commands: boolean;
    parallelTasks: boolean;
}

export interface MessageFilter {
    roles: MessageFilterRoles;
    contentTypes: MessageFilterContentTypes;
    /**
     * Dialogue view: only human prompts and assistant prose. Kept separate from
     * the individual toggles so turning it off restores them unchanged.
     */
    dialogue: boolean;
}

/**
 * Content types rendered in the dialogue view: text only. `parallelTasks` stays
 * on because the dialogue rules already drop tool calls and notifications, and
 * category filtering would also drop assistant prose that shares a record with
 * a parallel spawn.
 */
export const DIALOGUE_CONTENT_TYPES: Readonly<MessageFilterContentTypes> = Object.freeze({
    text: true,
    thinking: false,
    toolCalls: false,
    commands: false,
    parallelTasks: true,
});

/** Content types that are actually rendered, taking the dialogue view into account. */
export const getEffectiveContentTypes = (
    filter: MessageFilter,
): MessageFilterContentTypes =>
    filter.dialogue ? DIALOGUE_CONTENT_TYPES : filter.contentTypes;

const MESSAGE_FILTER_STORAGE_KEY = "message-filter";

const defaultMessageFilter = (): MessageFilter => ({
    roles: { user: true, assistant: true },
    contentTypes: {
        text: true,
        thinking: true,
        toolCalls: true,
        commands: true,
        parallelTasks: true,
    },
    dialogue: false,
});

const isBool = (value: unknown): value is boolean => typeof value === "boolean";

/**
 * Load the persisted message filter, validating every field. Any missing or
 * malformed field falls back to the default so an older/corrupt payload can never
 * break the toolbar. localStorage access is wrapped in try/catch per repo convention.
 */
const loadPersistedMessageFilter = (): MessageFilter => {
    const fallback = defaultMessageFilter();
    try {
        const raw = localStorage.getItem(MESSAGE_FILTER_STORAGE_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw) as Partial<MessageFilter> | null;
        const roles = parsed?.roles;
        const contentTypes = parsed?.contentTypes;
        if (!roles || !contentTypes) return fallback;
        return {
            roles: {
                user: isBool(roles.user) ? roles.user : fallback.roles.user,
                assistant: isBool(roles.assistant)
                    ? roles.assistant
                    : fallback.roles.assistant,
            },
            contentTypes: {
                text: isBool(contentTypes.text)
                    ? contentTypes.text
                    : fallback.contentTypes.text,
                thinking: isBool(contentTypes.thinking)
                    ? contentTypes.thinking
                    : fallback.contentTypes.thinking,
                toolCalls: isBool(contentTypes.toolCalls)
                    ? contentTypes.toolCalls
                    : fallback.contentTypes.toolCalls,
                commands: isBool(contentTypes.commands)
                    ? contentTypes.commands
                    : fallback.contentTypes.commands,
                parallelTasks: isBool(contentTypes.parallelTasks)
                    ? contentTypes.parallelTasks
                    : fallback.contentTypes.parallelTasks,
            },
            dialogue: isBool(parsed?.dialogue) ? parsed.dialogue : fallback.dialogue,
        };
    } catch {
        return fallback;
    }
};

const persistMessageFilter = (filter: MessageFilter): void => {
    try {
        localStorage.setItem(MESSAGE_FILTER_STORAGE_KEY, JSON.stringify(filter));
    } catch {
        // Persistence is best-effort; ignore quota/availability failures.
    }
};

export interface FilterSliceState {
    dateFilter: DateFilter;
    showParallelTasksInNavigator: boolean;
    messageFilter: MessageFilter;
}

export interface FilterSliceActions {
    setDateFilter: (filter: DateFilter) => void;
    clearDateFilter: () => void;
    toggleShowParallelTasksInNavigator: () => void;
    toggleRole: (role: keyof MessageFilterRoles) => void;
    toggleContentType: (contentType: keyof MessageFilterContentTypes) => void;
    toggleDialogue: () => void;
    resetMessageFilter: () => void;
    isMessageFilterActive: () => boolean;
}

export type FilterSlice = FilterSliceState & FilterSliceActions;

const getInitialDateFilter = () => ({ start: null, end: null });

// A factory (not a const) so the persisted filter is read when the slice/store is
// created, not once at module import — keeps the load fresh on every store creation.
const initialFilterState = (): FilterSliceState => ({
    dateFilter: getInitialDateFilter(),
    showParallelTasksInNavigator: true,
    // Seed from localStorage so the user's filter survives session switches and restarts.
    messageFilter: loadPersistedMessageFilter(),
});

export const createFilterSlice: StateCreator<
    FullAppStore,
    [],
    [],
    FilterSlice
> = (set, get) => ({
    ...initialFilterState(),

    setDateFilter: (dateFilter) => {
        set({ dateFilter });
    },

    clearDateFilter: () => {
        set({ dateFilter: { start: null, end: null } });
    },

    toggleShowParallelTasksInNavigator: () => {
        set((state) => ({
            showParallelTasksInNavigator: !state.showParallelTasksInNavigator,
        }));
    },

    toggleRole: (role) => {
        const current = get().messageFilter;
        const next: MessageFilter = {
            ...current,
            roles: { ...current.roles, [role]: !current.roles[role] },
        };
        persistMessageFilter(next);
        set({ messageFilter: next });
    },

    toggleContentType: (contentType) => {
        const current = get().messageFilter;
        const next: MessageFilter = {
            ...current,
            contentTypes: {
                ...current.contentTypes,
                [contentType]: !current.contentTypes[contentType],
            },
        };
        persistMessageFilter(next);
        set({ messageFilter: next });
    },

    toggleDialogue: () => {
        const current = get().messageFilter;
        const next: MessageFilter = { ...current, dialogue: !current.dialogue };
        persistMessageFilter(next);
        set({ messageFilter: next });
    },

    resetMessageFilter: () => {
        const next = defaultMessageFilter();
        persistMessageFilter(next);
        set({ messageFilter: next });
    },

    isMessageFilterActive: () => {
        const { messageFilter } = get();
        const { roles, contentTypes } = messageFilter;
        return messageFilter.dialogue
            || !roles.user || !roles.assistant
            || !contentTypes.text || !contentTypes.thinking
            || !contentTypes.toolCalls || !contentTypes.commands
            || !contentTypes.parallelTasks;
    },
});
