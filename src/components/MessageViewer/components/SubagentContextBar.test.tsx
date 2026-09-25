import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeSession, SubagentNavFrame, SubagentSession } from "@/types";
import { englishT } from "@/test/utils/englishTranslator";
import { SubagentContextBar } from "./SubagentContextBar";

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

const session = (file_path: string, summary?: string): ClaudeSession => ({
  session_id: file_path,
  actual_session_id: "3f2a9c1e-0000-4000-8000-000000000000",
  file_path,
  project_name: "p",
  message_count: 1,
  first_message_time: "",
  last_message_time: "",
  last_modified: "",
  has_tool_use: false,
  has_errors: false,
  summary,
});

const sub = (agent_id: string, overrides: Partial<SubagentSession> = {}): SubagentSession => ({
  agent_id,
  file_path: `/p/s/subagents/agent-${agent_id}.jsonl`,
  message_count: 4,
  file_size: 10,
  first_message_time: null,
  last_message_time: null,
  summary: null,
  tool_use_id: null,
  workflow_run_id: null,
  ...overrides,
});

const a = sub("a", { description: "Draft migration plan" });
const b = sub("b", { description: "Map the API error codes", agent_type: "Explore", model: "sonnet" });
const c = sub("c", { description: "Audit webhook retries" });
const parent = session("/p/s.jsonl", "Release v2 of the API");

const navigateBackToParent = vi.fn();
const navigateToSubagent = vi.fn();

function setState(opts: {
  parentSessionStack?: ClaudeSession[];
  subagentNavStack?: SubagentNavFrame[];
  selectedSession?: ClaudeSession | null;
  customNames?: Record<string, string>;
}) {
  const customNames = opts.customNames ?? {};
  Object.assign(storeState, {
    parentSessionStack: opts.parentSessionStack ?? [],
    subagentNavStack: opts.subagentNavStack ?? [],
    selectedSession: opts.selectedSession ?? null,
    navigateBackToParent,
    navigateToSubagent,
    getSessionDisplayName: (id: string, fallback?: string) => customNames[id] ?? fallback,
  });
}

const inside = (current: SubagentSession, siblings: SubagentSession[] = [a, b, c]) =>
  setState({
    parentSessionStack: [parent],
    subagentNavStack: [{ subagent: current, siblings }],
    selectedSession: session(current.file_path, current.description ?? undefined),
  });

describe("SubagentContextBar", () => {
  beforeEach(() => {
    navigateBackToParent.mockReset();
    navigateToSubagent.mockReset();
  });

  it("renders nothing at top level", () => {
    setState({ selectedSession: parent });
    const { container } = render(<SubagentContextBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the subagent with its type and model, and the parent in the back button", () => {
    inside(b);
    render(<SubagentContextBar />);

    expect(screen.getByRole("navigation", { name: "Subagent navigation" })).toBeInTheDocument();
    expect(screen.getByText("Subagent")).toBeInTheDocument();
    expect(screen.getByText("Map the API error codes")).toBeInTheDocument();
    expect(screen.getByTitle("Agent type: Explore")).toBeInTheDocument();
    expect(screen.getByTitle("Model: sonnet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to Release v2 of the API" }));
    expect(navigateBackToParent).toHaveBeenCalledTimes(1);
  });

  it("uses the parent's custom name when it has one", () => {
    setState({
      parentSessionStack: [parent],
      subagentNavStack: [{ subagent: a, siblings: [a, b] }],
      selectedSession: session(a.file_path),
      customNames: { [parent.session_id]: "My release session" },
    });
    render(<SubagentContextBar />);
    expect(screen.getByRole("button", { name: "Back to My release session" })).toBeInTheDocument();
  });

  it("shows i of n and navigates to the previous and next sibling", () => {
    inside(b);
    render(<SubagentContextBar />);

    expect(screen.getByLabelText("Subagent 2 of 3")).toHaveTextContent("2 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Previous subagent" }));
    expect(navigateToSubagent).toHaveBeenLastCalledWith(a);
    fireEvent.click(screen.getByRole("button", { name: "Next subagent" }));
    expect(navigateToSubagent).toHaveBeenLastCalledWith(c);
  });

  it("disables previous on the first and next on the last sibling", () => {
    inside(a);
    const { unmount } = render(<SubagentContextBar />);
    expect(screen.getByRole("button", { name: "Previous subagent" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next subagent" })).toBeEnabled();
    unmount();

    inside(c);
    render(<SubagentContextBar />);
    expect(screen.getByRole("button", { name: "Previous subagent" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next subagent" })).toBeDisabled();
  });

  it("hides sibling navigation for an only child", () => {
    inside(a, [a]);
    render(<SubagentContextBar />);
    expect(screen.queryByRole("button", { name: "Next subagent" })).toBeNull();
    expect(screen.queryByText(/of 1/)).toBeNull();
  });

  it("falls back to the session summary without a nav frame", () => {
    setState({
      parentSessionStack: [parent],
      subagentNavStack: [],
      selectedSession: session(a.file_path, "Legacy subagent"),
    });
    render(<SubagentContextBar />);

    expect(screen.getByText("Legacy subagent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Release v2 of the API" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next subagent" })).toBeNull();
  });
});
