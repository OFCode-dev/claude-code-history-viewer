import { beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";
import { createNavigatorSlice, type NavigatorSlice } from "./navigatorSlice";
import {
  createLayoutSlice,
  EXPLORER_COLLAPSED_KEY,
  FOCUS_MODE_KEY,
  SESSIONS_PANE_COLLAPSED_KEY,
  type LayoutSlice,
} from "./layoutSlice";
import type { FullAppStore } from "./types";

type TestStore = LayoutSlice & NavigatorSlice;

function makeStore() {
  return create<TestStore>()((set, get, api) => ({
    ...createNavigatorSlice(
      set as never,
      get as unknown as () => FullAppStore,
      api as never,
    ),
    ...createLayoutSlice(
      set as never,
      get as unknown as () => FullAppStore,
      api as never,
    ),
  }));
}

describe("layoutSlice", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("sessions pane collapse", () => {
    it("starts expanded when nothing is stored", () => {
      expect(makeStore().getState().isSessionsPaneCollapsed).toBe(false);
    });

    it("persists the collapsed state and restores it in a new store", () => {
      const store = makeStore();
      store.getState().toggleSessionsPaneCollapsed();

      expect(store.getState().isSessionsPaneCollapsed).toBe(true);
      expect(localStorage.getItem(SESSIONS_PANE_COLLAPSED_KEY)).toBe("true");
      expect(makeStore().getState().isSessionsPaneCollapsed).toBe(true);

      store.getState().setSessionsPaneCollapsed(false);
      expect(localStorage.getItem(SESSIONS_PANE_COLLAPSED_KEY)).toBe("false");
      expect(makeStore().getState().isSessionsPaneCollapsed).toBe(false);
    });
  });

  describe("explorer collapse", () => {
    it("persists the collapsed state", () => {
      const store = makeStore();
      expect(store.getState().isExplorerCollapsed).toBe(false);

      store.getState().toggleExplorerCollapsed();

      expect(store.getState().isExplorerCollapsed).toBe(true);
      expect(localStorage.getItem(EXPLORER_COLLAPSED_KEY)).toBe("true");
      expect(makeStore().getState().isExplorerCollapsed).toBe(true);
    });
  });

  describe("focus mode", () => {
    it("collapses explorer, sessions pane and navigator", () => {
      const store = makeStore();
      expect(store.getState().isNavigatorOpen).toBe(true);

      store.getState().toggleFocusMode();

      const state = store.getState();
      expect(state.isExplorerCollapsed).toBe(true);
      expect(state.isSessionsPaneCollapsed).toBe(true);
      expect(state.isNavigatorOpen).toBe(false);
      expect(state.focusModeSnapshot).not.toBeNull();
    });

    it("restores the exact previous layout on second use", () => {
      const store = makeStore();
      // A mixed starting layout: sessions pane already collapsed, the others open.
      store.getState().setSessionsPaneCollapsed(true);

      store.getState().toggleFocusMode();
      store.getState().toggleFocusMode();

      const state = store.getState();
      expect(state.focusModeSnapshot).toBeNull();
      expect(state.isExplorerCollapsed).toBe(false);
      expect(state.isSessionsPaneCollapsed).toBe(true);
      expect(state.isNavigatorOpen).toBe(true);
    });

    it("restores the snapshot even when a panel was reopened while focused", () => {
      const store = makeStore();
      store.getState().toggleFocusMode();
      store.getState().setNavigatorOpen(true);
      store.getState().setExplorerCollapsed(false);

      store.getState().toggleFocusMode();

      const state = store.getState();
      expect(state.isExplorerCollapsed).toBe(false);
      expect(state.isSessionsPaneCollapsed).toBe(false);
      expect(state.isNavigatorOpen).toBe(true);
    });

    it("survives a reload so the second use still restores", () => {
      const first = makeStore();
      first.getState().toggleFocusMode();
      expect(localStorage.getItem(FOCUS_MODE_KEY)).not.toBeNull();

      const reloaded = makeStore();
      expect(reloaded.getState().focusModeSnapshot).toEqual({
        explorerCollapsed: false,
        sessionsPaneCollapsed: false,
        navigatorOpen: true,
      });

      reloaded.getState().toggleFocusMode();
      expect(reloaded.getState().isExplorerCollapsed).toBe(false);
      expect(reloaded.getState().isNavigatorOpen).toBe(true);
      expect(localStorage.getItem(FOCUS_MODE_KEY)).toBeNull();
    });

    it("ignores a malformed stored snapshot", () => {
      localStorage.setItem(FOCUS_MODE_KEY, "{\"explorerCollapsed\":\"yes\"}");
      expect(makeStore().getState().focusModeSnapshot).toBeNull();

      localStorage.setItem(FOCUS_MODE_KEY, "not json");
      expect(makeStore().getState().focusModeSnapshot).toBeNull();
    });
  });
});
