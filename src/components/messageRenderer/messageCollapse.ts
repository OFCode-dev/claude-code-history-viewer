/**
 * Collapsed view of a long message: its first MESSAGE_PREVIEW_CHARS characters.
 *
 * A message at or under the limit is shown whole. A longer one is cut at the
 * last paragraph or line break before the limit, so Markdown blocks (table
 * rows, list items, headings) are never split mid-line. For Markdown, a code
 * fence or display-math block left open by the cut is closed, so the partial
 * block still renders as code or math instead of swallowing what follows.
 */

/** Characters a collapsed message shows; anything at or under it shows whole. */
export const MESSAGE_PREVIEW_CHARS = 10_000;

/** How far before the limit a paragraph or line break is still preferred. */
const BREAK_LOOKBACK = 2_000;
/** Inside one very long line, how far back a space is still preferred. */
const WORD_LOOKBACK = 200;

export interface MessageCollapse {
  needsCollapse: boolean;
  /** Text shown while collapsed (the whole text when nothing collapses). */
  preview: string;
  /** Source lines after the preview (0 when nothing collapses). */
  hiddenLineCount: number;
}

export interface MessageCollapseOptions {
  /** The text renders as Markdown: close blocks the cut leaves open. */
  markdown?: boolean;
  limit?: number;
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * UTF-16 index just past the first `limit` characters (code points), or -1
 * when the text has no more than `limit` characters.
 */
function indexAfterChars(text: string, limit: number): number {
  // A string never has more code points than UTF-16 units.
  if (text.length <= limit) return -1;
  let chars = 0;
  for (let index = 0; index < text.length; index++) {
    if (
      isHighSurrogate(text.charCodeAt(index)) &&
      index + 1 < text.length &&
      isLowSurrogate(text.charCodeAt(index + 1))
    ) {
      index++;
    }
    chars++;
    if (chars === limit) return index + 1 < text.length ? index + 1 : -1;
  }
  return -1;
}

/** Index to cut at: a paragraph break, else a line break, else a space, near `hardCut`. */
function chooseCut(text: string, hardCut: number): number {
  const paragraph = text.lastIndexOf("\n\n", hardCut - 1);
  if (paragraph > 0 && hardCut - paragraph <= BREAK_LOOKBACK) return paragraph;
  const line = text.lastIndexOf("\n", hardCut - 1);
  if (line > 0 && hardCut - line <= BREAK_LOOKBACK) return line;
  const space = text.lastIndexOf(" ", hardCut - 1);
  if (space > 0 && hardCut - space <= WORD_LOOKBACK) return space;
  return hardCut;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;

/** Close a code fence or `$$` math block that is still open at the end of `preview`. */
function closeOpenBlocks(preview: string): string {
  let openFence: string | null = null;
  let mathOpen = false;
  for (const line of preview.split("\n")) {
    if (openFence) {
      const close = line.match(FENCE_CLOSE)?.[1];
      if (close && close[0] === openFence[0] && close.length >= openFence.length) {
        openFence = null;
      }
      continue;
    }
    const open = line.match(FENCE_OPEN)?.[1];
    if (open) {
      openFence = open;
      continue;
    }
    if (line.trim() === "$$") mathOpen = !mathOpen;
  }
  if (openFence) return `${preview}\n${openFence}`;
  if (mathOpen) return `${preview}\n$$`;
  return preview;
}

export function getMessageCollapse(
  text: string,
  { markdown = false, limit = MESSAGE_PREVIEW_CHARS }: MessageCollapseOptions = {}
): MessageCollapse {
  const hardCut = indexAfterChars(text, limit);
  if (hardCut < 0) {
    return { needsCollapse: false, preview: text, hiddenLineCount: 0 };
  }

  const cut = chooseCut(text, hardCut);
  const head = text.slice(0, cut).trimEnd();
  const rest = text.slice(cut).replace(/^\s*\n/, "");
  const hiddenLineCount = rest.length > 0 ? rest.split("\n").length : 0;
  return {
    needsCollapse: true,
    preview: markdown ? closeOpenBlocks(head) : head,
    hiddenLineCount,
  };
}
