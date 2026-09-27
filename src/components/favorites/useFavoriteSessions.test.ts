import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import type { ClaudeProject, ClaudeSession, SessionMetadata } from "@/types";
import { useFavoriteSessions } from "./useFavoriteSessions";

vi.mock("react-i18next", async (importOriginal) => ({
  // Keep initReactI18next: the store pulls in the i18n singleton.
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options ? `${key}(${Object.values(options).join(",")})` : key,
  }),
}));

vi.mock("@/utils/time", () => ({
  formatTimeAgo: () => "3 hours ago",
}));

const project: ClaudeProject = {
  name: "-home-me-work-api",
  path: "/home/me/.claude/projects/-home-me-work-api",
  actual_path: "/home/me/work/api",
  session_count: 2,
  message_count: 20,
  last_modified: "2026-09-26T10:00:00Z",
  provider: "claude",
};

const idA = `${project.path}/a.jsonl`;
const idB = `${project.path}/b.jsonl`;
const idGone = "/home/me/.claude/projects/-home-me-old/c.jsonl";

function starred(starredAt: string, extra: Partial<SessionMetadata["favorite"]> = {}, meta: SessionMetadata = {}): SessionMetadata {
  return {
    starred: true,
    starredAt,
    favorite: { projectPath: project.path, provider: "claude", ...extra },
    ...meta,
  };
}

function session(id: string): ClaudeSession {
  return {
    session_id: id,
    actual_session_id: `${id}-uuid`,
    file_path: id,
    project_name: "api",
    message_count: 1,
    first_message_time: "",
    last_message_time: "",
    last_modified: "",
    has_tool_use: false,
    has_errors: false,
  };
}

const initialState = useAppStore.getState();
const openFavoriteSession = vi.fn(async () => {});
const removeSessionFavorite = vi.fn(async () => {});

describe("useFavoriteSessions", () => {
  beforeEach(() => {
    useAppStore.setState({
      projects: [project],
      selectedSession: null,
      parentSessionStack: [],
      isServerReadOnly: false,
      openFavoriteSession,
      removeSessionFavorite,
      userMetadata: {
        version: 1,
        projects: {},
        settings: {},
        sessions: {
          [idA]: starred("2026-09-01T10:00:00.000Z", {
            title: "Snapshot title",
            actualSessionId: "aaaaaaaa-0000-0000-0000-00000000abcd",
            lastMessageTime: "2026-09-27T09:00:00Z",
          }),
          [idB]: starred("2026-09-20T10:00:00.000Z", {}, { customName: "My rename" }),
          [idGone]: starred("2026-09-10T10:00:00.000Z", {
            projectPath: "/home/me/.claude/projects/-home-me-old",
            actualSessionId: "cccccccc-0000-0000-0000-00000000cafe",
          }),
        },
      },
    });
  });

  afterEach(() => {
    useAppStore.setState(initialState, true);
    vi.clearAllMocks();
  });

  it("lists favourites newest first with the name the user sees", () => {
    const { result } = renderHook(() => useFavoriteSessions());

    const byId = Object.fromEntries(result.current.items.map((item) => [item.entry.sessionId, item]));
    expect(result.current.items.map((item) => item.entry.sessionId)).toEqual([idB, idGone, idA]);
    // The rename wins over the snapshot; without either, the id labels it.
    expect(byId[idB]?.title).toBe("My rename");
    expect(byId[idA]?.title).toBe("Snapshot title");
    expect(byId[idGone]?.title).toBe("header.breadcrumb.untitledSession(0000cafe)");
  });

  it("names the project and puts its path and the last message in the tooltip", () => {
    const { result } = renderHook(() => useFavoriteSessions());
    const [b, gone, a] = result.current.items;

    expect(a?.projectName).toBe("api");
    expect(a?.tooltip).toBe("/home/me/work/api\nsession.favorites.lastMessage(3 hours ago)");
    expect(b?.tooltip).toBe("/home/me/work/api");
    // A project that is no longer loaded falls back to its stored path.
    expect(gone?.projectName).toBe("-home-me-old");
    expect(gone?.tooltip).toBe("/home/me/.claude/projects/-home-me-old");
  });

  it("marks the open session, and the parent of an open subagent transcript", () => {
    useAppStore.setState({ selectedSession: session(idA) });
    const { result, rerender } = renderHook(() => useFavoriteSessions());
    expect(result.current.items.filter((item) => item.isSelected).map((item) => item.entry.sessionId)).toEqual([idA]);

    act(() => {
      useAppStore.setState({ selectedSession: session("subagent"), parentSessionStack: [session(idB)] });
    });
    rerender();
    expect(result.current.items.filter((item) => item.isSelected).map((item) => item.entry.sessionId)).toEqual([idB]);
  });

  it("opens and removes through the store", () => {
    const { result } = renderHook(() => useFavoriteSessions());
    const [first] = result.current.items;

    result.current.onOpen(first!.entry);
    result.current.onRemove(first!.entry);

    expect(openFavoriteSession).toHaveBeenCalledWith(first!.entry);
    expect(removeSessionFavorite).toHaveBeenCalledWith(idB);
  });

  it("cannot remove on a read-only server", () => {
    useAppStore.setState({ isServerReadOnly: true });
    const { result } = renderHook(() => useFavoriteSessions());
    expect(result.current.canRemove).toBe(false);
  });
});
