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
    activeProviders: ["claude"] as string[],
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

// A stable `t`, like i18next's: effects that depend on it must not re-run every render.
const translate = vi.hoisted(
  () => (key: string, options?: string | { defaultValue?: string }) =>
    typeof options === "string" ? options : options?.defaultValue ?? key
);

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: translate }),
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
  selectedProject?: ClaudeProject | null;
}

function renderTree(props: TreeProps = {}, treeProjects: ClaudeProject[] = projects) {
  const baseProps = {
    projects: treeProjects,
    sessions: [],
    selectedProject: null,
    selectedSession: null,
    onProjectSelect: vi.fn(),
    onSessionSelect: vi.fn(),
    onGlobalStatsClick: vi.fn(),
    isLoading: false,
    isViewingGlobalStats: false,
    directoryGroups: groupProjectsByDirectory(treeProjects).groups,
    onGroupingModeChange: vi.fn(),
  };
  const result = render(<ProjectTree {...baseProps} groupingMode="directory" {...props} />);
  return {
    ...result,
    rerenderWith: (next: TreeProps) =>
      result.rerender(<ProjectTree {...baseProps} groupingMode="directory" {...next} />),
  };
}

// Matched by dataset, not a CSS selector: Windows keys contain backslashes.
const row = (key: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"]')).find(
    (item) => item.dataset.treeKey === key
  ) ?? null;

const press = (key: string) => {
  fireEvent.keyDown(document.activeElement as HTMLElement, { key });
};

const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

const tabStops = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"]')).filter(
    (item) => item.tabIndex === 0
  );

const typeSearch = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText("Search projects..."), { target: { value } });

const [appProject] = projects as [ClaudeProject];

describe("ProjectTree directory tree", () => {
  beforeEach(() => {
    store.explorerRevealRequest = null;
    store.activeProviders = ["claude"];
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
    // The label keeps its last folder whole; the path before it may truncate.
    const label = within(chain).getByTitle("/home/jack/work/crawl/reports");
    expect(label).toHaveTextContent("crawl/reports");
    expect(within(label).getByText("reports")).toHaveClass("shrink-0");
    expect(row("loc:/home/jack/work/crawl/reports/daily")).toHaveAttribute("aria-level", "4");
    // Each group row owns its sibling role="group" container.
    const group = document.getElementById(chain.getAttribute("aria-owns")!);
    expect(group).toHaveAttribute("role", "group");
    expect(group).toContainElement(row("loc:/home/jack/work/crawl/reports/daily"));
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
      seenRoots: ["dir:/home/jack"],
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

  it("keeps every provider of a folder recorded with different spellings", () => {
    store.activeProviders = ["claude", "codex"];
    renderTree({}, [
      project("/home/jack/proj", { last_modified: "2026-09-20T00:00:00Z" }),
      project("/home/jack/proj/", { path: "/store/codex/proj", provider: "codex" }),
      project("/home/jack/other"),
    ]);

    const proj = row("loc:/home/jack/proj")!;
    expect(within(proj).getByText("Codex CLI")).toBeInTheDocument();
    expect(within(proj).getByText("Claude Code")).toBeInTheDocument();
    // The most recently active provider leads the row.
    expect(proj).toHaveAttribute("data-project-path", "/store/codex/proj");
    expect(document.querySelectorAll('[data-tree-node="project"]')).toHaveLength(2);
  });

  it("merges Windows case variants of a folder into one row with both chips", () => {
    store.activeProviders = ["claude", "codex"];
    const selected = project("C:\\Users\\Jack\\src\\api", { path: "/store/claude-api" });
    renderTree({ selectedProject: selected }, [
      selected,
      project("c:\\users\\jack\\src\\API", { path: "/store/codex-api", provider: "codex" }),
      project("C:\\Users\\Jack\\src\\app", { path: "/store/claude-app" }),
    ]);

    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-tree-node="project"]'));
    expect(rows).toHaveLength(2);
    // The selected spelling leads the merged row; the other provider is a chip.
    const api = rows.find((item) => item.dataset.projectPath === "/store/claude-api")!;
    expect(api).toHaveAttribute("aria-selected", "true");
    expect(api.dataset.treeKey?.toLowerCase()).toBe("loc:c:\\users\\jack\\src\\api");
    expect(within(api).getByText("Codex CLI")).toBeInTheDocument();
  });

  it("hides Collapse all in the flat list", () => {
    renderTree({ groupingMode: "none" });

    expect(screen.queryByRole("button", { name: "Collapse all" })).toBeNull();
  });
});

describe("ProjectTree directory tree state", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    store.explorerRevealRequest = null;
    store.activeProviders = ["claude"];
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  it("keeps exactly one tab stop after Collapse all unmounts it", async () => {
    renderTree({ selectedProject: appProject });
    await waitFor(() => expect(tabStops()).toHaveLength(1));
    expect(tabStops()[0]).toBe(row("loc:/home/jack/work/app"));

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));

    // Falls back to the first treeitem once the selected row is gone.
    await waitFor(() => expect(tabStops()).toHaveLength(1));
    expect(tabStops()[0]!.isConnected).toBe(true);
    expect(row("loc:/home/jack/work/app")).toBeNull();
  });

  it("scrolls to a new selection but not when an unrelated folder opens", async () => {
    renderTree({ selectedProject: appProject });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(row("loc:/home/jack/work/app"));
    scrollIntoView.mockClear();

    fireEvent.click(row("dir:/home/jack/work/crawl")!);
    await nextFrame();
    await nextFrame();

    expect(row("loc:/home/jack/work/crawl/reports/daily")).not.toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not re-open the selection's folders after Collapse all when the search changes", async () => {
    renderTree({ selectedProject: appProject });
    expect(row("dir:/home/jack/work")).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    typeSearch("app");
    // The search opens the folders holding matches…
    await waitFor(() => expect(row("loc:/home/jack/work/app")).not.toBeNull());
    typeSearch("");

    // …and clearing it closes them again instead of re-opening the ancestors.
    await waitFor(() => expect(row("dir:/home/jack")).toHaveAttribute("aria-expanded", "false"));
    expect(row("dir:/home/jack/work")).toBeNull();
  });

  it("opens folders holding search matches and closes them when the search clears", async () => {
    renderTree();
    expect(row("dir:/home/jack/work")).toHaveAttribute("aria-expanded", "false");

    // Every project path contains "e" (home), so the whole tree matches.
    typeSearch("e");
    await waitFor(() => expect(row("loc:/home/jack/work/crawl/reports/weekly")).not.toBeNull());
    expect(row("dir:/home/jack/work/crawl")).toHaveAttribute("aria-expanded", "true");

    typeSearch("");
    await waitFor(() => expect(row("dir:/home/jack/work")).toHaveAttribute("aria-expanded", "false"));
    // The root was open before the search and stays open.
    expect(row("dir:/home/jack")).toHaveAttribute("aria-expanded", "true");
  });

  it("does not persist the folders a search opened when the tree unmounts mid-search", async () => {
    // The mobile drawer unmounts the tree after a session pick, search still typed.
    const { unmount } = renderTree();
    typeSearch("e");
    await waitFor(() => expect(row("loc:/home/jack/work/crawl/reports/weekly")).not.toBeNull());
    unmount();

    const stored = JSON.parse(localStorage.getItem(EXPANDED_GROUPS_STORAGE_KEY) ?? "{}");
    expect(stored.keys).toEqual(["dir:/home/jack"]);
  });

  it("persists the ancestors of a project selected while searching once the search clears", async () => {
    const { rerenderWith } = renderTree();
    // The whole tree matches, so the search opens every folder...
    typeSearch("e");
    await waitFor(() => expect(row("loc:/home/jack/work/crawl/reports/daily")).not.toBeNull());
    rerenderWith({ selectedProject: projects[1]! });
    typeSearch("");

    // ...and all of them are the selection's ancestors: nothing closes, yet
    // they must reach storage now that the search no longer owns them.
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(EXPANDED_GROUPS_STORAGE_KEY) ?? "{}");
      expect(stored.keys).toEqual(
        expect.arrayContaining(["dir:/home/jack/work", "dir:/home/jack/work/crawl"])
      );
    });
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

  describe("a folder that is itself a project", () => {
    // ~/work is a project and a folder holding two more projects.
    const nested = [
      project("/home/jack/work"),
      project("/home/jack/work/app"),
      project("/home/jack/work/lib"),
      project("/home/jack/notes"),
    ];
    const workProject = nested[0]!;

    it("opens the folder and focuses the project row for the selected project's crumb", async () => {
      const { rerenderWith } = renderTree({ selectedProject: workProject }, nested);
      expect(row("dir:/home/jack/work")).toHaveAttribute("aria-expanded", "true");
      fireEvent.click(row("dir:/home/jack/work")!);
      expect(row("loc:/home/jack/work")).toBeNull();

      store.explorerRevealRequest = { path: "/home/jack/work", nonce: 9 };
      rerenderWith({ selectedProject: workProject });

      await waitFor(() => expect(document.activeElement).toBe(row("loc:/home/jack/work")));
      expect(row("dir:/home/jack/work")).toHaveAttribute("aria-expanded", "true");
      expect(store.explorerRevealRequest).toBeNull();
    });

    it("keeps focusing the folder row when that folder is not the selected project", async () => {
      store.explorerRevealRequest = { path: "/home/jack/work", nonce: 10 };

      renderTree({ selectedProject: nested[1]! }, nested);

      await waitFor(() => expect(document.activeElement).toBe(row("dir:/home/jack/work")));
    });
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

  it("asks for directory grouping once however often the effect re-runs", () => {
    const switchMode = vi.fn();
    store.explorerRevealRequest = { path: "/home/jack/notes", nonce: 5 };

    const { rerenderWith } = renderTree({
      groupingMode: "none",
      onGroupingModeChange: (mode) => switchMode(mode),
    });
    rerenderWith({ groupingMode: "none", onGroupingModeChange: (mode) => switchMode(mode) });
    rerenderWith({ groupingMode: "none", onGroupingModeChange: (mode) => switchMode(mode) });

    expect(switchMode).toHaveBeenCalledTimes(1);
    expect(switchMode).toHaveBeenCalledWith("directory");
  });

  it("drops the request when the grouping mode never switches", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      store.explorerRevealRequest = { path: "/home/jack/notes", nonce: 6 };
      renderTree({ groupingMode: "none" });
      expect(store.explorerRevealRequest).not.toBeNull();

      act(() => vi.advanceTimersByTime(3000));

      expect(store.explorerRevealRequest).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the search when it already shows the requested row", async () => {
    const { rerenderWith } = renderTree();
    typeSearch("weekly");
    await waitFor(() => expect(row("loc:/home/jack/work/crawl/reports/weekly")).not.toBeNull());

    store.explorerRevealRequest = { path: "/home/jack/work/crawl/reports/weekly", nonce: 7 };
    rerenderWith({});

    await waitFor(() =>
      expect(document.activeElement).toBe(row("loc:/home/jack/work/crawl/reports/weekly"))
    );
    expect(screen.getByPlaceholderText("Search projects...")).toHaveValue("weekly");
  });

  it("clears the search when it hides the requested row", async () => {
    const { rerenderWith } = renderTree();
    typeSearch("weekly");
    await waitFor(() => expect(row("loc:/home/jack/work/crawl/reports/weekly")).not.toBeNull());

    store.explorerRevealRequest = { path: "/home/jack/notes", nonce: 8 };
    rerenderWith({});

    await waitFor(() => expect(document.activeElement).toBe(row("loc:/home/jack/notes")));
    expect(screen.getByPlaceholderText("Search projects...")).toHaveValue("");
  });
});
