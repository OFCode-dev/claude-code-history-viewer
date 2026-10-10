import { beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";
import { createNavigatorSlice, type NavigatorSlice } from "./navigatorSlice";
import {
  createRecentEditsPanelSlice,
  RECENT_EDITS_DOCK_OPEN_KEY,
  type RecentEditsPanelSlice,
} from "./recentEditsPanelSlice";
import {
  createLayoutSlice,
  effectiveGroupMode,
  EXPLORER_COLLAPSED_KEY,
  FOCUS_MODE_KEY,
  HOVER_REVEAL_KEY,
  migrateLegacyFocusMode,
  READING_MODE_KEY,
  READING_PROFILE_KEY,
  SESSIONS_PANE_COLLAPSED_KEY,
  type LayoutSlice,
} from "./layoutSlice";
import type { FullAppStore } from "./types";

type TestStore = LayoutSlice & NavigatorSlice & RecentEditsPanelSlice;

function storageSnapshot(): Record<string, string | null> {
  const snapshot: Record<string, string | null> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key != null) snapshot[key] = localStorage.getItem(key);
  }
  return snapshot;
}

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
    ...createRecentEditsPanelSlice(
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

  describe("reading mode", () => {
    it("leaves the normal layout untouched on the way in and out", () => {
      const store = makeStore();
      // A mixed normal layout: sessions pane folded, navigator closed.
      store.getState().setSessionsPaneCollapsed(true);
      store.getState().setNavigatorOpen(false);
      const before = storageSnapshot();
      expect(Object.keys(before).length).toBeGreaterThan(0);

      store.getState().toggleReadingMode();
      let state = store.getState();
      expect(state.isReadingMode).toBe(true);
      expect(state.isExplorerCollapsed).toBe(false);
      expect(state.isSessionsPaneCollapsed).toBe(true);
      expect(state.isNavigatorOpen).toBe(false);

      store.getState().toggleReadingMode();
      state = store.getState();
      expect(state.isReadingMode).toBe(false);
      expect(state.isExplorerCollapsed).toBe(false);
      expect(state.isSessionsPaneCollapsed).toBe(true);
      expect(state.isNavigatorOpen).toBe(false);
      // Only the reading-mode record itself was written.
      const after = storageSnapshot();
      delete after[READING_MODE_KEY];
      expect(after).toEqual(before);
    });

    it("closes the recent-edits dock on entry and reopens it on exit", () => {
      const store = makeStore();
      store.getState().setRecentEditsDockOpen(true);

      store.getState().toggleReadingMode();
      expect(store.getState().isRecentEditsDockOpen).toBe(false);
      expect(store.getState().readingRestoreDock).toBe(true);

      store.getState().toggleReadingMode();
      expect(store.getState().isRecentEditsDockOpen).toBe(true);
      expect(store.getState().readingRestoreDock).toBe(false);
    });

    it("keeps a dock the person opened during reading mode", () => {
      const store = makeStore();
      store.getState().toggleReadingMode();
      store.getState().setRecentEditsDockOpen(true);

      store.getState().toggleReadingMode();
      expect(store.getState().isRecentEditsDockOpen).toBe(true);
    });

    it("does not reopen a dock that was closed on entry", () => {
      const store = makeStore();
      store.getState().toggleReadingMode();
      store.getState().toggleReadingMode();
      expect(store.getState().isRecentEditsDockOpen).toBe(false);
    });

    it("survives a reload, dock memory included", () => {
      const store = makeStore();
      store.getState().setRecentEditsDockOpen(true);
      store.getState().toggleReadingMode();

      const reloaded = makeStore();
      expect(reloaded.getState().isReadingMode).toBe(true);
      expect(reloaded.getState().readingRestoreDock).toBe(true);
      expect(reloaded.getState().isRecentEditsDockOpen).toBe(false);

      reloaded.getState().toggleReadingMode();
      expect(reloaded.getState().isRecentEditsDockOpen).toBe(true);
    });

    it("rejects malformed stored values and falls back to the defaults", () => {
      localStorage.setItem(READING_MODE_KEY, '{"on":"yes"}');
      localStorage.setItem(READING_PROFILE_KEY, '{"left":"floating","right":"pinned"}');
      localStorage.setItem(HOVER_REVEAL_KEY, "fast");
      let state = makeStore().getState();
      expect(state.isReadingMode).toBe(false);
      expect(state.readingProfile).toEqual({ left: "autohide", right: "pinned", top: "autohide" });
      expect(state.hoverReveal).toBe("standard");

      localStorage.setItem(READING_MODE_KEY, "not json");
      localStorage.setItem(READING_PROFILE_KEY, "[1,2]");
      state = makeStore().getState();
      expect(state.isReadingMode).toBe(false);
      expect(state.readingProfile).toEqual({ left: "autohide", right: "autohide", top: "autohide" });
    });

    it("never reveals anything outside reading mode", () => {
      const store = makeStore();
      expect(store.getState().revealPanel("left", "click")).toBe(false);
      expect(store.getState().revealed).toBeNull();
    });

    it("drops the overlay on entry and exit", () => {
      const store = makeStore();
      store.getState().toggleReadingMode();
      store.getState().revealPanel("left", "click");
      store.getState().toggleReadingMode();
      expect(store.getState().revealed).toBeNull();
    });
  });

  describe("focus-mode migration", () => {
    it("applies the old snapshot to the normal layout and continues in reading mode", () => {
      localStorage.setItem(
        FOCUS_MODE_KEY,
        JSON.stringify({ explorerCollapsed: false, sessionsPaneCollapsed: true, navigatorOpen: true }),
      );
      // Focus mode had folded everything.
      localStorage.setItem(EXPLORER_COLLAPSED_KEY, "true");
      localStorage.setItem(SESSIONS_PANE_COLLAPSED_KEY, "true");
      localStorage.setItem("navigator-open", "false");
      localStorage.setItem(RECENT_EDITS_DOCK_OPEN_KEY, "true");

      migrateLegacyFocusMode();
      const state = makeStore().getState();

      expect(localStorage.getItem(FOCUS_MODE_KEY)).toBeNull();
      expect(state.isExplorerCollapsed).toBe(false);
      expect(state.isSessionsPaneCollapsed).toBe(true);
      expect(state.isNavigatorOpen).toBe(true);
      expect(state.isReadingMode).toBe(true);
      expect(state.readingRestoreDock).toBe(true);
      expect(state.isRecentEditsDockOpen).toBe(false);
    });

    it("discards a malformed snapshot without entering reading mode", () => {
      localStorage.setItem(FOCUS_MODE_KEY, '{"explorerCollapsed":"yes"}');
      migrateLegacyFocusMode();
      expect(localStorage.getItem(FOCUS_MODE_KEY)).toBeNull();
      expect(makeStore().getState().isReadingMode).toBe(false);
    });

    it("does nothing when there is no snapshot", () => {
      migrateLegacyFocusMode();
      expect(localStorage.getItem(READING_MODE_KEY)).toBeNull();
    });
  });

  describe("pins", () => {
    it("edits the reading profile and survives exit, re-entry and reload", () => {
      const store = makeStore();
      store.getState().toggleReadingMode();
      store.getState().setReadingPin("right", true);
      expect(store.getState().readingProfile.right).toBe("pinned");

      store.getState().toggleReadingMode();
      store.getState().toggleReadingMode();
      expect(store.getState().readingProfile.right).toBe("pinned");
      expect(makeStore().getState().readingProfile.right).toBe("pinned");

      store.getState().setReadingPin("right", false);
      expect(makeStore().getState().readingProfile.right).toBe("autohide");
    });

    it("pinning the open group drops its overlay", () => {
      const store = makeStore();
      store.getState().toggleReadingMode();
      store.getState().revealPanel("left", "hover");
      store.getState().setReadingPin("left", true);
      expect(store.getState().revealed).toBeNull();
      expect(store.getState().revealPanel("left", "click")).toBe(false);
    });

    it("never changes the normal layout", () => {
      const store = makeStore();
      store.getState().toggleReadingMode();
      store.getState().setReadingPin("left", true);
      store.getState().toggleReadingMode();
      expect(store.getState().isExplorerCollapsed).toBe(false);
    });
  });

  describe("one overlay at a time", () => {
    it("lets an explicit open replace another overlay", () => {
      const store = makeStore();
      store.getState().toggleReadingMode();
      expect(store.getState().revealPanel("left", "hover")).toBe(true);
      expect(store.getState().revealPanel("right", "keyboard")).toBe(true);
      expect(store.getState().revealed).toEqual({ group: "right", source: "keyboard", quick: false });
    });

    it("never lets a hover replace an open overlay", () => {
      const store = makeStore();
      store.getState().toggleReadingMode();
      store.getState().revealPanel("left", "keyboard");
      expect(store.getState().revealPanel("right", "hover")).toBe(false);
      expect(store.getState().revealed?.group).toBe("left");
    });

    it("conceals only the named group", () => {
      const store = makeStore();
      store.getState().toggleReadingMode();
      store.getState().revealPanel("top", "click");
      store.getState().concealPanel("left");
      expect(store.getState().revealed?.group).toBe("top");
      store.getState().concealPanel("top");
      expect(store.getState().revealed).toBeNull();
    });
  });

  describe("hover reveal setting", () => {
    it("persists the choice", () => {
      const store = makeStore();
      expect(store.getState().hoverReveal).toBe("standard");
      store.getState().setHoverReveal("slow");
      expect(makeStore().getState().hoverReveal).toBe("slow");
      store.getState().setHoverReveal("off");
      expect(makeStore().getState().hoverReveal).toBe("off");
    });
  });

  describe("effectiveGroupMode", () => {
    it("is normal outside reading mode and below 768 px", () => {
      const profile = { left: "autohide", right: "pinned", top: "autohide" } as const;
      expect(effectiveGroupMode({ isReadingMode: false, readingProfile: profile }, "left", false)).toBe("normal");
      expect(effectiveGroupMode({ isReadingMode: true, readingProfile: profile }, "left", true)).toBe("normal");
      expect(effectiveGroupMode({ isReadingMode: true, readingProfile: profile }, "left", false)).toBe("autohide");
      expect(effectiveGroupMode({ isReadingMode: true, readingProfile: profile }, "right", false)).toBe("pinned");
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
