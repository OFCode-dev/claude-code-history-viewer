import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeProject } from "@/types";
import { SessionsPane } from "./SessionsPane";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count != null ? `${key}:${options.count}` : key,
  }),
}));

// The subagents section has its own suite (SessionsPane.test.tsx) and pulls in
// the real i18n setup; this suite only covers the pane's collapse behaviour.
vi.mock("./SubagentsSection", () => ({
  SubagentsSection: () => null,
}));

vi.mock("@/components/ProjectTree/components/SessionList", () => ({
  SessionList: ({ listHeight }: { listHeight?: number }) => (
    <div data-testid="session-list" data-list-height={listHeight} />
  ),
}));

vi.mock("overlayscrollbars-react", () => ({
  OverlayScrollbarsComponent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

const project: ClaudeProject = {
  name: "-work-acme-api",
  path: "/home/me/.claude/projects/-work-acme-api",
  actual_path: "/home/me/work/acme/api",
  session_count: 7,
  message_count: 100,
  last_modified: "2026-09-25T10:00:00Z",
  provider: "claude",
};

function paneElement(props: Partial<React.ComponentProps<typeof SessionsPane>> = {}) {
  return (
    <SessionsPane
      selectedProject={project}
      sessions={[]}
      sessionsTotal={7}
      selectedSession={null}
      isLoading={false}
      onSessionSelect={vi.fn()}
      formatTimeAgo={(d) => d}
      width={300}
      onResizeStart={vi.fn()}
      {...props}
    />
  );
}

function renderPane(props: Partial<React.ComponentProps<typeof SessionsPane>> = {}) {
  return render(paneElement(props));
}

/** ResizeObserver stand-in that records what it observes and lets a test resize it. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly targets = new Set<Element>();
  disconnected = false;

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.disconnected = true;
    this.targets.clear();
  }

  resize(target: Element, height: number) {
    const entry = { target, contentRect: { height } } as unknown as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
}

function activeObserverOf(element: Element) {
  return FakeResizeObserver.instances.find((o) => !o.disconnected && o.targets.has(element));
}

/** The element the pane measures: the parent of the (mocked) scroll container. */
function listBody() {
  const body = screen.getByTestId("session-list").parentElement?.parentElement;
  if (!body) throw new Error("session list body not found");
  return body;
}

describe("SessionsPane collapse", () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    FakeResizeObserver.instances = [];
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it("offers a collapse button in the pane header", () => {
    const onToggleCollapse = vi.fn();
    renderPane({ onToggleCollapse });

    fireEvent.click(screen.getByRole("button", { name: "session.pane.collapse" }));

    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("session-list")).toBeInTheDocument();
  });

  it("renders a rail with the session count and an expand button when collapsed", () => {
    const onToggleCollapse = vi.fn();
    const { container } = renderPane({ isCollapsed: true, onToggleCollapse });

    const pane = screen.getByRole("complementary", { name: "session.pane.title" });
    expect(pane).toHaveAttribute("id", "sessions-pane");
    expect(pane).toHaveStyle({ width: "48px" });
    expect(screen.queryByTestId("session-list")).not.toBeInTheDocument();
    expect(screen.getByText("session.count:7")).toBeInTheDocument();
    // No resize handle on the rail.
    expect(container.querySelector(".cursor-col-resize")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "session.pane.expand" }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it("has no collapse control when the host does not provide one", () => {
    renderPane();
    expect(screen.queryByRole("button", { name: "session.pane.collapse" })).toBeNull();
  });

  it("measures the body again after expanding from a collapsed start", () => {
    const { rerender } = renderPane({ isCollapsed: true, onToggleCollapse: vi.fn() });
    expect(FakeResizeObserver.instances).toHaveLength(0);

    rerender(paneElement({ isCollapsed: false, onToggleCollapse: vi.fn() }));

    const body = listBody();
    const observer = activeObserverOf(body);
    expect(observer).toBeDefined();

    act(() => observer?.resize(body, 900));
    // 900 px body minus the 150 px of list chrome, not the 200 px floor.
    expect(screen.getByTestId("session-list")).toHaveAttribute("data-list-height", "750");
  });

  it("observes the new body after a collapse and expand round trip", () => {
    const { rerender } = renderPane({ onToggleCollapse: vi.fn() });
    const firstBody = listBody();
    const firstObserver = activeObserverOf(firstBody);
    expect(firstObserver).toBeDefined();

    rerender(paneElement({ isCollapsed: true, onToggleCollapse: vi.fn() }));
    expect(firstObserver?.disconnected).toBe(true);

    rerender(paneElement({ isCollapsed: false, onToggleCollapse: vi.fn() }));
    const secondBody = listBody();
    expect(secondBody).not.toBe(firstBody);
    const secondObserver = activeObserverOf(secondBody);
    expect(secondObserver).toBeDefined();

    act(() => secondObserver?.resize(secondBody, 640));
    expect(screen.getByTestId("session-list")).toHaveAttribute("data-list-height", "490");
  });
});
