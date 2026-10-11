/**
 * Search Slice
 *
 * Handles global search and session search (KakaoTalk-style navigation).
 */

import { toast } from "sonner";
import type { StateCreator } from "zustand";
import { searchMessagesAsync, buildSearchIndex, isSearchIndexReady, linearSearchMessages } from "../../utils/searchIndex";
import {
  type SearchState,
  type SearchFilterType,
  type SearchMatch,
  type FullAppStore,
  createEmptySearchState,
} from "./types";
import { filterSearchMatches } from "../../components/MessageViewer/helpers/searchMatchVisibility";

// ============================================================================
// State Interface
// ============================================================================

export interface SearchSliceState {
  // Session search
  sessionSearch: SearchState;
}

export interface SearchSliceActions {
  // Session search
  setSessionSearchQuery: (query: string) => Promise<void> | void;
  /**
   * Re-run the current session search (e.g. after the display filter changed),
   * staying on the current match when it is still visible.
   */
  refreshSessionSearch: () => Promise<void> | void;
  setSearchFilterType: (filterType: SearchFilterType) => void;
  goToNextMatch: () => void;
  goToPrevMatch: () => void;
  goToMatchIndex: (index: number) => void;
  clearSessionSearch: () => void;
}

export type SearchSlice = SearchSliceState & SearchSliceActions;

// ============================================================================
// Initial State
// ============================================================================

const initialSearchState: SearchSliceState = {
  sessionSearch: createEmptySearchState("content"),
};

/**
 * Index of the match to make current: `stayOn` itself when it is still a
 * match, else the match closest to its message, else (no `stayOn`) the first.
 */
const pickCurrentMatchIndex = (matches: SearchMatch[], stayOn: SearchMatch | null): number => {
  if (matches.length === 0) return -1;
  if (!stayOn) return 0;
  const same = matches.findIndex(
    (m) => m.messageUuid === stayOn.messageUuid && m.matchIndex === stayOn.matchIndex,
  );
  if (same !== -1) return same;
  let closest = 0;
  for (let i = 1; i < matches.length; i++) {
    const distance = Math.abs((matches[i]?.messageIndex ?? 0) - stayOn.messageIndex);
    const best = Math.abs((matches[closest]?.messageIndex ?? 0) - stayOn.messageIndex);
    if (distance < best) closest = i;
  }
  return closest;
};

// ============================================================================
// Slice Creator
// ============================================================================

export const createSearchSlice: StateCreator<
  FullAppStore,
  [],
  [],
  SearchSlice
> = (set, get) => {
  // Monotonic request token for setSessionSearchQuery: protects against
  // stale async results overwriting newer ones when the user types quickly
  // and the Worker is still building (linear fallback is sync, Worker path
  // is async - earlier async result can otherwise land on top of a later
  // sync result).
  let sessionSearchRequestId = 0;

  /**
   * Search the complete session. `stayOn` is the match to stay on when it is
   * still in the new results (a refresh); otherwise the first match is current.
   */
  const runSessionSearch = async (query: string, stayOn: SearchMatch | null): Promise<void> => {
    const requestId = ++sessionSearchRequestId;
    const { sessionSearch } = get();
    const { filterType } = sessionSearch;
    const sessionPath = get().selectedSession?.file_path;

    // Empty query clears search results
    if (!query.trim()) {
      set((state) => ({
        sessionSearch: createEmptySearchState(state.sessionSearch.filterType),
      }));
      return;
    }

    // Set searching state
    set((state) => ({
      sessionSearch: {
        ...state.sessionSearch,
        query,
        isSearching: true,
      },
    }));

    // Helper: predicate "this request is still the latest one AND the user
    // is still on the session it was issued for". Re-checked after EVERY
    // await and in the catch path — a session switch does not bump the
    // request id, so the id alone cannot stop a stale result (or a stale
    // error) from landing on the new session's state.
    const isStillLatest = () =>
      requestId === sessionSearchRequestId &&
      get().selectedSession?.file_path === sessionPath;

    try {
      // Search over the COMPLETE session, not just the loaded window —
      // matches in unloaded older pages must be findable. The fetch is
      // cached per session in the message slice.
      const searchableMessages = await get().fetchFullSessionMessages();

      // Session-switch guard: the full fetch resolved for a session the
      // user has already left.
      if (!isStillLatest()) {
        return;
      }

      // Search strategy: Worker (async) > linear fallback (sync)
      let searchResults: Array<{ messageUuid: string; messageIndex: number; matchIndex: number; matchCount: number }>;

      if (isSearchIndexReady()) {
        // Worker index is ready — use fast async search
        searchResults = await searchMessagesAsync(query, filterType);
      } else {
        // Index not ready — use linear search (instant, ~100-200ms for 50k messages)
        searchResults = linearSearchMessages(searchableMessages, query, filterType);
        // Trigger background Worker index build for future searches
        buildSearchIndex(searchableMessages);
      }

      // Drop stale results: a newer search has been started while this one
      // was awaiting. The newer search owns `isSearching` and will clear it
      // on its own success / failure path, so we intentionally do not touch
      // it here.
      if (!isStillLatest()) return;

      // Convert to SearchMatch format (filter valid indices)
      const allMatches: SearchMatch[] = searchResults.filter(
        (result) =>
          result.messageIndex >= 0 &&
          result.messageIndex < searchableMessages.length
      );

      // Matches in records the display filter hides cannot be navigated to;
      // keep them out of the list and report how many there are.
      const { visible: matches, hiddenCount: hiddenMatchCount } = filterSearchMatches(
        allMatches,
        searchableMessages,
        get().messageFilter,
        query,
        filterType,
      );

      // Save match results (auto-navigate to the first match, or stay on the
      // current one when refreshing)
      set((state) => ({
        sessionSearch: {
          query,
          matches,
          currentMatchIndex: pickCurrentMatchIndex(matches, stayOn),
          isSearching: false,
          filterType: state.sessionSearch.filterType,
          hiddenMatchCount,
        },
      }));
    } catch (error) {
      console.error("[Search] Failed to search messages:", error);
      // Drop stale error: a newer search has already started and owns
      // the `isSearching` state.
      if (!isStillLatest()) return;
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to search messages: ${message}`);
      set((state) => ({
        sessionSearch: {
          query,
          matches: [],
          currentMatchIndex: -1,
          isSearching: false,
          filterType: state.sessionSearch.filterType,
          hiddenMatchCount: 0,
        },
      }));
    }
  };

  return {
  ...initialSearchState,

  // Session search (KakaoTalk-style navigation)
  setSessionSearchQuery: (query: string) => runSessionSearch(query, null),

  refreshSessionSearch: () => {
    const { sessionSearch } = get();
    if (!sessionSearch.query.trim()) return;
    const current = sessionSearch.matches[sessionSearch.currentMatchIndex] ?? null;
    return runSessionSearch(sessionSearch.query, current);
  },

  goToNextMatch: () => {
    const { sessionSearch } = get();
    if (sessionSearch.matches.length === 0) return;

    const nextIndex =
      (sessionSearch.currentMatchIndex + 1) % sessionSearch.matches.length;
    set({
      sessionSearch: {
        ...sessionSearch,
        currentMatchIndex: nextIndex,
      },
    });
  },

  goToPrevMatch: () => {
    const { sessionSearch } = get();
    if (sessionSearch.matches.length === 0) return;

    const totalMatches = sessionSearch.matches.length;
    const prevIndex =
      sessionSearch.currentMatchIndex <= 0
        ? totalMatches - 1
        : sessionSearch.currentMatchIndex - 1;

    set({
      sessionSearch: {
        ...sessionSearch,
        currentMatchIndex: prevIndex,
      },
    });
  },

  goToMatchIndex: (index: number) => {
    const { sessionSearch } = get();
    const { matches } = sessionSearch;

    if (index < 0 || index >= matches.length) {
      console.warn(
        `[Search] Invalid match index: ${index} (total: ${matches.length})`
      );
      return;
    }

    set({
      sessionSearch: {
        ...sessionSearch,
        currentMatchIndex: index,
      },
    });
  },

  clearSessionSearch: () => {
    set((state) => ({
      sessionSearch: createEmptySearchState(state.sessionSearch.filterType),
    }));
  },

  setSearchFilterType: (filterType: SearchFilterType) => {
    set(() => ({
      sessionSearch: createEmptySearchState(filterType),
    }));
  },
  };
};
