import type { ClaudeMessage } from "../types";
import type { SearchFilterType } from "../store/useAppStore";

// Type guards for safe type checking
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const hasStringProperty = (
  obj: Record<string, unknown>,
  key: string,
): boolean => {
  return key in obj && typeof obj[key] === "string";
};

// 검색 가능한 텍스트 추출 (content 검색용)
const MAX_TEXT_LENGTH = 10000; // 최대 10KB만 인덱싱 (텍스트용)
const MAX_INPUT_LENGTH = 5000; // tool_use.input 값 인덱싱 상한 (도구당)

// tool_use.input(객체)의 문자열/숫자 값을 재귀적으로 수집한다.
// 키가 아니라 값만 인덱싱해 글로벌(rust) 검색과 동작을 맞추고,
// budget으로 총 길이를 제한해 거대한 input이 인덱스를 부풀리지 않게 한다. (#429)
const collectInputValues = (
  value: unknown,
  parts: string[],
  budget: { remaining: number },
): void => {
  if (budget.remaining <= 0) return;
  if (typeof value === "string") {
    const s = value.slice(0, budget.remaining);
    parts.push(s);
    budget.remaining -= s.length;
  } else if (typeof value === "number" || typeof value === "boolean") {
    parts.push(String(value));
    budget.remaining -= String(value).length;
  } else if (Array.isArray(value)) {
    for (const v of value) {
      if (budget.remaining <= 0) break;
      collectInputValues(v, parts, budget);
    }
  } else if (isRecord(value)) {
    for (const v of Object.values(value)) {
      if (budget.remaining <= 0) break;
      collectInputValues(v, parts, budget);
    }
  }
};

const extractSearchableText = (message: ClaudeMessage): string => {
  const parts: string[] = [];

  try {
    // content 추출
    if (message.content) {
      if (typeof message.content === "string") {
        parts.push(message.content);
      } else if (Array.isArray(message.content)) {
        for (const item of message.content) {
          if (typeof item === "string") {
            parts.push(item);
          } else if (isRecord(item)) {
            const itemType = item.type as string | undefined;

            // Skip image content (base64 data is not searchable)
            if (itemType === "image") {
              continue;
            }

            // text content (길이 제한)
            if (hasStringProperty(item, "text")) {
              parts.push((item.text as string).slice(0, MAX_TEXT_LENGTH));
            }
            // thinking content (길이 제한)
            if (hasStringProperty(item, "thinking")) {
              parts.push((item.thinking as string).slice(0, MAX_TEXT_LENGTH));
            }
            // tool_use: name + input values (file_path, command, query 등) (#429)
            if (itemType === "tool_use") {
              if (hasStringProperty(item, "name"))
                parts.push(item.name as string);
              if (isRecord(item.input))
                collectInputValues(item.input, parts, {
                  remaining: MAX_INPUT_LENGTH,
                });
            }
            // tool_result: content
            if (
              itemType === "tool_result" &&
              hasStringProperty(item, "content")
            ) {
              parts.push(item.content as string);
            }
            // server_tool_use: name + input values (#429)
            if (itemType === "server_tool_use") {
              if (hasStringProperty(item, "name"))
                parts.push(item.name as string);
              if (isRecord(item.input))
                collectInputValues(item.input, parts, {
                  remaining: MAX_INPUT_LENGTH,
                });
            }
            // web_search_tool_result: titles and urls
            if (
              itemType === "web_search_tool_result" &&
              isRecord(item.content)
            ) {
              extractWebSearchResults(item.content, parts);
            } else if (
              itemType === "web_search_tool_result" &&
              Array.isArray(item.content)
            ) {
              for (const result of item.content) {
                if (isRecord(result)) {
                  if (hasStringProperty(result, "title"))
                    parts.push(result.title as string);
                  if (hasStringProperty(result, "url"))
                    parts.push(result.url as string);
                }
              }
            }
            // document: title, context
            if (itemType === "document") {
              if (hasStringProperty(item, "title"))
                parts.push(item.title as string);
              if (hasStringProperty(item, "context"))
                parts.push(item.context as string);
              // Also extract text content from PlainTextSource
              if (
                isRecord(item.source) &&
                (item.source as Record<string, unknown>).type === "text"
              ) {
                const source = item.source as Record<string, unknown>;
                if (hasStringProperty(source, "data"))
                  parts.push(source.data as string);
              }
            }
            // search_result: title, source, content texts
            if (itemType === "search_result") {
              if (hasStringProperty(item, "title"))
                parts.push(item.title as string);
              if (hasStringProperty(item, "source"))
                parts.push(item.source as string);
              if (Array.isArray(item.content)) {
                for (const textContent of item.content) {
                  if (
                    isRecord(textContent) &&
                    hasStringProperty(textContent, "text")
                  ) {
                    parts.push(textContent.text as string);
                  }
                }
              }
            }
            // mcp_tool_use: server_name, tool_name + input values (#429)
            if (itemType === "mcp_tool_use") {
              if (hasStringProperty(item, "server_name"))
                parts.push(item.server_name as string);
              if (hasStringProperty(item, "tool_name"))
                parts.push(item.tool_name as string);
              if (isRecord(item.input))
                collectInputValues(item.input, parts, {
                  remaining: MAX_INPUT_LENGTH,
                });
            }
            // mcp_tool_result: text content
            if (itemType === "mcp_tool_result") {
              extractMCPToolResultText(item.content, parts);
            }
            // web_fetch_tool_result: url, title
            if (
              itemType === "web_fetch_tool_result" &&
              isRecord(item.content)
            ) {
              const content = item.content as Record<string, unknown>;
              if (hasStringProperty(content, "url"))
                parts.push(content.url as string);
              if (isRecord(content.content)) {
                const doc = content.content as Record<string, unknown>;
                if (hasStringProperty(doc, "title"))
                  parts.push(doc.title as string);
              }
            }
            // code_execution_tool_result: stdout, stderr
            if (
              itemType === "code_execution_tool_result" &&
              isRecord(item.content)
            ) {
              const content = item.content as Record<string, unknown>;
              if (hasStringProperty(content, "stdout"))
                parts.push(content.stdout as string);
              if (hasStringProperty(content, "stderr"))
                parts.push(content.stderr as string);
            }
            // bash_code_execution_tool_result: stdout, stderr
            if (
              itemType === "bash_code_execution_tool_result" &&
              isRecord(item.content)
            ) {
              const content = item.content as Record<string, unknown>;
              if (hasStringProperty(content, "stdout"))
                parts.push(content.stdout as string);
              if (hasStringProperty(content, "stderr"))
                parts.push(content.stderr as string);
            }
            // text_editor_code_execution_tool_result: path, content
            if (
              itemType === "text_editor_code_execution_tool_result" &&
              isRecord(item.content)
            ) {
              const content = item.content as Record<string, unknown>;
              if (hasStringProperty(content, "path"))
                parts.push(content.path as string);
              if (hasStringProperty(content, "content"))
                parts.push(content.content as string);
            }
            // tool_search_tool_result: tool names, descriptions
            if (
              itemType === "tool_search_tool_result" &&
              Array.isArray(item.content)
            ) {
              for (const result of item.content) {
                if (isRecord(result)) {
                  if (hasStringProperty(result, "tool_name"))
                    parts.push(result.tool_name as string);
                  if (hasStringProperty(result, "server_name"))
                    parts.push(result.server_name as string);
                  if (hasStringProperty(result, "description"))
                    parts.push(result.description as string);
                }
              }
            }
          }
        }
      }
    }

    const compactMetadata: unknown =
      message.type === "system" ? message.compactMetadata : undefined;
    if (
      isRecord(compactMetadata) &&
      hasStringProperty(compactMetadata, "warning")
    ) {
      parts.push(compactMetadata.warning as string);
    }

    // toolUse name 추출
    if (
      message.type === "assistant" &&
      isRecord(message.toolUse) &&
      hasStringProperty(message.toolUse, "name")
    ) {
      parts.push(message.toolUse.name as string);
    }

    // toolUseResult 추출 (큰 내용은 처음 부분만 인덱싱)
    const MAX_CONTENT_LENGTH = 5000; // 최대 5KB만 인덱싱
    if (
      (message.type === "user" || message.type === "assistant") &&
      message.toolUseResult
    ) {
      const result = message.toolUseResult;
      if (typeof result === "string") {
        parts.push(result.slice(0, MAX_CONTENT_LENGTH));
      } else if (isRecord(result)) {
        if (hasStringProperty(result, "stdout")) {
          parts.push((result.stdout as string).slice(0, MAX_CONTENT_LENGTH));
        }
        if (hasStringProperty(result, "stderr")) {
          parts.push((result.stderr as string).slice(0, MAX_CONTENT_LENGTH));
        }
        if (hasStringProperty(result, "content")) {
          parts.push((result.content as string).slice(0, MAX_CONTENT_LENGTH));
        }
      }
    }
  } catch (error) {
    console.error("[SearchIndex] Error extracting searchable text:", error);
  }

  return parts.join(" ");
};

// Helper: Extract text from web search results
const extractWebSearchResults = (
  content: Record<string, unknown>,
  parts: string[],
): void => {
  if (hasStringProperty(content, "title")) parts.push(content.title as string);
  if (hasStringProperty(content, "url")) parts.push(content.url as string);
};

// Helper: Extract text from MCP tool result
const extractMCPToolResultText = (content: unknown, parts: string[]): void => {
  if (typeof content === "string") {
    parts.push(content);
  } else if (isRecord(content)) {
    if (hasStringProperty(content, "text")) {
      parts.push(content.text as string);
    }
    if (hasStringProperty(content, "uri")) {
      parts.push(content.uri as string);
    }
  }
};

// Tool ID 추출 (tool_use_id, tool_use.id 검색용)
const extractToolIds = (message: ClaudeMessage): string => {
  const ids: string[] = [];

  try {
    // message.content 배열에서 tool_use와 tool_result의 id 추출
    if (Array.isArray(message.content)) {
      for (const item of message.content) {
        if (isRecord(item)) {
          // tool_use의 id
          if (item.type === "tool_use" && hasStringProperty(item, "id")) {
            ids.push(item.id as string);
          }
          // tool_result의 tool_use_id
          if (
            item.type === "tool_result" &&
            hasStringProperty(item, "tool_use_id")
          ) {
            ids.push(item.tool_use_id as string);
          }
        }
      }
    }

    // toolUse 객체의 id
    if (
      message.type === "assistant" &&
      isRecord(message.toolUse) &&
      hasStringProperty(message.toolUse, "id")
    ) {
      ids.push(message.toolUse.id as string);
    }
  } catch (error) {
    console.error("[SearchIndex] Error extracting tool IDs:", error);
  }

  return ids.join(" ");
};

// ============================================================================
// Web Worker-based Search Index
// ============================================================================

type SearchResult = {
  messageUuid: string;
  messageIndex: number;
  matchIndex: number;
  matchCount: number;
};

let worker: Worker | null = null;
let workerReady = false;
// In-flight build guard: prevents repeated index rebuilds when the user
// types continuously. Same messages reference is a no-op while a build
// is in flight or already ready.
let workerBuildInFlight = false;
let lastBuildMessagesRef: ClaudeMessage[] | null = null;
const pendingSearchCallbacks = new Map<
  number,
  (results: SearchResult[]) => void
>();
const pendingSearchTimeouts = new Map<number, ReturnType<typeof setTimeout>>();
const SEARCH_TIMEOUT_MS = 5000;
let searchIdCounter = 0;

// Internal: clear a pending search (cancel its timeout + delete its callback).
function resolveAndCleanupSearch(id: number, results: SearchResult[]): void {
  const callback = pendingSearchCallbacks.get(id);
  if (!callback) return;
  pendingSearchCallbacks.delete(id);
  const timer = pendingSearchTimeouts.get(id);
  if (timer != null) {
    clearTimeout(timer);
    pendingSearchTimeouts.delete(id);
  }
  callback(results);
}

// Internal: resolve every pending search with [] - used when the worker
// errors out or is cleared, so callbacks don't leak and the UI is unstuck.
function resolveAllPendingSearches(): void {
  const ids = Array.from(pendingSearchCallbacks.keys());
  for (const id of ids) {
    resolveAndCleanupSearch(id, []);
  }
}

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./searchWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === "build-complete") {
        workerReady = true;
        workerBuildInFlight = false;
        if (import.meta.env.DEV) {
          console.log(
            `[SearchIndex Worker] Index built for ${msg.count} messages`,
          );
        }
      } else if (msg.type === "search-result") {
        resolveAndCleanupSearch(msg.id, msg.results);
      }
    };
    // Resolve all pending searches on worker crash/error so the UI never
    // gets stuck in a "searching..." state.
    worker.onerror = (event) => {
      if (import.meta.env.DEV) {
        console.error("[SearchIndex Worker] Worker error:", event);
      }
      workerReady = false;
      workerBuildInFlight = false;
      resolveAllPendingSearches();
    };
    return worker;
  } catch {
    // Worker creation failed (e.g., in test environment)
    return null;
  }
}

// 편의 함수들
export const buildSearchIndex = (messages: ClaudeMessage[]): void => {
  const w = getWorker();
  if (!w) return;
  // De-dup: skip if the same messages reference is already building or built.
  if (
    lastBuildMessagesRef === messages &&
    (workerBuildInFlight || workerReady)
  ) {
    return;
  }
  workerReady = false;
  workerBuildInFlight = true;
  lastBuildMessagesRef = messages;
  // Send minimal message data to worker (avoid transferring unnecessary fields)
  const minimalMessages = messages.map((m) => ({
    uuid: m.uuid,
    type: m.type,
    content: m.content,
    toolUse: (m as unknown as Record<string, unknown>).toolUse,
    toolUseResult: (m as unknown as Record<string, unknown>).toolUseResult,
    compactMetadata: (m as unknown as Record<string, unknown>).compactMetadata,
  }));
  w.postMessage({ type: "build", messages: minimalMessages });
};

export const searchMessagesAsync = (
  query: string,
  filterType: SearchFilterType = "content",
): Promise<SearchResult[]> => {
  const w = getWorker();
  if (w && workerReady) {
    return new Promise((resolve) => {
      const id = ++searchIdCounter;
      pendingSearchCallbacks.set(id, resolve);
      // 5s safety timeout so the promise never stays pending if the worker
      // drops the message or the search hangs.
      const timer = setTimeout(() => {
        if (import.meta.env.DEV) {
          console.warn(
            `[SearchIndex Worker] Search ${id} timed out after ${SEARCH_TIMEOUT_MS}ms`,
          );
        }
        resolveAndCleanupSearch(id, []);
      }, SEARCH_TIMEOUT_MS);
      pendingSearchTimeouts.set(id, timer);
      w.postMessage({ type: "search", id, query, filterType });
    });
  }
  // Worker not ready — resolve immediately with empty (caller uses linear fallback)
  return Promise.resolve([]);
};

export const clearSearchIndex = (): void => {
  workerReady = false;
  workerBuildInFlight = false;
  lastBuildMessagesRef = null;
  // Also resolve pending searches so callbacks don't linger past the clear.
  resolveAllPendingSearches();
  // Only send clear to worker if it already exists — avoids eagerly
  // spinning up the worker on every selectSession.
  if (worker) {
    worker.postMessage({ type: "clear" });
  }
};

export const isSearchIndexReady = (): boolean => {
  return workerReady;
};

/**
 * Linear search fallback — scans all messages with String.includes.
 * Used when FlexSearch index is not yet built (pre-index stage).
 *
 * Returns results in newest-first order (descending messageIndex, then
 * descending matchIndex), matching the FlexSearch path so navigation is
 * consistent regardless of which code path is active.
 *
 * Performance: O(n) single pass, typically 50-200ms for 50k messages.
 * Recall: substring match (indexOf) — finds queries even mid-word, which
 * means the first search after session load may return more results than
 * subsequent searches through the FlexSearch "forward" index.  This gap
 * is a conscious tradeoff; see createFlexSearchIndex above.
 */
export const linearSearchMessages = (
  messages: ClaudeMessage[],
  query: string,
  filterType: SearchFilterType = "content",
): SearchResult[] => {
  if (!query.trim()) return [];
  const lowerQuery = query.toLowerCase();

  const results: SearchResult[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (!message) continue;

    const text =
      filterType === "toolId"
        ? extractToolIds(message)
        : extractSearchableText(message);

    if (!text) continue;
    const lowerText = text.toLowerCase();

    // Count all occurrences
    let count = 0;
    let pos = 0;
    while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
      count++;
      pos += lowerQuery.length;
    }

    if (count > 0) {
      for (let matchIdx = 0; matchIdx < count; matchIdx++) {
        results.push({
          messageUuid: message.uuid,
          messageIndex: i,
          matchIndex: matchIdx,
          matchCount: count,
        });
      }
    }
  }

  // Sort newest-first to match FlexSearch result order for consistent navigation
  results.sort(
    (a, b) => b.messageIndex - a.messageIndex || b.matchIndex - a.matchIndex,
  );

  return results;
};
