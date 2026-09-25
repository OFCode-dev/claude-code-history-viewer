import type { ClaudeSession, SubagentNavFrame, SubagentSession } from "@/types";

/** Subagents shown together: flat subagents (`workflowRunId` null) or one workflow run. */
export interface SubagentGroup {
  workflowRunId: string | null;
  subagents: SubagentSession[];
}

/**
 * Group subagents for display: flat subagents first (in their given order),
 * then one group per workflow run in order of first appearance. The backend
 * already sorts subagents by start time, so each group stays chronological.
 */
export function groupSubagentsForDisplay(
  subagents: readonly SubagentSession[],
): SubagentGroup[] {
  const flat: SubagentSession[] = [];
  const runs = new Map<string, SubagentSession[]>();
  for (const subagent of subagents) {
    const runId = subagent.workflow_run_id;
    if (runId == null || runId === "") {
      flat.push(subagent);
      continue;
    }
    const run = runs.get(runId);
    if (run) run.push(subagent);
    else runs.set(runId, [subagent]);
  }

  const groups: SubagentGroup[] = [];
  if (flat.length > 0) groups.push({ workflowRunId: null, subagents: flat });
  for (const [workflowRunId, members] of runs) {
    groups.push({ workflowRunId, subagents: members });
  }
  return groups;
}

/** The order subagents appear in lists, which is also the previous/next order. */
export function orderSubagentsForDisplay(
  subagents: readonly SubagentSession[],
): SubagentSession[] {
  return groupSubagentsForDisplay(subagents).flatMap((group) => group.subagents);
}

interface SubagentNavState {
  subagentNavStack: readonly SubagentNavFrame[];
  parentSessionStack: readonly ClaudeSession[];
  selectedSession: ClaudeSession | null;
}

/**
 * The navigation frame of the subagent currently on screen, or null at top
 * level. Frames are only trusted while they line up with `parentSessionStack`
 * and the selected session, so a stack cleared elsewhere (project switch,
 * session refresh) can never surface a stale sibling list.
 */
export function getActiveSubagentFrame(state: SubagentNavState): SubagentNavFrame | null {
  const { subagentNavStack, parentSessionStack, selectedSession } = state;
  if (parentSessionStack.length === 0) return null;
  if (subagentNavStack.length !== parentSessionStack.length) return null;
  const top = subagentNavStack[subagentNavStack.length - 1];
  if (!top || selectedSession == null) return null;
  return top.subagent.file_path === selectedSession.file_path ? top : null;
}

export interface SubagentSiblingPosition {
  /** 1-based position among the siblings, in display order. */
  index: number;
  total: number;
  previous: SubagentSession | null;
  next: SubagentSession | null;
}

/** Where a frame's subagent sits among its siblings, or null if it is not listed. */
export function getSubagentSiblingPosition(
  frame: SubagentNavFrame,
): SubagentSiblingPosition | null {
  const ordered = orderSubagentsForDisplay(frame.siblings);
  const i = ordered.findIndex((s) => s.file_path === frame.subagent.file_path);
  if (i < 0) return null;
  return {
    index: i + 1,
    total: ordered.length,
    previous: ordered[i - 1] ?? null,
    next: ordered[i + 1] ?? null,
  };
}

/**
 * The subagent transcript spawned by an `Agent`/`Task` tool use.
 *
 * Resolves through `toolUseToSubagentMap` (meta.json `toolUseId`, or progress
 * messages for older sessions). Without a mapping, a session with exactly one
 * subagent that carries no tool-use id and is not a workflow agent is assumed
 * to belong to the call — the older format gives nothing better. Anything
 * else returns null so a card never opens the wrong transcript.
 */
export function resolveSubagentForToolUse(
  toolUseId: string,
  toolUseToSubagentMap: ReadonlyMap<string, string>,
  subagents: readonly SubagentSession[],
): SubagentSession | null {
  if (!toolUseId || subagents.length === 0) return null;
  const filePath = toolUseToSubagentMap.get(toolUseId);
  if (filePath != null) {
    return subagents.find((s) => s.file_path === filePath) ?? null;
  }
  if (subagents.length === 1) {
    const only = subagents[0]!;
    if (only.tool_use_id == null && only.workflow_run_id == null) return only;
  }
  return null;
}
