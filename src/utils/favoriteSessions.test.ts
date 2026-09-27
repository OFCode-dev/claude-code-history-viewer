import { describe, expect, it } from "vitest";
import type { ClaudeProject, ClaudeSession, SessionMetadata } from "@/types";
import {
  buildFavoriteRef,
  findFavoriteProject,
  isSameFavoriteRef,
  isSameProject,
  listFavoriteSessions,
  withoutFavorite,
} from "./favoriteSessions";

const project: ClaudeProject = {
  name: "-home-me-work-api",
  path: "/home/me/.claude/projects/-home-me-work-api",
  actual_path: "/home/me/work/api",
  session_count: 2,
  message_count: 20,
  last_modified: "2026-09-26T10:00:00Z",
  provider: "claude",
};

const session: ClaudeSession = {
  session_id: "/home/me/.claude/projects/-home-me-work-api/a.jsonl",
  actual_session_id: "aaaaaaaa-0000-0000-0000-000000000001",
  file_path: "/home/me/.claude/projects/-home-me-work-api/a.jsonl",
  project_name: "api",
  message_count: 12,
  first_message_time: "2026-09-26T08:00:00Z",
  last_message_time: "2026-09-26T09:30:00Z",
  last_modified: "2026-09-26T09:30:00Z",
  has_tool_use: true,
  has_errors: false,
  summary: "Fix the\n  login   flow",
};

describe("buildFavoriteRef", () => {
  it("snapshots project, provider, ids and the summary as one line", () => {
    expect(buildFavoriteRef(session, project)).toEqual({
      projectPath: project.path,
      provider: "claude",
      title: "Fix the login flow",
      actualSessionId: session.actual_session_id,
      lastMessageTime: session.last_message_time,
    });
  });

  it("prefers the user's custom name over the summary", () => {
    expect(buildFavoriteRef(session, project, "  My login fix ").title).toBe("My login fix");
  });

  it("leaves out what is unknown instead of storing empty values", () => {
    const bare = buildFavoriteRef(
      { ...session, summary: undefined, actual_session_id: "", last_message_time: "", provider: undefined },
      { ...project, provider: undefined },
    );
    expect(bare).toStrictEqual({ projectPath: project.path });
  });

  it("falls back to the session's provider when the project has none", () => {
    const ref = buildFavoriteRef({ ...session, provider: "codex" }, { ...project, provider: undefined });
    expect(ref.provider).toBe("codex");
  });

  it("caps a very long title", () => {
    const ref = buildFavoriteRef({ ...session, summary: "x".repeat(500) }, project);
    expect(ref.title).toHaveLength(200);
  });
});

describe("isSameFavoriteRef", () => {
  it("compares every recorded field", () => {
    const ref = buildFavoriteRef(session, project);
    expect(isSameFavoriteRef({ ...ref }, ref)).toBe(true);
    expect(isSameFavoriteRef({ ...ref, title: "Renamed" }, ref)).toBe(false);
    expect(isSameFavoriteRef({ ...ref, lastMessageTime: "2026-09-27T00:00:00Z" }, ref)).toBe(false);
    expect(isSameFavoriteRef(undefined, ref)).toBe(false);
  });
});

describe("withoutFavorite", () => {
  it("drops starred, starredAt and favorite and keeps everything else", () => {
    const meta: SessionMetadata = {
      customName: "Keep me",
      tags: ["a"],
      notes: "n",
      starred: true,
      starredAt: "2026-09-27T10:00:00.000Z",
      favorite: { projectPath: project.path },
    };
    expect(withoutFavorite(meta)).toStrictEqual({ customName: "Keep me", tags: ["a"], notes: "n" });
    // The input is not mutated.
    expect(meta.starred).toBe(true);
  });
});

describe("listFavoriteSessions", () => {
  const ref = { projectPath: project.path, title: "t" };

  it("orders favourites by when they were starred, newest first", () => {
    const entries = listFavoriteSessions({
      old: { starred: true, starredAt: "2026-09-01T10:00:00.000Z", favorite: ref },
      newest: { starred: true, starredAt: "2026-09-27T10:00:00.000Z", favorite: ref },
      middle: { starred: true, starredAt: "2026-09-15T10:00:00.000Z", favorite: ref },
    });
    expect(entries.map((e) => e.sessionId)).toEqual(["newest", "middle", "old"]);
    expect(entries[0]).toEqual({ sessionId: "newest", starredAt: "2026-09-27T10:00:00.000Z", favorite: ref });
  });

  it("compares instants, not strings", () => {
    const entries = listFavoriteSessions({
      a: { starred: true, starredAt: "2026-09-27T10:00:00Z", favorite: ref },
      b: { starred: true, starredAt: "2026-09-27T10:00:00.500Z", favorite: ref },
    });
    expect(entries.map((e) => e.sessionId)).toEqual(["b", "a"]);
  });

  it("puts a favourite without a star time last", () => {
    const entries = listFavoriteSessions({
      undated: { starred: true, favorite: ref },
      dated: { starred: true, starredAt: "2026-09-01T10:00:00.000Z", favorite: ref },
    });
    expect(entries.map((e) => e.sessionId)).toEqual(["dated", "undated"]);
    expect(entries[1]?.starredAt).toBe("");
  });

  it("skips sessions that are not starred", () => {
    expect(
      listFavoriteSessions({
        renamed: { customName: "x" },
        unstarred: { starred: false, favorite: ref },
      }),
    ).toEqual([]);
  });

  it("skips stars without a snapshot, which cannot be opened", () => {
    expect(
      listFavoriteSessions({
        legacy: { starred: true },
        noPath: { starred: true, starredAt: "2026-09-01T10:00:00.000Z", favorite: { projectPath: "" } },
      }),
    ).toEqual([]);
  });
});

describe("project matching", () => {
  const codex: ClaudeProject = { ...project, path: "codex:///home/me/work/api", provider: "codex" };

  it("isSameProject compares path and provider, treating no provider as claude", () => {
    expect(isSameProject(project, { ...project, provider: undefined })).toBe(true);
    expect(isSameProject(project, { ...project, provider: "codex" })).toBe(false);
    expect(isSameProject(project, codex)).toBe(false);
    expect(isSameProject(null, project)).toBe(false);
  });

  it("findFavoriteProject matches by path and, when recorded, provider", () => {
    const projects = [codex, project];
    expect(findFavoriteProject(projects, { projectPath: project.path })).toBe(project);
    expect(findFavoriteProject(projects, { projectPath: project.path, provider: "claude" })).toBe(project);
    expect(findFavoriteProject(projects, { projectPath: project.path, provider: "codex" })).toBeUndefined();
    expect(findFavoriteProject([{ ...project, provider: undefined }], { projectPath: project.path, provider: "claude" })).toBeDefined();
    expect(findFavoriteProject(projects, { projectPath: "/gone" })).toBeUndefined();
  });
});
