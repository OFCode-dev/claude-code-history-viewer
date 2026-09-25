import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { create, type StoreApi } from "zustand";
import {
  createFilterSlice,
  getEffectiveContentTypes,
  type FilterSlice,
} from "../store/slices/filterSlice";
import type { FullAppStore } from "../store/slices/types";

// The filter slice only reads/writes its own state, so it can be exercised in
// isolation; the casts bridge the FullAppStore-typed StateCreator to a slice store.
const makeStore = () =>
  create<FilterSlice>()((set, get, api) =>
    createFilterSlice(
      set as unknown as Parameters<typeof createFilterSlice>[0],
      get as unknown as () => FullAppStore,
      api as unknown as StoreApi<FullAppStore>,
    ),
  );

const STORAGE_KEY = "message-filter";
const readSaved = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");

describe("filterSlice message-filter persistence", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("persists a role toggle and updates state", () => {
    const store = makeStore();
    store.getState().toggleRole("user");
    expect(store.getState().messageFilter.roles.user).toBe(false);
    expect(readSaved().roles.user).toBe(false);
  });

  it("persists a content-type toggle", () => {
    const store = makeStore();
    store.getState().toggleContentType("parallelTasks");
    expect(store.getState().messageFilter.contentTypes.parallelTasks).toBe(false);
    expect(readSaved().contentTypes.parallelTasks).toBe(false);
    expect(store.getState().isMessageFilterActive()).toBe(true);
  });

  it("loads the persisted filter as initial state on a fresh slice (survives restart/switch)", () => {
    makeStore().getState().toggleRole("assistant");
    const restored = makeStore();
    expect(restored.getState().messageFilter.roles.assistant).toBe(false);
    expect(restored.getState().isMessageFilterActive()).toBe(true);
  });

  it("toggles Parallel Tasks visibility for the message navigator", () => {
    const store = makeStore();
    expect(store.getState().showParallelTasksInNavigator).toBe(true);

    store.getState().toggleShowParallelTasksInNavigator();

    expect(store.getState().showParallelTasksInNavigator).toBe(false);
  });

  it("enables Parallel Tasks when loading filters saved by an older version", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      roles: { user: true, assistant: true },
      contentTypes: {
        text: true,
        thinking: true,
        toolCalls: true,
        commands: true,
      },
    }));

    expect(makeStore().getState().messageFilter.contentTypes.parallelTasks).toBe(true);
  });

  it("resetMessageFilter restores defaults and persists them", () => {
    const store = makeStore();
    store.getState().toggleRole("user");
    store.getState().resetMessageFilter();
    expect(store.getState().messageFilter.roles.user).toBe(true);
    expect(store.getState().isMessageFilterActive()).toBe(false);
    expect(readSaved().roles.user).toBe(true);
  });

  it("falls back to defaults on corrupt or partial persisted data", () => {
    localStorage.setItem(STORAGE_KEY, "not json");
    expect(makeStore().getState().messageFilter).toEqual({
      roles: { user: true, assistant: true },
      contentTypes: {
        text: true,
        thinking: true,
        toolCalls: true,
        commands: true,
        parallelTasks: true,
      },
      dialogue: false,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ roles: { user: "nope" } }));
    expect(makeStore().getState().messageFilter.roles.user).toBe(true);
  });

  it("toggles the dialogue view without touching the individual toggles", () => {
    const store = makeStore();
    store.getState().toggleContentType("thinking");
    store.getState().toggleDialogue();

    const { messageFilter } = store.getState();
    expect(messageFilter.dialogue).toBe(true);
    expect(messageFilter.contentTypes.thinking).toBe(false);
    expect(messageFilter.contentTypes.toolCalls).toBe(true);
    expect(store.getState().isMessageFilterActive()).toBe(true);
    expect(readSaved().dialogue).toBe(true);

    store.getState().toggleDialogue();
    expect(store.getState().messageFilter.dialogue).toBe(false);
    // The toggles the user set before entering the dialogue view come back.
    expect(store.getState().messageFilter.contentTypes.thinking).toBe(false);
    expect(store.getState().messageFilter.contentTypes.toolCalls).toBe(true);
  });

  it("restores the dialogue flag on a fresh slice and resets it with the filters", () => {
    makeStore().getState().toggleDialogue();
    const restored = makeStore();
    expect(restored.getState().messageFilter.dialogue).toBe(true);

    restored.getState().resetMessageFilter();
    expect(restored.getState().messageFilter.dialogue).toBe(false);
    expect(restored.getState().isMessageFilterActive()).toBe(false);
  });

  it("treats a missing or malformed dialogue flag as off", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      roles: { user: true, assistant: true },
      contentTypes: { text: true, thinking: true, toolCalls: true, commands: true, parallelTasks: true },
      dialogue: "yes",
    }));
    expect(makeStore().getState().messageFilter.dialogue).toBe(false);
  });
});

describe("getEffectiveContentTypes", () => {
  const base = {
    roles: { user: true, assistant: false },
    contentTypes: { text: false, thinking: true, toolCalls: true, commands: true, parallelTasks: true },
  };

  it("returns the individual toggles when the dialogue view is off", () => {
    expect(getEffectiveContentTypes({ ...base, dialogue: false })).toEqual(base.contentTypes);
  });

  it("keeps only text when the dialogue view is on", () => {
    // parallelTasks stays true: the dialogue rules already drop tool calls and
    // notifications, and category filtering would also drop assistant prose that
    // happens to share a record with a parallel spawn.
    expect(getEffectiveContentTypes({ ...base, dialogue: true })).toEqual({
      text: true,
      thinking: false,
      toolCalls: false,
      commands: false,
      parallelTasks: true,
    });
  });
});
