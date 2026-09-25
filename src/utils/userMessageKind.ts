/**
 * Classifies `type: "user"` records.
 *
 * Most user records are not something a person typed: tool results, slash
 * command echoes and their output, background-task notifications, harness
 * context (e.g. Codex's injected AGENTS.md block), interrupts and compaction
 * summaries all arrive as user records. Only `"prompt"` is a human turn — the
 * anchor used by the dialogue view, the prompts navigator and turn numbering.
 *
 * `isMeta` records (skill expansions, subagent hand-backs, caveats) never reach
 * the frontend: the backend drops them while loading a session.
 */
import type { ClaudeMessage } from "@/types";

export type UserMessageKind =
  | "prompt"
  | "toolResult"
  | "command"
  | "commandOutput"
  | "taskNotification"
  | "systemContext"
  | "interrupt"
  | "compactSummary"
  | "empty";

const PREFIX_RULES: ReadonlyArray<readonly [RegExp, UserMessageKind]> = [
  [/^<command-(?:name|message|args)>/, "command"],
  [/^<bash-input>/, "command"],
  [/^<local-command-(?:stdout|stderr|caveat)>/, "commandOutput"],
  [/^<bash-(?:stdout|stderr)>/, "commandOutput"],
  [/^<task-notification>/, "taskNotification"],
  [/^<system-reminder>/, "systemContext"],
  [/^<user-prompt-submit-hook>/, "systemContext"],
  [/^# AGENTS\.md instructions/, "systemContext"],
  [/^<user_instructions>/, "systemContext"],
  [/^<environment_context>/, "systemContext"],
  [/^\[Request interrupted by user/, "interrupt"],
  [/^This session is being continued from a previous conversation/, "compactSummary"],
];

interface ContentBlockLike {
  type?: unknown;
  text?: unknown;
}

function contentBlocks(message: ClaudeMessage): ContentBlockLike[] | null {
  const { content } = message;
  if (!Array.isArray(content)) return null;
  return (content as unknown[]).filter(
    (block): block is ContentBlockLike => block != null && typeof block === "object"
  );
}

/** Plain text of a user record: the string content, or its text blocks joined. */
export function getUserMessageText(message: ClaudeMessage): string {
  const { content } = message;
  if (typeof content === "string") return content;
  const blocks = contentBlocks(message);
  if (!blocks) return "";
  return blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");
}

export function getUserMessageKind(message: ClaudeMessage): UserMessageKind | null {
  if (message.type !== "user") return null;

  const blocks = contentBlocks(message);
  if (blocks?.some((block) => block.type === "tool_result")) return "toolResult";

  const text = getUserMessageText(message).trimStart();
  for (const [pattern, kind] of PREFIX_RULES) {
    if (pattern.test(text)) return kind;
  }

  if (text.trim()) return "prompt";
  // A pasted image with no text is still something the person sent.
  if (blocks?.some((block) => block.type === "image")) return "prompt";
  return "empty";
}

export function isHumanPrompt(message: ClaudeMessage): boolean {
  return getUserMessageKind(message) === "prompt";
}

export interface PromptPreview {
  text: string;
  /**
   * True when the preview is the prompt's closing paragraph: long prompts are
   * usually pasted context followed by the actual question, and the question
   * is what identifies the turn.
   */
  fromTail: boolean;
}

const LONG_PROMPT_CHARS = 400;
const MAX_TAIL_CHARS = 280;

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export function getPromptPreview(text: string, maxLength = 160): PromptPreview {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return { text: "", fromTail: false };

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const last = paragraphs[paragraphs.length - 1] ?? "";

  if (
    normalized.length > LONG_PROMPT_CHARS &&
    paragraphs.length >= 2 &&
    last.length <= MAX_TAIL_CHARS &&
    !/^```/.test(last)
  ) {
    return { text: truncate(squash(last), maxLength), fromTail: true };
  }

  const firstLine = normalized.split("\n").find((line) => line.trim()) ?? "";
  return { text: truncate(squash(firstLine), maxLength), fromTail: false };
}
