/**
 * Absolute turn number of a human prompt, for the prompt card header.
 *
 * Turn numbers are only meaningful when the loaded message window starts at
 * the beginning of the session: while older pages are still unloaded the
 * count would be off, so the number is omitted rather than shown wrong.
 */
import { useMemo } from "react";
import type { ClaudeMessage } from "@/types";
import { useAppStore } from "@/store/useAppStore";
import { buildTurnAnchors } from "@/utils/turns";

const cache = new WeakMap<readonly ClaudeMessage[], Map<string, number>>();
const cacheWithoutSidechain = new WeakMap<readonly ClaudeMessage[], Map<string, number>>();

/**
 * Prompt uuid → 1-based turn number over the loaded messages. Sidechain
 * records are skipped unless viewing a subagent transcript (the conversation
 * does not render them in the main session). Memoised per messages array so
 * every prompt card shares one pass.
 */
export function getPromptTurnNumbers(
  messages: readonly ClaudeMessage[],
  includeSidechain: boolean,
): Map<string, number> {
  const store = includeSidechain ? cache : cacheWithoutSidechain;
  const cached = store.get(messages);
  if (cached) return cached;

  const source = includeSidechain ? messages : messages.filter((m) => !m.isSidechain);
  const numbers = new Map(
    buildTurnAnchors(source).map((anchor) => [anchor.uuid, anchor.turnNumber] as const),
  );
  store.set(messages, numbers);
  return numbers;
}

export function usePromptTurnNumber(uuid: string): number | null {
  const messages = useAppStore((s) => s.messages);
  const windowStartsAtSessionStart = useAppStore((s) => !s.pagination.hasMore);
  const inSubagent = useAppStore((s) => s.parentSessionStack.length > 0);

  return useMemo(() => {
    if (!windowStartsAtSessionStart) return null;
    return getPromptTurnNumbers(messages, inSubagent).get(uuid) ?? null;
  }, [messages, windowStartsAtSessionStart, inSubagent, uuid]);
}
