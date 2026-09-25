/**
 * Session search vs. the message display filter: matches in records the
 * filter hides are left out of navigation and counted instead, and a refresh
 * after a filter change brings them back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { create, type StoreApi } from "zustand";
import type { ClaudeMessage } from "../types";
import type { FullAppStore } from "../store/slices/types";

vi.mock("../utils/searchIndex", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/searchIndex")>();
  return {
    ...actual,
    // Force the synchronous linear search; no Worker in tests.
    isSearchIndexReady: () => false,
    buildSearchIndex: () => {},
  };
});

import { createSearchSlice } from "../store/slices/searchSlice";
import { createFilterSlice } from "../store/slices/filterSlice";

const record = (uuid: string, type: string, content: unknown): ClaudeMessage =>
  ({ uuid, sessionId: "s1", timestamp: "2026-09-24T10:00:00.000Z", type, role: type, content }) as unknown as ClaudeMessage;

const session = [
  record("prompt", "user", "Why is the deploy slow?"),
  record("call", "assistant", [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "kubectl get pods" } }]),
  record("result", "user", [{ type: "tool_result", tool_use_id: "t1", content: "api-7f9 CrashLoopBackOff" }]),
  record("reply", "assistant", [{ type: "text", text: "One pod is in CrashLoopBackOff." }]),
];

const makeStore = () =>
  create<FullAppStore>()((set, get, api) => {
    const args = [
      set as unknown as Parameters<typeof createSearchSlice>[0],
      get,
      api as unknown as StoreApi<FullAppStore>,
    ] as const;
    return {
      ...createSearchSlice(...args),
      ...createFilterSlice(...args),
      selectedSession: { file_path: "/fixture/session.jsonl" },
      fetchFullSessionMessages: async () => session,
    } as unknown as FullAppStore;
  });

describe("session search under the display filter", () => {
  beforeEach(() => localStorage.clear());

  it("finds a tool-result match when nothing is filtered", async () => {
    const store = makeStore();
    await store.getState().setSessionSearchQuery("CrashLoopBackOff");
    const { matches, hiddenMatchCount } = store.getState().sessionSearch;
    expect(matches.map((m) => m.messageUuid).sort()).toEqual(["reply", "result"]);
    expect(hiddenMatchCount).toBe(0);
  });

  it("leaves a tool-result match out of navigation in the dialogue view", async () => {
    const store = makeStore();
    store.getState().toggleDialogue();
    await store.getState().setSessionSearchQuery("CrashLoopBackOff");
    const { matches, currentMatchIndex, hiddenMatchCount } = store.getState().sessionSearch;
    expect(matches.map((m) => m.messageUuid)).toEqual(["reply"]);
    expect(currentMatchIndex).toBe(0);
    expect(hiddenMatchCount).toBe(1);
  });

  it("reports only hidden matches when every match is hidden", async () => {
    const store = makeStore();
    store.getState().toggleDialogue();
    await store.getState().setSessionSearchQuery("kubectl");
    expect(store.getState().sessionSearch.matches).toEqual([]);
    expect(store.getState().sessionSearch.currentMatchIndex).toBe(-1);
    expect(store.getState().sessionSearch.hiddenMatchCount).toBe(1);
  });

  it("brings hidden matches back on refresh after the filter is reset, keeping the current match", async () => {
    const store = makeStore();
    store.getState().toggleDialogue();
    await store.getState().setSessionSearchQuery("CrashLoopBackOff");
    const current = store.getState().sessionSearch.matches[0];

    store.getState().resetMessageFilter();
    await store.getState().refreshSessionSearch();

    const { matches, currentMatchIndex, hiddenMatchCount } = store.getState().sessionSearch;
    expect(matches).toHaveLength(2);
    expect(hiddenMatchCount).toBe(0);
    expect(matches[currentMatchIndex]?.messageUuid).toBe(current?.messageUuid);
  });
});
