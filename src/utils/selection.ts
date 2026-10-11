/** Inclusive range of IDs between two IDs in an ordered list. */
export function getRange(orderedIds: string[], fromId: string, toId: string): string[] {
  const fromIdx = orderedIds.indexOf(fromId);
  const toIdx = orderedIds.indexOf(toId);
  if (fromIdx === -1 || toIdx === -1) return [toId];
  const lo = Math.min(fromIdx, toIdx);
  const hi = Math.max(fromIdx, toIdx);
  return orderedIds.slice(lo, hi + 1);
}
