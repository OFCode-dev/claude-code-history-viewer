import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeSession, SubagentNavFrame, SubagentSession } from "@/types";
import { englishT } from "@/test/utils/englishTranslator";
import { SubagentsSection } from "./SubagentsSection";

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

const session = (file_path: string): ClaudeSession => ({
  session_id: file_path,
  actual_session_id: file_path,
  file_path,
  project_name: "p",
  message_count: 1,
  first_message_time: "",
  last_message_time: "",
  last_modified: "",
  has_tool_use: false,
  has_errors: false,
});

const sub = (agent_id: string, description: string): SubagentSession => ({
  agent_id,
  file_path: `/p/s/subagents/agent-${agent_id}.jsonl`,
  message_count: 5,
  file_size: 10,
  first_message_time: null,
  last_message_time: null,
  summary: null,
  tool_use_id: `toolu_${agent_id}`,
  workflow_run_id: null,
  description,
});

const a = sub("a", "Draft migration plan");
const b = sub("b", "Map the API error codes");
const parent = session("/p/s.jsonl");
const navigateToSubagent = vi.fn();

function setState(opts: {
  subagentSessions?: SubagentSession[];
  parentSessionStack?: ClaudeSession[];
  subagentNavStack?: SubagentNavFrame[];
  selectedSession?: ClaudeSession | null;
}) {
  Object.assign(storeState, {
    subagentSessions: opts.subagentSessions ?? [],
    parentSessionStack: opts.parentSessionStack ?? [],
    subagentNavStack: opts.subagentNavStack ?? [],
    selectedSession: opts.selectedSession ?? null,
    navigateToSubagent,
  });
}

describe("SubagentsSection (sessions pane)", () => {
  beforeEach(() => {
    navigateToSubagent.mockReset();
    localStorage.clear();
  });

  it("is hidden when the selected session has no subagents", () => {
    setState({ selectedSession: parent });
    const { container } = render(<SubagentsSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the selected session's subagents with a count and opens one on click", () => {
    setState({ selectedSession: parent, subagentSessions: [a, b] });
    render(<SubagentsSection />);

    const section = screen.getByRole("region", { name: "Subagents of this session" });
    const toggle = within(section).getByRole("button", { expanded: true });
    expect(toggle).toHaveTextContent("Subagents");
    expect(toggle).toHaveTextContent("2");

    fireEvent.click(within(section).getByRole("button", { name: /Map the API error codes/ }));
    expect(navigateToSubagent).toHaveBeenCalledWith(b);
  });

  it("keeps listing the parent's subagents inside a subagent and highlights the active one", () => {
    setState({
      // The child transcript has no subagents of its own.
      subagentSessions: [],
      parentSessionStack: [parent],
      subagentNavStack: [{ subagent: b, siblings: [a, b] }],
      selectedSession: session(b.file_path),
    });
    render(<SubagentsSection />);

    expect(screen.getByRole("button", { name: /Map the API error codes/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: /Draft migration plan/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("collapses and remembers the choice", () => {
    setState({ selectedSession: parent, subagentSessions: [a, b] });
    const { unmount } = render(<SubagentsSection />);

    fireEvent.click(screen.getByRole("button", { expanded: true }));
    expect(screen.queryByRole("button", { name: /Draft migration plan/ })).toBeNull();
    expect(localStorage.getItem("sessionsPane.subagentsOpen")).toBe("false");
    unmount();

    render(<SubagentsSection />);
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Draft migration plan/ })).toBeNull();
  });
});
