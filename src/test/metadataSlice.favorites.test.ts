/**
 * Favourite sessions in the metadata slice: starring, listing and opening.
 *
 * The backend is faked with the semantics of `update_session_metadata`: the
 * sent entry replaces the stored one, and an empty entry is removed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { toast } from "sonner";
import type {
  ClaudeProject,
  ClaudeSession,
  FavoriteSessionEntry,
  SessionMetadata,
  UserMetadata,
} from "../types";
import { createMetadataSlice, type MetadataSlice } from "../store/slices/metadataSlice";
import type { FullAppStore } from "../store/slices/types";

const mockApi = vi.fn();
vi.mock("@/services/api", () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("../i18n", () => ({
  default: { t: (key: string) => key },
}));

// ============================================================================
// Fixtures
// ============================================================================

const claudeProject: ClaudeProject = {
  name: "-home-me-work-api",
  path: "/home/me/.claude/projects/-home-me-work-api",
  actual_path: "/home/me/work/api",
  session_count: 60,
  message_count: 600,
  last_modified: "2026-09-26T10:00:00Z",
  provider: "claude",
};

const codexProject: ClaudeProject = {
  name: "web",
  path: "codex:///home/me/work/web",
  actual_path: "/home/me/work/web",
  session_count: 3,
  message_count: 30,
  last_modified: "2026-09-25T10:00:00Z",
  provider: "codex",
};

function makeSession(id: string, overrides: Partial<ClaudeSession> = {}): ClaudeSession {
  const filePath = `${claudeProject.path}/${id}.jsonl`;
  return {
    session_id: filePath,
    actual_session_id: `${id}-uuid`,
    file_path: filePath,
    project_name: "api",
    message_count: 10,
    first_message_time: "2026-09-20T08:00:00Z",
    last_message_time: "2026-09-20T09:00:00Z",
    last_modified: "2026-09-20T09:00:00Z",
    has_tool_use: false,
    has_errors: false,
    summary: `Summary of ${id}`,
    ...overrides,
  };
}

const recent = makeSession("recent");
const older = makeSession("older", { summary: "Older work" });
const codexSession = makeSession("codex-1", {
  session_id: "/home/me/.codex/sessions/rollout-1.jsonl",
  file_path: "/home/me/.codex/sessions/rollout-1.jsonl",
  provider: "codex",
});

const NOW = new Date("2026-09-27T12:00:00.000Z");

// ============================================================================
// Fake backend and test store
// ============================================================================

let backend: UserMetadata;

function isEmptyEntry(entry: SessionMetadata): boolean {
  // Mirrors `SessionMetadata::is_empty` in Rust (undefined keys are dropped by JSON).
  return Object.values(JSON.parse(JSON.stringify(entry)) as Record<string, unknown>).every(
    (value) => Array.isArray(value) && value.length === 0
  );
}

function installBackend(sessionsById: Record<string, ClaudeSession[]> = {}) {
  mockApi.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    if (command === "update_session_metadata") {
      const { sessionId, update } = args as { sessionId: string; update: SessionMetadata };
      const sessions = { ...backend.sessions };
      if (isEmptyEntry(update)) delete sessions[sessionId];
      else sessions[sessionId] = JSON.parse(JSON.stringify(update)) as SessionMetadata;
      backend = { ...backend, sessions };
      return structuredClone(backend);
    }
    if (command === "load_project_sessions" || command === "load_provider_sessions") {
      return sessionsById[args?.projectPath as string] ?? [];
    }
    throw new Error(`unexpected command ${command}`);
  });
}

type TestStore = MetadataSlice &
  Pick<
    FullAppStore,
    | "projects"
    | "selectedProject"
    | "selectedSession"
    | "sessions"
    | "parentSessionStack"
    | "excludeSidechain"
    | "isLoadingProjects"
    | "isServerReadOnly"
    | "selectProject"
    | "selectSession"
  >;

/** First page each project shows after `selectProject`. */
const firstPage: Record<string, ClaudeSession[]> = {
  [claudeProject.path]: [recent],
  [codexProject.path]: [],
};

function createTestStore(initial: Partial<TestStore> = {}) {
  const store = create<TestStore>()((set, get) => ({
    ...createMetadataSlice(
      set as unknown as Parameters<typeof createMetadataSlice>[0],
      get as unknown as Parameters<typeof createMetadataSlice>[1],
      undefined as unknown as Parameters<typeof createMetadataSlice>[2]
    ),
    projects: [claudeProject, codexProject],
    selectedProject: null,
    selectedSession: null,
    sessions: [],
    parentSessionStack: [],
    excludeSidechain: true,
    isLoadingProjects: false,
    isServerReadOnly: false,
    selectProject: vi.fn(async (project: ClaudeProject) => {
      set({
        selectedProject: project,
        selectedSession: null,
        sessions: firstPage[project.path] ?? [],
      });
    }),
    selectSession: vi.fn(async (session: ClaudeSession) => {
      set({ selectedSession: session, parentSessionStack: [] });
    }),
  }));
  store.setState({ userMetadata: structuredClone(backend), ...initial });
  return store;
}

function sessionWrites() {
  return mockApi.mock.calls.filter(([command]) => command === "update_session_metadata");
}

function favoriteEntry(store: ReturnType<typeof createTestStore>, sessionId: string): FavoriteSessionEntry {
  const entry = store.getState().getFavoriteSessions().find((e) => e.sessionId === sessionId);
  if (!entry) throw new Error(`no favourite ${sessionId}`);
  return entry;
}

function starredMetadata(session: ClaudeSession, project: ClaudeProject, extra: SessionMetadata = {}): SessionMetadata {
  return {
    starred: true,
    starredAt: "2026-09-26T10:00:00.000Z",
    favorite: {
      projectPath: project.path,
      provider: project.provider,
      title: session.summary,
      actualSessionId: session.actual_session_id,
      lastMessageTime: session.last_message_time,
    },
    ...extra,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  backend = { version: 1, sessions: {}, projects: {}, settings: {} };
  mockApi.mockReset();
  installBackend();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ============================================================================
// Tests
// ============================================================================

describe("isSessionFavorite", () => {
  it("is true only for starred sessions", () => {
    backend.sessions = {
      a: { starred: true },
      b: { starred: false },
      c: { customName: "x" },
    };
    const store = createTestStore();
    expect(store.getState().isSessionFavorite("a")).toBe(true);
    expect(store.getState().isSessionFavorite("b")).toBe(false);
    expect(store.getState().isSessionFavorite("c")).toBe(false);
    expect(store.getState().isSessionFavorite("missing")).toBe(false);
  });
});

describe("toggleSessionFavorite", () => {
  it("stars a session with the time and a snapshot of where it lives", async () => {
    const store = createTestStore();

    await store.getState().toggleSessionFavorite(recent, claudeProject);

    expect(sessionWrites()).toHaveLength(1);
    expect(mockApi).toHaveBeenCalledWith("update_session_metadata", {
      sessionId: recent.session_id,
      update: {
        starred: true,
        starredAt: NOW.toISOString(),
        favorite: {
          projectPath: claudeProject.path,
          provider: "claude",
          title: "Summary of recent",
          actualSessionId: "recent-uuid",
          lastMessageTime: recent.last_message_time,
        },
      },
    });
    expect(store.getState().isSessionFavorite(recent.session_id)).toBe(true);
  });

  it("keeps the user's other metadata and titles the favourite with the custom name", async () => {
    backend.sessions = { [recent.session_id]: { customName: "Login fix", tags: ["auth"] } };
    const store = createTestStore();

    await store.getState().toggleSessionFavorite(recent, claudeProject);

    const stored = backend.sessions[recent.session_id];
    expect(stored).toMatchObject({ customName: "Login fix", tags: ["auth"], starred: true });
    expect(stored?.favorite?.title).toBe("Login fix");
  });

  it("unstarring removes all three fields and keeps the rest", async () => {
    backend.sessions = {
      [recent.session_id]: starredMetadata(recent, claudeProject, { customName: "Login fix" }),
    };
    const store = createTestStore();

    await store.getState().toggleSessionFavorite(recent, claudeProject);

    const [, args] = sessionWrites()[0] ?? [];
    const update = (args as { update: SessionMetadata }).update;
    expect(update).not.toHaveProperty("starred");
    expect(update).not.toHaveProperty("starredAt");
    expect(update).not.toHaveProperty("favorite");
    expect(store.getState().userMetadata.sessions[recent.session_id]).toEqual({ customName: "Login fix" });
    expect(store.getState().isSessionFavorite(recent.session_id)).toBe(false);
  });

  it("an entry left empty by unstarring disappears", async () => {
    backend.sessions = { [recent.session_id]: starredMetadata(recent, claudeProject) };
    const store = createTestStore();

    await store.getState().toggleSessionFavorite(recent, claudeProject);

    expect(sessionWrites()[0]?.[1]).toEqual({ sessionId: recent.session_id, update: {} });
    expect(store.getState().userMetadata.sessions).not.toHaveProperty(recent.session_id);
  });

  it("applies quick toggles in order, each on top of the last", async () => {
    const store = createTestStore();

    // Fired together: the second must see the star written by the first.
    await Promise.all([
      store.getState().toggleSessionFavorite(recent, claudeProject),
      store.getState().toggleSessionFavorite(recent, claudeProject),
    ]);

    const updates = sessionWrites().map(([, args]) => (args as { update: SessionMetadata }).update);
    expect(updates[0]).toMatchObject({ starred: true });
    expect(updates[1]).toEqual({});
    expect(store.getState().isSessionFavorite(recent.session_id)).toBe(false);
  });

  it("shows a toast and keeps the old state when saving fails", async () => {
    const store = createTestStore();
    mockApi.mockRejectedValueOnce(new Error("disk full"));

    await store.getState().toggleSessionFavorite(recent, claudeProject);

    expect(toast.error).toHaveBeenCalledWith("session.favorites.saveError");
    expect(store.getState().isSessionFavorite(recent.session_id)).toBe(false);
  });

  it("a failed write does not block the next one", async () => {
    const store = createTestStore();
    mockApi.mockRejectedValueOnce(new Error("disk full"));

    await store.getState().toggleSessionFavorite(recent, claudeProject);
    await store.getState().toggleSessionFavorite(recent, claudeProject);

    expect(store.getState().isSessionFavorite(recent.session_id)).toBe(true);
  });
});

describe("removeSessionFavorite", () => {
  it("drops the favourite fields by session id", async () => {
    backend.sessions = {
      [older.session_id]: starredMetadata(older, claudeProject, { notes: "keep" }),
    };
    const store = createTestStore();

    await store.getState().removeSessionFavorite(older.session_id);

    expect(store.getState().userMetadata.sessions[older.session_id]).toEqual({ notes: "keep" });
  });

  it("writes nothing for a session that is not a favourite", async () => {
    backend.sessions = { [older.session_id]: { customName: "x" } };
    const store = createTestStore();

    await store.getState().removeSessionFavorite(older.session_id);
    await store.getState().removeSessionFavorite("unknown");

    expect(sessionWrites()).toHaveLength(0);
  });
});

describe("getFavoriteSessions", () => {
  it("lists favourites most recently starred first and skips stars without a snapshot", () => {
    backend.sessions = {
      [older.session_id]: starredMetadata(older, claudeProject, { starredAt: "2026-09-01T10:00:00.000Z" }),
      [recent.session_id]: starredMetadata(recent, claudeProject, { starredAt: "2026-09-20T10:00:00.000Z" }),
      legacy: { starred: true },
      renamed: { customName: "not a favourite" },
    };
    const store = createTestStore();

    const entries = store.getState().getFavoriteSessions();

    expect(entries.map((e) => e.sessionId)).toEqual([recent.session_id, older.session_id]);
    expect(entries[0]).toEqual({
      sessionId: recent.session_id,
      starredAt: "2026-09-20T10:00:00.000Z",
      favorite: backend.sessions[recent.session_id]?.favorite,
    });
  });
});

describe("openFavoriteSession", () => {
  it("opens a session that is on the loaded page of the selected project", async () => {
    backend.sessions = { [recent.session_id]: starredMetadata(recent, claudeProject) };
    const store = createTestStore({ selectedProject: claudeProject, sessions: [recent] });

    await store.getState().openFavoriteSession(favoriteEntry(store, recent.session_id));

    expect(store.getState().selectProject).not.toHaveBeenCalled();
    expect(store.getState().selectSession).toHaveBeenCalledWith(recent);
    expect(mockApi).not.toHaveBeenCalled();
  });

  it("switches to the favourite's project first", async () => {
    backend.sessions = { [recent.session_id]: starredMetadata(recent, claudeProject) };
    const store = createTestStore({ selectedProject: codexProject, sessions: [codexSession] });

    await store.getState().openFavoriteSession(favoriteEntry(store, recent.session_id));

    expect(store.getState().selectProject).toHaveBeenCalledWith(claudeProject);
    expect(store.getState().selectSession).toHaveBeenCalledWith(recent);
  });

  it("loads the whole session list when the favourite is past the loaded page", async () => {
    backend.sessions = { [older.session_id]: starredMetadata(older, claudeProject) };
    installBackend({ [claudeProject.path]: [recent, older] });
    const store = createTestStore();

    await store.getState().openFavoriteSession(favoriteEntry(store, older.session_id));

    expect(store.getState().selectProject).toHaveBeenCalledWith(claudeProject);
    expect(mockApi).toHaveBeenCalledWith("load_project_sessions", {
      projectPath: claudeProject.path,
      excludeSidechain: true,
    });
    expect(store.getState().selectSession).toHaveBeenCalledWith(older);
  });

  it("loads a provider project's sessions with the provider command", async () => {
    backend.sessions = { [codexSession.session_id]: starredMetadata(codexSession, codexProject) };
    installBackend({ [codexProject.path]: [codexSession] });
    const store = createTestStore({ selectedProject: claudeProject, sessions: [recent] });

    await store.getState().openFavoriteSession(favoriteEntry(store, codexSession.session_id));

    expect(mockApi).toHaveBeenCalledWith("load_provider_sessions", {
      provider: "codex",
      projectPath: codexProject.path,
      excludeSidechain: true,
    });
    expect(store.getState().selectSession).toHaveBeenCalledWith(codexSession);
  });

  it("refreshes the snapshot when the title or last message changed", async () => {
    const stale = starredMetadata(recent, claudeProject, {
      favorite: {
        projectPath: claudeProject.path,
        provider: "claude",
        title: "Old title",
        actualSessionId: recent.actual_session_id,
        lastMessageTime: "2026-09-01T00:00:00Z",
      },
    });
    backend.sessions = { [recent.session_id]: stale };
    const store = createTestStore({ selectedProject: claudeProject, sessions: [recent] });

    await store.getState().openFavoriteSession(favoriteEntry(store, recent.session_id));

    expect(sessionWrites()).toHaveLength(1);
    expect(store.getState().userMetadata.sessions[recent.session_id]).toEqual({
      ...stale,
      favorite: { ...stale.favorite, title: recent.summary, lastMessageTime: recent.last_message_time },
    });
  });

  it("does not write when the snapshot is current", async () => {
    backend.sessions = { [recent.session_id]: starredMetadata(recent, claudeProject) };
    const store = createTestStore({ selectedProject: claudeProject, sessions: [recent] });

    await store.getState().openFavoriteSession(favoriteEntry(store, recent.session_id));

    expect(sessionWrites()).toHaveLength(0);
  });

  it("does nothing when the favourite is already open", async () => {
    backend.sessions = { [recent.session_id]: starredMetadata(recent, claudeProject) };
    const store = createTestStore({
      selectedProject: claudeProject,
      selectedSession: recent,
      sessions: [recent],
    });

    await store.getState().openFavoriteSession(favoriteEntry(store, recent.session_id));

    expect(store.getState().selectSession).not.toHaveBeenCalled();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it("reopens the favourite from one of its subagent transcripts", async () => {
    backend.sessions = { [recent.session_id]: starredMetadata(recent, claudeProject) };
    const subagent = makeSession("agent-1", { session_id: "sub", file_path: "sub" });
    const store = createTestStore({
      selectedProject: claudeProject,
      selectedSession: subagent,
      parentSessionStack: [recent],
      sessions: [recent],
    });

    await store.getState().openFavoriteSession(favoriteEntry(store, recent.session_id));

    expect(store.getState().selectSession).toHaveBeenCalledWith(recent);
  });

  it("offers to remove a favourite whose project is gone", async () => {
    backend.sessions = {
      [recent.session_id]: starredMetadata(recent, { ...claudeProject, path: "/home/me/.claude/projects/-gone" }),
    };
    const store = createTestStore();

    await store.getState().openFavoriteSession(favoriteEntry(store, recent.session_id));

    expect(store.getState().selectProject).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "session.favorites.unavailable",
      expect.objectContaining({
        action: expect.objectContaining({ label: "session.favorites.removeAction" }),
      })
    );

    const options = vi.mocked(toast.error).mock.calls[0]?.[1] as {
      action: { onClick: () => void };
    };
    options.action.onClick();
    await vi.waitFor(() =>
      expect(store.getState().userMetadata.sessions).not.toHaveProperty(recent.session_id)
    );
  });

  it("offers to remove a favourite whose session is gone", async () => {
    backend.sessions = { [older.session_id]: starredMetadata(older, claudeProject) };
    installBackend({ [claudeProject.path]: [recent] });
    const store = createTestStore();

    await store.getState().openFavoriteSession(favoriteEntry(store, older.session_id));

    expect(store.getState().selectSession).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "session.favorites.unavailable",
      expect.objectContaining({ action: expect.anything() })
    );
  });

  it("offers no remove action on a read-only server", async () => {
    backend.sessions = {
      [recent.session_id]: starredMetadata(recent, { ...claudeProject, path: "/gone" }),
    };
    const store = createTestStore({ isServerReadOnly: true });

    await store.getState().openFavoriteSession(favoriteEntry(store, recent.session_id));

    expect(toast.error).toHaveBeenCalledWith("session.favorites.unavailable");
  });

  it("asks to wait instead of calling a favourite gone while projects are loading", async () => {
    backend.sessions = { [recent.session_id]: starredMetadata(recent, claudeProject) };
    const store = createTestStore({ projects: [], isLoadingProjects: true });

    await store.getState().openFavoriteSession(favoriteEntry(store, recent.session_id));

    expect(toast.info).toHaveBeenCalledWith("session.favorites.projectsLoading");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows a toast when loading the sessions fails", async () => {
    backend.sessions = { [older.session_id]: starredMetadata(older, claudeProject) };
    const store = createTestStore({ selectedProject: claudeProject, sessions: [recent] });
    mockApi.mockRejectedValueOnce(new Error("backend down"));

    await store.getState().openFavoriteSession(favoriteEntry(store, older.session_id));

    expect(toast.error).toHaveBeenCalledWith("session.favorites.openError");
    expect(store.getState().selectSession).not.toHaveBeenCalled();
  });

  it("a newer open wins over one still loading", async () => {
    backend.sessions = {
      [older.session_id]: starredMetadata(older, claudeProject),
      [recent.session_id]: starredMetadata(recent, claudeProject),
    };
    let releaseLoad: (sessions: ClaudeSession[]) => void = () => {};
    mockApi.mockImplementationOnce(
      () => new Promise<ClaudeSession[]>((resolve) => (releaseLoad = resolve))
    );
    const store = createTestStore({ selectedProject: claudeProject, sessions: [recent] });

    const slow = store.getState().openFavoriteSession(favoriteEntry(store, older.session_id));
    await store.getState().openFavoriteSession(favoriteEntry(store, recent.session_id));
    releaseLoad([recent, older]);
    await slow;

    expect(store.getState().selectSession).toHaveBeenCalledTimes(1);
    expect(store.getState().selectSession).toHaveBeenCalledWith(recent);
  });

  it("stops when the user picks another project while it loads", async () => {
    backend.sessions = { [older.session_id]: starredMetadata(older, claudeProject) };
    let releaseLoad: (sessions: ClaudeSession[]) => void = () => {};
    mockApi.mockImplementationOnce(
      () => new Promise<ClaudeSession[]>((resolve) => (releaseLoad = resolve))
    );
    const store = createTestStore({ selectedProject: claudeProject, sessions: [recent] });

    const pending = store.getState().openFavoriteSession(favoriteEntry(store, older.session_id));
    store.setState({ selectedProject: codexProject, sessions: [codexSession] });
    releaseLoad([recent, older]);
    await pending;

    expect(store.getState().selectSession).not.toHaveBeenCalled();
  });
});
