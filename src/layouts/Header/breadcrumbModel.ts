/**
 * Pure model behind the header breadcrumb: which crumbs to show for the
 * selected project path and session (or subagent chain), and which path
 * segments to fold into "…" when the header runs out of room.
 */
import type { ClaudeSession, SubagentSession } from "@/types";
import { getSubagentLabel } from "@/utils/subagentLabel";

/** One directory of the project path; `path` is what the explorer reveals. */
export interface PathCrumb {
  label: string;
  path: string;
}

/** The root a path starts from, as shown and as revealed. */
function splitRoot(path: string): { label: string; path: string } | null {
  const unc = path.match(/^[\\/]{2}[^\\/]+[\\/][^\\/]+/);
  if (unc) return { label: unc[0], path: unc[0] };
  const drive = path.match(/^([A-Za-z]:)[\\/]/);
  if (drive?.[1]) return { label: drive[1], path: path.slice(0, 3) };
  if (path.startsWith("/")) return { label: "/", path: "/" };
  return null;
}

function stripTrailingSeparators(path: string): string {
  const stripped = path.replace(/[\\/]+$/, "");
  // Keep a bare root ("/", "C:\") intact rather than reducing it to nothing.
  return stripped === "" || /^[A-Za-z]:$/.test(stripped) ? path : stripped;
}

/** Whether `path` is `homeDir` or lies below it (segment-wise, not by prefix). */
function isUnderHome(path: string, homeDir: string): boolean {
  if (!path.startsWith(homeDir)) return false;
  const next = path.charAt(homeDir.length);
  return next === "" || next === "/" || next === "\\";
}

/**
 * Crumbs for an absolute project path: `~` for the home directory (or the
 * filesystem root outside it), then one crumb per directory. Each crumb's
 * `path` is a prefix of the original string, so separators are preserved.
 */
export function buildPathCrumbs(actualPath: string, homeDir: string | null): PathCrumb[] {
  if (!actualPath) return [];
  const path = stripTrailingSeparators(actualPath);

  const crumbs: PathCrumb[] = [];
  let start: number;
  const home = homeDir ? stripTrailingSeparators(homeDir) : null;
  if (home && isUnderHome(path, home)) {
    crumbs.push({ label: "~", path: home });
    start = home.length;
  } else {
    const root = splitRoot(path);
    if (root) crumbs.push(root);
    start = root?.path.length ?? 0;
  }

  const segment = /[^\\/]+/g;
  segment.lastIndex = start;
  for (let match = segment.exec(path); match; match = segment.exec(path)) {
    crumbs.push({
      label: match[0],
      path: path.slice(0, match.index + match[0].length),
    });
  }
  return crumbs;
}

export interface CollapsedPathCrumbs {
  /** Always shown before the "…" (the root or `~`). */
  leading: PathCrumb[];
  /** Folded into the "…" menu, in path order. */
  hidden: PathCrumb[];
  /** Shown after the "…", ending with the project directory. */
  trailing: PathCrumb[];
}

/**
 * Fold `collapsedCount` middle segments into "…". Segments nearest the root go
 * first, so the directories closest to the project stay readable; the first
 * and last crumb are never hidden.
 */
export function collapsePathCrumbs(
  crumbs: PathCrumb[],
  collapsedCount: number,
): CollapsedPathCrumbs {
  if (crumbs.length === 0) return { leading: [], hidden: [], trailing: [] };
  const middle = Math.max(0, crumbs.length - 2);
  const count = Math.min(Math.max(0, collapsedCount), middle);
  return {
    leading: crumbs.slice(0, 1),
    hidden: crumbs.slice(1, 1 + count),
    trailing: crumbs.slice(1 + count),
  };
}

/** Largest useful `collapsedCount` for `collapsePathCrumbs`. */
export function maxCollapsiblePathCrumbs(crumbs: PathCrumb[]): number {
  return Math.max(0, crumbs.length - 2);
}

export interface SessionCrumb {
  kind: "session" | "subagent";
  label: string;
  /** Full text for the tooltip. */
  title: string;
  /**
   * How many levels up the subagent chain this crumb is: 0 is the transcript
   * on screen, 1 its parent, and so on.
   */
  popCount: number;
}

interface BuildSessionCrumbsInput {
  selectedSession: ClaudeSession | null;
  /** Sessions the user descended from, root first (message slice). */
  parentSessionStack: ClaudeSession[];
  /** Known subagents, used for their spawn description. */
  subagentSessions: SubagentSession[];
  /** Label for a session without a summary, given the end of its id. */
  untitledSession: (shortId: string) => string;
  /** The user's name for a session (a rename), preferred over its summary. */
  sessionName?: (session: ClaudeSession) => string | undefined;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function sessionLabel(
  session: ClaudeSession,
  untitledSession: (shortId: string) => string,
  sessionName?: (session: ClaudeSession) => string | undefined,
): string {
  const name = oneLine(sessionName?.(session) ?? "");
  if (name) return name;
  const summary = session.summary ? oneLine(session.summary) : "";
  if (summary) return summary;
  const id = session.actual_session_id || session.session_id;
  return untitledSession(id.slice(-8));
}

/**
 * A subagent transcript is selected as a synthetic session (see
 * `navigateToSubagent`): its `file_path` identifies the subagent and its
 * `actual_session_id` is the agent id.
 */
function subagentLabel(session: ClaudeSession, subagentSessions: SubagentSession[]): string {
  const known = subagentSessions.find((s) => s.file_path === session.file_path);
  if (known) return getSubagentLabel(known);
  const agentId = session.actual_session_id || session.session_id;
  // The synthetic session falls back to the agent id as its summary; that is
  // not a name, so let the label helper shorten it instead.
  const summary = session.summary && session.summary !== agentId ? session.summary : null;
  return getSubagentLabel({ agent_id: agentId, summary });
}

/**
 * Crumbs after the path: the session, and when a subagent transcript is open,
 * the chain from the top-level session down to it.
 */
export function buildSessionCrumbs({
  selectedSession,
  parentSessionStack,
  subagentSessions,
  untitledSession,
  sessionName,
}: BuildSessionCrumbsInput): SessionCrumb[] {
  if (selectedSession == null) return [];
  const chain = [...parentSessionStack, selectedSession];
  return chain.map((session, index) => {
    const isRoot = index === 0;
    const label = isRoot
      ? sessionLabel(session, untitledSession, sessionName)
      : subagentLabel(session, subagentSessions);
    return {
      kind: isRoot ? "session" : "subagent",
      label,
      title: label,
      popCount: chain.length - 1 - index,
    };
  });
}
