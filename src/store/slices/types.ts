/**
 * Store Slice Types
 *
 * Shared types for Zustand store slices.
 */

import type { AppStore } from "../useAppStore";

// ============================================================================
// Search Types
// ============================================================================

/** Search match information */
export interface SearchMatch {
  messageUuid: string;
  messageIndex: number; // Index in messages array
  matchIndex: number; // Which match within the message (0-based)
  matchCount: number; // Total matches in this message
}

/** Search filter type */
export type SearchFilterType = "content" | "toolId";

/** Session search state (KakaoTalk-style navigation) */
export interface SearchState {
  query: string;
  matches: SearchMatch[];
  currentMatchIndex: number;
  isSearching: boolean;
  filterType: SearchFilterType;
  /**
   * Matches left out of `matches` because the message display filter hides
   * them (e.g. tool results in the dialogue view). They cannot be navigated to.
   */
  hiddenMatchCount: number;
}

// ============================================================================
// Helpers
// ============================================================================

/** Create empty search state while preserving filterType */
export const createEmptySearchState = (
  filterType: SearchFilterType
): SearchState => ({
  query: "",
  matches: [],
  currentMatchIndex: -1,
  isSearching: false,
  filterType,
  hiddenMatchCount: 0,
});

// ============================================================================
// Full App Store Interface (for slice dependencies)
// ============================================================================

/**
 * Full AppStore type that all slices can depend on.
 * Type-only import, so it does not create a runtime cycle.
 */
export type FullAppStore = AppStore;
