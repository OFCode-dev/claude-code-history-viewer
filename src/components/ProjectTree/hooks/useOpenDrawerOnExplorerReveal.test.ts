import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../../store/useAppStore";
import { useOpenDrawerOnExplorerReveal } from "./useOpenDrawerOnExplorerReveal";

describe("useOpenDrawerOnExplorerReveal", () => {
  afterEach(() => {
    act(() => useAppStore.getState().clearExplorerRevealRequest());
  });

  it("opens the mobile drawer when a breadcrumb asks to reveal a path", () => {
    const setDrawerOpen = vi.fn();
    renderHook(() => useOpenDrawerOnExplorerReveal(true, setDrawerOpen));
    expect(setDrawerOpen).not.toHaveBeenCalled();

    act(() => useAppStore.getState().requestExplorerReveal("/home/jack/work"));

    expect(setDrawerOpen).toHaveBeenCalledWith(true);
  });

  it("leaves the drawer alone on desktop, where the tree is always mounted", () => {
    const setDrawerOpen = vi.fn();
    renderHook(() => useOpenDrawerOnExplorerReveal(false, setDrawerOpen));

    act(() => useAppStore.getState().requestExplorerReveal("/home/jack/work"));

    expect(setDrawerOpen).not.toHaveBeenCalled();
  });
});
