import { useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { getActiveSubagentFrame } from "@/utils/subagentNavigation";
import type { SubagentSession } from "@/types";

/**
 * The subagents the sessions list offers: at top level the selected
 * session's own; inside a subagent, its parent's (the siblings), so the
 * list stays put while moving between them. Shared by the docked
 * "Subagents" section and the rail buttons that lead to it.
 */
export function useSessionSubagents(): readonly SubagentSession[] {
  const subagentSessions = useAppStore((s) => s.subagentSessions);
  const parentSessionStack = useAppStore((s) => s.parentSessionStack);
  const subagentNavStack = useAppStore((s) => s.subagentNavStack);
  const selectedSession = useAppStore((s) => s.selectedSession);

  return useMemo(() => {
    const frame = getActiveSubagentFrame({ subagentNavStack, parentSessionStack, selectedSession });
    if (frame) return frame.siblings;
    return parentSessionStack.length === 0 ? subagentSessions : [];
  }, [subagentNavStack, parentSessionStack, selectedSession, subagentSessions]);
}

/** A rail's "show subagents" press, picked up by the section once the list mounts. */
const FOCUS_REQUEST_TTL_MS = 1000;
let focusRequestedAt: number | null = null;

/** Ask the next "Subagents" section that mounts to open and take focus. */
export function requestSubagentsFocus(now: number = Date.now()): void {
  focusRequestedAt = now;
}

/** True once per request, and only shortly after it: a stale one never steals focus. */
export function takeSubagentsFocusRequest(now: number = Date.now()): boolean {
  const requestedAt = focusRequestedAt;
  focusRequestedAt = null;
  return requestedAt != null && now - requestedAt <= FOCUS_REQUEST_TTL_MS;
}
