import { describe, expect, it } from "vitest";
import { getMessageCollapse, MESSAGE_PREVIEW_CHARS } from "./messageCollapse";

const words = (count: number) => Array.from({ length: count }, (_, i) => `word${i % 10}`).join(" ");

describe("getMessageCollapse", () => {
  it("shows a message of exactly the limit in full", () => {
    const text = "a".repeat(MESSAGE_PREVIEW_CHARS);
    expect(getMessageCollapse(text)).toEqual({ needsCollapse: false, preview: text, hiddenLineCount: 0 });
  });

  it("shows short multi-line messages in full, however many lines they have", () => {
    const text = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    expect(text.length).toBeLessThan(MESSAGE_PREVIEW_CHARS);
    expect(getMessageCollapse(text).needsCollapse).toBe(false);
  });

  it("collapses one character over the limit to at most the limit", () => {
    const text = "a".repeat(MESSAGE_PREVIEW_CHARS + 1);
    const collapse = getMessageCollapse(text);
    expect(collapse.needsCollapse).toBe(true);
    expect(collapse.preview.length).toBeLessThanOrEqual(MESSAGE_PREVIEW_CHARS);
    expect(collapse.preview.length).toBeGreaterThan(MESSAGE_PREVIEW_CHARS - 10);
  });

  it("counts characters, not UTF-16 units, and never splits an emoji", () => {
    const emoji = "😀";
    const text = emoji.repeat(MESSAGE_PREVIEW_CHARS);
    expect(text.length).toBe(MESSAGE_PREVIEW_CHARS * 2);
    expect(getMessageCollapse(text).needsCollapse).toBe(false);

    const longer = `${emoji.repeat(MESSAGE_PREVIEW_CHARS)}${emoji}`;
    const preview = getMessageCollapse(longer).preview;
    expect(preview).not.toMatch(/[\uD800-\uDBFF]$/);
    expect(Array.from(preview).every((char) => char === emoji)).toBe(true);
  });

  it("cuts at a paragraph break before the limit instead of mid-line", () => {
    const first = words(1500);
    const text = `${first}\n\n${words(1000)}`;
    expect(first.length).toBeLessThan(MESSAGE_PREVIEW_CHARS);
    expect(text.length).toBeGreaterThan(MESSAGE_PREVIEW_CHARS);
    const collapse = getMessageCollapse(text);
    expect(collapse.preview).toBe(first);
    expect(collapse.hiddenLineCount).toBe(1);
  });

  it("keeps table rows whole", () => {
    const rows = Array.from({ length: 600 }, (_, i) => `| row ${i} | value ${i} |`);
    const text = ["| a | b |", "| --- | --- |", ...rows].join("\n");
    const preview = getMessageCollapse(text, { markdown: true }).preview;
    for (const line of preview.split("\n")) {
      expect(line).toMatch(/^\|.*\|$/);
    }
  });

  it("closes a code fence the cut leaves open so the rest still renders", () => {
    const code = Array.from({ length: 800 }, (_, i) => `const value${i} = ${i};`).join("\n");
    const text = `Intro\n\n\`\`\`ts\n${code}\n\`\`\`\n\nOutro`;
    const markdown = getMessageCollapse(text, { markdown: true }).preview;
    expect(markdown.startsWith("Intro\n\n```ts\n")).toBe(true);
    expect(markdown.endsWith("\n```")).toBe(true);

    // Plain text keeps exactly what was written.
    const plain = getMessageCollapse(text).preview;
    expect(plain.endsWith("```")).toBe(false);
  });

  it("does not add a fence when the preview's fences are balanced", () => {
    const text = `\`\`\`\ncode\n\`\`\`\n\n${words(2000)}`;
    const preview = getMessageCollapse(text, { markdown: true }).preview;
    expect((preview.match(/^```/gm) ?? []).length).toBe(2);
  });

  it("closes an open display-math block", () => {
    const math = Array.from({ length: 900 }, (_, i) => `x_${i} + y_${i} \\\\`).join("\n");
    const text = `$$\n${math}\n$$`;
    const preview = getMessageCollapse(text, { markdown: true }).preview;
    expect(preview.endsWith("\n$$")).toBe(true);
  });

  it("falls back to a word break inside one very long line", () => {
    const text = words(3000);
    const preview = getMessageCollapse(text).preview;
    expect(preview.endsWith(" ")).toBe(false);
    expect(text.startsWith(preview)).toBe(true);
    expect(text.charAt(preview.length)).toBe(" ");
  });
});
