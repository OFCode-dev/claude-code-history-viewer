import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ClaudeProject } from "@/types";
import { SessionsPane } from "./SessionsPane";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count != null ? `${key}:${options.count}` : key,
  }),
}));

vi.mock("@/components/ProjectTree/components/SessionList", () => ({
  SessionList: () => <div data-testid="session-list" />,
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

function renderPane(props: Partial<React.ComponentProps<typeof SessionsPane>> = {}) {
  return render(
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
    />,
  );
}

describe("SessionsPane collapse", () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
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
});
