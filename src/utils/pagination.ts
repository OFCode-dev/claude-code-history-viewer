/**
 * Pagination Utilities
 *
 * Unified pagination types and helper functions.
 * Single source of truth for all pagination logic.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Base pagination state (core fields shared by all paginated resources)
 */
export interface BasePaginationState {
  offset: number;
  limit: number;
  hasMore: boolean;
  isLoadingMore: boolean;
}

/**
 * Pagination state with total count
 */
export interface PaginationWithCount extends BasePaginationState {
  totalCount: number;
}

/**
 * Extended pagination state for recent edits (with additional metadata)
 */
export interface RecentEditsPaginationState extends BasePaginationState {
  totalEditsCount: number;
  uniqueFilesCount: number;
}

/**
 * Alias for project token stats pagination
 */
export type ProjectTokenStatsPaginationState = PaginationWithCount;

// ============================================================================
// Initial States
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;

/**
 * Create initial base pagination state
 */
export const createInitialPagination = (
  limit: number = DEFAULT_PAGE_SIZE
): BasePaginationState => ({
  offset: 0,
  limit,
  hasMore: false,
  isLoadingMore: false,
});

/**
 * Create initial pagination state with count
 */
export const createInitialPaginationWithCount = (
  limit: number = DEFAULT_PAGE_SIZE
): PaginationWithCount => ({
  ...createInitialPagination(limit),
  totalCount: 0,
});

/**
 * Create initial recent edits pagination state
 */
export const createInitialRecentEditsPagination = (
  limit: number = DEFAULT_PAGE_SIZE
): RecentEditsPaginationState => ({
  ...createInitialPagination(limit),
  totalEditsCount: 0,
  uniqueFilesCount: 0,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate next offset for pagination
 */
export const getNextOffset = (pagination: BasePaginationState): number => {
  return pagination.offset + pagination.limit;
};

/**
 * Check if can load more items
 */
export const canLoadMore = (pagination: BasePaginationState): boolean => {
  return pagination.hasMore && !pagination.isLoadingMore;
};
