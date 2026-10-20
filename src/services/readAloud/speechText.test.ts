import { describe, expect, it } from "vitest";
import { MAX_CHUNK_CHARS, toSpeechChunks } from "./speechText";
import type { SpeechCues } from "./types";

const cues: SpeechCues = {
  code: "Code.",
  table: "Table.",
  thinking: "Thinking:",
  restSkipped: "Rest skipped.",
  skipped: (n) => `${n} replies skipped.`,
};

const speak = (markdown: string, kind: "text" | "thinking" = "text") =>
  toSpeechChunks(markdown, { kind, cues });
const spoken = (markdown: string, kind: "text" | "thinking" = "text") =>
  speak(markdown, kind)
    .map((c) => c.text)
    .join(" ");

describe("toSpeechChunks", () => {
  it("returns [] for empty or blank input", () => {
    expect(speak("")).toEqual([]);
    expect(speak("  \n\n ")).toEqual([]);
  });

  it("turns a fence into one cue-only chunk and never speaks code", () => {
    const chunks = speak("Before.\n\n```ts\nconst secret = 1;\n```\n\nAfter.");
    expect(chunks.map((c) => c.text)).toEqual(["Before.", "Code.", "After."]);
    expect(chunks[1]?.body).toBe("");
    expect(spoken("```\nconst secret = 1;\n```")).not.toContain("secret");
  });

  it("turns a table into a cue", () => {
    expect(spoken("| a | b |\n|---|---|\n| 1 | 2 |")).toBe("Table.");
  });

  it("speaks a link's label and a bare URL's host", () => {
    expect(spoken("Read [the docs](https://example.com/docs) now.")).toBe("Read the docs now.");
    expect(spoken("See https://www.example.com/a/b?x=1 for details.")).toBe("See example.com for details.");
  });

  it("keeps short inline code and replaces long inline code with the cue", () => {
    expect(spoken("Run `pnpm lint` first.")).toBe("Run pnpm lint first.");
    const chunk = speak("Run `pnpm exec vitest run src/services --reporter=verbose` first.")[0];
    expect(chunk?.text).toBe("Run Code. first.");
    expect(chunk?.body).toBe("Run first.");
  });

  it("reads paths as their basename", () => {
    expect(spoken("Edited src/services/readAloud/engine.ts and /home/x/y/tail.rs today.")).toBe(
      "Edited engine.ts and tail.rs today.",
    );
    expect(spoken("Use `src/store/persist.ts` here.")).toBe("Use persist.ts here.");
  });

  it("leaves slash words and numbers alone", () => {
    expect(spoken("Pick and/or skip 1/2 of 2026/10/20.")).toBe("Pick and/or skip 1/2 of 2026/10/20.");
  });

  it("drops XML-like wrapper blocks and strips inline tags", () => {
    expect(spoken("<system-reminder>\nsecret stuff\n</system-reminder>\n\nHello.")).toBe("Hello.");
    expect(spoken("Press <kbd>K</kbd> now.")).toBe("Press K now.");
  });

  it("strips markdown emphasis and heading markers", () => {
    expect(spoken("# Title\n\n**bold** and _em_ and ~~del~~.")).toBe("Title. bold and em and del.");
  });

  it("recurses into lists and blockquotes", () => {
    const text = spoken("- one\n- two\n  - nested deep\n\n> quoted line");
    expect(text).toContain("one.");
    expect(text).toContain("nested deep.");
    expect(text).toContain("quoted line");
    expect(text).not.toMatch(/[-*>]/);
  });

  it("splits a long paragraph into chunks on sentence boundaries", () => {
    const sentence = "This sentence is exactly about sixty characters long, yes.";
    const paragraph = Array.from({ length: 10 }, () => sentence).join(" ");
    const chunks = speak(paragraph);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
      expect(chunk.text.endsWith("yes.")).toBe(true);
    }
    expect(chunks.map((c) => c.text).join(" ")).toBe(paragraph);
  });

  it("splits an over-long sentence at the last whitespace within the limit", () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const chunks = speak(words);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
      expect(chunk.text).not.toMatch(/^\s|\s$/);
    }
    expect(chunks.map((c) => c.text).join(" ")).toBe(`${words}.`);
  });

  it("hard-splits text without whitespace", () => {
    const chunks = speak("字".repeat(450));
    expect(chunks.map((c) => c.text.length)).toEqual([200, 200, 50]);
  });

  it("prefixes only the first chunk of a thinking block", () => {
    const sentence = "Thinking about the next step in some detail here.";
    const chunks = speak(Array.from({ length: 8 }, () => sentence).join(" "), "thinking");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.text.startsWith("Thinking: ")).toBe(true);
    expect(chunks[0]?.body.startsWith("Thinking")).toBe(true);
    expect(chunks[0]?.body).not.toContain("Thinking:");
    expect(chunks.slice(1).every((c) => !c.text.startsWith("Thinking:"))).toBe(true);
  });

  it("keeps the cue prefix out of the body of a cue-only first thinking chunk", () => {
    const [first] = speak("```\nx\n```", "thinking");
    expect(first).toEqual({ text: "Thinking: Code.", body: "" });
  });

  it("drops a block that has no speakable content", () => {
    expect(speak("---\n\n<div>\nraw\n</div>")).toEqual([]);
  });
});
