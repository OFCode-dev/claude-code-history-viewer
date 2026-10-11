/**
 * Metadata Slice
 *
 * Manages user metadata stored in ~/.claude-history-viewer/user-data.json
 */

import { toast } from "sonner";
import { api } from "@/services/api";
import { loadAllProjectSessions } from "@/services/projectSessionsApi";
import type { StateCreator } from "zustand";
import type {
  UserMetadata,
  SessionMetadata,
  ProjectMetadata,
  UserSettings,
  CustomClaudePath,
  WslSettings,
  ClaudeProject,
  ClaudeSession,
  FavoriteSessionEntry,
} from "../../types";
import { DEFAULT_USER_METADATA } from "../../types";
import i18n from "../../i18n";
import { matchGlobPattern } from "../../utils/globUtils";
import {
  buildFavoriteRef,
  findFavoriteProject,
  isSameFavoriteRef,
  isSameProject,
  listFavoriteSessions,
  withoutFavorite,
} from "../../utils/favoriteSessions";
import type { FullAppStore } from "./types";

// ============================================================================
// State Interface
// ============================================================================

export interface MetadataSliceState {
  /** User metadata from ~/.claude-history-viewer/user-data.json */
  userMetadata: UserMetadata;
  /** Whether metadata has been loaded */
  isMetadataLoaded: boolean;
  /** Whether metadata is currently loading */
  isMetadataLoading: boolean;
  /** Error message if metadata loading failed */
  metadataError: string | null;
}

// ============================================================================
// Actions Interface
// ============================================================================

export interface MetadataSliceActions {
  /** Load user metadata from disk */
  loadMetadata: () => Promise<void>;
  /** Update metadata for a specific session */
  updateSessionMetadata: (
    sessionId: string,
    update: Partial<SessionMetadata>
  ) => Promise<void>;
  /** Update metadata for a specific project */
  updateProjectMetadata: (
    projectPath: string,
    update: Partial<ProjectMetadata>
  ) => Promise<void>;
  /** Update global user settings */
  updateUserSettings: (update: Partial<UserSettings>) => Promise<void>;
  /** Get session display name (custom name or fallback) */
  getSessionDisplayName: (
    sessionId: string,
    fallbackSummary?: string
  ) => string | undefined;
  /** Check if a project should be hidden */
  isProjectHidden: (projectPath: string) => boolean;
  /** Hide a specific project */
  hideProject: (projectPath: string) => Promise<void>;
  /** Unhide a specific project */
  unhideProject: (projectPath: string) => Promise<void>;
  /** Add a custom Claude directory path */
  addCustomClaudePath: (path: string, label?: string) => Promise<void>;
  /** Remove a custom Claude directory path */
  removeCustomClaudePath: (path: string) => Promise<void>;
  /** Update label for a custom Claude directory path */
  updateCustomClaudePathLabel: (path: string, label: string) => Promise<void>;
  /** Enable or disable WSL scanning */
  setWslEnabled: (enabled: boolean) => Promise<void>;
  /** Toggle a WSL distro in/out of the excluded list */
  toggleWslDistro: (distroName: string) => Promise<void>;
  /** Whether a session is starred */
  isSessionFavorite: (sessionId: string) => boolean;
  /** Star a session (with a snapshot of where it lives), or unstar it */
  toggleSessionFavorite: (
    session: ClaudeSession,
    project: ClaudeProject
  ) => Promise<void>;
  /** Unstar a session by its metadata key */
  removeSessionFavorite: (sessionId: string) => Promise<void>;
  /** Favourites that can be opened, most recently starred first */
  getFavoriteSessions: () => FavoriteSessionEntry[];
  /**
   * Open a favourite: select its project if needed, find the session (loading
   * the project's whole list when it is past the loaded page) and select it.
   */
  openFavoriteSession: (entry: FavoriteSessionEntry) => Promise<void>;
}

export type MetadataSlice = MetadataSliceState & MetadataSliceActions;

// ============================================================================
// Initial State
// ============================================================================

export const initialMetadataState: MetadataSliceState = {
  userMetadata: DEFAULT_USER_METADATA,
  isMetadataLoaded: false,
  isMetadataLoading: false,
  metadataError: null,
};

const trimSlash = (p: string): string => p.replace(/[\\/]+$/, "");

// ============================================================================
// Slice Creator
// ============================================================================

export const createMetadataSlice: StateCreator<
  FullAppStore,
  [],
  [],
  MetadataSlice
> = (set, get) => {
  // Session entries are written one at a time, each computed from the result
  // of the write before it. The backend replaces the entry and then saves the
  // whole file outside its lock, through a single temp file, so two writes in
  // flight can land on disk in either order or interleave; and an update
  // merged from the state at call time would undo one still in flight (two
  // quick clicks on a star).
  let sessionWriteChain: Promise<void> = Promise.resolve();

  const writeSessionEntry = (
    sessionId: string,
    next: (current: SessionMetadata | undefined) => SessionMetadata | null
  ): Promise<void> => {
    const run = async () => {
      const entry = next(get().userMetadata.sessions[sessionId]);
      if (entry === null) return;
      const updatedMetadata = await api<UserMetadata>("update_session_metadata", {
        sessionId,
        update: entry,
      });
      set({ userMetadata: updatedMetadata });
    };
    const result = sessionWriteChain.then(run);
    sessionWriteChain = result.catch(() => undefined);
    return result;
  };

  const getWsl = (): WslSettings => {
    const wsl = get().userMetadata?.settings?.wsl;
    return {
      enabled: wsl?.enabled ?? false,
      excludedDistros: wsl?.excludedDistros ?? [],
    };
  };

  // Only the latest `openFavoriteSession` may select anything.
  let openFavoriteRequest = 0;

  /** An opened favourite shows its transcript, as picking a session in the list does. */
  const showTranscript = () => {
    get().setViewingGlobalStats(false);
    get().setAnalyticsCurrentView("messages");
  };

  const notifyFavoriteUnavailable = (sessionId: string) => {
    const message = i18n.t("session.favorites.unavailable");
    if (get().isServerReadOnly) {
      toast.error(message);
      return;
    }
    toast.error(message, {
      duration: 8000,
      action: {
        label: i18n.t("session.favorites.removeAction"),
        onClick: () => void get().removeSessionFavorite(sessionId),
      },
    });
  };

  /** Keep the favourite's title and last-message time in step with the session. */
  const refreshFavoriteSnapshot = async (
    sessionId: string,
    session: ClaudeSession,
    project: ClaudeProject
  ) => {
    // A read-only server rejects metadata writes; the stale snapshot is harmless.
    if (get().isServerReadOnly) return;
    try {
      await writeSessionEntry(sessionId, (current) => {
        if (current?.starred !== true) return null;
        const fresh = buildFavoriteRef(session, project, current.customName);
        return isSameFavoriteRef(current.favorite, fresh)
          ? null
          : { ...current, favorite: fresh };
      });
    } catch (error) {
      console.error("Failed to refresh favorite session:", error);
      toast.error(i18n.t("session.favorites.saveError"));
    }
  };

  return {
    ...initialMetadataState,

  loadMetadata: async () => {
    set({ isMetadataLoading: true, metadataError: null });

    try {
      const metadata = await api<UserMetadata>("load_user_metadata");
      set({
        userMetadata: metadata,
        isMetadataLoaded: true,
        isMetadataLoading: false,
      });
    } catch (error) {
      console.error("Failed to load user metadata:", error);
      set({
        userMetadata: DEFAULT_USER_METADATA,
        isMetadataLoaded: true,
        isMetadataLoading: false,
        metadataError: String(error),
      });
    }
  },

  updateSessionMetadata: async (
    sessionId: string,
    update: Partial<SessionMetadata>
  ) => {
    try {
      await writeSessionEntry(sessionId, (current) => ({ ...current, ...update }));
    } catch (error) {
      console.error("Failed to update session metadata:", error);
      set({ metadataError: String(error) });
    }
  },

  updateProjectMetadata: async (
    projectPath: string,
    update: Partial<ProjectMetadata>
  ) => {
    const { userMetadata } = get();
    const existingProject = userMetadata.projects[projectPath] || {};
    const mergedProject: ProjectMetadata = { ...existingProject, ...update };

    try {
      const updatedMetadata = await api<UserMetadata>(
        "update_project_metadata",
        {
          projectPath,
          update: mergedProject,
        }
      );
      set({ userMetadata: updatedMetadata });
    } catch (error) {
      console.error("Failed to update project metadata:", error);
      set({ metadataError: String(error) });
    }
  },

  updateUserSettings: async (update: Partial<UserSettings>) => {
    const { userMetadata } = get();
    const mergedSettings: UserSettings = {
      ...userMetadata.settings,
      ...update,
    };

    try {
      const updatedMetadata = await api<UserMetadata>("update_user_settings", {
        settings: mergedSettings,
      });
      set({ userMetadata: updatedMetadata });
    } catch (error) {
      console.error("Failed to update user settings:", error);
      const message = String(error);
      set({ metadataError: message });
      throw new Error(message);
    }
  },

  getSessionDisplayName: (
    sessionId: string,
    fallbackSummary?: string
  ): string | undefined => {
    const { userMetadata } = get();
    const sessionMeta = userMetadata.sessions[sessionId];
    return sessionMeta?.customName || fallbackSummary;
  },

  isProjectHidden: (projectPath: string): boolean => {
    const { userMetadata } = get();

    // Check explicit hidden flag
    const projectMeta = userMetadata.projects[projectPath];
    if (projectMeta?.hidden) {
      return true;
    }

    // Check hidden patterns
    const patterns = userMetadata.settings.hiddenPatterns || [];
    for (const pattern of patterns) {
      if (matchGlobPattern(projectPath, pattern)) {
        return true;
      }
    }

    return false;
  },

  hideProject: async (projectPath: string) => {
    await get().updateProjectMetadata(projectPath, { hidden: true });
  },

  unhideProject: async (projectPath: string) => {
    await get().updateProjectMetadata(projectPath, { hidden: false });
  },

  addCustomClaudePath: async (path: string, label?: string) => {
    const { userMetadata } = get();
    const currentPaths = userMetadata.settings.customClaudePaths ?? [];
    // Normalize: trim trailing slashes for consistent comparison
    const normalized = trimSlash(path);
    // Prevent duplicates
    if (currentPaths.some((cp) => trimSlash(cp.path) === normalized)) {
      return;
    }
    const entry: CustomClaudePath = { path: normalized, label };
    await get().updateUserSettings({
      customClaudePaths: [...currentPaths, entry],
    });
  },

  removeCustomClaudePath: async (path: string) => {
    const { userMetadata } = get();
    const currentPaths = userMetadata.settings.customClaudePaths ?? [];
    const normalized = trimSlash(path);
    await get().updateUserSettings({
      customClaudePaths: currentPaths.filter(
        (cp) => trimSlash(cp.path) !== normalized
      ),
    });
  },

  updateCustomClaudePathLabel: async (path: string, label: string) => {
    const { userMetadata } = get();
    const currentPaths = userMetadata.settings.customClaudePaths ?? [];
    const normalized = trimSlash(path);
    await get().updateUserSettings({
      customClaudePaths: currentPaths.map((cp) =>
        trimSlash(cp.path) === normalized
          ? { ...cp, label: label || undefined }
          : cp
      ),
    });
  },

  setWslEnabled: async (enabled: boolean) => {
    const wsl = getWsl();
    await get().updateUserSettings({ wsl: { ...wsl, enabled } });
  },

  toggleWslDistro: async (distroName: string) => {
    const wsl = getWsl();
    const excluded = wsl.excludedDistros.includes(distroName)
      ? wsl.excludedDistros.filter((d: string) => d !== distroName)
      : [...wsl.excludedDistros, distroName];
    await get().updateUserSettings({ wsl: { ...wsl, excludedDistros: excluded } });
  },

  isSessionFavorite: (sessionId: string): boolean =>
    get().userMetadata.sessions[sessionId]?.starred === true,

  toggleSessionFavorite: async (session: ClaudeSession, project: ClaudeProject) => {
    try {
      await writeSessionEntry(session.session_id, (current = {}) =>
        current.starred === true
          ? withoutFavorite(current)
          : {
              ...current,
              starred: true,
              starredAt: new Date().toISOString(),
              favorite: buildFavoriteRef(session, project, current.customName),
            }
      );
    } catch (error) {
      console.error("Failed to update favorite session:", error);
      toast.error(i18n.t("session.favorites.saveError"));
    }
  },

  removeSessionFavorite: async (sessionId: string) => {
    try {
      await writeSessionEntry(sessionId, (current) =>
        current != null &&
        (current.starred != null || current.starredAt != null || current.favorite != null)
          ? withoutFavorite(current)
          : null
      );
    } catch (error) {
      console.error("Failed to remove favorite session:", error);
      toast.error(i18n.t("session.favorites.saveError"));
    }
  },

  getFavoriteSessions: (): FavoriteSessionEntry[] =>
    listFavoriteSessions(get().userMetadata.sessions),

  openFavoriteSession: async (entry: FavoriteSessionEntry) => {
    const request = ++openFavoriteRequest;
    const project = findFavoriteProject(get().projects, entry.favorite);
    if (!project) {
      // During a scan the list is still filling in, so absence proves nothing.
      if (get().isLoadingProjects) {
        toast.info(i18n.t("session.favorites.projectsLoading"));
      } else {
        notifyFavoriteUnavailable(entry.sessionId);
      }
      return;
    }

    const { selectedSession, parentSessionStack, selectedProject } = get();
    if (
      selectedSession?.session_id === entry.sessionId &&
      parentSessionStack.length === 0 &&
      isSameProject(selectedProject, project)
    ) {
      showTranscript();
      return;
    }

    // Abandon the open when a newer one started or the user moved on while it
    // was loading: to another project, or to another session.
    let expectedProject: ClaudeProject | null = selectedProject;
    let expectedSessionPath = selectedSession?.file_path;
    const isStale = () => {
      const state = get();
      return (
        request !== openFavoriteRequest ||
        state.selectedSession?.file_path !== expectedSessionPath ||
        (expectedProject == null
          ? state.selectedProject != null
          : !isSameProject(state.selectedProject, expectedProject))
      );
    };

    const inSelectedProject = isSameProject(selectedProject, project);
    let session: ClaudeSession | undefined;
    try {
      if (inSelectedProject) {
        session = get().sessions.find((s) => s.session_id === entry.sessionId);
      }
      if (!session) {
        // The loaded list is one page (and another project's is not loaded at
        // all), so look in the whole list before changing what is on screen.
        const allSessions = await loadAllProjectSessions(project, get().excludeSidechain);
        if (isStale()) return;
        session = allSessions.find((s) => s.session_id === entry.sessionId);
      }
      if (!session) {
        notifyFavoriteUnavailable(entry.sessionId);
        return;
      }
      if (!inSelectedProject) {
        await get().selectProject(project);
        // Switching projects clears the selection.
        expectedProject = project;
        expectedSessionPath = undefined;
        if (isStale()) return;
      }
      showTranscript();
      await get().selectSession(session);
    } catch (error) {
      console.error("Failed to open favorite session:", error);
      toast.error(i18n.t("session.favorites.openError"));
      return;
    }

    await refreshFavoriteSnapshot(entry.sessionId, session, project);
  },
  };
};
