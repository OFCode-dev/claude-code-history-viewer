import { describe, expect, it } from "vitest";
import { detectExternalInvocation } from "./externalCommand";

describe("detectExternalInvocation", () => {
  it("detects codex exec with file prompt behind timeout", () => {
    expect(
      detectExternalInvocation(
        'timeout 900 codex exec -m gpt-6.1-sol "$(cat review-prompt.md)"'
      )
    ).toEqual({
      kind: "ai-cli",
      engine: "codex",
      model: "gpt-6.1-sol",
      prompt: { source: "file", value: "review-prompt.md" },
    });
  });

  it("detects agy with stream-json and piped stdin behind timeout", () => {
    expect(
      detectExternalInvocation(
        'printf \'%s\' "$PROMPT" | timeout 600 agy --input-format stream-json --model gemini-3.1-pro -p= | tail -1'
      )
    ).toEqual({
      kind: "ai-cli",
      engine: "agy",
      model: "gemini-3.1-pro",
      prompt: { source: "stdin" },
    });
  });

  it("detects claude with redirect file overriding inline prompt", () => {
    expect(
      detectExternalInvocation('claude -p "Summarise the diff" --model haiku < diff.patch')
    ).toEqual({
      kind: "ai-cli",
      engine: "claude",
      model: "haiku",
      prompt: { source: "file", value: "diff.patch" },
    });
  });

  it("detects python bridge listener", () => {
    expect(detectExternalInvocation("python3 -u ~/bin/tg_listen.py --chat owner")).toEqual({
      kind: "bridge",
      bridge: { name: "telegram", direction: "listen" },
    });
  });

  it("detects direct telegram sender script", () => {
    expect(detectExternalInvocation("~/projects/x/bin/tg_send.py --silent --to X")).toEqual({
      kind: "bridge",
      bridge: { name: "telegram", direction: "send" },
    });
  });

  it("ignores engine words inside echoed text", () => {
    expect(detectExternalInvocation("echo 'codex exec --model example hello'")).toBeNull();
  });

  it("ignores engine words passed to other executables", () => {
    expect(detectExternalInvocation("rg -n 'claude -p' docs/ && cat codex.py")).toBeNull();
  });

  it("ignores claude without a print marker", () => {
    expect(detectExternalInvocation("claude --version")).toBeNull();
  });

  it("detects codex exec with a leading assignment and inline prompt", () => {
    expect(detectExternalInvocation('OPENAI_KEY=abc codex exec "hi"')).toEqual({
      kind: "ai-cli",
      engine: "codex",
      prompt: { source: "inline", value: "hi" },
    });
  });

  it("skips codex option values before the prompt", () => {
    expect(
      detectExternalInvocation('codex exec -C /repo -c mode=fast --model gpt-6.1-sol "hi"')
    ).toEqual({
      kind: "ai-cli",
      engine: "codex",
      model: "gpt-6.1-sol",
      prompt: { source: "inline", value: "hi" },
    });
  });

  it("honors the codex option terminator", () => {
    expect(detectExternalInvocation('codex exec -- "--model=literal"')).toEqual({
      kind: "ai-cli",
      engine: "codex",
      prompt: { source: "inline", value: "--model=literal" },
    });
  });

  it("keeps single-quoted command substitution literal", () => {
    expect(detectExternalInvocation("codex exec '$(cat review-prompt.md)'")).toEqual({
      kind: "ai-cli",
      engine: "codex",
      prompt: { source: "inline", value: "$(cat review-prompt.md)" },
    });
  });

  it("does not infer stdin from agy -p= without a pipe", () => {
    expect(detectExternalInvocation("agy -p=")).toEqual({
      kind: "ai-cli",
      engine: "agy",
    });
  });

  it("detects an agy file redirect immediately after the print marker", () => {
    expect(detectExternalInvocation("agy --model=gemini-3.1-pro -p <review-prompt.md")).toEqual({
      kind: "ai-cli",
      engine: "agy",
      model: "gemini-3.1-pro",
      prompt: { source: "file", value: "review-prompt.md" },
    });
  });

  it("keeps a quoted redirect character as inline prompt text", () => {
    expect(detectExternalInvocation('claude -p "<" --model haiku')).toEqual({
      kind: "ai-cli",
      engine: "claude",
      model: "haiku",
      prompt: { source: "inline", value: "<" },
    });
  });

  it("ignores quoted separators and returns the first detected segment", () => {
    expect(
      detectExternalInvocation(
        'echo "ignored | text"; /home/x/.local/bin/codex exec --model=example "a | b; c && d || e" && agy -p later'
      )
    ).toEqual({
      kind: "ai-cli",
      engine: "codex",
      model: "example",
      prompt: { source: "inline", value: "a | b; c && d || e" },
    });
  });

  it("detects a teams bridge behind a timeout with a signal", () => {
    expect(
      detectExternalInvocation("MODE=test timeout -s TERM 2m python3 ~/bin/teams_send.py")
    ).toEqual({
      kind: "bridge",
      bridge: { name: "teams", direction: "send" },
    });
  });

  it("ignores invocation text inside a heredoc body", () => {
    expect(detectExternalInvocation("cat <<'EOF'\ncodex exec hidden\nEOF")).toBeNull();
  });

  it("preserves variable text and limits inline previews to 200 characters", () => {
    const text = "$PROMPT" + "x".repeat(201);
    expect(detectExternalInvocation(`codex exec "${text}"`)).toEqual({
      kind: "ai-cli",
      engine: "codex",
      prompt: { source: "inline", value: text.slice(0, 200) },
    });
  });

  it("detects codex stdin when a pipe supplies the missing prompt", () => {
    expect(detectExternalInvocation("printf hi | codex exec")).toEqual({
      kind: "ai-cli",
      engine: "codex",
      prompt: { source: "stdin" },
    });
  });
});
