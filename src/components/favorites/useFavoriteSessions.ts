/**
 * Data and actions for {@link FavoritesList}. The return value is the list's
 * props, so mounting it is:
 *
 * ```tsx
 * const favorites = useFavoriteSessions();
 * return <FavoritesList {...favorites} />;
 * ```
 */

import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/useAppStore";
import { findFavoriteProject, listFavoriteSessions } from "@/utils/favoriteSessions";
import { getPathLeaf, getProjectDisplayName } from "@/utils/pathUtils";
import { formatTimeAgo } from "@/utils/time";
import type { FavoriteSessionEntry } from "@/types";

export interface FavoriteSessionItem {
  entry: FavoriteSessionEntry;
  /** The user's rename, else the title when it was starred, else "Session <id>" */
  title: string;
  /** Folder name of the owning project */
  projectName: string;
  /** Project path, and when the last message was sent */
  tooltip: string;
  /** The session on screen, or the parent of the subagent transcript on screen */
  isSelected: boolean;
}

export interface UseFavoriteSessionsResult {
  /** Most recently starred first */
  items: FavoriteSessionItem[];
  onOpen: (entry: FavoriteSessionEntry) => void;
  onRemove: (entry: FavoriteSessionEntry) => void;
  /** False on a read-only server, where favourites show but cannot change */
  canRemove: boolean;
}

export function useFavoriteSessions(): UseFavoriteSessionsResult {
  const { t } = useTranslation();
  const sessionMetadata = useAppStore((s) => s.userMetadata.sessions);
  const projects = useAppStore((s) => s.projects);
  const selectedSession = useAppStore((s) => s.selectedSession);
  const rootSession = useAppStore((s) => s.parentSessionStack[0]);
  const isServerReadOnly = useAppStore((s) => s.isServerReadOnly);
  const openFavoriteSession = useAppStore((s) => s.openFavoriteSession);
  const removeSessionFavorite = useAppStore((s) => s.removeSessionFavorite);

  const openSessionId = (rootSession ?? selectedSession)?.session_id;

  const items = useMemo(
    () =>
      listFavoriteSessions(sessionMetadata).map((entry): FavoriteSessionItem => {
        const { favorite } = entry;
        const project = findFavoriteProject(projects, favorite);
        const projectPath = project ? project.actual_path || project.path : favorite.projectPath;
        const shortId = (favorite.actualSessionId || entry.sessionId).slice(-8);
        const title =
          sessionMetadata[entry.sessionId]?.customName?.trim() ||
          favorite.title ||
          t("header.breadcrumb.untitledSession", { id: shortId });
        const lastMessage = favorite.lastMessageTime
          ? t("session.favorites.lastMessage", { time: formatTimeAgo(favorite.lastMessageTime) })
          : null;
        return {
          entry,
          title,
          projectName: project ? getProjectDisplayName(project) : getPathLeaf(favorite.projectPath),
          tooltip: lastMessage ? `${projectPath}\n${lastMessage}` : projectPath,
          isSelected: entry.sessionId === openSessionId,
        };
      }),
    [sessionMetadata, projects, openSessionId, t]
  );

  const onOpen = useCallback(
    (entry: FavoriteSessionEntry) => void openFavoriteSession(entry),
    [openFavoriteSession]
  );
  const onRemove = useCallback(
    (entry: FavoriteSessionEntry) => void removeSessionFavorite(entry.sessionId),
    [removeSessionFavorite]
  );

  return { items, onOpen, onRemove, canRemove: !isServerReadOnly };
}
