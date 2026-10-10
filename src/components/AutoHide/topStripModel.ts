import type { MessageFilter } from "@/store/slices/filterSlice";

/**
 * Message types the filter row hides: each role or content toggle that is
 * off. Parallel tasks count only when the session has any (the toggle only
 * shows then).
 */
export function countHiddenMessageTypes(
  filter: Pick<MessageFilter, "roles" | "contentTypes">,
  hasParallelTasks: boolean
): number {
  const { roles, contentTypes } = filter;
  const toggles = [
    roles.user,
    roles.assistant,
    contentTypes.text,
    contentTypes.thinking,
    contentTypes.toolCalls,
    contentTypes.commands,
    ...(hasParallelTasks ? [contentTypes.parallelTasks] : []),
  ];
  return toggles.filter((shown) => !shown).length;
}
