import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MessageNavigator } from "@/components/MessageNavigator";
import { buildPromptTrack, useViewportAnchorStore } from "@/store/viewportAnchorStore";

const {
  navigateToMessageMock,
  toggleShowParallelTasksMock,
  setNavigatorModeMock,
  scrollToIndexMock,
  resetMessageFilterMock,
  useAppStoreMock,
  storeState,
} = vi.hoisted(() => {
  const navigateToMessage = vi.fn();
  const resetMessageFilter = vi.fn();
  const toggleShowParallelTasks = vi.fn();
  const setNavigatorMode = vi.fn();

  const state = {
    navigateToMessage,
    targetMessageUuid: "message-2" as string | null,
    showParallelTasksInNavigator: true,
    toggleShowParallelTasksInNavigator: toggleShowParallelTasks,
    navigatorMode: "all" as "all" | "prompts",
    setNavigatorMode,
    pagination: { hasMore: false },
    selectedSession: { file_path: "/s.jsonl" } as { file_path: string } | null,
    parentSessionStack: [] as string[],
    messageFilterActive: false,
    isMessageFilterActive: () => state.messageFilterActive,
    resetMessageFilter,
  };

  return {
    scrollToIndexMock: vi.fn(),
    resetMessageFilterMock: resetMessageFilter,
    navigateToMessageMock: navigateToMessage,
    toggleShowParallelTasksMock: toggleShowParallelTasks,
    setNavigatorModeMock: setNavigatorMode,
    useAppStoreMock: (selector?: (store: typeof state) => unknown) =>
      typeof selector === "function" ? selector(state) : state,
    storeState: state,
  };
});

vi.mock("@/store/useAppStore", () => ({
  useAppStore: useAppStoreMock,
}));

vi.mock("react-i18next", () => ({
  // Loaded by the app's i18n setup, which the time formatting imports.
  initReactI18next: { type: "3rdParty", init: () => undefined },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown> | string) =>
      typeof options === "object" && ("count" in options || "number" in options)
        ? `${key}:${String(options.count ?? options.number)}`
        : key,
  }),
}));

// The rows the "viewport" shows; null renders every row.
const visibleRange: { current: { startIndex: number; endIndex: number } | null } = {
  current: null,
};

vi.mock("@tanstack/react-virtual", () => {
  type Range = { startIndex: number; endIndex: number; overscan: number; count: number };
  const defaultRangeExtractor = (range: Range) =>
    Array.from(
      { length: range.endIndex - range.startIndex + 1 },
      (_, offset) => range.startIndex + offset
    );
  return {
    defaultRangeExtractor,
    useVirtualizer: ({
      count,
      rangeExtractor = defaultRangeExtractor,
    }: {
      count: number;
      rangeExtractor?: (range: Range) => number[];
    }) => ({
      getVirtualItems: () => {
        const range = visibleRange.current ?? { startIndex: 0, endIndex: count - 1 };
        return rangeExtractor({ ...range, overscan: 0, count }).map((index) => ({
          index,
          start: index * 40,
        }));
      },
      getTotalSize: () => count * 40,
      scrollToIndex: scrollToIndexMock,
      measureElement: vi.fn(),
    }),
  };
});

describe("MessageNavigator accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.showParallelTasksInNavigator = true;
    storeState.navigatorMode = "all";
    storeState.targetMessageUuid = "message-2";
    storeState.pagination = { hasMore: false };
    visibleRange.current = null;
    useViewportAnchorStore.getState().reset();
  });

  it("supports roving focus and keyboard activation", () => {
    render(
      <MessageNavigator
        messages={[
          { uuid: "message-1", type: "user", content: "First", timestamp: "2026-02-27T10:00:00Z" } as never,
          { uuid: "message-2", type: "assistant", content: "Second", timestamp: "2026-02-27T10:01:00Z" } as never,
          { uuid: "message-3", type: "assistant", content: "Third", timestamp: "2026-02-27T10:02:00Z" } as never,
        ]}
        width={260}
        isResizing={false}
        onResizeStart={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
      />
    );

    const currentEntry = screen.getAllByRole("option")[1];
    expect(currentEntry).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("listbox")).toHaveAttribute(
      "aria-describedby",
      "message-navigator-keyboard-help"
    );
    expect(screen.queryByRole("button", {
      name: "navigator.showParallelTasks",
    })).not.toBeInTheDocument();

    act(() => {
      currentEntry.focus();
    });
    act(() => {
      fireEvent.keyDown(currentEntry, { key: "ArrowDown" });
    });

    const movedEntry = screen.getAllByRole("option")[2];
    expect(movedEntry).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(movedEntry, { key: "Enter" });
    expect(navigateToMessageMock).toHaveBeenCalledWith("message-3");
  });

  it("hides Parallel Tasks entries and exposes a header toggle", () => {
    storeState.showParallelTasksInNavigator = false;

    render(
      <MessageNavigator
        messages={[
          {
            uuid: "parallel-task",
            type: "user",
            content: "<task-notification><task-id>agent-1</task-id></task-notification>",
            timestamp: "2026-02-27T10:00:00Z",
          } as never,
          {
            uuid: "human-message",
            type: "user",
            content: "Human prompt",
            timestamp: "2026-02-27T10:01:00Z",
          } as never,
        ]}
        width={260}
        isResizing={false}
        onResizeStart={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
      />
    );

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByText("Human prompt")).toBeInTheDocument();

    const toggle = screen.getByRole("button", {
      name: "navigator.showParallelTasks",
    });
    const modeToggle = screen.getByRole("radiogroup", {
      name: "navigator.mode.label",
    });
    expect(
      modeToggle.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggleShowParallelTasksMock).toHaveBeenCalledOnce();
  });
  it("gives each All-mode option its position in the whole list", () => {
    visibleRange.current = { startIndex: 2, endIndex: 2 };
    render(
      <MessageNavigator
        messages={[
          { uuid: "message-1", type: "user", content: "First", timestamp: "2026-02-27T10:00:00Z" } as never,
          { uuid: "message-2", type: "assistant", content: "Second", timestamp: "2026-02-27T10:01:00Z" } as never,
          { uuid: "message-3", type: "assistant", content: "Third", timestamp: "2026-02-27T10:02:00Z" } as never,
        ]}
        width={260}
        isResizing={false}
        onResizeStart={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
      />
    );

    // message-2 is the target (the tab stop) and stays mounted beside row 3.
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.getAttribute("aria-posinset"))).toEqual(["2", "3"]);
    expect(options[1]).toHaveAttribute("aria-setsize", "3");
  });
});

const promptSession = [
  { uuid: "p1", type: "user", content: "Deploy the api", timestamp: "2026-02-27T10:00:00Z" },
  {
    uuid: "a1",
    type: "assistant",
    content: [
      { type: "text", text: "Starting" },
      { type: "tool_use", id: "t1", name: "Agent", input: { description: "Check migrations" } },
    ],
    timestamp: "2026-02-27T10:01:00Z",
  },
  {
    uuid: "r1",
    type: "user",
    content: [{ type: "tool_result", tool_use_id: "t1", content: "done" }],
    timestamp: "2026-02-27T10:02:00Z",
  },
  { uuid: "c1", type: "user", content: "<command-name>/clear</command-name>", timestamp: "2026-02-27T10:03:00Z" },
  { uuid: "p2", type: "user", content: "Write the changelog", timestamp: "2026-02-27T10:04:00Z" },
  { uuid: "a2", type: "assistant", content: [{ type: "text", text: "Done" }], timestamp: "2026-02-27T10:05:00Z" },
] as never[];

function renderNavigator(isCollapsed = false) {
  return render(
    <MessageNavigator
      messages={promptSession}
      width={260}
      isResizing={false}
      onResizeStart={vi.fn()}
      isCollapsed={isCollapsed}
      onToggleCollapse={vi.fn()}
    />
  );
}

describe("MessageNavigator prompts mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.navigatorMode = "prompts";
    storeState.targetMessageUuid = null;
    storeState.pagination = { hasMore: false };
    storeState.showParallelTasksInNavigator = true;
    storeState.selectedSession = { file_path: "/s.jsonl" };
    storeState.parentSessionStack = [];
    storeState.messageFilterActive = false;
    visibleRange.current = null;
    useViewportAnchorStore.getState().reset();
  });

  function publishTrack(messages: never[], anchorUuid: string) {
    act(() => {
      const anchors = useViewportAnchorStore.getState();
      anchors.setPromptTrack(buildPromptTrack("/s.jsonl", messages));
      anchors.publishAnchor("/s.jsonl", anchorUuid);
    });
  }

  it("builds rows from the list the conversation renders", () => {
    renderNavigator();
    // Tool calls hidden by the conversation's filter: the spawning record is
    // not rendered, so there is no spawn row pointing at it.
    publishTrack(
      promptSession.filter((message) => (message as { uuid: string }).uuid !== "a1"),
      "p1"
    );

    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.getAttribute("aria-label"))).toEqual([
      "navigator.a11y.promptLabel",
      "navigator.a11y.promptLabel",
    ]);
    expect(screen.queryByText("Check migrations")).not.toBeInTheDocument();

    fireEvent.click(options[1]!);
    expect(navigateToMessageMock).toHaveBeenLastCalledWith("p2");
  });

  it("ignores a rendered list that belongs to another session", () => {
    storeState.selectedSession = { file_path: "/other.jsonl" };
    renderNavigator();
    publishTrack([promptSession[4]!], "p2");

    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("keeps following the active turn after a row was clicked", () => {
    renderNavigator();
    publishTrack(promptSession, "a1");
    const [prompt] = screen.getAllByRole("option");

    act(() => {
      prompt!.focus();
    });
    fireEvent.click(prompt!);
    scrollToIndexMock.mockClear();

    // The reader scrolls the conversation into the second turn; focus is
    // still on the clicked row, and the list must follow anyway.
    act(() => {
      useViewportAnchorStore.getState().publishAnchor("/s.jsonl", "a2");
    });

    expect(scrollToIndexMock).toHaveBeenCalledWith(2, { align: "auto" });
  });

  it("does not move the list while it is used with the keyboard", () => {
    renderNavigator();
    publishTrack(promptSession, "a1");
    const [prompt] = screen.getAllByRole("option");

    act(() => {
      prompt!.focus();
    });
    fireEvent.keyDown(prompt!, { key: "ArrowDown" });
    scrollToIndexMock.mockClear();

    act(() => {
      useViewportAnchorStore.getState().publishAnchor("/s.jsonl", "a2");
    });

    expect(scrollToIndexMock).not.toHaveBeenCalled();
  });

  it("applies the parallel-task switch to the Prompts list", () => {
    storeState.showParallelTasksInNavigator = false;
    const parallelTurn = [
      { uuid: "p1", type: "user", content: "Audit both services", timestamp: "2026-02-27T10:00:00Z" },
      {
        uuid: "a1",
        type: "assistant",
        // Two subagent calls in one record: a parallel task.
        provider: "opencode",
        content: [
          { type: "tool_use", id: "t1", name: "Task", input: { description: "Audit api" } },
          { type: "tool_use", id: "t2", name: "Task", input: { description: "Audit web" } },
        ],
        timestamp: "2026-02-27T10:01:00Z",
      },
    ] as never[];
    render(
      <MessageNavigator
        messages={parallelTurn}
        width={260}
        isResizing={false}
        onResizeStart={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
      />
    );

    expect(screen.queryByText("Audit api")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "navigator.showParallelTasks" })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("counts the prompts left by the text filter", () => {
    renderNavigator();
    const count = screen.getByTitle("navigator.promptCount:2");
    expect(count).toHaveTextContent("2");

    fireEvent.change(screen.getByRole("textbox", { name: "navigator.filterPrompts" }), {
      target: { value: "changelog" },
    });

    expect(count).toHaveTextContent("1");
  });

  it("marks the list so Alt+Arrow reaches the global prompt jump", () => {
    renderNavigator();

    expect(screen.getByRole("listbox")).toHaveAttribute("data-prompt-jump-passthrough");
  });

  it("lists human prompts and their subagent spawns, not the noise", () => {
    renderNavigator();

    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.getAttribute("aria-label"))).toEqual([
      "navigator.a11y.promptLabel",
      "navigator.a11y.spawnLabel",
      "navigator.a11y.promptLabel",
    ]);
    expect(screen.getByText("Deploy the api")).toBeInTheDocument();
    expect(screen.getByText("Check migrations")).toBeInTheDocument();
    expect(screen.queryByText("/clear")).not.toBeInTheDocument();
    expect(within(options[0]!).getByText("navigator.turn:1")).toBeInTheDocument();
    expect(within(options[0]!).getByText("navigator.steps:3")).toBeInTheDocument();
  });

  it("omits turn numbers while older pages are not loaded", () => {
    storeState.pagination = { hasMore: true };
    renderNavigator();

    expect(screen.queryByText("navigator.turn:1")).not.toBeInTheDocument();
    expect(screen.getAllByRole("option")[0]).toHaveAttribute(
      "aria-label",
      "navigator.a11y.promptLabelNoTurn"
    );
  });

  it("jumps to the prompt or to the tool call that spawned a subagent", () => {
    renderNavigator();
    const [prompt, spawn] = screen.getAllByRole("option");

    fireEvent.click(prompt!);
    expect(navigateToMessageMock).toHaveBeenLastCalledWith("p1");

    fireEvent.click(spawn!);
    expect(navigateToMessageMock).toHaveBeenLastCalledWith("a1");
  });

  it("highlights the turn at the top of the conversation (scroll-spy)", () => {
    renderNavigator();
    act(() => {
      const anchors = useViewportAnchorStore.getState();
      anchors.setPromptTrack(buildPromptTrack("/s.jsonl", promptSession));
      anchors.publishAnchor("/s.jsonl", "r1");
    });

    const [first, , second] = screen.getAllByRole("option");
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(first).toHaveAttribute("aria-current", "location");
    expect(second).toHaveAttribute("aria-selected", "false");

    act(() => {
      useViewportAnchorStore.getState().publishAnchor("/s.jsonl", "a2");
    });
    expect(screen.getAllByRole("option")[2]).toHaveAttribute("aria-selected", "true");
  });

  it("switches between Prompts and All with a radio group", () => {
    renderNavigator();

    const prompts = screen.getByRole("radio", { name: "navigator.mode.prompts" });
    const all = screen.getByRole("radio", { name: "navigator.mode.all" });
    expect(prompts).toHaveAttribute("aria-checked", "true");
    expect(all).toHaveAttribute("tabindex", "-1");

    fireEvent.click(all);
    expect(setNavigatorModeMock).toHaveBeenCalledWith("all");

    fireEvent.keyDown(prompts, { key: "ArrowRight" });
    expect(setNavigatorModeMock).toHaveBeenLastCalledWith("all");
  });

  it("shows the prompt count on the collapsed rail", () => {
    renderNavigator(true);

    expect(screen.getByText("navigator.promptCount:2")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("leaves Alt+Arrow to the global prompt shortcut", () => {
    renderNavigator();
    const [prompt] = screen.getAllByRole("option");

    act(() => {
      prompt!.focus();
    });
    fireEvent.keyDown(prompt!, { key: "ArrowDown", altKey: true });

    expect(screen.getAllByRole("option")[0]).toHaveAttribute("tabindex", "0");
  });

  it("keeps the focused row mounted when the list scrolls far away from it", () => {
    const longSession = Array.from({ length: 30 }, (_, index) => ({
      uuid: `p${index}`,
      type: "user",
      content: `Prompt number ${index}`,
      timestamp: "2026-02-27T10:00:00Z",
    })) as never[];
    const view = render(
      <MessageNavigator
        messages={longSession}
        width={260}
        isResizing={false}
        onResizeStart={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
      />
    );
    visibleRange.current = { startIndex: 0, endIndex: 4 };
    publishTrack(longSession, "p0");
    const first = screen.getAllByRole("option")[0]!;
    expect(first).toHaveTextContent("Prompt number 0");
    act(() => {
      first.focus();
    });

    // Alt+Down from the focused row jumps the conversation far ahead; the
    // list follows the new turn and the first row leaves the viewport.
    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true });
    act(() => {
      useViewportAnchorStore.getState().publishAnchor("/s.jsonl", "p25");
    });
    visibleRange.current = { startIndex: 23, endIndex: 27 };
    view.rerender(
      <MessageNavigator
        messages={longSession}
        width={260}
        isResizing={false}
        onResizeStart={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
      />
    );

    expect(first).toBeInTheDocument();
    expect(document.activeElement).toBe(first);
    expect(first).toHaveAttribute("tabindex", "0");
  });

  it("builds All-mode rows from the list the conversation renders", () => {
    storeState.navigatorMode = "all";
    renderNavigator();
    expect(screen.getByText("Starting")).toBeInTheDocument();

    // Tool calls hidden by the conversation's filter: a1 is not rendered, so
    // it has no row to jump to.
    publishTrack(
      promptSession.filter((message) => (message as { uuid: string }).uuid !== "a1"),
      "p1"
    );

    expect(screen.queryByText("Starting")).not.toBeInTheDocument();
    expect(screen.getByText("Deploy the api")).toBeInTheDocument();
  });

  it("says when the display filter hides every prompt, with a way back", () => {
    storeState.messageFilterActive = true;
    renderNavigator();
    // User unchecked: the conversation renders no user records.
    publishTrack(
      promptSession.filter((message) => (message as { type: string }).type !== "user"),
      "a1"
    );

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByText("navigator.promptsHidden")).toBeInTheDocument();
    expect(screen.queryByText("navigator.noPrompts")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "filter.showAll" }));
    expect(resetMessageFilterMock).toHaveBeenCalledOnce();
  });

  it("keeps the plain empty state when the session has no prompts", () => {
    storeState.messageFilterActive = true;
    render(
      <MessageNavigator
        messages={[promptSession[1]!, promptSession[5]!]}
        width={260}
        isResizing={false}
        onResizeStart={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
      />
    );

    expect(screen.getByText("navigator.noPrompts")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "filter.showAll" })).not.toBeInTheDocument();
  });

  it("describes Prompts mode as the parent agent's prompts inside a subagent", () => {
    storeState.parentSessionStack = ["/parent.jsonl"];
    renderNavigator();

    expect(screen.getByRole("radio", { name: "navigator.mode.prompts" })).toHaveAttribute(
      "title",
      "navigator.mode.promptsHintSubagent"
    );
  });

  it("gives each option its position in the whole list", () => {
    visibleRange.current = { startIndex: 1, endIndex: 2 };
    renderNavigator();

    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.getAttribute("aria-posinset"))).toEqual([
      // Row 0 stays mounted as the roving tab stop.
      "1",
      "2",
      "3",
    ]);
    for (const option of options) {
      expect(option).toHaveAttribute("aria-setsize", "3");
    }
  });
});
