import type { ClaudeProject } from "@/types";

/**
 * Whether the Session Board can open for `project`. The board reads Claude
 * Code sessions only, which is why the header shows its tab disabled for
 * other providers; entry points elsewhere follow the same rule.
 */
export function supportsSessionBoard(
  project: Pick<ClaudeProject, "provider"> | null | undefined,
): boolean {
  return (project?.provider ?? "claude") === "claude";
}
