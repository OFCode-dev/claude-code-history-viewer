/**
 * One home per control, in every layout:
 * - subagents: one "Subagents" list (or, folded, one rail button) at the
 *   bottom of whatever lists the sessions, never above the conversation;
 * - previous / next prompt: one pair, under whichever control opens the
 *   prompts navigator.
 *
 * The real explorer, sessions pane, navigator and reading-mode regions render;
 * only the conversation and the app chrome around them are stubbed.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import { buildPromptTrack, useViewportAnchorStore } from "@/store/viewportAnchorStore";
import type { ClaudeMessage, ClaudeProject, ClaudeSession, SubagentSession } from "@/types";
import { AppLayout, type AppLayoutProps } from "./AppLayout";

vi.mock("@/contexts/platform", () => ({
  usePlatform: () => ({ platform: "web", isDesktop: false, isWeb: true, isMobile: false }),
  DesktopOnly: () => null,
  MobileOnly: () => null,
}));
vi.mock("@/components/MessageViewer", () => ({
  MessageViewer: () => <div data-testid="message-viewer">conversation</div>,
}));
vi.mock("@/layouts/Header/Header", () => ({ Header: () => <header /> }));
vi.mock("@/layouts/Header/SettingDropdown/ModalContainer", () => ({ ModalContainer: () => null }));
vi.mock("@/components/SimpleUpdateManager", () => ({ SimpleUpdateManager: () => null }));
vi.mock("@/components/mobile/BottomTabBar", () => ({ BottomTabBar: () => null }));
vi.mock("@/components/ProjectTree/components/ExplorerFavorites", () => ({
  ExplorerFavorites: () => null,
}));
vi.mock("@/components/ProjectTree/components/SessionList", () => ({
  SessionList: () => <ul aria-label="Session list" />,
}));
vi.mock("overlayscrollbars-react", () => ({
  OverlayScrollbarsComponent: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <div id={id}>{children}</div>
  ),
}));

/** Media queries answered for one window width. */
function setWindowWidth(width: number) {
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const max = /max-width:\s*(\d+)px/.exec(query);
    const matches =
      (min == null || width >= Number(min[1])) && (max == null || width <= Number(max[1]));
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

const SESSION_PATH = "/home/me/.claude/projects/longform/5e551011.jsonl";
const project = {
  name: "longform",
  path: "/home/me/.claude/projects/longform",
  actual_path: "/home/me/work/longform",
  session_count: 1,
  message_count: 4,
  last_modified: "2026-09-25T10:00:00Z",
  provider: "claude",
} as ClaudeProject;
const session = {
  session_id: "5e551011",
  actual_session_id: "5e551011",
  file_path: SESSION_PATH,
  project_name: "longform",
  message_count: 4,
  first_message_time: "2026-09-25T10:00:00Z",
  last_message_time: "2026-09-25T10:03:00Z",
  last_modified: "2026-09-25T10:03:00Z",
  has_tool_use: false,
  has_errors: false,
} as ClaudeSession;
const messages = [
  { uuid: "p1", type: "user", content: "First question", timestamp: "2026-09-25T10:00:00Z" },
  { uuid: "a1", type: "assistant", content: [{ type: "text", text: "a" }], timestamp: "2026-09-25T10:01:00Z" },
  { uuid: "p2", type: "user", content: "Second question", timestamp: "2026-09-25T10:02:00Z" },
  { uuid: "a2", type: "assistant", content: [{ type: "text", text: "b" }], timestamp: "2026-09-25T10:03:00Z" },
] as unknown as ClaudeMessage[];
const subagent: SubagentSession = {
  agent_id: "a",
  file_path: "/home/me/.claude/projects/longform/5e551011/subagents/agent-a.jsonl",
  message_count: 5,
  file_size: 10,
  first_message_time: null,
  last_message_time: null,
  summary: null,
  tool_use_id: "toolu_a",
  workflow_run_id: null,
  description: "Map the API error codes",
};

interface LayoutCase {
  width: number;
  isSidebarCollapsed?: boolean;
  isSessionsPaneCollapsed?: boolean;
  isNavigatorOpen?: boolean;
  readingMode?: "autohide" | "pinned";
  isMobileSidebarOpen?: boolean;
}

function renderLayout(layout: LayoutCase) {
  setWindowWidth(layout.width);
  const isMobile = layout.width < 768;
  useAppStore.setState({
    isSessionsPaneCollapsed: layout.isSessionsPaneCollapsed ?? false,
    isReadingMode: layout.readingMode != null,
    readingProfile: {
      left: layout.readingMode ?? "autohide",
      right: layout.readingMode ?? "autohide",
      top: "autohide",
    },
    revealed: null,
  });
  const noop = () => {};
  const props = {
    projects: [project],
    sessions: [session],
    sessionsTotal: 1,
    hasMoreSessions: false,
    selectedProject: project,
    selectedSession: session,
    messages,
    isLoading: false,
    isLoadingProjects: false,
    isLoadingSessions: false,
    isLoadingMoreSessions: false,
    isLoadingMessages: false,
    isLoadingTokenStats: false,
    error: null,
    sessionTokenStats: null,
    sessionConversationTokenStats: null,
    projectTokenStats: [],
    projectConversationTokenStats: [],
    projectTokenStatsSummary: null,
    projectConversationTokenStatsSummary: null,
    projectTokenStatsPagination: {},
    sessionSearch: { query: "", matches: [], currentMatchIndex: -1, filterType: "content" },
    dateFilter: { start: null, end: null },
    analyticsState: { currentView: "messages" },
    analyticsActions: {},
    computed: {
      isMessagesView: true,
      isTokenStatsView: false,
      isAnalyticsView: false,
      isRecentEditsView: false,
      isSettingsView: false,
      isBoardView: false,
      isArchiveView: false,
      isAnyLoading: false,
    },
    updater: {},
    appVersion: "1.0.0",
    isDesktop: false,
    isMobile,
    isViewingGlobalStats: false,
    isSidebarCollapsed: layout.isSidebarCollapsed ?? false,
    isMobileSidebarOpen: layout.isMobileSidebarOpen ?? false,
    setIsMobileSidebarOpen: noop,
    setIsViewingGlobalStats: noop,
    sidebarWidth: 256,
    isSidebarResizing: false,
    handleSidebarResizeStart: noop,
    navigatorWidth: 280,
    isNavigatorResizing: false,
    handleNavigatorResizeStart: noop,
    isNavigatorOpen: layout.isNavigatorOpen ?? true,
    toggleNavigator: noop,
    recentEditsDockWidth: 340,
    isRecentEditsDockResizing: false,
    handleRecentEditsDockResizeStart: noop,
    handleProjectSelect: noop,
    loadMoreSessions: noop,
    handleSessionSelect: noop,
    handleSessionHover: noop,
    handleGlobalStatsClick: noop,
    handleToggleSidebar: noop,
    handleTokenStatClick: noop,
    hideProject: async () => {},
    unhideProject: async () => {},
    isProjectHidden: () => false,
    setDateFilter: noop,
    setSessionSearchQuery: noop,
    setSearchFilterType: noop,
    clearSessionSearch: noop,
    goToNextMatch: noop,
    goToPrevMatch: noop,
    loadMoreProjectTokenStats: async () => {},
    loadMoreRecentEdits: async () => {},
    globalOverviewDescription: "",
    liveStatusMessage: "",
  } as unknown as AppLayoutProps;
  return render(<AppLayout {...props} />);
}

const subagentLists = () =>
  screen.queryAllByRole("region", { name: "Subagents of this session", hidden: true });
const subagentRailButtons = () =>
  screen.queryAllByRole("button", { name: "Show 1 subagent", hidden: true });
const seekPairs = () =>
  screen.queryAllByRole("group", { name: "Previous and next prompt", hidden: true });

const original = useAppStore.getState();
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    selectedProject: project,
    selectedSession: session,
    subagentSessions: [subagent],
    parentSessionStack: [],
    subagentNavStack: [],
    messages,
  });
  const anchors = useViewportAnchorStore.getState();
  anchors.reset();
  anchors.setPromptTrack(buildPromptTrack(SESSION_PATH, messages));
  anchors.publishAnchor(SESSION_PATH, "p1");
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  useAppStore.setState({
    selectedProject: original.selectedProject,
    selectedSession: original.selectedSession,
    subagentSessions: original.subagentSessions,
    messages: original.messages,
    isReadingMode: false,
    isSessionsPaneCollapsed: original.isSessionsPaneCollapsed,
    readingProfile: original.readingProfile,
    revealed: null,
  });
  useViewportAnchorStore.getState().reset();
});

/** Where the subagent list (or its rail button) sits in a layout. */
function subagentHome(): string {
  const lists = subagentLists();
  const buttons = subagentRailButtons();
  expect(lists.length + buttons.length).toBe(1);
  expect(screen.getByTestId("message-viewer").querySelector("[aria-label='Subagents of this session']")).toBeNull();
  const home = (lists[0] ?? buttons[0])!;
  const column = home.closest("aside");
  const kind = lists.length > 0 ? "list" : "rail button";
  return `${kind} in #${column?.id ?? "?"}`;
}

/** Where the prompt seek pair sits in a layout. */
function seekHome(): string {
  const pairs = seekPairs();
  expect(pairs).toHaveLength(1);
  return pairs[0]!.getAttribute("data-prompt-seek") ?? "?";
}

describe("AppLayout: one home for subagents and for prompt seeking", () => {
  it.each([
    [{ width: 1440 }, "list in #sessions-pane", "header"],
    [{ width: 1440, isSessionsPaneCollapsed: true }, "rail button in #sessions-pane", "header"],
    [{ width: 1440, isNavigatorOpen: false }, "list in #sessions-pane", "rail"],
    [{ width: 1024 }, "list in #sessions-pane", "header"],
    [{ width: 1024, isSessionsPaneCollapsed: true }, "rail button in #sessions-pane", "header"],
    [{ width: 900 }, "list in #project-explorer", "header"],
    [{ width: 900, isSidebarCollapsed: true }, "rail button in #project-explorer", "header"],
    [{ width: 900, isNavigatorOpen: false }, "list in #project-explorer", "rail"],
    [{ width: 1440, readingMode: "autohide" as const }, "list in #sessions-pane", "gutter"],
    [
      { width: 1440, readingMode: "autohide" as const, isSessionsPaneCollapsed: true },
      "list in #sessions-pane",
      "gutter",
    ],
    [{ width: 1440, readingMode: "pinned" as const }, "list in #sessions-pane", "header"],
    [{ width: 900, readingMode: "autohide" as const }, "list in #project-explorer", "gutter"],
    [{ width: 390, isMobileSidebarOpen: true }, "list in #project-explorer", "floating"],
  ])("%o: subagents %s, prompt seek in the %s", (layout, subagents, seek) => {
    renderLayout(layout);
    act(() => {});
    expect(subagentHome()).toBe(subagents);
    expect(seekHome()).toBe(seek);
  });

  it("phones with the drawer closed: no subagent list on screen, prompt seek by the navigator button", () => {
    renderLayout({ width: 390 });
    expect(subagentLists()).toHaveLength(0);
    expect(subagentRailButtons()).toHaveLength(0);
    expect(seekHome()).toBe("floating");
  });
});
