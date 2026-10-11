import { describe, expect, it } from "vitest";
import {
  buildTreeItemAnnouncement,
  findFirstChildTreeItemIndex,
  findParentTreeItemIndex,
  findSiblingTreeItemIndexes,
  findTypeaheadMatchIndex,
  getNextTreeItemIndex,
  getTreeNavigationKey,
} from "@/components/ProjectTree/treeKeyboard";

describe("getNextTreeItemIndex", () => {
  it("moves down within bounds", () => {
    expect(getNextTreeItemIndex(0, 4, "ArrowDown")).toBe(1);
    expect(getNextTreeItemIndex(3, 4, "ArrowDown")).toBe(3);
  });

  it("moves up within bounds", () => {
    expect(getNextTreeItemIndex(2, 4, "ArrowUp")).toBe(1);
    expect(getNextTreeItemIndex(0, 4, "ArrowUp")).toBe(0);
  });

  it("supports home and end", () => {
    expect(getNextTreeItemIndex(2, 5, "Home")).toBe(0);
    expect(getNextTreeItemIndex(1, 5, "End")).toBe(4);
  });

  it("returns -1 when there are no items", () => {
    expect(getNextTreeItemIndex(0, 0, "ArrowDown")).toBe(-1);
  });

  it("finds next matching typeahead item with wrap-around", () => {
    const labels = ["Global Statistics", "Alpha", "Beta", "Gamma"];
    expect(findTypeaheadMatchIndex(labels, 1, "g")).toBe(3);
    expect(findTypeaheadMatchIndex(labels, 3, "a")).toBe(1);
  });

  it("returns -1 when typeahead has no match", () => {
    const labels = ["Alpha", "Beta", "Gamma"];
    expect(findTypeaheadMatchIndex(labels, 0, "z")).toBe(-1);
  });

  it("builds tree item announcement with expanded and selected state", () => {
    const result = buildTreeItemAnnouncement(
      "  Project Alpha  ",
      { ariaExpanded: "true", ariaSelected: "true" },
      { expanded: "expanded", collapsed: "collapsed", selected: "selected" },
      "Explorer"
    );

    expect(result).toBe("Project Alpha, expanded, selected");
  });

  it("uses fallback label for empty node text", () => {
    const result = buildTreeItemAnnouncement(
      "   ",
      { ariaExpanded: null, ariaSelected: null },
      { expanded: "expanded", collapsed: "collapsed", selected: "selected" },
      "Explorer"
    );

    expect(result).toBe("Explorer");
  });
});

describe("tree hierarchy helpers", () => {
  // global, ~, work, app, api, notes, /, opt-app
  const levels = [1, 1, 2, 3, 3, 2, 1, 2];

  it("finds the parent row one level up", () => {
    expect(findParentTreeItemIndex(levels, 3)).toBe(2);
    expect(findParentTreeItemIndex(levels, 4)).toBe(2);
    expect(findParentTreeItemIndex(levels, 5)).toBe(1);
    expect(findParentTreeItemIndex(levels, 7)).toBe(6);
    expect(findParentTreeItemIndex(levels, 1)).toBe(-1);
    expect(findParentTreeItemIndex(levels, 99)).toBe(-1);
  });

  it("finds the first child only when the next row is one level deeper", () => {
    expect(findFirstChildTreeItemIndex(levels, 1)).toBe(2);
    expect(findFirstChildTreeItemIndex(levels, 2)).toBe(3);
    expect(findFirstChildTreeItemIndex(levels, 3)).toBe(-1);
    expect(findFirstChildTreeItemIndex(levels, 5)).toBe(-1);
    expect(findFirstChildTreeItemIndex(levels, 7)).toBe(-1);
  });

  it("lists siblings under the same parent only", () => {
    expect(findSiblingTreeItemIndexes(levels, 3)).toEqual([4]);
    expect(findSiblingTreeItemIndexes(levels, 2)).toEqual([5]);
    expect(findSiblingTreeItemIndexes(levels, 1)).toEqual([0, 6]);
    expect(findSiblingTreeItemIndexes(levels, 7)).toEqual([]);
  });
});

describe("getTreeNavigationKey", () => {
  it("returns the navigation key for plain arrows, Home and End", () => {
    expect(getTreeNavigationKey({ key: "ArrowDown", altKey: false })).toBe("ArrowDown");
    expect(getTreeNavigationKey({ key: "End", altKey: false })).toBe("End");
  });

  it("leaves Alt+Arrow to the message list's prompt jump", () => {
    expect(getTreeNavigationKey({ key: "ArrowUp", altKey: true })).toBeNull();
    expect(getTreeNavigationKey({ key: "ArrowDown", altKey: true })).toBeNull();
  });

  it("ignores other keys", () => {
    expect(getTreeNavigationKey({ key: "ArrowLeft", altKey: false })).toBeNull();
  });
});
