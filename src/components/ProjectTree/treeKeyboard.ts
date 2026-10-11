export type TreeNavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";
export interface TreeItemAnnouncementLabels {
  collapsed: string;
  expanded: string;
  selected: string;
}

/**
 * The tree navigation key for a keydown, or null. Alt+Arrow is left to the
 * global previous/next prompt shortcut (useAppKeyboard).
 */
export function getTreeNavigationKey(event: { key: string; altKey: boolean }): TreeNavigationKey | null {
  if (event.altKey) return null;
  return event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End"
    ? event.key
    : null;
}

export function getNextTreeItemIndex(
  currentIndex: number,
  itemCount: number,
  key: TreeNavigationKey
): number {
  if (itemCount <= 0) {
    return -1;
  }

  switch (key) {
    case "ArrowDown":
      return Math.min(currentIndex + 1, itemCount - 1);
    case "ArrowUp":
      return Math.max(currentIndex - 1, 0);
    case "Home":
      return 0;
    case "End":
      return itemCount - 1;
    default:
      return currentIndex;
  }
}

/**
 * Index of the closest preceding item one level up (the parent row), or -1.
 * `levels` are the `aria-level`s of the visible tree items in DOM order.
 */
export function findParentTreeItemIndex(levels: number[], index: number): number {
  const level = levels[index];
  if (level === undefined || level <= 1) return -1;
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = levels[i];
    if (candidate !== undefined && candidate < level) {
      return candidate === level - 1 ? i : -1;
    }
  }
  return -1;
}

/** Index of the first child row (the next item, one level deeper), or -1. */
export function findFirstChildTreeItemIndex(levels: number[], index: number): number {
  const level = levels[index];
  const next = levels[index + 1];
  return level !== undefined && next === level + 1 ? index + 1 : -1;
}

/** Indexes of the items sharing the parent and level of `index` (itself excluded). */
export function findSiblingTreeItemIndexes(levels: number[], index: number): number[] {
  const level = levels[index];
  if (level === undefined) return [];
  const parent = findParentTreeItemIndex(levels, index);
  const siblings: number[] = [];
  for (let i = parent + 1; i < levels.length; i += 1) {
    const candidate = levels[i];
    if (candidate === undefined || candidate < level) break;
    if (candidate === level && i !== index) siblings.push(i);
  }
  return siblings;
}

export function normalizeTypeaheadLabel(label: string): string {
  return label.trim().toLowerCase();
}

export function findTypeaheadMatchIndex(
  labels: string[],
  currentIndex: number,
  query: string
): number {
  if (labels.length === 0 || !query.trim()) {
    return -1;
  }

  const normalizedQuery = normalizeTypeaheadLabel(query);
  const normalizedLabels = labels.map(normalizeTypeaheadLabel);

  for (let offset = 1; offset <= normalizedLabels.length; offset += 1) {
    const index = (currentIndex + offset) % normalizedLabels.length;
    if (normalizedLabels[index]?.startsWith(normalizedQuery)) {
      return index;
    }
  }

  return -1;
}

export function buildTreeItemAnnouncement(
  rawLabel: string,
  state: {
    ariaExpanded?: "true" | "false" | null;
    ariaSelected?: "true" | "false" | null;
  },
  labels: TreeItemAnnouncementLabels,
  fallbackLabel: string
): string {
  const normalizedLabel = rawLabel.replace(/\s+/g, " ").trim() || fallbackLabel;
  const descriptors: string[] = [];

  if (state.ariaExpanded === "true") {
    descriptors.push(labels.expanded);
  } else if (state.ariaExpanded === "false") {
    descriptors.push(labels.collapsed);
  }

  if (state.ariaSelected === "true") {
    descriptors.push(labels.selected);
  }

  return descriptors.length > 0
    ? `${normalizedLabel}, ${descriptors.join(", ")}`
    : normalizedLabel;
}
