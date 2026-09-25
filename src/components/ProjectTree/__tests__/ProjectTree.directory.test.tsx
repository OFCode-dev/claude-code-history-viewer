import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ClaudeProject } from "../../../types";
import type { GroupingMode } from "../../../types/metadata.types";
import { groupProjectsByDirectory } from "../../../utils/worktreeUtils";
import { EXPANDED_GROUPS_STORAGE_KEY } from "../hooks/useProjectTreeState";
import { ProjectTree } from "..";

const store = vi.hoisted(() => {
  const state = {
    activeProviders: ["claude"],
    providers: [],
    isDetectingProviders: false,
    isLoadingProjects: false,
    discoverProviders: async () => {},
    setActiveProviders: () => {},
    sessionEntrypointFilter: "all",
    setSessionEntrypointFilter: async () => {},
    loadGlobalStats: async () => {},
    clearProjectSelection: () => {},
    explorerRevealRequest: null as { path: string; nonce: number } | null,
    clearExplorerRevealRequest: () => {
      state.explorerRevealRequest = null;
    },
  };
  return state;
});

vi.mock("../../../store/useAppStore", () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof store) => unknown) => selector(store),
    { getState: () => store }
  ),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: string | { defaultValue?: string }) =>
      typeof options === "string" ? options : options?.defaultValue ?? key,
  }),
}));

vi.mock("overlayscrollbars-react", () => ({
  OverlayScrollbarsComponent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../components/SessionList", () => ({
  SessionList: () => <div data-testid="session-list" />,
}));

function project(actualPath: string, overrides: Partial<ClaudeProject> = {}): ClaudeProject {
  return {
    name: actualPath.split("/").pop() ?? actualPath,
    path: `/store${actualPath}`,
    actual_path: actualPath,
    session_count: 0,
    message_count: 1,
    last_modified: "2026-09-25T00:00:00Z",
    provider: "claude",
    ...overrides,
  };
}

// ~[4]{work[3]{crawl/reports[2]{daily,weekly},app},notes}
const projects = [
  project("/home/jack/work/app"),
  project("/home/jack/work/crawl/reports/daily"),
  project("/home/jack/work/crawl/reports/weekly"),
  project("/home/jack/notes"),
];

interface TreeProps {
  groupingMode?: GroupingMode;
  onGroupingModeChange?: (mode: GroupingMode) => void;
}

function renderTree(props: TreeProps = {}) {
  const baseProps = {
    projects,
    sessions: [],
    selectedProject: null,
    selectedSession: null,
    onProjectSelect: vi.fn(),
    onSessionSelect: vi.fn(),
    onGlobalStatsClick: vi.fn(),
    isLoading: false,
    isViewingGlobalStats: false,
    directoryGroups: groupProjectsByDirectory(projects).groups,
    onGroupingModeChange: vi.fn(),
  };
  const result = render(<ProjectTree {...baseProps} groupingMode="directory" {...props} />);
  return {
    ...result,
    rerenderWith: (next: TreeProps) =>
      result.rerender(<ProjectTree {...baseProps} groupingMode="directory" {...next} />),
  };
}

const row = (key: string) =>
  document.querySelector<HTMLElement>(`[role="treeitem"][data-tree-key="${key}"]`);

const press = (key: string) => {
  fireEvent.keyDown(document.activeElement as HTMLElement, { key });
};

describe("ProjectTree directory tree", () => {
  beforeEach(() => {
    store.explorerRevealRequest = null;
  });

  it("renders a nested tree with the root expanded on first run", () => {
    renderTree();

    const root = row("dir:/home/jack")!;
    expect(root).toHaveAttribute("aria-level", "1");
    expect(root).toHaveAttribute("aria-expanded", "true");
    expect(within(root).getByText("4")).toBeInTheDocument();

    const work = row("dir:/home/jack/work")!;
    expect(work).toHaveAttribute("aria-level", "2");
    expect(work).toHaveAttribute("aria-expanded", "false");
    expect(work.closest('[role="group"]')).not.toBeNull();
    expect(row("loc:/home/jack/notes")).toHaveAttribute("aria-level", "2");
    expect(row("loc:/home/jack/work/app")).toBeNull();
  });

  it("shows compacted folders and nested groups when expanded", () => {
    renderTree();

    fireEvent.click(row("dir:/home/jack/work")!);
    fireEvent.click(row("dir:/home/jack/work/crawl")!);

    const chain = row("dir:/home/jack/work/crawl")!;
    expect(chain).toHaveAttribute("aria-level", "3");
    expect(within(chain).getByText("crawl/reports")).toBeInTheDocument();
    expect(row("loc:/home/jack/work/crawl/reports/daily")).toHaveAttribute("aria-level", "4");
    expect(
      document.querySelectorAll('[role="group"] [role="group"] [role="group"]')
    ).toHaveLength(1);
  });

  it("persists folder expansion", () => {
    renderTree();
    fireEvent.click(row("dir:/home/jack/work")!);

    const stored = JSON.parse(localStorage.getItem(EXPANDED_GROUPS_STORAGE_KEY) ?? "{}");
    expect(stored).toEqual({
      keys: ["dir:/home/jack", "dir:/home/jack/work"],
      rootsInitialized: true,
    });
  });

  it("moves with Right/Left: expand, first child, parent, collapse", () => {
    renderTree();
    const work = row("dir:/home/jack/work")!;
    act(() => work.focus());

    press("ArrowRight");
    expect(work).toHaveAttribute("aria-expanded", "true");

    press("ArrowRight");
    expect(document.activeElement).toBe(row("dir:/home/jack/work/crawl"));

    press("ArrowDown");
    expect(document.activeElement).toBe(row("loc:/home/jack/work/app"));

    press("ArrowLeft");
    expect(document.activeElement).toBe(work);

    press("ArrowLeft");
    expect(work).toHaveAttribute("aria-expanded", "false");

    press("ArrowLeft");
    expect(document.activeElement).toBe(row("dir:/home/jack"));
  });

  it("expands only the siblings under the same parent with *", () => {
    renderTree();
    fireEvent.click(row("dir:/home/jack/work")!);
    act(() => row("loc:/home/jack/work/app")!.focus());

    press("*");

    expect(row("dir:/home/jack/work/crawl")).toHaveAttribute("aria-expanded", "true");
    expect(row("dir:/home/jack")).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses every folder with Collapse all", () => {
    renderTree();
    fireEvent.click(row("dir:/home/jack/work")!);

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));

    expect(row("dir:/home/jack")).toHaveAttribute("aria-expanded", "false");
    expect(row("dir:/home/jack/work")).toBeNull();
  });

  it("hides Collapse all in the flat list", () => {
    renderTree({ groupingMode: "none" });

    expect(screen.queryByRole("button", { name: "Collapse all" })).toBeNull();
  });
});

describe("ProjectTree reveal requests", () => {
  beforeEach(() => {
    store.explorerRevealRequest = null;
  });

  it("switches to directory grouping, expands ancestors, focuses the row and clears", async () => {
    const clear = vi.spyOn(store, "clearExplorerRevealRequest");
    const onGroupingModeChange = vi.fn();
    store.explorerRevealRequest = { path: "/home/jack/work/crawl/reports/weekly", nonce: 1 };

    const { rerenderWith } = renderTree({ groupingMode: "none", onGroupingModeChange });
    expect(onGroupingModeChange).toHaveBeenCalledWith("directory");
    expect(clear).not.toHaveBeenCalled();

    rerenderWith({ groupingMode: "directory", onGroupingModeChange });

    await waitFor(() =>
      expect(document.activeElement).toBe(row("loc:/home/jack/work/crawl/reports/weekly"))
    );
    expect(row("dir:/home/jack/work")).toHaveAttribute("aria-expanded", "true");
    expect(row("dir:/home/jack/work/crawl")).toHaveAttribute("aria-expanded", "true");
    expect(clear).toHaveBeenCalledTimes(1);
    clear.mockRestore();
  });

  it("reveals a folder row without expanding the folder itself", async () => {
    store.explorerRevealRequest = { path: "/home/jack/work", nonce: 2 };

    renderTree();

    await waitFor(() => expect(document.activeElement).toBe(row("dir:/home/jack/work")));
    expect(row("dir:/home/jack/work")).toHaveAttribute("aria-expanded", "false");
    expect(store.explorerRevealRequest).toBeNull();
  });

  it("reveals the nearest node for a parent above every project", async () => {
    store.explorerRevealRequest = { path: "/home", nonce: 3 };

    renderTree();

    await waitFor(() => expect(document.activeElement).toBe(row("dir:/home/jack")));
    expect(store.explorerRevealRequest).toBeNull();
  });

  it("clears the request when nothing in the tree matches", async () => {
    const clear = vi.spyOn(store, "clearExplorerRevealRequest");
    store.explorerRevealRequest = { path: "/srv/elsewhere", nonce: 4 };

    renderTree();

    await waitFor(() => expect(clear).toHaveBeenCalled());
    clear.mockRestore();
  });
});
