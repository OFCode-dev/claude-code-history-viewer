import { describe, expect, it } from "vitest";
import { getPromptCollapse, PROMPT_CHAR_LIMIT, PROMPT_HEAD_CHARS, PROMPT_LINE_LIMIT } from "./promptCollapse";

const numberedLines = (count: number, prefix = "line") =>
  Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`).join("\n");

describe("getPromptCollapse", () => {
  it("leaves short prompts alone", () => {
    const text = "Why does the build fail on CI?";
    expect(getPromptCollapse(text)).toEqual({
      needsCollapse: false,
      head: text,
      tail: null,
      hiddenLineCount: 0,
    });
  });

  it("does not collapse a prompt at exactly the line limit", () => {
    expect(getPromptCollapse(numberedLines(PROMPT_LINE_LIMIT)).needsCollapse).toBe(false);
  });

  it("folds a prompt with too many lines to its first lines", () => {
    const result = getPromptCollapse(numberedLines(PROMPT_LINE_LIMIT + 3));
    expect(result.needsCollapse).toBe(true);
    expect(result.head).toBe(numberedLines(PROMPT_LINE_LIMIT));
    expect(result.tail).toBeNull();
    expect(result.hiddenLineCount).toBe(3);
  });

  it("folds a single very long line by characters", () => {
    const text = "x".repeat(PROMPT_CHAR_LIMIT + 300);
    const result = getPromptCollapse(text);
    expect(result.needsCollapse).toBe(true);
    expect(result.head).toBe(`${"x".repeat(PROMPT_HEAD_CHARS)}…`);
    expect(result.tail).toBeNull();
    expect(result.hiddenLineCount).toBe(0);
  });

  it("keeps the closing question of pasted context visible", () => {
    const context = numberedLines(30, "log output");
    const question = "Which of these errors should I fix first?";
    const result = getPromptCollapse(`${context}\n\n${question}\n`);
    expect(result.needsCollapse).toBe(true);
    expect(result.head).toBe(numberedLines(6, "log output"));
    expect(result.tail).toBe(question);
    expect(result.hiddenLineCount).toBe(24);
  });

  it("caps the head by characters when the pasted context is one long line", () => {
    const context = "y".repeat(1500);
    const question = "Can you summarise this?";
    const result = getPromptCollapse(`${context}\n\n${question}`);
    expect(result.needsCollapse).toBe(true);
    expect(result.head).toBe(`${"y".repeat(600)}…`);
    expect(result.tail).toBe(question);
  });

  it("handles Windows line endings", () => {
    const text = `${numberedLines(20, "row of pasted log output").replace(/\n/g, "\r\n")}\r\n\r\nWhat went wrong here?`;
    const result = getPromptCollapse(text);
    expect(result.tail).toBe("What went wrong here?");
    expect(result.head).toBe(numberedLines(6, "row of pasted log output"));
  });

  it("falls back to the leading lines when the prompt ends in a code block", () => {
    const text = `${numberedLines(20)}\n\n\`\`\`\nconst x = 1;\n\`\`\``;
    const result = getPromptCollapse(text);
    expect(result.tail).toBeNull();
    expect(result.head).toBe(numberedLines(PROMPT_LINE_LIMIT));
  });
});
