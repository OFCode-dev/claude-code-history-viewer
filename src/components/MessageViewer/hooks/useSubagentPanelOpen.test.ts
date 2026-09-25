import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSubagentPanelOpen } from "./useSubagentPanelOpen";

const STORAGE_KEY = "messageViewer.subagentPanelOpen";

function setViewportLgUp(matches: boolean) {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("useSubagentPanelOpen", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    setViewportLgUp(false);
  });

  it("starts collapsed where the sessions pane already lists the subagents", () => {
    setViewportLgUp(true);
    const { result } = renderHook(() => useSubagentPanelOpen());
    expect(result.current[0]).toBe(false);
  });

  it("starts open on narrow windows, where it is the only list", () => {
    setViewportLgUp(false);
    const { result } = renderHook(() => useSubagentPanelOpen());
    expect(result.current[0]).toBe(true);
  });

  it("remembers the user's choice over the default", () => {
    setViewportLgUp(true);
    const { result, unmount } = renderHook(() => useSubagentPanelOpen());
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
    unmount();

    const again = renderHook(() => useSubagentPanelOpen());
    expect(again.result.current[0]).toBe(true);
  });

  it("falls back to the default when storage is unavailable", () => {
    setViewportLgUp(true);
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { result } = renderHook(() => useSubagentPanelOpen());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
