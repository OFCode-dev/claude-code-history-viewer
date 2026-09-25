/**
 * Prompts mode of the message navigator: one entry per human prompt (a turn),
 * with the question it asked, how many records the turn produced and the
 * subagents it spawned.
 *
 * Pure functions so the list can be tested without rendering.
 */
import type { ClaudeMessage } from "../../types";
import { buildTurnAnchors } from "../../utils/turns";
import { getPromptPreview, getUserMessageText } from "../../utils/userMessageKind";
import { isNavigatorNoise } from "./useNavigatorEntries";

/** Tool names whose `tool_use` starts a subagent. */
const SUBAGENT_TOOL_NAMES = new Set(["Agent", "Task"]);

const PREVIEW_MAX_LENGTH = 160;

export interface PromptSpawn {
  /** `tool_use` block id. */
  toolUseId: string;
  /** Assistant message holding the tool call — the scroll target. */
  messageUuid: string;
  /** Tool input `description`, falling back to the agent type or tool name. */
  label: string;
}

export interface PromptEntry {
  uuid: string;
  /** 1-based turn number within the list the entries were built from. */
  turnNumber: number;
  timestamp: string;
  /** The prompt's question (see `getPromptPreview`). */
  preview: string;
  /** True when `preview` is the closing paragraph of a longer prompt. */
  fromTail: boolean;
  /** Full prompt text, lower-cased, for the navigator's text filter. */
  searchText: string;
  /** Non-noise records after the prompt, up to the next prompt. */
  steps: number;
  spawns: PromptSpawn[];
}

export type PromptListRow =
  | { kind: "prompt"; key: string; entry: PromptEntry }
  | { kind: "spawn"; key: string; entry: PromptEntry; spawn: PromptSpawn };

interface ToolUseLike {
  type?: unknown;
  id?: unknown;
  name?: unknown;
  input?: unknown;
}

function spawnLabel(block: ToolUseLike, fallback: string): string {
  const input =
    block.input != null && typeof block.input === "object"
      ? (block.input as Record<string, unknown>)
      : {};
  for (const key of ["description", "subagent_type"] as const) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

/** Subagent `tool_use` blocks (`Agent` / `Task`) in an assistant record. */
export function getSubagentSpawns(message: ClaudeMessage): PromptSpawn[] {
  if (message.type !== "assistant" || !Array.isArray(message.content)) return [];
  const spawns: PromptSpawn[] = [];
  (message.content as unknown[]).forEach((raw, blockIndex) => {
    if (raw == null || typeof raw !== "object") return;
    const block = raw as ToolUseLike;
    if (block.type !== "tool_use" || typeof block.name !== "string") return;
    if (!SUBAGENT_TOOL_NAMES.has(block.name)) return;
    spawns.push({
      toolUseId:
        typeof block.id === "string" && block.id
          ? block.id
          : `${message.uuid}:${blockIndex}`,
      messageUuid: message.uuid,
      label: spawnLabel(block, block.name),
    });
  });
  return spawns;
}

export function buildPromptEntries(messages: readonly ClaudeMessage[]): PromptEntry[] {
  const anchors = buildTurnAnchors(messages);
  return anchors.map((anchor, position) => {
    const end = anchors[position + 1]?.messageIndex ?? messages.length;
    const prompt = messages[anchor.messageIndex]!;
    const text = getUserMessageText(prompt);
    const preview = getPromptPreview(text, PREVIEW_MAX_LENGTH);

    let steps = 0;
    const spawns: PromptSpawn[] = [];
    for (let index = anchor.messageIndex + 1; index < end; index++) {
      const message = messages[index]!;
      if (isNavigatorNoise(message)) continue;
      steps++;
      spawns.push(...getSubagentSpawns(message));
    }

    return {
      uuid: anchor.uuid,
      turnNumber: anchor.turnNumber,
      timestamp: anchor.timestamp,
      preview: preview.text,
      fromTail: preview.fromTail,
      searchText: text.toLowerCase(),
      steps,
      spawns,
    };
  });
}

/**
 * Rows of the virtualized prompts list: each prompt followed by its spawn
 * markers. A text filter keeps prompts whose text or spawn labels match.
 */
export function buildPromptListRows(
  entries: readonly PromptEntry[],
  filterText = ""
): PromptListRow[] {
  const needle = filterText.trim().toLowerCase();
  const rows: PromptListRow[] = [];
  for (const entry of entries) {
    if (
      needle &&
      !entry.searchText.includes(needle) &&
      !entry.spawns.some((spawn) => spawn.label.toLowerCase().includes(needle))
    ) {
      continue;
    }
    rows.push({ kind: "prompt", key: entry.uuid, entry });
    for (const spawn of entry.spawns) {
      rows.push({ kind: "spawn", key: `${entry.uuid}:${spawn.toolUseId}`, entry, spawn });
    }
  }
  return rows;
}
