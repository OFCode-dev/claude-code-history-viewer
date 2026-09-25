/**
 * Last reading position per session, in memory only (LRU).
 *
 * The message viewer records the first visible row while the user scrolls;
 * re-selecting the session restores it (see `navigatorSlice`). A session left
 * at the bottom has no entry: it opens at the bottom as usual.
 */

export interface ReadingPosition {
  /** Message row that was first visible. */
  uuid: string;
  /** `row.start - scrollTop` when recorded; restoring subtracts it again. */
  offset: number;
}

export const READING_POSITION_CAPACITY = 30;

const positions = new Map<string, ReadingPosition>();

/** Record (or refresh) the position of `sessionPath` as most recent. */
export function rememberReadingPosition(
  sessionPath: string,
  position: ReadingPosition
): void {
  positions.delete(sessionPath);
  positions.set(sessionPath, position);
  while (positions.size > READING_POSITION_CAPACITY) {
    const oldest = positions.keys().next().value;
    if (oldest === undefined) break;
    positions.delete(oldest);
  }
}

export function forgetReadingPosition(sessionPath: string): void {
  positions.delete(sessionPath);
}

export function recallReadingPosition(sessionPath: string): ReadingPosition | null {
  return positions.get(sessionPath) ?? null;
}

/** Test helper. */
export function clearReadingPositions(): void {
  positions.clear();
}
