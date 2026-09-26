import { useAppStore } from "../../store/useAppStore";
import type { BoardSessionData } from "../../types/board.types";
import { buildSearchIndex, clearSearchIndex } from "../../utils/searchIndex";

const EMPTY_SUBAGENT_MAP = new Map<string, string>();

/**
 * Opens a board lane's session in the message view and jumps to `messageId`.
 *
 * The lane already holds the session's messages, so they are placed in the
 * store directly instead of going through `selectSession`. That shortcut must
 * still leave the store as a fresh top-level selection would: any open
 * subagent stack and the previous session's subagent list are dropped, then
 * the new session's subagents are loaded so its Agent cards can open.
 */
export function openBoardSessionAt(data: BoardSessionData, messageId: string): void {
  const store = useAppStore.getState();
  // Set session and messages from board cache when session differs or
  // messages are empty (e.g., after board view switch).
  if (store.selectedSession?.session_id !== data.session.session_id || store.messages.length === 0) {
    useAppStore.setState({
      selectedSession: data.session,
      messages: data.messages,
      isLoadingMessages: false,
      pagination: {
        currentOffset: data.messages.length,
        pageSize: data.messages.length,
        totalCount: data.messages.length,
        hasMore: false,
        isLoadingMore: false,
      },
      parentSessionStack: [],
      subagentNavStack: [],
      subagentSessions: [],
      toolUseToSubagentMap: EMPTY_SUBAGENT_MAP,
    });

    clearSearchIndex();
    buildSearchIndex(data.messages);
    void useAppStore.getState().loadSubagents(data.session.file_path, data.messages);
  }
  // Navigate to message and switch view
  useAppStore.getState().navigateToMessage(messageId);
  useAppStore.getState().setAnalyticsCurrentView("messages");
}
