/**
 * Opening a board lane while a subagent transcript is on screen must behave
 * like a fresh top-level selection: the subagent stack and the old parent's
 * subagent list go away, the deep link follows the board session, and the
 * board session's own subagents are loaded.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeMessage, ClaudeSession, SubagentSession } from "@/types";
import type { BoardSessionData } from "@/types/board.types";

const mockApi = vi.fn();
vi.mock("@/services/api", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

const { mockWriteDeepLink } = vi.hoisted(() => ({ mockWriteDeepLink: vi.fn() }));
vi.mock("@/utils/webuiDeepLink", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/webuiDeepLink")>()),
  writeWebUIDeepLink: mockWriteDeepLink,
}));

vi.mock("@/utils/searchIndex", () => ({
  buildSearchIndex: vi.fn(),
  clearSearchIndex: vi.fn(),
}));

import { useAppStore } from "@/store/useAppStore";
import { openBoardSessionAt } from "./openBoardSession";

const session = (id: string, file_path: string): ClaudeSession => ({
  session_id: id,
  actual_session_id: id,
  file_path,
  project_name: "p",
  message_count: 1,
  first_message_time: "2026-09-20T10:00:00Z",
  last_message_time: "2026-09-20T10:05:00Z",
  last_modified: "2026-09-20T10:05:00Z",
  has_tool_use: false,
  has_errors: false,
});

const subagent = (agent_id: string, file_path: string): SubagentSession => ({
  agent_id,
  file_path,
  message_count: 2,
  file_size: 10,
  first_message_time: "2026-09-20T10:00:00Z",
  last_message_time: "2026-09-20T10:05:00Z",
  summary: "task",
  tool_use_id: `toolu_${agent_id}`,
  workflow_run_id: null,
});

const parent = session("parent", "/p/parent.jsonl");
const openSub = subagent("a1", "/p/parent/subagents/agent-a1.jsonl");
const syntheticSubSession = session("agent-a1", openSub.file_path);

const boardSession = session("board", "/p/board.jsonl");
const boardMessage = {
  uuid: "m1",
  sessionId: "board",
  timestamp: "2026-09-20T10:00:00Z",
  type: "user",
  content: "hello",
} as ClaudeMessage;
const boardData = {
  session: boardSession,
  messages: [boardMessage],
} as BoardSessionData;
const boardSub = subagent("b1", "/p/board/subagents/agent-b1.jsonl");

describe("openBoardSessionAt", () => {
  beforeEach(() => {
    mockApi.mockReset();
    mockWriteDeepLink.mockReset();
    useAppStore.setState({
      selectedSession: syntheticSubSession,
      messages: [],
      parentSessionStack: [parent],
      subagentNavStack: [{ subagent: openSub, siblings: [openSub] }],
      subagentSessions: [openSub],
      toolUseToSubagentMap: new Map([["toolu_a1", openSub.file_path]]),
    });
  });

  it("drops the open subagent stack and loads the board session's subagents", async () => {
    mockApi.mockResolvedValue([boardSub]);

    openBoardSessionAt(boardData, "m1");

    const state = useAppStore.getState();
    expect(state.selectedSession).toBe(boardSession);
    expect(state.messages).toEqual([boardMessage]);
    expect(state.parentSessionStack).toEqual([]);
    expect(state.subagentNavStack).toEqual([]);
    expect(state.targetMessageUuid).toBe("m1");
    // With the stack gone the deep link tracks the board session again.
    expect(mockWriteDeepLink).toHaveBeenCalledWith(
      { sessionId: "board", messageId: "m1" },
      "push",
    );
    expect(mockApi).toHaveBeenCalledWith("get_session_subagents", {
      sessionPath: boardSession.file_path,
    });

    await vi.waitFor(() => {
      expect(useAppStore.getState().subagentSessions).toEqual([boardSub]);
    });
    expect(useAppStore.getState().toolUseToSubagentMap.get("toolu_b1")).toBe(boardSub.file_path);
    expect(useAppStore.getState().toolUseToSubagentMap.has("toolu_a1")).toBe(false);
  });

  it("clears the old parent's subagents while the new list is loading", () => {
    mockApi.mockReturnValue(new Promise(() => {}));

    openBoardSessionAt(boardData, "m1");

    expect(useAppStore.getState().subagentSessions).toEqual([]);
    expect(useAppStore.getState().toolUseToSubagentMap.size).toBe(0);
  });
});
