/**
 * Role / content-type display filter shared by the message list and export.
 *
 * Extracted from the MessageViewer `displayMessages` memo so that export can
 * apply the exact same filtering to a freshly fetched FULL session (the store
 * may only hold a paginated window of it).
 */

import type { ClaudeAssistantMessage, ClaudeMessage } from "../../../types";
import {
  DIALOGUE_CONTENT_TYPES,
  type MessageFilter,
  type MessageFilterContentTypes,
} from "../../../store/slices/filterSlice";
import { extractClaudeMessageContent } from "../../../utils/messageUtils";
import { getUserMessageKind } from "../../../utils/userMessageKind";
import { filterMessagesByCategory } from "./messageCategories";

const TOOL_BLOCK_TYPES = new Set([
  "tool_use",
  "tool_result",
  "server_tool_use",
  "web_search_tool_result",
  "mcp_tool_use",
  "mcp_tool_result",
  "web_fetch_tool_result",
  "code_execution_tool_result",
  "bash_code_execution_tool_result",
  "text_editor_code_execution_tool_result",
  "tool_search_tool_result",
]);

/** Whether an assistant record keeps any visible content under these content types. */
function hasVisibleAssistantContent(
  msg: ClaudeAssistantMessage,
  contentTypes: MessageFilterContentTypes,
): boolean {
  const hasText = contentTypes.text && !!extractClaudeMessageContent(msg);
  const hasContentArray = Array.isArray(msg.content) && msg.content.some((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const t = (item as Record<string, unknown>).type as string;
    if (t === "text") return contentTypes.text;
    if (t === "thinking" || t === "redacted_thinking") return contentTypes.thinking;
    if (TOOL_BLOCK_TYPES.has(t)) return contentTypes.toolCalls;
    if (t === "command") return contentTypes.commands;
    return true; // image, document, search_result — always show
  });
  const hasLegacyTool = contentTypes.toolCalls && !!(msg.toolUse || msg.toolUseResult);
  return hasText || hasContentArray || hasLegacyTool;
}

/**
 * Dialogue view: human prompts and assistant prose only. Tool calls and results,
 * thinking, slash commands and their output, notifications, harness context,
 * progress/system rows and assistant records without text are all dropped. The
 * individual role and content toggles are ignored (they are disabled in the UI).
 */
function isDialogueRecord(msg: ClaudeMessage): boolean {
  if (msg.type === "user") return getUserMessageKind(msg) === "prompt";
  if (msg.type === "assistant") {
    return hasVisibleAssistantContent(msg, DIALOGUE_CONTENT_TYPES);
  }
  return false;
}

export function applyMessageDisplayFilter(
  messages: ClaudeMessage[],
  messageFilter: MessageFilter,
): ClaudeMessage[] {
  if (messageFilter.dialogue) return messages.filter(isDialogueRecord);

  const { roles, contentTypes } = messageFilter;
  const allRoles = roles.user && roles.assistant;
  const allContent = contentTypes.text && contentTypes.thinking && contentTypes.toolCalls && contentTypes.commands;
  const parallelTaskFilteredMessages = filterMessagesByCategory(
    messages,
    "parallel-task",
    contentTypes.parallelTasks,
  );
  if (allRoles && allContent) return parallelTaskFilteredMessages;

  return parallelTaskFilteredMessages.filter((msg) => {
    if (msg.type === "user") {
      if (!roles.user) return false;
      // Tool results arrive as user records; they follow the Tool Calls toggle
      // so hiding tool calls does not leave their orphaned results behind.
      if (!contentTypes.toolCalls && getUserMessageKind(msg) === "toolResult") return false;
      return true;
    }
    if (msg.type === "assistant") {
      if (!roles.assistant) return false;
      return allContent || hasVisibleAssistantContent(msg, contentTypes);
    }
    return true; // system/summary/other
  });
}
