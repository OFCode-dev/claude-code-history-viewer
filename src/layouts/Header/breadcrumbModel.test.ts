import { describe, expect, it } from "vitest";
import type { ClaudeSession, SubagentSession } from "@/types";
import {
  buildPathCrumbs,
  buildSessionCrumbs,
  collapsePathCrumbs,
  type PathCrumb,
} from "./breadcrumbModel";

const session = (overrides: Partial<ClaudeSession> = {}): ClaudeSession => ({
  session_id: "11111111-2222-3333-4444-555566667777",
  actual_session_id: "11111111-2222-3333-4444-555566667777",
  file_path: "/home/me/.claude/projects/-work-acme-api/root.jsonl",
  project_name: "api",
  message_count: 3,
  first_message_time: "2026-09-25T10:00:00Z",
  last_message_time: "2026-09-25T11:00:00Z",
  last_modified: "2026-09-25T11:00:00Z",
  has_tool_use: false,
  has_errors: false,
  summary: "Fix the login flow",
  ...overrides,
});

/** The synthetic session `navigateToSubagent` selects for a subagent file. */
const subagentSession = (agentId: string, summary: string | null): ClaudeSession =>
  session({
    session_id: `/home/me/.claude/projects/-work-acme-api/root/subagents/agent-${agentId}.jsonl`,
    actual_session_id: agentId,
    file_path: `/home/me/.claude/projects/-work-acme-api/root/subagents/agent-${agentId}.jsonl`,
    summary: summary ?? agentId,
  });

const subagent = (agentId: string, overrides: Partial<SubagentSession> = {}): SubagentSession => ({
  agent_id: agentId,
  file_path: `/home/me/.claude/projects/-work-acme-api/root/subagents/agent-${agentId}.jsonl`,
  message_count: 5,
  file_size: 100,
  first_message_time: null,
  last_message_time: null,
  summary: "first prompt line",
  tool_use_id: null,
  workflow_run_id: null,
  ...overrides,
});

const untitled = (id: string) => `Session ${id}`;

describe("buildPathCrumbs", () => {
  it("starts a path under home with ~ and gives every segment its absolute path", () => {
    expect(buildPathCrumbs("/home/me/work/acme/api", "/home/me")).toEqual([
      { label: "~", path: "/home/me" },
      { label: "work", path: "/home/me/work" },
      { label: "acme", path: "/home/me/work/acme" },
      { label: "api", path: "/home/me/work/acme/api" },
    ]);
  });

  it("shows the home directory itself as a single ~ crumb", () => {
    expect(buildPathCrumbs("/home/me", "/home/me")).toEqual([
      { label: "~", path: "/home/me" },
    ]);
  });

  it("does not treat a sibling that shares the home prefix as home", () => {
    expect(buildPathCrumbs("/home/me2/app", "/home/me")).toEqual([
      { label: "/", path: "/" },
      { label: "home", path: "/home" },
      { label: "me2", path: "/home/me2" },
      { label: "app", path: "/home/me2/app" },
    ]);
  });

  it("starts a path outside home at the filesystem root", () => {
    expect(buildPathCrumbs("/tmp/scratch/", null)).toEqual([
      { label: "/", path: "/" },
      { label: "tmp", path: "/tmp" },
      { label: "scratch", path: "/tmp/scratch" },
    ]);
  });

  it("keeps Windows separators in the revealed paths", () => {
    expect(buildPathCrumbs("C:\\Users\\me\\src\\app", "C:\\Users\\me")).toEqual([
      { label: "~", path: "C:\\Users\\me" },
      { label: "src", path: "C:\\Users\\me\\src" },
      { label: "app", path: "C:\\Users\\me\\src\\app" },
    ]);
    expect(buildPathCrumbs("D:\\data\\app", null)).toEqual([
      { label: "D:", path: "D:\\" },
      { label: "data", path: "D:\\data" },
      { label: "app", path: "D:\\data\\app" },
    ]);
  });

  it("returns nothing for an empty path", () => {
    expect(buildPathCrumbs("", "/home/me")).toEqual([]);
  });
});

describe("collapsePathCrumbs", () => {
  const crumbs: PathCrumb[] = ["~", "a", "b", "c", "d"].map((label) => ({
    label,
    path: `/${label}`,
  }));

  it("shows everything when nothing is collapsed", () => {
    expect(collapsePathCrumbs(crumbs, 0)).toEqual({
      leading: [crumbs[0]],
      hidden: [],
      trailing: crumbs.slice(1),
    });
  });

  it("hides middle segments nearest the root first and keeps first and last", () => {
    expect(collapsePathCrumbs(crumbs, 2)).toEqual({
      leading: [crumbs[0]],
      hidden: [crumbs[1], crumbs[2]],
      trailing: [crumbs[3], crumbs[4]],
    });
  });

  it("never hides the first or the last segment", () => {
    const result = collapsePathCrumbs(crumbs, 99);
    expect(result.leading).toEqual([crumbs[0]]);
    expect(result.hidden).toEqual(crumbs.slice(1, 4));
    expect(result.trailing).toEqual([crumbs[4]]);
  });

  it("has nothing to hide with two segments or fewer", () => {
    expect(collapsePathCrumbs(crumbs.slice(0, 2), 3).hidden).toEqual([]);
    expect(collapsePathCrumbs([], 3)).toEqual({ leading: [], hidden: [], trailing: [] });
  });
});

describe("buildSessionCrumbs", () => {
  it("shows a top-level session as the current page", () => {
    expect(
      buildSessionCrumbs({
        selectedSession: session(),
        parentSessionStack: [],
        subagentSessions: [],
        untitledSession: untitled,
      }),
    ).toEqual([
      { kind: "session", label: "Fix the login flow", title: "Fix the login flow", popCount: 0 },
    ]);
  });

  it("names an untitled session after the end of its id", () => {
    const [crumb] = buildSessionCrumbs({
      selectedSession: session({ summary: undefined }),
      parentSessionStack: [],
      subagentSessions: [],
      untitledSession: untitled,
    });
    expect(crumb?.label).toBe("Session 66667777");
  });

  it("puts the parent session before a subagent and labels the subagent by its description", () => {
    const child = subagent("a1b2c3d4e5", { description: "Audit the auth module" });
    expect(
      buildSessionCrumbs({
        selectedSession: subagentSession("a1b2c3d4e5", "first prompt line"),
        parentSessionStack: [session()],
        subagentSessions: [child],
        untitledSession: untitled,
      }),
    ).toEqual([
      { kind: "session", label: "Fix the login flow", title: "Fix the login flow", popCount: 1 },
      {
        kind: "subagent",
        label: "Audit the auth module",
        title: "Audit the auth module",
        popCount: 0,
      },
    ]);
  });

  it("falls back to the synthetic session when the subagent is not in the list", () => {
    const crumbs = buildSessionCrumbs({
      selectedSession: subagentSession("a1b2c3d4e5", "Review the diff"),
      parentSessionStack: [session()],
      subagentSessions: [],
      untitledSession: untitled,
    });
    expect(crumbs[1]).toMatchObject({ kind: "subagent", label: "Review the diff" });
  });

  it("does not show a raw agent id as a subagent summary", () => {
    const crumbs = buildSessionCrumbs({
      selectedSession: subagentSession("a1b2c3d4e5f6", null),
      parentSessionStack: [session()],
      subagentSessions: [],
      untitledSession: untitled,
    });
    expect(crumbs[1]?.label).toBe("Agent a1b2c3d4");
  });

  it("counts how many levels each crumb is above a nested subagent", () => {
    const outer = subagentSession("outer000", "Outer task");
    const crumbs = buildSessionCrumbs({
      selectedSession: subagentSession("inner000", "Inner task"),
      parentSessionStack: [session(), outer],
      subagentSessions: [],
      untitledSession: untitled,
    });
    expect(crumbs.map((c) => [c.kind, c.label, c.popCount])).toEqual([
      ["session", "Fix the login flow", 2],
      ["subagent", "Outer task", 1],
      ["subagent", "Inner task", 0],
    ]);
  });

  it("returns nothing without a selected session", () => {
    expect(
      buildSessionCrumbs({
        selectedSession: null,
        parentSessionStack: [],
        subagentSessions: [],
        untitledSession: untitled,
      }),
    ).toEqual([]);
  });
});
