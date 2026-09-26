/**
 * Role / content-type display filter shared by the message list and export.
 *
 * Extracted from the MessageViewer `displayMessages` memo so that export can
 * apply the exact same filtering to a freshly fetched FULL session (the store
 * may only hold a paginated window of it).
 */

import type { ClaudeAssistantMessage, ClaudeMessage, ContentItem } from "../../../types";
import type {
  MessageFilter,
  MessageFilterContentTypes,
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

/** Whether an assistant content block is shown under these content types. */
function isAssistantBlockShown(
  block: object,
  contentTypes: MessageFilterContentTypes,
): boolean {
  const t = (block as Record<string, unknown>).type as string;
  if (t === "text") return contentTypes.text;
  if (t === "thinking" || t === "redacted_thinking") return contentTypes.thinking;
  if (TOOL_BLOCK_TYPES.has(t)) return contentTypes.toolCalls;
  if (t === "command") return contentTypes.commands;
  return true; // image, document, search_result — always show
}

/** Whether an assistant record keeps any visible content under these content types. */
function hasVisibleAssistantContent(
  msg: ClaudeAssistantMessage,
  contentTypes: MessageFilterContentTypes,
): boolean {
  const hasText = contentTypes.text && !!extractClaudeMessageContent(msg);
  const hasContentArray = Array.isArray(msg.content) && msg.content.some((item: unknown) =>
    !!item && typeof item === "object" && isAssistantBlockShown(item, contentTypes),
  );
  const hasLegacyTool = contentTypes.toolCalls && !!(msg.toolUse || msg.toolUseResult);
  return hasText || hasContentArray || hasLegacyTool;
}

/**
 * A kept assistant record as displayed: without the blocks (and legacy tool
 * fields) of the content types turned off, so session search, the groupers
 * and export see only what the renderer shows. Providers that pack several
 * block types into one record (e.g. OpenCode) need this; Claude Code writes
 * one block per record. Returns the record itself when nothing is removed.
 */
function toDisplayedAssistantRecord(
  msg: ClaudeAssistantMessage,
  contentTypes: MessageFilterContentTypes,
): ClaudeAssistantMessage {
  let { content } = msg;
  if (Array.isArray(content)) {
    const shown = content.filter((item: unknown) =>
      !item || typeof item !== "object" || isAssistantBlockShown(item, contentTypes),
    );
    if (shown.length !== content.length) content = shown;
  } else if (typeof content === "string" && content && !contentTypes.text) {
    content = "";
  }
  const dropLegacyTool =
    !contentTypes.toolCalls && (msg.toolUse != null || msg.toolUseResult != null);
  if (content === msg.content && !dropLegacyTool) return msg;
  return dropLegacyTool
    ? { ...msg, content, toolUse: undefined, toolUseResult: undefined }
    : { ...msg, content };
}

/** Whether a content block is a `text` block that actually carries prose. */
function isProseBlock(block: unknown): block is ContentItem {
  if (!block || typeof block !== "object") return false;
  const { type, text } = block as { type?: unknown; text?: unknown };
  return type === "text" && typeof text === "string" && text.trim().length > 0;
}

/**
 * Dialogue view of one record: human prompts unchanged, assistant records
 * reduced to their prose, everything else dropped (null).
 *
 * Tool calls and results, thinking, slash commands and their output,
 * notifications, harness context, progress/system rows and assistant records
 * without prose are all dropped. A kept assistant record loses every non-text
 * block and its legacy tool fields, so the renderer, the task/agent groupers
 * and export see prose only, whatever block types a provider emits (e.g.
 * OpenCode's per-step `opencode_step` block). The individual role and content
 * toggles are ignored (they are disabled in the UI).
 */
export function toDialogueRecord(msg: ClaudeMessage): ClaudeMessage | null {
  if (msg.type === "user") return getUserMessageKind(msg) === "prompt" ? msg : null;
  if (msg.type !== "assistant") return null;

  const hasLegacyTool = msg.toolUse != null || msg.toolUseResult != null;
  const { content } = msg;
  if (typeof content === "string") {
    if (!content.trim()) return null;
    return hasLegacyTool ? { ...msg, toolUse: undefined, toolUseResult: undefined } : msg;
  }
  if (!Array.isArray(content)) return null;

  const prose = content.filter(isProseBlock);
  if (prose.length === 0) return null;
  if (prose.length === content.length && !hasLegacyTool) return msg;
  return { ...msg, content: prose, toolUse: undefined, toolUseResult: undefined };
}

function applyDialogueFilter(messages: ClaudeMessage[]): ClaudeMessage[] {
  const result: ClaudeMessage[] = [];
  for (const msg of messages) {
    const shown = toDialogueRecord(msg);
    if (shown) result.push(shown);
  }
  return result;
}

export function applyMessageDisplayFilter(
  messages: ClaudeMessage[],
  messageFilter: MessageFilter,
): ClaudeMessage[] {
  if (messageFilter.dialogue) return applyDialogueFilter(messages);

  const { roles, contentTypes } = messageFilter;
  const allRoles = roles.user && roles.assistant;
  const allContent = contentTypes.text && contentTypes.thinking && contentTypes.toolCalls && contentTypes.commands;
  const parallelTaskFilteredMessages = filterMessagesByCategory(
    messages,
    "parallel-task",
    contentTypes.parallelTasks,
  );
  if (allRoles && allContent) return parallelTaskFilteredMessages;

  const result: ClaudeMessage[] = [];
  for (const msg of parallelTaskFilteredMessages) {
    if (msg.type === "user") {
      if (!roles.user) continue;
      // Tool results arrive as user records; they follow the Tool Calls toggle
      // so hiding tool calls does not leave their orphaned results behind.
      if (!contentTypes.toolCalls && getUserMessageKind(msg) === "toolResult") continue;
      result.push(msg);
    } else if (msg.type === "assistant") {
      if (!roles.assistant) continue;
      if (allContent) {
        result.push(msg);
      } else if (hasVisibleAssistantContent(msg, contentTypes)) {
        result.push(toDisplayedAssistantRecord(msg, contentTypes));
      }
    } else {
      result.push(msg); // system/summary/other
    }
  }
  return result;
}
