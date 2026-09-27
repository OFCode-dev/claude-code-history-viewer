/**
 * Project Sessions API Service
 *
 * Loads every session of a project in one call. The store's session list is
 * paginated (`load_provider_sessions_page`); this is for lookups that must
 * find a session wherever it sits in the list: the CLI preload and opening a
 * favourite. Kept free of store imports so store slices can use it.
 */

import { api } from "@/services/api";
import type { ClaudeProject, ClaudeSession } from "@/types";

export function loadAllProjectSessions(
  project: ClaudeProject,
  excludeSidechain: boolean
): Promise<ClaudeSession[]> {
  const providerId = project.provider ?? "claude";
  return api<ClaudeSession[]>(
    providerId !== "claude" ? "load_provider_sessions" : "load_project_sessions",
    providerId !== "claude"
      ? { provider: providerId, projectPath: project.path, excludeSidechain }
      : { projectPath: project.path, excludeSidechain }
  );
}
