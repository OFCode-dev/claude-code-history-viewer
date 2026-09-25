/**
 * selectSession queues the remembered reading position of a revisited
 * session; the message viewer consumes it (see useReadingPosition).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import type { ClaudeMessage, ClaudeSession } from "../types";
import { createMessageSlice, type MessageSlice } from "../store/slices/messageSlice";
import type { PendingPositionRestore } from "../store/slices/navigatorSlice";
import {
  clearReadingPositions,
  rememberReadingPosition,
} from "../store/readingPositions";

const mockApi = vi.fn();
vi.mock("@/services/api", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), warning: vi.fn() },
}));

vi.mock("../utils/searchIndex", () => ({
  buildSearchIndex: vi.fn(),
  clearSearchIndex: vi.fn(),
}));

type TestStore = MessageSlice & {
  selectedSession: ClaudeSession | null;
  excludeSidechain: boolean;
  showSystemMessages: boolean;
  setError: ReturnType<typeof vi.fn>;
  setSelectedSession: (s: ClaudeSession | null) => void;
  selectedProject: null;
  dateFilter: { start: null; end: null };
  pendingPositionRestore?: PendingPositionRestore | null;
  targetMessageUuid?: string | null;
  shouldHighlightTarget?: boolean;
};

const createTestStore = () =>
  create<TestStore>()((set, get) => ({
    selectedSession: null,
    excludeSidechain: true,
    showSystemMessages: false,
    setError: vi.fn(),
    setSelectedSession: (s) => set({ selectedSession: s }),
    selectedProject: null,
    dateFilter: { start: null, end: null },
    ...createMessageSlice(
      set as Parameters<typeof createMessageSlice>[0],
      get as Parameters<typeof createMessageSlice>[1],
    ),
  }));

const session = (filePath: string): ClaudeSession =>
  ({
    session_id: filePath,
    actual_session_id: filePath,
    file_path: filePath,
    project_name: "proj",
    message_count: 1,
    summary: "",
  }) as unknown as ClaudeSession;

const message = { uuid: "m1", type: "user", content: "hi", timestamp: "" } as unknown as ClaudeMessage;

describe("selectSession position restore", () => {
  beforeEach(() => {
    clearReadingPositions();
    mockApi.mockReset();
    mockApi.mockImplementation((cmd: string) => {
      if (cmd === "load_provider_messages_paginated") {
        return Promise.resolve({ messages: [message], total_count: 1, has_more: false, next_offset: 1 });
      }
      if (cmd === "get_session_subagents") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected: ${cmd}`));
    });
  });

  it("queues nothing for a session without a remembered position", async () => {
    const store = createTestStore();

    await store.getState().selectSession(session("/a.jsonl"));

    expect(store.getState().pendingPositionRestore).toBeNull();
  });

  it("queues the remembered position when the session is selected again", async () => {
    const store = createTestStore();
    rememberReadingPosition("/a.jsonl", { uuid: "m1", offset: -40 });

    await store.getState().selectSession(session("/b.jsonl"));
    await store.getState().selectSession(session("/a.jsonl"));

    expect(store.getState().pendingPositionRestore).toEqual({
      sessionPath: "/a.jsonl",
      uuid: "m1",
      offset: -40,
    });
  });

  it("drops a scroll target left over from the previous session", async () => {
    const store = createTestStore();
    await store.getState().selectSession(session("/a.jsonl"));
    store.setState({ targetMessageUuid: "m1", shouldHighlightTarget: true });

    await store.getState().selectSession(session("/b.jsonl"));

    expect(store.getState().targetMessageUuid).toBeNull();
    expect(store.getState().shouldHighlightTarget).toBe(false);
  });

  it("leaves the viewport alone on an in-place reload", async () => {
    const store = createTestStore();
    await store.getState().selectSession(session("/a.jsonl"));
    rememberReadingPosition("/a.jsonl", { uuid: "m1", offset: 0 });

    await store.getState().selectSession(session("/a.jsonl"));

    expect(store.getState().pendingPositionRestore).toBeNull();
  });
});
