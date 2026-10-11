/**
 * Detects external CLI invocations and prompt sources without running shell commands.
 */
export interface ExternalInvocation {
  kind: "ai-cli" | "bridge";
  engine?: "codex" | "agy" | "claude";
  model?: string;
  /** Where the prompt comes from, for the label "Prompt · File: review-prompt.md". */
  prompt?: { source: "inline" | "file" | "stdin"; value?: string };
  bridge?: { name: "telegram" | "teams"; direction: "send" | "listen" };
}

interface Token {
  value: string;
  raw: string;
}

interface Segment {
  tokens: Token[];
  isPiped: boolean;
}

const CODEX_VALUE_OPTIONS = new Set([
  "-c", "--config", "-C", "--cd", "-s", "--sandbox",
  "-o", "--output-last-message", "-i", "--image", "-p", "--profile",
  "--color", "--output-schema", "--local-provider", "--add-dir",
]);

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function scanSegments(command: string): Segment[] {
  const text = command.includes("<<") ? command.split(/\r?\n/)[0] ?? "" : command;
  const segments: Segment[] = [];
  let tokens: Token[] = [];
  let isPiped = false;
  let raw = "";
  let value = "";
  let quote = "";

  function finishToken(): void {
    if (raw) tokens.push({ value, raw });
    raw = "";
    value = "";
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? "";
    const next = text[i + 1] ?? "";
    if (ch === "\\" && quote !== "'" && next) {
      raw += ch + next;
      value += quote === '"' && !/["\\$`]/.test(next) ? ch + next : next;
      i++;
    } else if (quote) {
      raw += ch;
      if (ch === quote) quote = "";
      else value += ch;
    } else if (ch === "'" || ch === '"') {
      raw += ch;
      quote = ch;
    } else if (/\s/.test(ch)) {
      finishToken();
    } else if (ch === "|" || ch === ";" || (ch === "&" && next === "&")) {
      finishToken();
      segments.push({ tokens, isPiped });
      tokens = [];
      isPiped = ch === "|" && next !== "|";
      if ((ch === "|" || ch === "&") && next === ch) i++;
    } else {
      raw += ch;
      value += ch;
    }
  }
  finishToken();
  segments.push({ tokens, isPiped });
  return segments;
}

function promptFromToken(token: Token): ExternalInvocation["prompt"] {
  if (token.value === "-") return { source: "stdin" };
  const file = token.raw.startsWith('"$(') && token.raw.endsWith('"')
    ? /^\$\(\s*cat\s+("[^"]+"|'[^']+'|[^\s;|&<>]+)\s*\)$/.exec(token.value)
    : null;
  if (file) {
    return { source: "file", value: (file[1] ?? "").replace(/^(['"])(.*)\1$/, "$2") };
  }
  return { source: "inline", value: token.value.slice(0, 200) };
}

function detectSegment({ tokens, isPiped }: Segment): ExternalInvocation | null {
  let index = 0;
  while (/^[a-zA-Z_][a-zA-Z0-9_]*=/.test(tokens[index]?.value ?? "")) index++;
  if (basename(tokens[index]?.value ?? "") === "timeout") {
    let duration = index + 1;
    if (tokens[duration]?.value === "-s") duration += 2;
    if (!/^\d+(?:\.\d+)?[smhd]?$/.test(tokens[duration]?.value ?? "")) return null;
    index = duration + 1;
  }

  const engine = basename(tokens[index]?.value ?? "");
  let bridgeName = engine;
  if (engine === "python3") {
    const script = index + (tokens[index + 1]?.value === "-u" ? 2 : 1);
    bridgeName = basename(tokens[script]?.value ?? "");
  }
  const bridge = /^(tg|telegram|teams)_(send|listen)(?:\.py)?$/.exec(bridgeName);
  if (bridge) {
    return {
      kind: "bridge",
      bridge: {
        name: bridge[1] === "teams" ? "teams" : "telegram",
        direction: bridge[2] as "send" | "listen",
      },
    };
  }
  if (engine !== "codex" && engine !== "agy" && engine !== "claude") return null;
  if (engine === "codex" && tokens[index + 1]?.value !== "exec") return null;

  let hasMarker = engine === "codex";
  let model: string | undefined;
  let prompt: ExternalInvocation["prompt"];
  let redirectFile: string | undefined;
  let stdinMarker = false;
  const start = index + (engine === "codex" ? 2 : 1);
  for (let i = start; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    const arg = token.value;
    if (token.raw.startsWith("<")) {
      if (arg === "<") redirectFile = tokens[++i]?.value;
      else if (!arg.startsWith("<<")) redirectFile = arg.slice(1);
      else if (arg === "<<") i++;
      continue;
    }
    if (arg === "--model" || (engine === "codex" && arg === "-m")) {
      model = tokens[++i]?.value;
    } else if (engine !== "claude" && arg.startsWith("--model=")) {
      model = arg.slice("--model=".length);
    } else if (engine === "agy" && arg === "--input-format") {
      const format = tokens[++i]?.value;
      if (format === "stream-json") {
        hasMarker = true;
        stdinMarker = true;
      }
    } else if (engine !== "codex" && (arg === "-p" || arg === "--print")) {
      hasMarker = true;
      const next = tokens[i + 1];
      if (
        next &&
        !next.raw.startsWith("<") &&
        (!next.value.startsWith("-") || /^['"]/.test(next.raw))
      ) {
        prompt = { source: "inline", value: next.value.slice(0, 200) };
        i++;
      }
    } else if (engine === "agy" && arg.startsWith("-p=")) {
      hasMarker = true;
      const value = arg.slice(3);
      if (value) prompt = { source: "inline", value: value.slice(0, 200) };
      else stdinMarker = true;
    } else if (arg === "--") {
      const next = tokens[i + 1];
      if (engine === "codex" && !prompt && next) prompt = promptFromToken(next);
      break;
    } else if (engine === "codex" && CODEX_VALUE_OPTIONS.has(arg)) {
      i++;
    } else if (engine === "codex" && !prompt && (!arg.startsWith("-") || arg === "-")) {
      prompt = promptFromToken(token);
    }
  }
  if (!hasMarker) return null;
  if (engine !== "codex" && redirectFile !== undefined) {
    prompt = { source: "file", value: redirectFile };
  } else if (!prompt && isPiped && (engine === "codex" || stdinMarker)) {
    prompt = { source: "stdin" };
  }

  const result: ExternalInvocation = { kind: "ai-cli", engine };
  if (model !== undefined) result.model = model;
  if (prompt) result.prompt = prompt;
  return result;
}

export function detectExternalInvocation(command: string): ExternalInvocation | null {
  for (const segment of scanSegments(command)) {
    const invocation = detectSegment(segment);
    if (invocation) return invocation;
  }
  return null;
}
