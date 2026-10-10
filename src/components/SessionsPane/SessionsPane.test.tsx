import { fireEvent, render, screen } from "@testing-library/react";
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

describe("SessionsPane rail: the way to the subagents", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const paneWith = (isCollapsed: boolean, onToggleCollapse: () => void) => (
    <SessionsPane
      selectedProject={project}
      sessions={[session]}
      selectedSession={session}
      isLoading={false}
      onSessionSelect={vi.fn()}
      formatTimeAgo={() => ""}
      width={320}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );

  it("offers one Bot + count button instead of the list, and none without subagents", () => {
    setSubagents([subagent]);
    const { rerender } = render(paneWith(true, vi.fn()));
    expect(screen.getByRole("button", { name: "Show 1 subagent" })).toHaveTextContent("1");
    expect(screen.queryByRole("region", { name: "Subagents of this session" })).toBeNull();

    setSubagents([]);
    rerender(paneWith(true, vi.fn()));
    expect(screen.queryByRole("button", { name: /subagent/i })).toBeNull();
  });

  it("expands the pane and focuses the Subagents header, opening the list", () => {
    // The list was closed last time; the rail button still shows it.
    localStorage.setItem("sessionsPane.subagentsOpen", "false");
    setSubagents([subagent]);
    const onToggleCollapse = vi.fn();
    const { rerender } = render(paneWith(true, onToggleCollapse));

    const button = screen.getByRole("button", { name: "Show 1 subagent" });
    button.focus();
    fireEvent.click(button);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);

    rerender(paneWith(false, onToggleCollapse));
    const header = screen.getByRole("button", { name: /Subagents/ });
    expect(document.activeElement).toBe(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Map the API error codes/ })).toBeInTheDocument();
  });

  it("does not steal focus when the pane is expanded some other way", () => {
    setSubagents([subagent]);
    const { rerender } = render(paneWith(true, vi.fn()));
    fireEvent.click(screen.getByRole("button", { name: "Expand sessions" }));
    rerender(paneWith(false, vi.fn()));
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: /Subagents/ }));
  });
});
