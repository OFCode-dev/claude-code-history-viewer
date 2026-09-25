/**
 * Collapsed view of a long human prompt.
 *
 * Long prompts are usually pasted context followed by the actual question.
 * Folding them to their first lines would hide the question, so when the
 * prompt ends in a short closing paragraph the collapsed view keeps a few
 * leading lines, an ellipsis and that closing paragraph.
 */
import { getPromptPreview } from "@/utils/userMessageKind";

/** Collapse when a prompt has more lines than this… */
export const PROMPT_LINE_LIMIT = 12;
/** …or more characters than this. */
export const PROMPT_CHAR_LIMIT = 1200;
/** Leading lines kept above the ellipsis when the closing question is shown. */
const HEAD_LINES_WITH_TAIL = 6;
/**
 * Characters kept in the collapsed view. Half the trigger, so collapsing a
 * prompt that is just over the limit still saves a meaningful amount of space.
 */
export const PROMPT_HEAD_CHARS = 600;

export interface PromptCollapse {
  needsCollapse: boolean;
  /** Text shown above the ellipsis (the whole prompt when nothing collapses). */
  head: string;
  /** Closing question shown below the ellipsis, when the prompt ends in one. */
  tail: string | null;
  /** Source lines hidden by the collapsed view. */
  hiddenLineCount: number;
}

function capChars(text: string, limit: number): { text: string; capped: boolean } {
  if (text.length <= limit) return { text, capped: false };
  return { text: `${text.slice(0, limit).trimEnd()}…`, capped: true };
}

/** Index just past the last blank-line paragraph separator, or -1. */
function lastParagraphSeparator(text: string): { start: number; end: number } | null {
  let found: { start: number; end: number } | null = null;
  for (const match of text.matchAll(/\n\s*\n/g)) {
    found = { start: match.index, end: match.index + match[0].length };
  }
  return found;
}

export function getPromptCollapse(text: string): PromptCollapse {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const needsCollapse =
    lines.length > PROMPT_LINE_LIMIT || normalized.length > PROMPT_CHAR_LIMIT;
  if (!needsCollapse) {
    return { needsCollapse: false, head: text, tail: null, hiddenLineCount: 0 };
  }

  if (getPromptPreview(normalized).fromTail) {
    // Same paragraph split as getPromptPreview: over the trimmed text.
    const trimmed = normalized.trim();
    const separator = lastParagraphSeparator(trimmed);
    if (separator) {
      const before = trimmed.slice(0, separator.start);
      const tail = trimmed.slice(separator.end).trim();
      const beforeLines = before.split("\n");
      const headLines = beforeLines.slice(0, HEAD_LINES_WITH_TAIL);
      const head = capChars(headLines.join("\n").trimEnd(), PROMPT_HEAD_CHARS);
      const hiddenLineCount = beforeLines.length - headLines.length;
      // Nothing between head and tail would be hidden: show the prompt whole.
      if (hiddenLineCount > 0 || head.capped) {
        return { needsCollapse: true, head: head.text, tail, hiddenLineCount };
      }
      return { needsCollapse: false, head: text, tail: null, hiddenLineCount: 0 };
    }
  }

  const headLines = lines.slice(0, PROMPT_LINE_LIMIT);
  const head = capChars(headLines.join("\n").trimEnd(), PROMPT_HEAD_CHARS);
  return {
    needsCollapse: true,
    head: head.text,
    tail: null,
    hiddenLineCount: lines.length - headLines.length,
  };
}
