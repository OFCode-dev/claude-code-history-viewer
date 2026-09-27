/**
 * Favourite sessions: pure helpers shared by the metadata slice and the
 * favourites UI.
 *
 * A favourite is a session metadata entry (keyed by `session_id`) with
 * `starred: true`, `starredAt` and a `favorite` snapshot of where the session
 * lives, so it can be listed and opened without loading every project first.
 */

import type {
  ClaudeProject,
  ClaudeSession,
  FavoriteSessionEntry,
  FavoriteSessionRef,
  SessionMetadata,
} from "@/types";

/** Longest title kept in the snapshot; the list shows one truncated line. */
const MAX_TITLE_LENGTH = 200;

function oneLine(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Snapshot of a session for the favourites list. The title is the name the
 * session list shows (the user's rename, else the summary); a session with
 * neither gets no title, and the list labels it by id when it renders, in the
 * language of the moment rather than the one it was starred in.
 */
export function buildFavoriteRef(
  session: ClaudeSession,
  project: ClaudeProject,
  customName?: string
): FavoriteSessionRef {
  const ref: FavoriteSessionRef = { projectPath: project.path };
  const provider = project.provider ?? session.provider;
  if (provider) ref.provider = provider;
  const title = (oneLine(customName) || oneLine(session.summary)).slice(0, MAX_TITLE_LENGTH);
  if (title) ref.title = title;
  if (session.actual_session_id) ref.actualSessionId = session.actual_session_id;
  if (session.last_message_time) ref.lastMessageTime = session.last_message_time;
  return ref;
}

/** Whether two snapshots record the same thing (a missing field equals a missing field). */
export function isSameFavoriteRef(
  a: FavoriteSessionRef | undefined,
  b: FavoriteSessionRef
): boolean {
  return (
    a != null &&
    a.projectPath === b.projectPath &&
    a.provider === b.provider &&
    a.title === b.title &&
    a.actualSessionId === b.actualSessionId &&
    a.lastMessageTime === b.lastMessageTime
  );
}

/** A copy of the metadata without the favourite fields; the rest is kept. */
export function withoutFavorite(metadata: SessionMetadata): SessionMetadata {
  const rest = { ...metadata };
  delete rest.starred;
  delete rest.starredAt;
  delete rest.favorite;
  return rest;
}

function starredTime(entry: FavoriteSessionEntry): number {
  const time = Date.parse(entry.starredAt);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * Favourites that can be opened, most recently starred first. A star without
 * a snapshot has no project to open it in, so it is left out; this version
 * never writes one (nothing set `starred` before favourites existed).
 */
export function listFavoriteSessions(
  sessions: Record<string, SessionMetadata>
): FavoriteSessionEntry[] {
  const entries: FavoriteSessionEntry[] = [];
  for (const [sessionId, metadata] of Object.entries(sessions)) {
    if (metadata.starred !== true || !metadata.favorite?.projectPath) continue;
    entries.push({
      sessionId,
      starredAt: metadata.starredAt ?? "",
      favorite: metadata.favorite,
    });
  }
  return entries.sort(
    (a, b) => starredTime(b) - starredTime(a) || a.sessionId.localeCompare(b.sessionId)
  );
}

/** Same project: equal path and provider (no provider means Claude). */
export function isSameProject(
  a: ClaudeProject | null | undefined,
  b: ClaudeProject
): boolean {
  return a != null && a.path === b.path && (a.provider ?? "claude") === (b.provider ?? "claude");
}

/** The loaded project a favourite belongs to, if it is still there. */
export function findFavoriteProject(
  projects: ClaudeProject[],
  favorite: FavoriteSessionRef
): ClaudeProject | undefined {
  return projects.find(
    (project) =>
      project.path === favorite.projectPath &&
      (favorite.provider == null || (project.provider ?? "claude") === favorite.provider)
  );
}
