import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeMessage, ClaudeSession, SubagentSession } from "@/types";
import type { SearchState } from "@/store/slices/types";
import { englishT } from "@/test/utils/englishTranslator";
import { MessageViewer } from "./MessageViewer";

const { storeState } = vi.hoisted(() => ({
  storeState: {} as Record<string, unknown>,
}));

vi.mock("@/store/useAppStore", () => {
  const useAppStore = (selector?: (state: Record<string, unknown>) => unknown) =>
    selector ? selector(storeState) : storeState;
  useAppStore.getState = () => storeState;
  return { useAppStore };
});

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: englishT }),
}));

const message = {
  uuid: "m1",
  sessionId: "s1",
  timestamp: "2026-09-24T10:00:00.000Z",
  type: "user",
  role: "user",
  content: "Hello",
  isSidechain: false,
} as unknown as ClaudeMessage;

const session: ClaudeSession = {
  session_id: "s1",
  actual_session_id: "s1",
  file_path: "/p/s1.jsonl",
  project_name: "p",
  message_count: 1,
  first_message_time: "2026-09-24T10:00:00.000Z",
  last_message_time: "2026-09-24T10:00:00.000Z",
  last_modified: "2026-09-24T10:00:00.000Z",
  has_tool_use: false,
  has_errors: false,
};

const subagent: SubagentSession = {
  agent_id: "a1",
  file_path: "/p/s1/subagents/agent-a1.jsonl",
  message_count: 3,
  file_size: 10,
  first_message_time: null,
  last_message_time: null,
  summary: null,
  tool_use_id: "toolu_a1",
  workflow_run_id: null,
  description: "Investigate the flaky test",
};

const sessionSearch: SearchState = {
  query: "",
  matches: [],
  currentMatchIndex: -1,
  isSearching: false,
  filterType: "content",
  hiddenMatchCount: 0,
};

function setStoreState() {
  Object.assign(storeState, {
    isCaptureMode: false,
    hiddenMessageIds: [],
    selectedMessageIds: [],
    enterCaptureMode: vi.fn(),
    hideMessage: vi.fn(),
    showMessage: vi.fn(),
    restoreMessages: vi.fn(),
    isCapturing: false,
    handleSelectionClick: vi.fn(),
    clearSelection: vi.fn(),
    targetMessageUuid: null,
    targetRequestId: null,
    shouldHighlightTarget: false,
    clearTargetMessage: vi.fn(),
    messageFilter: {
      roles: { user: true, assistant: true },
      contentTypes: {
        text: true,
        thinking: true,
        toolCalls: true,
        commands: true,
        parallelTasks: true,
      },
      dialogue: false,
    },
    subagentSessions: [subagent],
    parentSessionStack: [],
    navigateToSubagent: vi.fn(async () => {}),
    isLoadingMessages: false,
    setActiveSessionNearBottom: vi.fn(),
    setIsCapturing: vi.fn(),
    pendingPositionRestore: null,
    clearPendingPositionRestore: vi.fn(),
    refreshSessionSearch: vi.fn(async () => {}),
    resetMessageFilter: vi.fn(),
    navigateToMessage: vi.fn(),
    isMessageFilterActive: () => false,
    loadMoreMessages: vi.fn(),
    ensureMessageLoaded: vi.fn(async () => false),
    fetchFullSessionMessages: vi.fn(async () => []),
    pagination: {
      currentOffset: 0,
      pageSize: 0,
      totalCount: 0,
      hasMore: false,
      isLoadingMore: false,
    },
  });
}

function renderViewer() {
  return render(
    <MessageViewer
      messages={[message]}
      isLoading={false}
      selectedSession={session}
      sessionSearch={sessionSearch}
      onSearchChange={vi.fn()}
      onFilterTypeChange={vi.fn()}
      onClearSearch={vi.fn()}
      onNextMatch={vi.fn()}
      onPrevMatch={vi.fn()}
    />,
  );
}

/**
 * Subagents have one home: the "Subagents" section at the bottom of whatever
 * lists the sessions. The conversation never lists them above itself.
 */
describe("MessageViewer and the subagent list", () => {
  beforeEach(() => {
    setStoreState();
  });

  it("lists no subagents above the conversation, even when the session has some", () => {
    renderViewer();
    expect(screen.queryByRole("region", { name: "Subagents of this session" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Investigate the flaky test/ })).toBeNull();
  });
});
