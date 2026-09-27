import { useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { ClaudeSession } from "@/types";

/**
 * Favourite state of a session of the selected project, and its toggle. The
 * session lists and the header only show sessions of the selected project, so
 * that is the project the favourite is recorded under.
 */
export function useSessionFavorite(session: ClaudeSession | null) {
  const isFavorite = useAppStore(
    (s) => session != null && s.userMetadata.sessions[session.session_id]?.starred === true
  );
  const project = useAppStore((s) => s.selectedProject);
  const isServerReadOnly = useAppStore((s) => s.isServerReadOnly);
  const toggleSessionFavorite = useAppStore((s) => s.toggleSessionFavorite);

  const canToggle = session != null && project != null && !isServerReadOnly;
  const toggle = useCallback(() => {
    if (session != null && project != null) {
      void toggleSessionFavorite(session, project);
    }
  }, [session, project, toggleSessionFavorite]);

  return { isFavorite, canToggle, toggle };
}
