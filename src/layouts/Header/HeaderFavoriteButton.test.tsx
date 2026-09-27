import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeProject, ClaudeSession, SessionMetadata } from "@/types";
import { HeaderFavoriteButton } from "./HeaderFavoriteButton";

const { store } = vi.hoisted(() => ({
  store: {
    selectedProject: null as ClaudeProject | null,
    selectedSession: null as ClaudeSession | null,
    parentSessionStack: [] as ClaudeSession[],
    isServerReadOnly: false,
    userMetadata: { sessions: {} as Record<string, SessionMetadata> },
    toggleSessionFavorite: vi.fn(async () => {}),
  },
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (selector: (state: typeof store) => unknown) => selector(store),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

const project: ClaudeProject = {
  name: "-home-me-work-api",
  path: "/home/me/.claude/projects/-home-me-work-api",
  actual_path: "/home/me/work/api",
  session_count: 3,
  message_count: 30,
  last_modified: "2026-09-25T10:00:00Z",
  provider: "claude",
};

const rootSession: ClaudeSession = {
  session_id: `${project.path}/root.jsonl`,
  actual_session_id: "11111111-2222-3333-4444-555566667777",
  file_path: `${project.path}/root.jsonl`,
  project_name: "api",
  message_count: 3,
  first_message_time: "2026-09-25T10:00:00Z",
  last_message_time: "2026-09-25T11:00:00Z",
  last_modified: "2026-09-25T11:00:00Z",
  has_tool_use: false,
  has_errors: false,
  summary: "Fix the login flow",
};

const subagentSession: ClaudeSession = {
  ...rootSession,
  session_id: `${project.path}/root/subagents/agent-a1.jsonl`,
  file_path: `${project.path}/root/subagents/agent-a1.jsonl`,
  actual_session_id: "a1",
};

function starRoot() {
  store.userMetadata = {
    sessions: { [rootSession.session_id]: { starred: true, favorite: { projectPath: project.path } } },
  };
}

describe("HeaderFavoriteButton", () => {
  beforeEach(() => {
    store.selectedProject = project;
    store.selectedSession = rootSession;
    store.parentSessionStack = [];
    store.isServerReadOnly = false;
    store.userMetadata = { sessions: {} };
    store.toggleSessionFavorite.mockClear();
  });

  it("stars the session on screen", () => {
    render(<HeaderFavoriteButton />);

    const add = screen.getByRole("button", { name: "Add to favorites" });
    expect(add).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(add);
    expect(store.toggleSessionFavorite).toHaveBeenCalledWith(rootSession, project);
  });

  it("shows a favourite as pressed and offers to remove it", () => {
    starRoot();
    render(<HeaderFavoriteButton />);

    expect(screen.getByRole("button", { name: "Remove from favorites" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("is hidden inside a subagent transcript", () => {
    starRoot();
    store.selectedSession = subagentSession;
    store.parentSessionStack = [rootSession];
    const { container } = render(<HeaderFavoriteButton />);

    expect(container).toBeEmptyDOMElement();
  });

  it("is hidden when no session is open", () => {
    store.selectedSession = null;
    const { container } = render(<HeaderFavoriteButton />);

    expect(container).toBeEmptyDOMElement();
  });

  it("on a read-only server only marks a favourite", () => {
    store.isServerReadOnly = true;
    const { container, rerender } = render(<HeaderFavoriteButton />);
    expect(container).toBeEmptyDOMElement();

    starRoot();
    rerender(<HeaderFavoriteButton />);
    expect(screen.getByRole("img", { name: "Favorite" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
