/**
 * @fileoverview Favourite star on a session row and in its context menu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SessionItem } from "../components/SessionItem";
import { useAppStore } from "../store/useAppStore";
import type { ClaudeProject, ClaudeSession } from "../types";

vi.mock("react-i18next", async () => {
  const actual = await vi.importActual<typeof import("react-i18next")>("react-i18next");
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, fallback?: string) => (typeof fallback === "string" ? fallback : key),
    }),
  };
});

vi.mock("@/hooks/useSessionMetadata", () => ({
  useSessionDisplayName: (_sessionId: string, fallbackSummary?: string) => fallbackSummary,
  useSessionMetadata: () => ({
    customName: undefined,
    setCustomName: vi.fn(),
    hasClaudeCodeName: false,
    setHasClaudeCodeName: vi.fn(),
  }),
}));

vi.mock("@/components/NativeRenameDialog", () => ({
  NativeRenameDialog: () => null,
}));

const project: ClaudeProject = {
  name: "-home-me-work-api",
  path: "/home/me/.claude/projects/-home-me-work-api",
  actual_path: "/home/me/work/api",
  session_count: 1,
  message_count: 10,
  last_modified: "2026-09-26T10:00:00Z",
  provider: "claude",
};

const session: ClaudeSession = {
  session_id: `${project.path}/a.jsonl`,
  actual_session_id: "aaaaaaaa-0000-0000-0000-000000000001",
  file_path: `${project.path}/a.jsonl`,
  project_name: "api",
  message_count: 10,
  first_message_time: "2026-09-26T08:00:00Z",
  last_message_time: "2026-09-26T09:00:00Z",
  last_modified: "2026-09-26T09:00:00Z",
  has_tool_use: false,
  has_errors: false,
  summary: "Fix the login flow",
};

const toggleSessionFavorite = vi.fn(async () => {});
const initialState = useAppStore.getState();

function setFavorite(isFavorite: boolean) {
  useAppStore.setState({
    userMetadata: {
      version: 1,
      sessions: isFavorite
        ? { [session.session_id]: { starred: true, starredAt: "2026-09-27T10:00:00.000Z", favorite: { projectPath: project.path } } }
        : {},
      projects: {},
      settings: {},
    },
  });
}

function renderRow(props: Partial<React.ComponentProps<typeof SessionItem>> = {}) {
  const onSelect = vi.fn();
  render(
    <SessionItem
      session={session}
      isSelected={false}
      onSelect={onSelect}
      formatTimeAgo={() => "1 hour ago"}
      {...props}
    />
  );
  return { onSelect };
}

describe("SessionItem favourite star", () => {
  beforeEach(() => {
    useAppStore.setState({
      selectedProject: project,
      isServerReadOnly: false,
      toggleSessionFavorite,
    });
    setFavorite(false);
  });

  afterEach(() => {
    useAppStore.setState(initialState, true);
    vi.clearAllMocks();
  });

  it("offers an add button that stars the session without selecting the row", () => {
    const { onSelect } = renderRow();

    const add = screen.getByRole("button", { name: "Add to favorites" });
    expect(add).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(add);

    expect(toggleSessionFavorite).toHaveBeenCalledWith(session, project);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("marks a favourite with a filled star before the title that unstars it", () => {
    setFavorite(true);
    const { onSelect } = renderRow();

    const remove = screen.getByRole("button", { name: "Remove from favorites" });
    expect(remove).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Add to favorites" })).not.toBeInTheDocument();
    // Before the title in reading order.
    expect(
      remove.compareDocumentPosition(screen.getByText("Fix the login flow")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    fireEvent.click(remove);
    expect(toggleSessionFavorite).toHaveBeenCalledWith(session, project);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows a favourite but offers no toggle on a read-only server", () => {
    setFavorite(true);
    useAppStore.setState({ isServerReadOnly: true });
    renderRow();

    expect(screen.getByRole("img", { name: "Favorite" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /favorites/ })).not.toBeInTheDocument();
  });

  it("shows a favourite but offers no toggle in multi-select mode", () => {
    setFavorite(true);
    renderRow({ isSelectionMode: true });

    expect(screen.getByRole("img", { name: "Favorite" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /favorites/ })).not.toBeInTheDocument();
  });

  it("hides the star while the name is being edited", () => {
    setFavorite(true);
    renderRow();

    fireEvent.doubleClick(screen.getByText("Fix the login flow"));

    expect(screen.getByPlaceholderText("Enter session name...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /favorites/ })).not.toBeInTheDocument();
  });

  it("adds and removes the favourite from the context menu", () => {
    const { onSelect } = renderRow();

    fireEvent.contextMenu(screen.getByText("Fix the login flow"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add to favorites" }));
    expect(toggleSessionFavorite).toHaveBeenCalledWith(session, project);
    expect(onSelect).not.toHaveBeenCalled();

    setFavorite(true);
    fireEvent.contextMenu(screen.getByText("Fix the login flow"));
    expect(screen.getByRole("menuitem", { name: "Remove from favorites" })).toBeInTheDocument();
  });
});
