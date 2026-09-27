import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EXPANDED_GROUPS_STORAGE_KEY, useProjectTreeState } from "./useProjectTreeState";

const stored = () => JSON.parse(localStorage.getItem(EXPANDED_GROUPS_STORAGE_KEY) ?? "null");

describe("useProjectTreeState", () => {
  it("ensures a selected project and its group are expanded", () => {
    const { result } = renderHook(() => useProjectTreeState());

    act(() => {
      result.current.ensureProjectExpanded("/store/feature", "group:other-locations");
    });

    expect(result.current.expandedProjects).toEqual(
      new Set(["/store/feature", "group:other-locations"]),
    );
  });

  it("ensures every ancestor folder of a nested project", () => {
    const { result } = renderHook(() => useProjectTreeState());

    act(() => {
      result.current.ensureProjectExpanded("/store/app", ["dir:/home/jack", "dir:/home/jack/work"]);
    });

    expect(result.current.expandedProjects).toEqual(
      new Set(["/store/app", "dir:/home/jack", "dir:/home/jack/work"]),
    );
  });

  it("persists group keys but not project rows", () => {
    const { result } = renderHook(() => useProjectTreeState());

    act(() => {
      result.current.ensureProjectExpanded("/store/app", "dir:/home/jack");
    });

    expect(stored()).toEqual({ keys: ["dir:/home/jack"], seenRoots: [] });
  });

  it("leaves transient (search-opened) group keys out of storage", () => {
    const transient = { current: { opened: ["dir:/home/jack/work"] as string[] } };
    const { result } = renderHook(() => useProjectTreeState(transient));

    act(() => result.current.expandGroups(["dir:/home/jack", "dir:/home/jack/work"]));
    expect(result.current.expandedProjects).toEqual(new Set(["dir:/home/jack", "dir:/home/jack/work"]));
    expect(stored().keys).toEqual(["dir:/home/jack"]);

    transient.current = { opened: [] };
    act(() => result.current.expandGroups(["dir:/srv"]));
    expect(stored().keys).toEqual(["dir:/home/jack", "dir:/home/jack/work", "dir:/srv"]);
  });

  it("restores persisted group keys on the next mount", () => {
    localStorage.setItem(
      EXPANDED_GROUPS_STORAGE_KEY,
      JSON.stringify({ keys: ["dir:/home/jack", "/not-a-group", 42], seenRoots: ["dir:/home/jack"] }),
    );

    const { result } = renderHook(() => useProjectTreeState());

    expect(result.current.expandedProjects).toEqual(new Set(["dir:/home/jack"]));
  });

  it("ignores corrupt stored state", () => {
    localStorage.setItem(EXPANDED_GROUPS_STORAGE_KEY, "{not json");

    const { result } = renderHook(() => useProjectTreeState());

    expect(result.current.expandedProjects).toEqual(new Set());
  });

  it("expands each default root only the first time it appears", () => {
    const { result, unmount } = renderHook(() => useProjectTreeState());

    act(() => result.current.expandDefaultRoots(["dir:/home/jack"]));
    expect(result.current.expandedProjects).toEqual(new Set(["dir:/home/jack"]));

    act(() => result.current.collapseAllGroups());
    act(() => result.current.expandDefaultRoots(["dir:/home/jack"]));
    expect(result.current.expandedProjects).toEqual(new Set());
    expect(stored()).toEqual({ keys: [], seenRoots: ["dir:/home/jack"] });

    unmount();
    const next = renderHook(() => useProjectTreeState());
    act(() => next.result.current.expandDefaultRoots(["dir:/home/jack"]));
    expect(next.result.current.expandedProjects).toEqual(new Set());

    // A row that shows up later opens the first time.
    act(() => next.result.current.expandDefaultRoots(["dir:/home/jack", "group:other-locations"]));
    expect(next.result.current.expandedProjects).toEqual(new Set(["group:other-locations"]));
    expect(stored().seenRoots).toEqual(["dir:/home/jack", "group:other-locations"]);
  });

  it("caps the stored group keys, keeping the most recent", () => {
    const { result } = renderHook(() => useProjectTreeState());
    const keys = Array.from({ length: 510 }, (_, index) => `dir:/f${index}`);

    act(() => result.current.expandGroups(keys));

    const saved = stored().keys as string[];
    expect(saved).toHaveLength(500);
    expect(saved[0]).toBe("dir:/f10");
    expect(saved.at(-1)).toBe("dir:/f509");
  });

  it("collapses several groups at once", () => {
    const { result } = renderHook(() => useProjectTreeState());

    act(() => result.current.expandGroups(["dir:/a", "dir:/b", "dir:/c"]));
    act(() => result.current.collapseGroups(["dir:/a", "dir:/c"]));

    expect(result.current.expandedProjects).toEqual(new Set(["dir:/b"]));
  });

  it("collapse all keeps expanded project rows", () => {
    const { result } = renderHook(() => useProjectTreeState());

    act(() => {
      result.current.ensureProjectExpanded("/store/app", ["dir:/home/jack", "group:temporary-projects"]);
    });
    act(() => result.current.collapseAllGroups());

    expect(result.current.expandedProjects).toEqual(new Set(["/store/app"]));
  });

  it("toggles one key without touching the others", () => {
    const { result } = renderHook(() => useProjectTreeState());

    act(() => result.current.expandGroups(["dir:/a", "group:other-locations"]));
    act(() => result.current.toggleExpansion("dir:/a"));
    act(() => result.current.toggleExpansion("/store/app"));

    expect(result.current.expandedProjects).toEqual(new Set(["group:other-locations", "/store/app"]));
    expect(stored().keys).toEqual(["group:other-locations"]);
  });
});
