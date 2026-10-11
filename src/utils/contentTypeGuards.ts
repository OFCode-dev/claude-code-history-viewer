/**
 * Content Type Guards Utility
 *
 * Comprehensive runtime type checking for all Claude content types.
 * These guards accept `unknown` for flexible runtime validation,
 * complementing the ContentItem-specific guards in typeGuards.ts.
 *
 * @see src/utils/typeGuards.ts for message-level type guards
 */

import type {
  TextContent,
  ThinkingContent,
  RedactedThinkingContent,
  ImageContent,
  DocumentContent,
  SearchResultContent,
  ToolUseContent,
  ToolResultContent,
  ServerToolUseContent,
  WebSearchToolResultContent,
  WebFetchToolResultContent,
  CodeExecutionToolResultContent,
  BashCodeExecutionToolResultContent,
  TextEditorCodeExecutionToolResultContent,
  ToolSearchToolResultContent,
  AdvisorToolResultContent,
  MCPToolUseContent,
  MCPToolResultContent,
  ContainerUploadContent,
} from "../types";

// ============================================================================
// Base Content Type Guard
// ============================================================================

/**
 * Base type guard - checks if value is a valid content item structure
 */
function isContentItem(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === "object" && "type" in item;
}

// ============================================================================
// Basic Content Type Guards
// ============================================================================

/**
 * Type guard for text content blocks
 */
export function isTextContent(item: unknown): item is TextContent {
  return (
    isContentItem(item) &&
    item.type === "text" &&
    typeof (item as Record<string, unknown>).text === "string"
  );
}

/**
 * Type guard for thinking content blocks
 */
export function isThinkingContent(item: unknown): item is ThinkingContent {
  return (
    isContentItem(item) &&
    item.type === "thinking" &&
    typeof (item as Record<string, unknown>).thinking === "string"
  );
}

/**
 * Type guard for redacted thinking content blocks
 */
export function isRedactedThinkingContent(item: unknown): item is RedactedThinkingContent {
  return (
    isContentItem(item) &&
    item.type === "redacted_thinking" &&
    typeof (item as Record<string, unknown>).data === "string"
  );
}

// ============================================================================
// Image Type Guards
// ============================================================================

/**
 * Type guard for image content blocks
 */
export function isImageContent(item: unknown): item is ImageContent {
  return (
    isContentItem(item) &&
    item.type === "image" &&
    "source" in item &&
    item.source !== null &&
    typeof item.source === "object"
  );
}

// ============================================================================
// Document Type Guards
// ============================================================================

/**
 * Type guard for document content blocks
 */
export function isDocumentContent(item: unknown): item is DocumentContent {
  return (
    isContentItem(item) &&
    item.type === "document" &&
    "source" in item &&
    item.source !== null &&
    typeof item.source === "object"
  );
}

// ============================================================================
// Search Result Type Guard
// ============================================================================

/**
 * Type guard for search result content blocks
 */
export function isSearchResultContent(item: unknown): item is SearchResultContent {
  return (
    isContentItem(item) &&
    item.type === "search_result" &&
    "title" in item &&
    typeof (item as Record<string, unknown>).title === "string" &&
    "source" in item &&
    typeof (item as Record<string, unknown>).source === "string" &&
    "content" in item &&
    Array.isArray((item as Record<string, unknown>).content)
  );
}

// ============================================================================
// Tool Use Type Guards
// ============================================================================

/**
 * Type guard for tool use content blocks
 */
export function isToolUseContent(item: unknown): item is ToolUseContent {
  return (
    isContentItem(item) &&
    item.type === "tool_use" &&
    "id" in item &&
    typeof (item as Record<string, unknown>).id === "string" &&
    "name" in item &&
    typeof (item as Record<string, unknown>).name === "string" &&
    "input" in item &&
    item.input !== null &&
    typeof item.input === "object"
  );
}

/**
 * Type guard for tool result content blocks
 */
export function isToolResultContent(item: unknown): item is ToolResultContent {
  return (
    isContentItem(item) &&
    item.type === "tool_result" &&
    "tool_use_id" in item &&
    typeof (item as Record<string, unknown>).tool_use_id === "string" &&
    "content" in item &&
    typeof (item as Record<string, unknown>).content === "string"
  );
}

/**
 * Type guard for server-side tool use content blocks
 */
export function isServerToolUseContent(item: unknown): item is ServerToolUseContent {
  return (
    isContentItem(item) &&
    item.type === "server_tool_use" &&
    "id" in item &&
    typeof (item as Record<string, unknown>).id === "string" &&
    "name" in item &&
    typeof (item as Record<string, unknown>).name === "string" &&
    "input" in item &&
    item.input !== null &&
    typeof item.input === "object"
  );
}

// ============================================================================
// Web Search Type Guard
// ============================================================================

/**
 * Type guard for web search tool result content blocks
 */
export function isWebSearchToolResultContent(
  item: unknown
): item is WebSearchToolResultContent {
  return (
    isContentItem(item) &&
    item.type === "web_search_tool_result" &&
    "tool_use_id" in item &&
    typeof (item as Record<string, unknown>).tool_use_id === "string" &&
    "content" in item
  );
}

// ============================================================================
// Web Fetch Type Guard (beta: web-fetch-2025-09-10)
// ============================================================================

/**
 * Type guard for web fetch tool result content blocks
 */
export function isWebFetchToolResultContent(
  item: unknown
): item is WebFetchToolResultContent {
  return (
    isContentItem(item) &&
    item.type === "web_fetch_tool_result" &&
    "tool_use_id" in item &&
    typeof (item as Record<string, unknown>).tool_use_id === "string" &&
    "content" in item
  );
}

// ============================================================================
// Code Execution Type Guards (beta: code-execution-2025-08-25)
// ============================================================================

/**
 * Type guard for legacy Python code execution tool result content blocks
 */
export function isCodeExecutionToolResultContent(
  item: unknown
): item is CodeExecutionToolResultContent {
  return (
    isContentItem(item) &&
    item.type === "code_execution_tool_result" &&
    "tool_use_id" in item &&
    typeof (item as Record<string, unknown>).tool_use_id === "string" &&
    "content" in item
  );
}

/**
 * Type guard for Bash code execution tool result content blocks
 */
export function isBashCodeExecutionToolResultContent(
  item: unknown
): item is BashCodeExecutionToolResultContent {
  return (
    isContentItem(item) &&
    item.type === "bash_code_execution_tool_result" &&
    "tool_use_id" in item &&
    typeof (item as Record<string, unknown>).tool_use_id === "string" &&
    "content" in item
  );
}

/**
 * Type guard for text editor code execution tool result content blocks
 */
export function isTextEditorCodeExecutionToolResultContent(
  item: unknown
): item is TextEditorCodeExecutionToolResultContent {
  return (
    isContentItem(item) &&
    item.type === "text_editor_code_execution_tool_result" &&
    "tool_use_id" in item &&
    typeof (item as Record<string, unknown>).tool_use_id === "string" &&
    "content" in item
  );
}

// ============================================================================
// Tool Search Type Guard (beta: mcp-client-2025-11-20)
// ============================================================================

/**
 * Type guard for tool search tool result content blocks
 */
export function isToolSearchToolResultContent(
  item: unknown
): item is ToolSearchToolResultContent {
  return (
    isContentItem(item) &&
    item.type === "tool_search_tool_result" &&
    "tool_use_id" in item &&
    typeof (item as Record<string, unknown>).tool_use_id === "string" &&
    "content" in item
  );
}

/**
 * Type guard for advisor tool result content blocks
 */
export function isAdvisorToolResultContent(
  item: unknown
): item is AdvisorToolResultContent {
  return (
    isContentItem(item) &&
    item.type === "advisor_tool_result" &&
    "tool_use_id" in item &&
    typeof (item as Record<string, unknown>).tool_use_id === "string" &&
    "content" in item
  );
}

// ============================================================================
// MCP Type Guards
// ============================================================================

/**
 * Type guard for MCP tool use content blocks
 */
export function isMCPToolUseContent(item: unknown): item is MCPToolUseContent {
  return (
    isContentItem(item) &&
    item.type === "mcp_tool_use" &&
    "id" in item &&
    typeof (item as Record<string, unknown>).id === "string" &&
    "server_name" in item &&
    typeof (item as Record<string, unknown>).server_name === "string" &&
    "tool_name" in item &&
    typeof (item as Record<string, unknown>).tool_name === "string" &&
    "input" in item &&
    item.input !== null &&
    typeof item.input === "object"
  );
}

/**
 * Type guard for MCP tool result content blocks
 */
export function isMCPToolResultContent(item: unknown): item is MCPToolResultContent {
  return (
    isContentItem(item) &&
    item.type === "mcp_tool_result" &&
    "tool_use_id" in item &&
    typeof (item as Record<string, unknown>).tool_use_id === "string" &&
    "content" in item
  );
}

// ============================================================================
// Container Upload Type Guard
// ============================================================================

/**
 * Type guard for container_upload content blocks (beta: files-api-2025-04-14)
 */
export function isContainerUploadContent(
  item: unknown
): item is ContainerUploadContent {
  return isContentItem(item) && item.type === "container_upload";
}
