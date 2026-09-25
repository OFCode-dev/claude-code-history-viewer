/**
 * One-line summaries of user records that nobody typed (command output, task
 * notifications, harness context, interrupts, compaction summaries).
 */
import type { UserMessageKind } from "@/utils/userMessageKind";

/** Kinds rendered as a compact, muted row instead of a prompt card. */
export type SystemRecordKind = Extract<
  UserMessageKind,
  "commandOutput" | "taskNotification" | "systemContext" | "interrupt" | "compactSummary" | "empty"
> | "shellCommand";

export interface SystemRecordSummary {
  /** Short single-line preview shown next to the label ("" when there is none). */
  preview: string;
  /** Whether expanding the row reveals more than the preview. */
  expandable: boolean;
}

const PREVIEW_MAX = 160;

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

const truncate = (text: string) =>
  text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1).trimEnd()}…` : text;

const stripTags = (text: string) => text.replace(/<\/?[A-Za-z][\w-]*(?:\s[^>]*)?>/g, "\n");

const firstLine = (text: string) =>
  text.split("\n").map((line) => line.trim()).find(Boolean) ?? "";

const tagContent = (text: string, tag: string): string | null => {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match?.[1] != null ? squash(match[1]) : null;
};

/** Command output without its wrapper tags, for the expanded row. */
export const getCommandOutputBody = (text: string): string =>
  text
    .replace(/<\/?(?:local-command-(?:stdout|stderr|caveat)|bash-(?:stdout|stderr))>/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Bash-mode input (`! cmd`) is classified as a command but has no slash-command renderer. */
export const isShellCommandText = (text: string) => /^\s*<bash-input>/.test(text);

/**
 * The compact-row kind of a user record, or null when it renders some other
 * way (prompt card, slash-command card, tool result).
 */
export function toSystemRecordKind(
  kind: UserMessageKind | null,
  text: string,
): SystemRecordKind | null {
  switch (kind) {
    case "commandOutput":
    case "taskNotification":
    case "systemContext":
    case "interrupt":
    case "compactSummary":
    case "empty":
      return kind;
    case "command":
      return isShellCommandText(text) ? "shellCommand" : null;
    default:
      return null;
  }
}

export function getSystemRecordSummary(kind: SystemRecordKind, text: string): SystemRecordSummary {
  const trimmed = text.trim();
  if (kind === "empty" || !trimmed) return { preview: "", expandable: false };

  let preview: string;
  switch (kind) {
    case "taskNotification":
      preview = tagContent(trimmed, "summary") ?? tagContent(trimmed, "status") ?? "";
      break;
    case "interrupt":
      // "[Request interrupted by user for tool use]" — the label already says it.
      return {
        preview: squash(trimmed.replace(/^\[|\]$/g, "").replace(/^Request interrupted by user\s*/, "")),
        expandable: false,
      };
    case "shellCommand": {
      const command = tagContent(trimmed, "bash-input") ?? squash(stripTags(trimmed));
      preview = `$ ${command}`;
      break;
    }
    case "systemContext":
      preview = firstLine(stripTags(trimmed)).replace(/^#+\s*/, "");
      break;
    default:
      preview = firstLine(stripTags(trimmed));
  }

  preview = truncate(squash(preview));
  const plain = squash(stripTags(trimmed));
  return { preview, expandable: plain.length > 0 && plain !== preview.replace(/^\$ /, "") };
}
