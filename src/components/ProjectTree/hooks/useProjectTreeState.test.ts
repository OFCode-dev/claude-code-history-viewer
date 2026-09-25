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

    expect(stored()).toEqual({ keys: ["dir:/home/jack"], rootsInitialized: false });
  });

  it("restores persisted group keys on the next mount", () => {
    localStorage.setItem(
      EXPANDED_GROUPS_STORAGE_KEY,
      JSON.stringify({ keys: ["dir:/home/jack", "/not-a-group", 42], rootsInitialized: true }),
    );

    const { result } = renderHook(() => useProjectTreeState("directory"));

    expect(result.current.expandedProjects).toEqual(new Set(["dir:/home/jack"]));
  });

  it("ignores corrupt stored state", () => {
    localStorage.setItem(EXPANDED_GROUPS_STORAGE_KEY, "{not json");

    const { result } = renderHook(() => useProjectTreeState("directory"));

    expect(result.current.expandedProjects).toEqual(new Set());
  });

  it("expands default roots only once", () => {
    const { result, unmount } = renderHook(() => useProjectTreeState("directory"));

    act(() => result.current.expandDefaultRoots(["dir:/home/jack"]));
    expect(result.current.expandedProjects).toEqual(new Set(["dir:/home/jack"]));

    act(() => result.current.collapseAllGroups());
    act(() => result.current.expandDefaultRoots(["dir:/home/jack"]));
    expect(result.current.expandedProjects).toEqual(new Set());
    expect(stored()).toEqual({ keys: [], rootsInitialized: true });

    unmount();
    const next = renderHook(() => useProjectTreeState("directory"));
    act(() => next.result.current.expandDefaultRoots(["dir:/home/jack"]));
    expect(next.result.current.expandedProjects).toEqual(new Set());
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
