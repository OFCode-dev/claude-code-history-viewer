import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MessageNavigator } from "@/components/MessageNavigator";
import { buildPromptTrack, useViewportAnchorStore } from "@/store/viewportAnchorStore";

const {
  navigateToMessageMock,
  toggleShowParallelTasksMock,
  setNavigatorModeMock,
  useAppStoreMock,
  storeState,
} = vi.hoisted(() => {
  const navigateToMessage = vi.fn();
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
  };

  return {
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
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown> | string) =>
      typeof options === "object" && ("count" in options || "number" in options)
        ? `${key}:${String(options.count ?? options.number)}`
        : key,
  }),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 40,
      })),
    getTotalSize: () => count * 40,
    scrollToIndex: vi.fn(),
    measureElement: vi.fn(),
  }),
}));

describe("MessageNavigator accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.showParallelTasksInNavigator = true;
    storeState.navigatorMode = "all";
    storeState.targetMessageUuid = "message-2";
    storeState.pagination = { hasMore: false };
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
    useViewportAnchorStore.getState().reset();
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
});
