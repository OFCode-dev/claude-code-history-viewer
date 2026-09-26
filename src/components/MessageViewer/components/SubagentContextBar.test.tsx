import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeSession, SubagentNavFrame, SubagentSession } from "@/types";
import { englishT } from "@/test/utils/englishTranslator";
import { useAppStore } from "@/store/useAppStore";
import { restoreFocusAfterEnteringSubagent } from "@/components/subagents/subagentFocus";
import { SubagentContextBar } from "./SubagentContextBar";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: englishT }),
}));

// A real (tiny) zustand store, so a state change re-renders the bar the way
// navigation does in the app.
vi.mock("@/store/useAppStore", async () => {
  const { create } = await import("zustand");
  return { useAppStore: create<Record<string, unknown>>(() => ({})) };
});

const testStore = useAppStore as unknown as {
  setState: (partial: Record<string, unknown>) => void;
};

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
  isLoadingMessages?: boolean;
}) {
  const customNames = opts.customNames ?? {};
  testStore.setState({
    parentSessionStack: opts.parentSessionStack ?? [],
    subagentNavStack: opts.subagentNavStack ?? [],
    selectedSession: opts.selectedSession ?? null,
    isLoadingMessages: opts.isLoadingMessages ?? false,
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
    // The label's tooltip repeats type and model for when the row truncates.
    expect(screen.getByText("Map the API error codes")).toHaveAttribute(
      "title",
      "Map the API error codes · Explore · sonnet",
    );

    fireEvent.click(screen.getByRole("button", { name: "Back to Release v2 of the API" }));
    expect(navigateBackToParent).toHaveBeenCalledTimes(1);
  });

  it("offers its Back button as the focus target after entering a subagent", () => {
    inside(b);
    render(<SubagentContextBar />);
    // The opening control unmounts with the parent conversation.
    (document.activeElement as HTMLElement | null)?.blur();

    restoreFocusAfterEnteringSubagent();

    expect(screen.getByRole("button", { name: "Back to Release v2 of the API" })).toHaveFocus();
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

  it("names an untitled parent like the header breadcrumb does", () => {
    setState({
      parentSessionStack: [session("/p/untitled.jsonl")],
      subagentNavStack: [{ subagent: a, siblings: [a, b] }],
      selectedSession: session(a.file_path),
    });
    render(<SubagentContextBar />);
    // The last 8 characters of the id, as in "Session xxxxxxxx" in the header.
    expect(screen.getByRole("button", { name: "Back to Session 00000000" })).toBeInTheDocument();
  });

  it("shows i of n and navigates to the previous and next sibling", () => {
    inside(b);
    render(<SubagentContextBar />);

    expect(screen.getByLabelText("Subagent 2 of 3")).toHaveTextContent("2 of 3");
    const previous = screen.getByRole("button", { name: "Previous subagent" });
    const next = screen.getByRole("button", { name: "Next subagent" });
    expect(previous).toHaveAttribute("title", "Previous subagent: Draft migration plan");
    expect(next).toHaveAttribute("title", "Next subagent: Audit webhook retries");

    fireEvent.click(previous);
    expect(navigateToSubagent).toHaveBeenLastCalledWith(a);
    fireEvent.click(next);
    expect(navigateToSubagent).toHaveBeenLastCalledWith(c);
  });

  it("marks previous/next busy and ignores clicks while a transcript loads", () => {
    inside(b);
    testStore.setState({ isLoadingMessages: true });
    render(<SubagentContextBar />);

    const next = screen.getByRole("button", { name: "Next subagent" });
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("navigation", { name: "Subagent navigation" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    fireEvent.click(next);
    expect(navigateToSubagent).not.toHaveBeenCalled();
  });

  it("moves focus to the other arrow when the pressed one becomes disabled", async () => {
    inside(b);
    render(<SubagentContextBar />);
    navigateToSubagent.mockImplementation(async () => {
      inside(c);
    });

    const next = screen.getByRole("button", { name: "Next subagent" });
    next.focus();
    await act(async () => {
      fireEvent.click(next);
    });

    expect(next).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous subagent" })).toHaveFocus();
  });

  it("returns focus to the row of the subagent it leaves after Back", async () => {
    inside(b);
    const row = document.createElement("button");
    row.setAttribute("data-subagent-path", b.file_path);
    document.body.appendChild(row);
    const { unmount } = render(<SubagentContextBar />);
    // At top level the bar unmounts, which drops focus on <body>.
    navigateBackToParent.mockImplementation(async () => {
      unmount();
    });

    screen.getByRole("button", { name: "Back to Release v2 of the API" }).focus();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back to Release v2 of the API" }));
    });

    expect(row).toHaveFocus();
    row.remove();
  });

  it("falls back to the main content region after Back when no row shows the subagent", async () => {
    inside(b);
    const main = document.createElement("main");
    main.id = "main-content";
    main.tabIndex = -1;
    document.body.appendChild(main);
    const { unmount } = render(<SubagentContextBar />);
    navigateBackToParent.mockImplementation(async () => {
      unmount();
    });

    const back = screen.getByRole("button", { name: "Back to Release v2 of the API" });
    back.focus();
    await act(async () => {
      fireEvent.click(back);
    });

    expect(main).toHaveFocus();
    main.remove();
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
