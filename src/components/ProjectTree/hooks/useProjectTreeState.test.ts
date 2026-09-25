import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EXPANDED_GROUPS_STORAGE_KEY, useProjectTreeState } from "./useProjectTreeState";

const stored = () => JSON.parse(localStorage.getItem(EXPANDED_GROUPS_STORAGE_KEY) ?? "null");

describe("useProjectTreeState", () => {
  it("ensures a selected project and its group are expanded", () => {
    const { result } = renderHook(() => useProjectTreeState("worktree"));

    act(() => {
      result.current.ensureProjectExpanded(
        "/worktrees/feature",
        "group:/repos/main",
      );
    });

    expect(result.current.expandedProjects).toEqual(
      new Set(["/worktrees/feature", "group:/repos/main"]),
    );
  });

  it("ensures every ancestor folder of a nested project", () => {
    const { result } = renderHook(() => useProjectTreeState("directory"));

    act(() => {
      result.current.ensureProjectExpanded("/store/app", ["dir:/home/jack", "dir:/home/jack/work"]);
    });

    expect(result.current.expandedProjects).toEqual(
      new Set(["/store/app", "dir:/home/jack", "dir:/home/jack/work"]),
    );
  });

  it("persists group keys but not project rows", () => {
    const { result } = renderHook(() => useProjectTreeState("directory"));

    act(() => {
      result.current.ensureProjectExpanded("/store/app", "dir:/home/jack");
    });

    expect(stored()).toEqual({ keys: ["dir:/home/jack"], seenRoots: [] });
  });

  it("restores persisted group keys on the next mount", () => {
    localStorage.setItem(
      EXPANDED_GROUPS_STORAGE_KEY,
      JSON.stringify({ keys: ["dir:/home/jack", "/not-a-group", 42], seenRoots: ["dir:/home/jack"] }),
    );

    const { result } = renderHook(() => useProjectTreeState("directory"));

    expect(result.current.expandedProjects).toEqual(new Set(["dir:/home/jack"]));
  });

  it("ignores corrupt stored state", () => {
    localStorage.setItem(EXPANDED_GROUPS_STORAGE_KEY, "{not json");

    const { result } = renderHook(() => useProjectTreeState("directory"));

    expect(result.current.expandedProjects).toEqual(new Set());
  });

  it("expands each default root only the first time it appears", () => {
    const { result, unmount } = renderHook(() => useProjectTreeState("directory"));

    act(() => result.current.expandDefaultRoots(["dir:/home/jack"]));
    expect(result.current.expandedProjects).toEqual(new Set(["dir:/home/jack"]));

    act(() => result.current.collapseAllGroups());
    act(() => result.current.expandDefaultRoots(["dir:/home/jack"]));
    expect(result.current.expandedProjects).toEqual(new Set());
    expect(stored()).toEqual({ keys: [], seenRoots: ["dir:/home/jack"] });

    unmount();
    const next = renderHook(() => useProjectTreeState("directory"));
    act(() => next.result.current.expandDefaultRoots(["dir:/home/jack"]));
    expect(next.result.current.expandedProjects).toEqual(new Set());

    // A root that shows up later (a new drive, the first project outside home) opens.
    act(() => next.result.current.expandDefaultRoots(["dir:/home/jack", "dir:D:\\"]));
    expect(next.result.current.expandedProjects).toEqual(new Set(["dir:D:\\"]));
    expect(stored().seenRoots).toEqual(["dir:/home/jack", "dir:D:\\"]);
  });

  it("caps the stored group keys, keeping the most recent", () => {
    const { result } = renderHook(() => useProjectTreeState("directory"));
    const keys = Array.from({ length: 510 }, (_, index) => `dir:/f${index}`);

    act(() => result.current.expandGroups(keys));

    const saved = stored().keys as string[];
    expect(saved).toHaveLength(500);
    expect(saved[0]).toBe("dir:/f10");
    expect(saved.at(-1)).toBe("dir:/f509");
  });

  it("collapses several groups at once", () => {
    const { result } = renderHook(() => useProjectTreeState("directory"));

    act(() => result.current.expandGroups(["dir:/a", "dir:/b", "dir:/c"]));
    act(() => result.current.collapseGroups(["dir:/a", "dir:/c"]));

    expect(result.current.expandedProjects).toEqual(new Set(["dir:/b"]));
  });

  it("collapse all keeps expanded project rows", () => {
    const { result } = renderHook(() => useProjectTreeState("directory"));

    act(() => {
      result.current.ensureProjectExpanded("/store/app", ["dir:/home/jack", "group:temporary-projects"]);
    });
    act(() => result.current.collapseAllGroups());

    expect(result.current.expandedProjects).toEqual(new Set(["/store/app"]));
  });

  it("keeps group keys when the grouping mode changes", () => {
    const { result, rerender } = renderHook(
      ({ mode }: { mode: "directory" | "none" }) => useProjectTreeState(mode),
      { initialProps: { mode: "directory" as "directory" | "none" } },
    );

    act(() => {
      result.current.ensureProjectExpanded("/store/app", "dir:/home/jack");
    });
    rerender({ mode: "none" });

    expect(result.current.expandedProjects).toEqual(new Set(["dir:/home/jack"]));
  });
});
