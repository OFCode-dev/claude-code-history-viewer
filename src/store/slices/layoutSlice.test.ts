import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { createNavigatorSlice, type NavigatorSlice } from "./navigatorSlice";
import {
  areAllCollapsed,
  CONVERSATION_TOOLS_COLLAPSED_KEY,
  createLayoutSlice,
  EXPLORER_COLLAPSED_KEY,
  OBSOLETE_LAYOUT_KEYS,
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

  describe("conversation tools collapse", () => {
    it("starts expanded and persists the collapsed state", () => {
      const store = makeStore();
      expect(store.getState().isConversationToolsCollapsed).toBe(false);

      store.getState().toggleConversationToolsCollapsed();

      expect(store.getState().isConversationToolsCollapsed).toBe(true);
      expect(localStorage.getItem(CONVERSATION_TOOLS_COLLAPSED_KEY)).toBe("true");
      expect(makeStore().getState().isConversationToolsCollapsed).toBe(true);

      store.getState().setConversationToolsCollapsed(false);
      expect(makeStore().getState().isConversationToolsCollapsed).toBe(false);
    });

    it("still works for this page load when storage throws", () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      try {
        const store = makeStore();
        store.getState().setConversationToolsCollapsed(true);
        expect(store.getState().isConversationToolsCollapsed).toBe(true);
      } finally {
        setItem.mockRestore();
      }
    });
  });

  describe("collapse all / expand all", () => {
    it("collapses all four areas and persists each one", () => {
      const store = makeStore();
      expect(areAllCollapsed(store.getState())).toBe(false);

      store.getState().collapseAll();

      const state = store.getState();
      expect(state.isExplorerCollapsed).toBe(true);
      expect(state.isSessionsPaneCollapsed).toBe(true);
      expect(state.isNavigatorOpen).toBe(false);
      expect(state.isConversationToolsCollapsed).toBe(true);
      expect(areAllCollapsed(state)).toBe(true);
      expect(areAllCollapsed(makeStore().getState())).toBe(true);
    });

    it("expands all four areas, with no memory of an earlier combination", () => {
      const store = makeStore();
      store.getState().setExplorerCollapsed(true);
      store.getState().collapseAll();
      store.getState().expandAll();

      const state = store.getState();
      expect(state.isExplorerCollapsed).toBe(false);
      expect(state.isSessionsPaneCollapsed).toBe(false);
      expect(state.isNavigatorOpen).toBe(true);
      expect(state.isConversationToolsCollapsed).toBe(false);
    });

    it("counts as all collapsed only when every area is", () => {
      const store = makeStore();
      store.getState().collapseAll();
      store.getState().setNavigatorOpen(true);
      expect(areAllCollapsed(store.getState())).toBe(false);
    });
  });

  describe("obsolete reading-mode keys", () => {
    it("are removed when the store is created; the layout keys stay", () => {
      for (const key of OBSOLETE_LAYOUT_KEYS) localStorage.setItem(key, "{}");
      localStorage.setItem(EXPLORER_COLLAPSED_KEY, "true");

      const store = makeStore();

      expect(OBSOLETE_LAYOUT_KEYS.map((key) => localStorage.getItem(key))).toEqual(
        OBSOLETE_LAYOUT_KEYS.map(() => null)
      );
      expect(store.getState().isExplorerCollapsed).toBe(true);
    });

    it("lists exactly the keys reading mode and focus mode wrote", () => {
      expect([...OBSOLETE_LAYOUT_KEYS].sort()).toEqual(
        [
          "focus-mode-restore",
          "panel-hover-reveal",
          "reading-mode",
          "reading-mode-hint-seen",
          "reading-profile",
        ].sort()
      );
    });

    it("does not throw when storage is unavailable", () => {
      const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("denied");
      });
      try {
        expect(() => makeStore()).not.toThrow();
      } finally {
        removeItem.mockRestore();
      }
    });
  });

  describe("announcements", () => {
    it("gives each announcement a new id and clears only its own", () => {
      const store = makeStore();
      store.getState().announceLayout("one");
      const first = store.getState().layoutAnnouncement;
      store.getState().announceLayout("one");
      const second = store.getState().layoutAnnouncement;
      expect(second?.id).not.toBe(first?.id);
      store.getState().clearLayoutAnnouncement(first?.id ?? -1);
      expect(store.getState().layoutAnnouncement).toEqual(second);
      store.getState().clearLayoutAnnouncement(second?.id ?? -1);
      expect(store.getState().layoutAnnouncement).toBeNull();
    });
  });
});
