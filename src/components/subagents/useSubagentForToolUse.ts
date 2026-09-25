import { useAppStore } from "@/store/useAppStore";
import { resolveSubagentForToolUse } from "@/utils/subagentNavigation";
import type { SubagentSession } from "@/types";

/**
 * The subagent transcript spawned by an `Agent`/`Task` tool use in the current
 * session, or null when it cannot be identified. The selector returns an
 * element of `subagentSessions` (or null), so cards only re-render when their
 * own answer changes.
 */
export function useSubagentForToolUse(toolUseId: string): SubagentSession | null {
  return useAppStore((s) =>
    resolveSubagentForToolUse(toolUseId, s.toolUseToSubagentMap, s.subagentSessions),
  );
}
