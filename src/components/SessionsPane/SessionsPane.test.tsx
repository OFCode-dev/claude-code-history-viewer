import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeProject, ClaudeSession, SubagentSession } from "@/types";
import { englishT } from "@/test/utils/englishTranslator";
import { SessionsPane } from "./SessionsPane";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: englishT }),
}));

const { storeState } = vi.hoisted(() => ({
  storeState: {} as Record<string, unknown>,
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(storeState),
}));

// The session list itself is covered elsewhere; a marker keeps this test
// about where the subagents section sits relative to it.
vi.mock("@/components/ProjectTree/components/SessionList", () => ({
  SessionList: () => <ul aria-label="Session list" />,
}));

const session: ClaudeSession = {
  session_id: "/p/s.jsonl",
  actual_session_id: "s",
  file_path: "/p/s.jsonl",
  project_name: "p",
  message_count: 1,
  first_message_time: "",
  last_message_time: "",
  last_modified: "",
  has_tool_use: false,
  has_errors: false,
};

const project = {
  name: "acme-api",
  path: "/p",
  actual_path: "/work/acme-api",
  session_count: 1,
  message_count: 1,
  last_modified: "",
} as ClaudeProject;

const subagent: SubagentSession = {
  agent_id: "a",
  file_path: "/p/s/subagents/agent-a.jsonl",
  message_count: 5,
  file_size: 10,
  first_message_time: null,
  last_message_time: null,
  summary: null,
  tool_use_id: "toolu_a",
  workflow_run_id: null,
  description: "Map the API error codes",
};

function setSubagents(subagentSessions: SubagentSession[]) {
  Object.assign(storeState, {
    subagentSessions,
    parentSessionStack: [],
    subagentNavStack: [],
    selectedSession: session,
    navigateToSubagent: vi.fn(),
  });
}

const pane = () => (
  <SessionsPane
    selectedProject={project}
    sessions={[session]}
    selectedSession={session}
    isLoading={false}
    onSessionSelect={vi.fn()}
    formatTimeAgo={() => ""}
    width={320}
  />
);

/** Every element that precedes `el` in document order inside the pane. */
function elementsBefore(el: Element): Element[] {
  const paneEl = screen.getByRole("complementary");
  return Array.from(paneEl.querySelectorAll("*")).filter(
    (other) => other.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

describe("SessionsPane subagents section", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("docks the subagents section below the session list", () => {
    setSubagents([subagent]);
    render(pane());

    const list = screen.getByRole("list", { name: "Session list" });
    const section = screen.getByRole("region", { name: "Subagents of this session" });
    expect(list.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("adds nothing above the session list when the subagents arrive after a session switch", () => {
    // selectSession clears the list at once; loadSubagents fills it later.
    setSubagents([]);
    const { rerender } = render(pane());
    const before = elementsBefore(screen.getByRole("list", { name: "Session list" }));
    expect(screen.queryByRole("region", { name: "Subagents of this session" })).toBeNull();

    setSubagents([subagent]);
    rerender(pane());

    const list = screen.getByRole("list", { name: "Session list" });
    expect(screen.getByRole("region", { name: "Subagents of this session" })).toBeInTheDocument();
    expect(elementsBefore(list)).toEqual(before);
  });
});
