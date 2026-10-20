/**
 * Markdown → speakable chunks (pure).
 *
 * Code fences and tables become a short cue instead of being read; links read
 * their label, bare URLs their host, paths their basename; XML-like wrapper
 * blocks are dropped. Text is split on sentence boundaries into chunks of at
 * most MAX_CHUNK_CHARS so each utterance stays short (Chrome cuts long ones).
 */

import { Lexer, type Token, type Tokens } from "marked";
import type { SpeechChunk, SpeechCues, TailBlockKind } from "./types";

export const MAX_CHUNK_CHARS = 200;
const MAX_INLINE_CODE_CHARS = 30;

/** Stands in for an inline code cue until a chunk is emitted (private-use char). */
const CODE_MARK = "";

type Element = { type: "text"; text: string } | { type: "cue"; text: string };

export interface SpeechTextOptions {
  kind: TailBlockKind;
  cues: SpeechCues;
}

const PATH_RE = /(?<![\w@.~/-])(?:~|\.{1,2})?\/?(?:[\w.@-]+\/)+[\w.@-]*/g;
const FILE_EXT_RE = /\.[A-Za-z]\w{0,7}\.?$/;

/** Replace path-like tokens with their basename; leave "and/or", "1/2" and dates alone. */
function pathToBasename(text: string): string {
  return text.replace(PATH_RE, (match) => {
    const segments = match.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last == null || segments.length < 2 || !/[A-Za-z]/.test(match)) return match;
    const absolute = /^[~./]/.test(match);
    return absolute || segments.length >= 3 || FILE_EXT_RE.test(last) ? last : match;
  });
}

function urlHost(href: string, fallback: string): string {
  try {
    return new URL(href).host.replace(/^www\./, "") || fallback;
  } catch {
    return fallback;
  }
}

function inlineText(tokens: readonly Token[] | undefined): string {
  if (!tokens) return "";
  return tokens.map(inlineToken).join("");
}

function inlineToken(token: Token): string {
  switch (token.type) {
    case "text": {
      const t = token as Tokens.Text;
      return t.tokens ? inlineText(t.tokens) : pathToBasename(t.text);
    }
    case "escape":
      return (token as Tokens.Escape).text;
    case "codespan": {
      const code = (token as Tokens.Codespan).text;
      return code.length <= MAX_INLINE_CODE_CHARS ? pathToBasename(code) : CODE_MARK;
    }
    case "link": {
      const link = token as Tokens.Link;
      const label = inlineText(link.tokens);
      const bare = label === link.href || /^(https?:\/\/|www\.)/i.test(label);
      return bare ? urlHost(link.href, label) : label;
    }
    case "br":
      return " ";
    case "image":
    case "html":
      return "";
    default:
      return "tokens" in token && Array.isArray(token.tokens) ? inlineText(token.tokens) : "";
  }
}

/** Latin/Cyrillic/Greek text without final punctuation gets a period so the voice pauses. */
function terminate(text: string): string {
  return /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{N}]$/u.test(text) ? `${text}.` : text;
}

function pushText(out: Element[], raw: string): void {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return;
  out.push({ type: "text", text: terminate(text) });
}

function collect(tokens: readonly Token[], cues: SpeechCues, out: Element[]): void {
  for (const token of tokens) {
    switch (token.type) {
      case "code":
        out.push({ type: "cue", text: cues.code });
        break;
      case "table":
        out.push({ type: "cue", text: cues.table });
        break;
      case "heading":
      case "paragraph":
        pushText(out, inlineText((token as Tokens.Heading | Tokens.Paragraph).tokens));
        break;
      case "text": {
        const t = token as Tokens.Text;
        pushText(out, t.tokens ? inlineText(t.tokens) : pathToBasename(t.text));
        break;
      }
      case "list":
        for (const item of (token as Tokens.List).items) collect(item.tokens, cues, out);
        break;
      case "space":
      case "hr":
      case "html":
      case "def":
      case "checkbox":
        break;
      default:
        if ("tokens" in token && Array.isArray(token.tokens)) collect(token.tokens, cues, out);
    }
  }
}

let segmenter: Intl.Segmenter | null | undefined;

function splitSentences(text: string): string[] {
  if (segmenter === undefined) {
    segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl
      ? new Intl.Segmenter(undefined, { granularity: "sentence" })
      : null;
  }
  const parts = segmenter
    ? Array.from(segmenter.segment(text), (s) => s.segment)
    : text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [text];
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Split an over-long sentence at the last whitespace within the limit (hard cut if none). */
function splitLong(sentence: string): string[] {
  const pieces: string[] = [];
  let rest = sentence;
  while (rest.length > MAX_CHUNK_CHARS) {
    const window = rest.slice(0, MAX_CHUNK_CHARS + 1);
    const cut = window.lastIndexOf(" ");
    const end = cut > 0 ? cut : MAX_CHUNK_CHARS;
    pieces.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

function toChunk(text: string, cueText: string): SpeechChunk {
  return {
    text: text.split(CODE_MARK).join(cueText),
    body: text.split(CODE_MARK).join("").replace(/\s+/g, " ").trim(),
  };
}

/** Turn one assistant content block into utterance-sized chunks. */
export function toSpeechChunks(markdown: string, { kind, cues }: SpeechTextOptions): SpeechChunk[] {
  if (!markdown.trim()) return [];
  const elements: Element[] = [];
  collect(new Lexer({ gfm: true }).lex(markdown), cues, elements);

  const chunks: SpeechChunk[] = [];
  let current = "";
  const flush = () => {
    if (current) chunks.push(toChunk(current, cues.code));
    current = "";
  };

  for (const element of elements) {
    if (element.type === "cue") {
      flush();
      chunks.push({ text: element.text, body: "" });
      continue;
    }
    for (const sentence of splitSentences(element.text)) {
      if (sentence.length > MAX_CHUNK_CHARS) {
        flush();
        for (const piece of splitLong(sentence)) chunks.push(toChunk(piece, cues.code));
      } else if (current && current.length + 1 + sentence.length > MAX_CHUNK_CHARS) {
        flush();
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }
  }
  flush();

  const first = chunks[0];
  if (kind === "thinking" && first) {
    chunks[0] = { text: `${cues.thinking} ${first.text}`, body: first.body };
  }
  return chunks;
}
