import type { ProviderId } from "../types";
import { isWindows } from "./platform";

export const PROVIDER_IDS: ProviderId[] = ["aider", "amazonq", "antigravity", "claude", "cline", "codebuddy", "codex", "continue", "copilot", "crush", "cursor", "cursor-agent", "forgecode", "gemini", "goose", "grok", "kilo", "kimi", "kiro", "llm", "ompi", "opencode", "openhands", "openinterpreter", "pearai", "pi", "qwen", "trae", "vibe", "zcode", "zed"];
export const DEFAULT_PROVIDER_ID: ProviderId = "claude";

// WSL provider loaders use UNC-backed paths and are not interchangeable with
// native provider loaders. Keep this list aligned with the backend routing.
export const WSL_SEARCHABLE_PROVIDER_IDS: readonly ProviderId[] = ["claude", "copilot"];

export function getWslSearchableProviderIds(
  ids: readonly ProviderId[],
): ProviderId[] {
  return WSL_SEARCHABLE_PROVIDER_IDS.filter((id) => ids.includes(id));
}

const PROVIDER_TRANSLATIONS: Record<
  ProviderId,
  { key: string; fallback: string }
> = {
  aider: { key: "common.provider.aider", fallback: "Aider" },
  amazonq: { key: "common.provider.amazonq", fallback: "Amazon Q CLI" },
  antigravity: { key: "common.provider.antigravity", fallback: "Antigravity" },
  claude: { key: "common.provider.claude", fallback: "Claude Code" },
  cline: { key: "common.provider.cline", fallback: "Cline" },
  codebuddy: { key: "common.provider.codebuddy", fallback: "CodeBuddy Code" },
  codex: { key: "common.provider.codex", fallback: "Codex CLI" },
  continue: { key: "common.provider.continue", fallback: "Continue" },
  copilot: { key: "common.provider.copilot", fallback: "Copilot" },
  crush: { key: "common.provider.crush", fallback: "Crush" },
  cursor: { key: "common.provider.cursor", fallback: "Cursor" },
  "cursor-agent": { key: "common.provider.cursorAgent", fallback: "Cursor Agent" },
  forgecode: { key: "common.provider.forgecode", fallback: "ForgeCode" },
  gemini: { key: "common.provider.gemini", fallback: "Gemini CLI" },
  goose: { key: "common.provider.goose", fallback: "Goose" },
  grok: { key: "common.provider.grok", fallback: "Grok CLI" },
  kilo: { key: "common.provider.kilo", fallback: "Kilo Code" },
  kimi: { key: "common.provider.kimi", fallback: "Kimi" },
  kiro: { key: "common.provider.kiro", fallback: "Kiro CLI" },
  llm: { key: "common.provider.llm", fallback: "llm" },
  ompi: { key: "common.provider.ompi", fallback: "oh-my-pi" },
  opencode: { key: "common.provider.opencode", fallback: "OpenCode" },
  openhands: { key: "common.provider.openhands", fallback: "OpenHands" },
  openinterpreter: { key: "common.provider.openinterpreter", fallback: "Open Interpreter" },
  pearai: { key: "common.provider.pearai", fallback: "PearAI" },
  pi: { key: "common.provider.pi", fallback: "Pi" },
  qwen: { key: "common.provider.qwen", fallback: "Qwen Code" },
  trae: { key: "common.provider.trae", fallback: "Trae" },
  vibe: { key: "common.provider.vibe", fallback: "Mistral Vibe" },
  zcode: { key: "common.provider.zcode", fallback: "Z Code" },
  zed: { key: "common.provider.zed", fallback: "Zed" },
};

type TranslateFn = (key: string, defaultValue: string) => string;

const CAPABLE = {
  supportsConversationBreakdown: ["antigravity", "claude", "forgecode"],
  supportsNativeRename: ["claude", "codex", "forgecode", "opencode"],
  supportsResumeCommand: ["claude", "codex", "copilot", "forgecode", "kimi", "vibe"],
  supportsSessionDeletion: ["claude", "codex", "forgecode"],
  supportsArchiveCreation: ["claude"],
} as const satisfies Record<string, readonly ProviderId[]>;

const supports = (capability: keyof typeof CAPABLE, provider?: ProviderId | string): boolean =>
  (CAPABLE[capability] as readonly string[]).includes(provider ?? "");

export interface ProviderTokenStatsLike {
  provider_id: string;
  tokens: number;
}

export interface ConversationBreakdownCoverage {
  totalTokens: number;
  coveredTokens: number;
  coveragePercent: number;
  hasLimitedProviders: boolean;
}

export function getProviderId(provider?: ProviderId | string): ProviderId {
  return PROVIDER_IDS.includes(provider as ProviderId)
    ? (provider as ProviderId)
    : DEFAULT_PROVIDER_ID;
}

export function normalizeProviderIds(ids: readonly ProviderId[]): ProviderId[] {
  return PROVIDER_IDS.filter((id) => ids.includes(id));
}

export function hasNonDefaultProvider(
  ids: readonly ProviderId[]
): boolean {
  return ids.some((id) => id !== DEFAULT_PROVIDER_ID);
}

export function getProviderLabel(
  translate: TranslateFn,
  provider?: ProviderId | string
): string {
  const id = getProviderId(provider);
  const config = PROVIDER_TRANSLATIONS[id];
  return translate(config.key, config.fallback);
}

export const supportsConversationBreakdown = (provider?: ProviderId | string): boolean =>
  supports("supportsConversationBreakdown", provider);

export const supportsNativeRename = (provider?: ProviderId | string): boolean =>
  supports("supportsNativeRename", provider);

export const supportsResumeCommand = (provider?: ProviderId | string): boolean =>
  supports("supportsResumeCommand", provider);

// Single-quote a path for safe shell interpolation. Always quotes (cheap and
// robust for arbitrary paths); a literal `'` is escaped as `'\''`.
function shellQuotePath(p: string): string {
  return `'${p.replace(/'/g, "'\\''")}'`;
}

// PowerShell's single-quoted strings are literal; a single quote is escaped by
// doubling it. The resulting command can be pasted into either CMD or
// PowerShell because both shells can invoke powershell.exe.
function powershellQuotePath(p: string): string {
  return `'${p.replace(/'/g, "''")}'`;
}

/**
 * Whether a session came from the kimi-code store rather than the legacy
 * kimi-cli one. Both surface under the `kimi` provider id, so the entrypoint
 * stamp (set only by the kimi-code scanner) is the discriminator.
 */
function isKimiCodeEntrypoint(entrypoint?: string): boolean {
  return entrypoint === "kimi-code-cli" || entrypoint === "kimi-code-vscode";
}

export function getResumeCommand(
  provider: ProviderId | string | undefined,
  sessionId: string,
  cwd?: string,
  entrypoint?: string,
  extraArgs?: string | string[]
): string | null {
  if (!sessionId) {
    return null;
  }

  // Fail-closed: sessionId is interpolated unquoted into a shell command that
  // the user pastes into their terminal. Only allow the charset CLIs actually
  // emit (UUIDs, hex hashes) so a crafted/corrupted JSONL can't extend the
  // command past the resume invocation.
  if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) {
    return null;
  }

  if (provider == null || !PROVIDER_IDS.includes(provider as ProviderId)) {
    return null;
  }

  const extra = Array.isArray(extraArgs)
    ? extraArgs.filter(Boolean).join(" ").trim()
    : (extraArgs ?? "").trim();
  const extraPrefix = extra ? `${extra} ` : "";

  let resume: string | null;
  switch (provider as ProviderId) {
    case "claude":
      resume = `claude ${extraPrefix}--resume ${sessionId}`;
      break;
    case "codex":
      // Extras go before `resume`, so they must be top-level Codex flags
      // (e.g. approval/sandbox options); `resume`-only flags like `--last`
      // are rejected there.
      resume = `codex ${extraPrefix}resume ${sessionId}`;
      break;
    case "copilot":
      // Only the CLI surface has a resume command; Desktop/VS Code resume by
      // reopening the app.
      resume =
        entrypoint === "copilot-cli"
          ? `copilot ${extraPrefix}--resume=${sessionId}`
          : null;
      break;
    case "forgecode":
      resume = `forge ${extraPrefix}conversation resume ${sessionId}`;
      break;
    case "kimi":
      // One provider id, two stores: kimi-code (`~/.kimi-code`) resumes with
      // `-S/--session` — its CLI has no `-r` — while the legacy kimi-cli store
      // (`~/.kimi`, whose sessions carry no entrypoint) still uses `-r`.
      resume = isKimiCodeEntrypoint(entrypoint)
        ? `kimi ${extraPrefix}-S ${sessionId}`
        : `kimi ${extraPrefix}-r ${sessionId}`;
      break;
    case "vibe":
      resume = `vibe ${extraPrefix}--resume ${sessionId}`;
      break;
    default:
      resume = null;
  }

  if (resume == null) return null;
  if (!cwd) return resume;

  if (isWindows()) {
    return `powershell.exe -NoProfile -Command "Set-Location -LiteralPath ${powershellQuotePath(cwd)}; ${resume}"`;
  }

  return `cd ${shellQuotePath(cwd)} && ${resume}`;
}

/**
 * Per-session variant of supportsResumeCommand. Matches `getResumeCommand`'s
 * gating exactly (Copilot resume requires entrypoint === "copilot-cli").
 */
export function supportsResumeCommandForSession(
  provider: ProviderId | string | undefined,
  entrypoint: string | undefined
): boolean {
  if (!supportsResumeCommand(provider)) return false;
  if (provider === "copilot") return entrypoint === "copilot-cli";
  return true;
}

export const supportsSessionDeletion = (provider?: ProviderId | string): boolean =>
  supports("supportsSessionDeletion", provider);

export const supportsArchiveCreation = (provider?: ProviderId | string): boolean =>
  supports("supportsArchiveCreation", provider);

export const PROVIDER_BADGE_STYLES: Record<ProviderId, string> = {
  claude: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  codebuddy: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  codex: "bg-green-500/15 text-green-600 dark:text-green-400",
  continue: "bg-lime-500/15 text-lime-700 dark:text-lime-300",
  copilot: "bg-[#8250df]/15 text-[#6639ba] dark:text-[#d2a8ff]",
  cline: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  crush: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  cursor: "bg-[#f54e00]/15 text-[#d04200] dark:text-[#ff6a2a]",
  "cursor-agent": "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  forgecode: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  gemini: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  goose: "bg-red-500/15 text-red-600 dark:text-red-400",
  grok: "bg-zinc-800/15 text-zinc-800 dark:text-zinc-200",
  kilo: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  kimi: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300",
  kiro: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  llm: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  ompi: "bg-teal-600/15 text-teal-700 dark:text-teal-300",
  opencode: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  openinterpreter: "bg-stone-500/15 text-stone-600 dark:text-stone-400",
  openhands: "bg-gray-500/15 text-gray-600 dark:text-gray-300",
  pearai: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  pi: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  qwen: "bg-violet-600/15 text-violet-700 dark:text-violet-300",
  zcode: "bg-cyan-600/15 text-cyan-700 dark:text-cyan-300",
  trae: "bg-blue-600/15 text-blue-700 dark:text-blue-300",
  vibe: "bg-orange-600/15 text-orange-700 dark:text-orange-300",
  zed: "bg-neutral-500/15 text-neutral-600 dark:text-neutral-400",
  aider: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  amazonq: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  antigravity: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
};

/** Unique two-letter codes for the explorer's compact provider chips. */
export const PROVIDER_SHORT_CODES: Record<ProviderId, string> = {
  aider: "AD",
  amazonq: "AQ",
  antigravity: "AG",
  claude: "CC",
  cline: "CL",
  codebuddy: "CB",
  codex: "CX",
  continue: "CN",
  copilot: "CP",
  crush: "CR",
  cursor: "CU",
  "cursor-agent": "CA",
  forgecode: "FC",
  gemini: "GM",
  goose: "GS",
  grok: "GK",
  kilo: "KL",
  kimi: "KM",
  kiro: "KR",
  llm: "LL",
  ompi: "OM",
  opencode: "OC",
  openhands: "OH",
  openinterpreter: "OI",
  pearai: "PA",
  pi: "PI",
  qwen: "QW",
  trae: "TR",
  vibe: "VB",
  zcode: "ZC",
  zed: "ZD",
};

export function getProviderBadgeStyle(provider?: ProviderId | string): string {
  const id = getProviderId(provider);
  return PROVIDER_BADGE_STYLES[id] ?? "bg-gray-500/15 text-gray-500";
}

export function hasAnyConversationBreakdownProvider(
  providers?: readonly (ProviderId | string)[]
): boolean {
  if (!providers || providers.length === 0) {
    return false;
  }
  return providers.some((provider) =>
    supportsConversationBreakdown(provider)
  );
}

export function calculateConversationBreakdownCoverage(
  providers: readonly ProviderTokenStatsLike[]
): ConversationBreakdownCoverage {
  let totalTokens = 0;
  let coveredTokens = 0;
  let hasLimitedProviders = false;

  for (const provider of providers) {
    const tokens = Math.max(0, provider.tokens);
    totalTokens += tokens;

    if (supportsConversationBreakdown(provider.provider_id)) {
      coveredTokens += tokens;
    } else if (tokens > 0) {
      hasLimitedProviders = true;
    }
  }

  const coveragePercent =
    totalTokens > 0 ? (coveredTokens / totalTokens) * 100 : 0;

  return {
    totalTokens,
    coveredTokens,
    coveragePercent,
    hasLimitedProviders,
  };
}
