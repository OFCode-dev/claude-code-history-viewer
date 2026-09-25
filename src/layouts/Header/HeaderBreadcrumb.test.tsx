import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeProject, ClaudeSession, SubagentSession } from "@/types";
import { HeaderBreadcrumb } from "./HeaderBreadcrumb";

const { store } = vi.hoisted(() => ({
  store: {
    selectedSession: null as ClaudeSession | null,
    parentSessionStack: [] as ClaudeSession[],
    subagentSessions: [] as SubagentSession[],
    requestExplorerReveal: vi.fn(),
    setExplorerCollapsed: vi.fn(),
    navigateBackToParent: vi.fn(async () => {}),
  },
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (selector: (state: typeof store) => unknown) => selector(store),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options ? `${key}(${Object.values(options).join(",")})` : key,
  }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DropdownMenuContent: ({ children }: React.PropsWithChildren) => (
    <div data-testid="hidden-crumbs">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: React.PropsWithChildren<{ onSelect?: () => void }>) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
}));

const project: ClaudeProject = {
  name: "-home-me-work-acme-api",
  path: "/home/me/.claude/projects/-home-me-work-acme-api",
  actual_path: "/home/me/work/acme/api",
  session_count: 3,
  message_count: 30,
  last_modified: "2026-09-25T10:00:00Z",
  provider: "claude",
};

const rootSession: ClaudeSession = {
  session_id: "11111111-2222-3333-4444-555566667777",
  actual_session_id: "11111111-2222-3333-4444-555566667777",
  file_path: "/home/me/.claude/projects/-home-me-work-acme-api/root.jsonl",
  project_name: "api",
  message_count: 3,
  first_message_time: "2026-09-25T10:00:00Z",
  last_message_time: "2026-09-25T11:00:00Z",
  last_modified: "2026-09-25T11:00:00Z",
  has_tool_use: false,
  has_errors: false,
  summary: "Fix the login flow",
};

const subagentFile = "/home/me/.claude/projects/-home-me-work-acme-api/root/subagents/agent-a1b2c3d4.jsonl";

const subagentSession: ClaudeSession = {
  ...rootSession,
  session_id: subagentFile,
  actual_session_id: "a1b2c3d4",
  file_path: subagentFile,
  summary: "first prompt line",
};

const subagent: SubagentSession = {
  agent_id: "a1b2c3d4",
  file_path: subagentFile,
  message_count: 4,
  file_size: 10,
  first_message_time: null,
  last_message_time: null,
  summary: "first prompt line",
  tool_use_id: "toolu_1",
  workflow_run_id: null,
  description: "Audit the auth module",
};

function crumbButtons() {
  const nav = screen.getByRole("navigation", { name: "header.breadcrumb.label" });
  return within(nav).getAllByRole("button");
}

describe("HeaderBreadcrumb", () => {
  beforeEach(() => {
    store.selectedSession = rootSession;
    store.parentSessionStack = [];
    store.subagentSessions = [];
    store.requestExplorerReveal.mockClear();
    store.setExplorerCollapsed.mockClear();
    store.navigateBackToParent.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the project path from ~ and the session as the current page", () => {
    render(<HeaderBreadcrumb project={project} />);

    expect(crumbButtons().map((b) => b.textContent)).toEqual(["~", "work", "acme", "api"]);
    const current = screen.getByText("Fix the login flow").closest("[aria-current]");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("asks the explorer to reveal the absolute path of the clicked segment", () => {
    render(<HeaderBreadcrumb project={project} />);

    fireEvent.click(screen.getByRole("button", { name: "~" }));
    fireEvent.click(screen.getByRole("button", { name: "acme" }));
    fireEvent.click(screen.getByRole("button", { name: "api" }));

    expect(store.requestExplorerReveal.mock.calls).toEqual([
      ["/home/me"],
      ["/home/me/work/acme"],
      ["/home/me/work/acme/api"],
    ]);
    // A folded explorer is unfolded so the reveal is visible.
    expect(store.setExplorerCollapsed).toHaveBeenCalledWith(false);
  });

  it("shows the full path of each segment as its tooltip", () => {
    render(<HeaderBreadcrumb project={project} />);
    expect(screen.getByRole("button", { name: "work" })).toHaveAttribute(
      "title",
      "header.breadcrumb.reveal(/home/me/work)",
    );
  });

  it("shows parent session and subagent label inside a subagent transcript", async () => {
    store.selectedSession = subagentSession;
    store.parentSessionStack = [rootSession];
    store.subagentSessions = [subagent];
    const onShowTranscript = vi.fn();
    render(<HeaderBreadcrumb project={project} onShowTranscript={onShowTranscript} />);

    const current = screen.getByText("Audit the auth module").closest("[aria-current]");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveTextContent("header.breadcrumb.subagent");

    const parent = screen.getByRole("button", { name: "Fix the login flow" });
    expect(parent).toHaveAttribute("title", "header.breadcrumb.backTo(Fix the login flow)");
    fireEvent.click(parent);

    await waitFor(() => expect(onShowTranscript).toHaveBeenCalledTimes(1));
    expect(store.navigateBackToParent).toHaveBeenCalledTimes(1);
  });

  it("walks back up as many levels as the clicked crumb is above", async () => {
    const outerFile = subagentFile.replace("a1b2c3d4", "0uter000");
    store.selectedSession = subagentSession;
    store.parentSessionStack = [
      rootSession,
      { ...subagentSession, session_id: outerFile, file_path: outerFile, actual_session_id: "0uter000", summary: "Outer task" },
    ];
    render(<HeaderBreadcrumb project={project} />);

    fireEvent.click(screen.getByRole("button", { name: "Fix the login flow" }));

    await waitFor(() => expect(store.navigateBackToParent).toHaveBeenCalledTimes(2));
  });

  it("folds middle directories into a menu when the trail does not fit", async () => {
    // Each rendered crumb takes 100px of a 450px header.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(450);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.querySelectorAll("li").length * 100;
    });

    const deepProject = { ...project, actual_path: "/home/me/a/b/c/d/api" };
    render(<HeaderBreadcrumb project={deepProject} />);

    // 7 items (700px) do not fit; folding goes on until ~ … api session
    // (400px) does, which hides every middle directory. The ends stay.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "header.breadcrumb.showCollapsed" })).toBeInTheDocument(),
    );
    expect(crumbButtons().map((b) => b.textContent)).toContain("~");
    expect(screen.getByRole("button", { name: "api" })).toBeInTheDocument();

    const menu = screen.getByTestId("hidden-crumbs");
    const hiddenLabels = within(menu).getAllByRole("button").map((b) => b.textContent);
    expect(hiddenLabels).toEqual(["a", "b", "c", "d"]);

    act(() => {
      within(menu).getByRole("button", { name: "a" }).click();
    });
    expect(store.requestExplorerReveal).toHaveBeenCalledWith("/home/me/a");
  });

  it("keeps everything visible when the trail fits", () => {
    render(<HeaderBreadcrumb project={project} />);
    expect(screen.queryByRole("button", { name: "header.breadcrumb.showCollapsed" })).toBeNull();
  });

  it("folds again from scratch once web fonts have loaded", async () => {
    const fontEvents = new EventTarget();
    let resolveReady: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: Object.assign(fontEvents, { ready }),
    });

    // Before the font swap every crumb takes 50px, after it 100px.
    let crumbWidth = 50;
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(450);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.querySelectorAll("li").length * crumbWidth;
    });

    try {
      const deepProject = { ...project, actual_path: "/home/me/a/b/c/d/api" };
      render(<HeaderBreadcrumb project={deepProject} />);
      expect(screen.queryByRole("button", { name: "header.breadcrumb.showCollapsed" })).toBeNull();

      crumbWidth = 100;
      await act(async () => {
        resolveReady();
        await ready;
      });

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "header.breadcrumb.showCollapsed" })).toBeInTheDocument(),
      );
      expect(within(screen.getByTestId("hidden-crumbs")).getAllByRole("button")).toHaveLength(4);
    } finally {
      delete (document as { fonts?: unknown }).fonts;
    }
  });
});
