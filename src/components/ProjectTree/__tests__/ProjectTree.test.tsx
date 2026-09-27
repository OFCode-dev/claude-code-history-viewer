import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ClaudeProject } from "../../../types";
import { englishT } from "../../../test/utils/englishTranslator";
import { EXPANDED_GROUPS_STORAGE_KEY } from "../hooks/useProjectTreeState";
import { SORT_STORAGE_KEY } from "../hooks/useExplorerSort";
import type { ProjectTreeProps } from "../types";
import { ProjectTree } from "..";

const store = vi.hoisted(() => {
  const state = {
    activeProviders: ["claude", "codex"] as string[],
    providers: [] as Array<{ id: string; display_name: string; base_path: string; is_available: boolean }>,
    isDetectingProviders: false,
    isLoadingProjects: false,
    discoverProviders: async () => {},
    setActiveProviders: (() => {}) as (providers: string[]) => void,
    sessionEntrypointFilter: "all",
    setSessionEntrypointFilter: (async () => {}) as (filter: string) => Promise<void>,
    loadGlobalStats: async () => {},
    clearProjectSelection: () => {},
    claudePath: "/home/jack/.claude",
    selectedProject: null,
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

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: englishT }),
}));

vi.mock("overlayscrollbars-react", () => ({
  OverlayScrollbarsComponent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../components/SessionList", () => ({
  SessionList: () => <div data-testid="session-list" />,
}));

vi.mock("../../ProjectContextMenu", () => ({
  ProjectContextMenu: ({
    project,
    providerSiblings = [],
  }: {
    project: ClaudeProject;
    providerSiblings?: ClaudeProject[];
  }) => (
    <div
      data-testid="context-menu"
      data-project={project.path}
      data-siblings={providerSiblings.map((sibling) => sibling.path).join(",")}
    />
  ),
}));

function project(actualPath: string, overrides: Partial<ClaudeProject> = {}): ClaudeProject {
  const provider = overrides.provider ?? "claude";
  return {
    name: actualPath.split("/").pop() ?? actualPath,
    path: `/store/${provider}${actualPath}`,
    actual_path: actualPath,
    session_count: 1,
    message_count: 1,
    last_modified: "2026-09-25T00:00:00Z",
    provider,
    ...overrides,
  };
}

// ~/projects is the workspace root: app (Claude + Codex), lab (a folder that
// is a project), research (a pure folder), notes-tool. ~/notes is elsewhere.
const app = project("/home/jack/projects/app", { session_count: 3, last_modified: "2026-09-20T00:00:00Z" });
const appCodex = project("/home/jack/projects/app", {
  provider: "codex",
  session_count: 2,
  last_modified: "2026-09-19T00:00:00Z",
});
const lab = project("/home/jack/projects/lab", { session_count: 4 });
const relay = project("/home/jack/projects/lab/relay");
const review = project("/home/jack/projects/lab/sessions/scratch/review", { provider: "codex" });
const researchA = project("/home/jack/projects/research/a", { last_modified: "2026-09-26T00:00:00Z" });
const researchB = project("/home/jack/projects/research/b");
const tool = project("/home/jack/projects/notes-tool", { last_modified: "2026-09-01T00:00:00Z" });
const notes = project("/home/jack/notes");
const scratchpad = project("/tmp/claude-1000/-home-jack-projects-app/0f3c9a12-aaaa/scratchpad");
const gone = project("/home/jack/projects/old", { path_status: "unavailable" });
const projects = [app, appCodex, lab, relay, review, researchA, researchB, tool, notes, scratchpad, gone];

const KEYS = {
  app: "loc:home/jack/projects/app",
  lab: "dir:home/jack/projects/lab",
  relay: "loc:home/jack/projects/lab/relay",
  review: "loc:home/jack/projects/lab/sessions/scratch/review",
  research: "dir:home/jack/projects/research",
  tool: "loc:home/jack/projects/notes-tool",
  notes: "loc:home/jack/notes",
  other: "group:other-locations",
  temporary: "group:temporary-projects",
  unavailable: "group:unavailable-projects",
};

function renderTree(props: Partial<ProjectTreeProps> = {}, treeProjects: ClaudeProject[] = projects) {
  const onProjectSelect = vi.fn();
  const baseProps: ProjectTreeProps = {
    projects: treeProjects,
    sessions: [],
    selectedProject: null,
    selectedSession: null,
    onProjectSelect,
    onSessionSelect: vi.fn(),
    onGlobalStatsClick: vi.fn(),
    isLoading: false,
    isViewingGlobalStats: false,
    inlineSessions: false,
  };
  const result = render(<ProjectTree {...baseProps} {...props} />);
  return {
    ...result,
    onProjectSelect,
    rerenderWith: (next: Partial<ProjectTreeProps>) =>
      result.rerender(<ProjectTree {...baseProps} {...props} {...next} />),
  };
}

// Matched by dataset, not a CSS selector: keys contain slashes.
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

const filterInput = () => screen.getByPlaceholderText("Filter projects…");
const typeFilter = (value: string) => fireEvent.change(filterInput(), { target: { value } });
const openMenu = (name: string) =>
  fireEvent.keyDown(screen.getByRole("button", { name }), { key: "Enter" });
const stored = () => JSON.parse(localStorage.getItem(EXPANDED_GROUPS_STORAGE_KEY) ?? "{}");

beforeEach(() => {
  store.explorerRevealRequest = null;
  store.activeProviders = ["claude", "codex"];
  store.sessionEntrypointFilter = "all";
  Element.prototype.scrollIntoView = vi.fn();
});

describe("ProjectTree explorer layout", () => {
  it("lists the workspace root's projects at the top level, one row per location", () => {
    renderTree();

    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("~/projects")).toBeInTheDocument();
    // No `~` or `~ › projects` levels.
    expect(row("dir:home/jack")).toBeNull();
    expect(row("dir:home/jack/projects")).toBeNull();

    const appRow = row(KEYS.app)!;
    expect(appRow).toHaveAttribute("aria-level", "1");
    expect(document.querySelectorAll('[data-typeahead="app"]')).toHaveLength(1);
    expect(within(appRow).getByText("CC")).toBeInTheDocument();
    expect(within(appRow).getByText("CX")).toBeInTheDocument();
    expect(within(appRow).getByText("5")).toBeInTheDocument();
    expect(appRow).toHaveAttribute("aria-label", "app, Claude Code, Codex CLI, 5 sessions");
    expect(appRow.title.split("\n")).toEqual([
      "/home/jack/projects/app",
      "Claude Code · 3 sessions",
      "Codex CLI · 2 sessions",
      expect.stringMatching(/^Last active /),
    ]);

    expect(row(KEYS.lab)).toHaveAttribute("aria-expanded", "false");
    expect(row(KEYS.research)).toHaveAttribute("aria-expanded", "false");
    expect(row(KEYS.relay)).toBeNull();
  });

  it("opens Other locations the first time and keeps Temporary and Unavailable closed", () => {
    renderTree();

    expect(row(KEYS.other)).toHaveAttribute("aria-expanded", "true");
    expect(row(KEYS.other)).toHaveTextContent("Other locations");
    expect(row(KEYS.notes)).toHaveAttribute("aria-level", "2");
    expect(row(KEYS.temporary)).toHaveAttribute("aria-expanded", "false");
    expect(row(KEYS.unavailable)).toHaveAttribute("aria-expanded", "false");
    expect(row(KEYS.unavailable)).toHaveClass("text-warning");
    expect(stored().seenRoots).toEqual([KEYS.other]);
  });

  it("labels temporary rows by their owner and keeps the unavailable warning", () => {
    renderTree();
    fireEvent.click(row(KEYS.temporary)!);
    fireEvent.click(row(KEYS.unavailable)!);

    const scratchpadRow = row("loc:tmp/claude-1000/-home-jack-projects-app/0f3c9a12-aaaa/scratchpad")!;
    expect(scratchpadRow).toHaveAttribute("aria-level", "2");
    expect(within(scratchpadRow).getByText("app")).toBeInTheDocument();
    expect(within(scratchpadRow).getByText("0f3c9a")).toHaveClass("shrink-0");
    const goneRow = row("loc:home/jack/projects/old")!;
    expect(within(goneRow).getByTestId("project-path-unavailable")).toHaveAttribute(
      "aria-label",
      "Location unavailable"
    );
  });

  it("leaves hidden projects out", () => {
    renderTree({
      isProjectHidden: (path) => path === "/home/jack/projects/notes-tool",
    });

    expect(row(KEYS.tool)).toBeNull();
    expect(row(KEYS.app)).not.toBeNull();
  });

  it("puts Global statistics outside the tree as a pressed toggle", () => {
    const onGlobalStatsClick = vi.fn();
    renderTree({ isViewingGlobalStats: true, onGlobalStatsClick });

    const button = screen.getByRole("button", { name: "Global statistics" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.closest('[role="tree"]')).toBeNull();
    fireEvent.click(button);
    expect(onGlobalStatsClick).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectTree selection and expansion", () => {
  it("selects a folder that is a project on click and leaves it collapsed", () => {
    const { onProjectSelect } = renderTree();

    fireEvent.click(row(KEYS.lab)!);

    expect(onProjectSelect).toHaveBeenCalledWith(lab);
    expect(row(KEYS.lab)).toHaveAttribute("aria-expanded", "false");
  });

  it("selects the location's primary project (most sessions)", () => {
    const { onProjectSelect } = renderTree();

    fireEvent.click(row(KEYS.app)!);

    expect(onProjectSelect).toHaveBeenCalledWith(app);
  });

  it("does not deselect when the selected row is clicked again", () => {
    const { onProjectSelect } = renderTree({ selectedProject: appCodex });

    fireEvent.click(row(KEYS.app)!);

    expect(onProjectSelect).not.toHaveBeenCalled();
    expect(row(KEYS.app)).toHaveAttribute("aria-selected", "true");
  });

  it("toggles children with the chevron without selecting", () => {
    const { onProjectSelect } = renderTree();

    fireEvent.click(within(row(KEYS.lab)!).getByTestId("tree-chevron"));

    expect(row(KEYS.lab)).toHaveAttribute("aria-expanded", "true");
    expect(row(KEYS.relay)).toHaveAttribute("aria-level", "2");
    expect(onProjectSelect).not.toHaveBeenCalled();
    // The row claims its sibling role="group" container.
    const group = document.getElementById(row(KEYS.lab)!.getAttribute("aria-owns")!);
    expect(group).toHaveAttribute("role", "group");
    expect(group).toContainElement(row(KEYS.relay));
  });

  it("toggles a pure folder with a click on the row", () => {
    const { onProjectSelect } = renderTree();

    fireEvent.click(row(KEYS.research)!);
    expect(row(KEYS.research)).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(row(KEYS.research)!);
    expect(row(KEYS.research)).toHaveAttribute("aria-expanded", "false");
    expect(onProjectSelect).not.toHaveBeenCalled();
    expect(row(KEYS.research)).not.toHaveAttribute("aria-selected");
  });

  it("switches provider with a chip on a multi-provider row", () => {
    const { onProjectSelect } = renderTree({ selectedProject: app });
    const appRow = row(KEYS.app)!;

    expect(within(appRow).getByText("CC")).toHaveClass("ring-1");
    expect(within(appRow).getByText("CX")).toHaveClass("opacity-60");
    fireEvent.click(within(appRow).getByRole("button", { name: "Codex CLI · 2 sessions" }));
    expect(onProjectSelect).toHaveBeenCalledWith(appCodex);

    onProjectSelect.mockClear();
    fireEvent.click(within(appRow).getByRole("button", { name: "Claude Code · 3 sessions" }));
    expect(onProjectSelect).not.toHaveBeenCalled();
  });

  it("opens the menu for the row's project with the other providers as siblings", () => {
    renderTree({
      selectedProject: appCodex,
      onHideProject: vi.fn(),
      onUnhideProject: vi.fn(),
      isProjectHidden: () => false,
    });

    fireEvent.contextMenu(row(KEYS.app)!);

    const menu = screen.getByTestId("context-menu");
    expect(menu).toHaveAttribute("data-project", appCodex.path);
    expect(menu).toHaveAttribute("data-siblings", app.path);
  });

  it("persists folder expansion but not inline session lists", () => {
    renderTree({ inlineSessions: true });

    fireEvent.click(row(KEYS.research)!);
    fireEvent.click(row(KEYS.app)!);

    expect(stored().keys).toEqual([KEYS.other, KEYS.research]);
  });

  it("collapses every folder and group with Collapse all", () => {
    renderTree();
    fireEvent.click(row(KEYS.research)!);

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));

    expect(row(KEYS.research)).toHaveAttribute("aria-expanded", "false");
    expect(row(KEYS.other)).toHaveAttribute("aria-expanded", "false");
    expect(row(KEYS.notes)).toBeNull();
  });

  it("opens the ancestors of a selection made elsewhere and scrolls to it", async () => {
    const { rerenderWith } = renderTree();
    expect(row(KEYS.review)).toBeNull();

    rerenderWith({ selectedProject: review });

    await waitFor(() => expect(row(KEYS.review)).toHaveAttribute("aria-selected", "true"));
    expect(row(KEYS.lab)).toHaveAttribute("aria-expanded", "true");
    await waitFor(() =>
      expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts.at(-1)).toBe(row(KEYS.review))
    );
  });

  it("scrolls to a new selection but not when an unrelated folder opens", async () => {
    renderTree({ selectedProject: relay });
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    scroll.mockClear();

    fireEvent.click(row(KEYS.research)!);
    await nextFrame();
    await nextFrame();

    expect(row("loc:home/jack/projects/research/a")).not.toBeNull();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("keeps exactly one tab stop after Collapse all unmounts it", async () => {
    renderTree({ selectedProject: relay });
    await waitFor(() => expect(tabStops()).toHaveLength(1));
    expect(tabStops()[0]).toBe(row(KEYS.relay));

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));

    await waitFor(() => expect(tabStops()).toHaveLength(1));
    expect(tabStops()[0]!.isConnected).toBe(true);
    expect(row(KEYS.relay)).toBeNull();
  });

  it("renders inline sessions under the selected row below lg and toggles them on re-click", async () => {
    const { onProjectSelect } = renderTree({ inlineSessions: true, selectedProject: app });

    await waitFor(() => expect(screen.getByTestId("session-list")).toBeInTheDocument());
    expect(row(KEYS.app)).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(row(KEYS.app)!);
    expect(screen.queryByTestId("session-list")).toBeNull();
    expect(row(KEYS.app)).toHaveAttribute("aria-expanded", "false");

    act(() => row(KEYS.app)!.focus());
    press("ArrowRight");
    expect(screen.getByTestId("session-list")).toBeInTheDocument();
    expect(onProjectSelect).not.toHaveBeenCalled();
  });
});

describe("ProjectTree filter", () => {
  it("highlights matches and opens the rows above them for the search only", async () => {
    renderTree();

    typeFilter("review");

    await waitFor(() => expect(row(KEYS.review)).not.toBeNull());
    expect(row(KEYS.lab)).toHaveAttribute("aria-expanded", "true");
    expect(row(KEYS.app)).toBeNull();
    expect(within(row(KEYS.review)!).getByText("review", { selector: "mark" })).toBeInTheDocument();
    // Opened by the search, so not persisted.
    expect(stored().keys).toEqual([KEYS.other]);

    typeFilter("");
    await waitFor(() => expect(row(KEYS.lab)).toHaveAttribute("aria-expanded", "false"));
    expect(row(KEYS.app)).not.toBeNull();
  });

  it("opens the rows above matches that appear while the filter is active", async () => {
    const { rerenderWith } = renderTree();
    typeFilter("review");
    await waitFor(() => expect(row(KEYS.review)).not.toBeNull());
    // Closing a row mid-search sticks…
    fireEvent.click(within(row(KEYS.lab)!).getByTestId("tree-chevron"));
    expect(row(KEYS.lab)).toHaveAttribute("aria-expanded", "false");

    // …while a new match (projects reloaded) gets its rows opened.
    const notes = project("/home/jack/projects/research/review-notes");
    rerenderWith({ projects: [...projects, notes] });

    await waitFor(() => expect(row(KEYS.research)).toHaveAttribute("aria-expanded", "true"));
    expect(row("loc:home/jack/projects/research/review-notes")).not.toBeNull();
    expect(row(KEYS.lab)).toHaveAttribute("aria-expanded", "false");
  });

  it("clears on Escape", () => {
    renderTree();
    typeFilter("app");

    fireEvent.keyDown(filterInput(), { key: "Escape" });

    expect(filterInput()).toHaveValue("");
  });

  it("says so when nothing matches", async () => {
    renderTree();
    typeFilter("zzz");

    await waitFor(() => expect(screen.getByText("No matching projects")).toBeInTheDocument());
    expect(screen.queryByRole("tree")).toBeNull();
  });

  it("does not re-open the selection's folders after Collapse all when the search changes", async () => {
    renderTree({ selectedProject: relay });
    await waitFor(() => expect(row(KEYS.lab)).toHaveAttribute("aria-expanded", "true"));

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    typeFilter("relay");
    await waitFor(() => expect(row(KEYS.relay)).not.toBeNull());
    typeFilter("");

    await waitFor(() => expect(row(KEYS.lab)).toHaveAttribute("aria-expanded", "false"));
    expect(row(KEYS.relay)).toBeNull();
  });

  it("does not persist the rows a search opened when the tree unmounts mid-search", async () => {
    const { unmount } = renderTree();
    typeFilter("review");
    await waitFor(() => expect(row(KEYS.review)).not.toBeNull());

    unmount();

    expect(stored().keys).toEqual([KEYS.other]);
  });

  it("persists the ancestors of a project picked while searching once the search clears", async () => {
    const { rerenderWith } = renderTree();
    typeFilter("review");
    await waitFor(() => expect(row(KEYS.review)).not.toBeNull());

    rerenderWith({ selectedProject: review });
    typeFilter("");

    await waitFor(() => expect(stored().keys).toEqual(expect.arrayContaining([KEYS.lab])));
    expect(row(KEYS.review)).not.toBeNull();
  });
});

describe("ProjectTree header menus", () => {
  it("sorts by recent activity and remembers the choice", async () => {
    renderTree();
    const topLevel = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"][aria-level="1"]'))
        .map((item) => item.dataset.typeahead)
        .slice(0, 4);
    expect(topLevel()).toEqual(["app", "lab", "notes-tool", "research"]);

    openMenu("Sort by");
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Recent activity" }));

    await waitFor(() => expect(topLevel()).toEqual(["research", "lab", "app", "notes-tool"]));
    expect(localStorage.getItem(SORT_STORAGE_KEY)).toBe("recent");
  });

  it("filters providers from the menu and shows a removable chip for the filter", async () => {
    const setActiveProviders = vi.spyOn(store, "setActiveProviders");
    const { rerenderWith } = renderTree();

    openMenu("Filters");
    const codexItem = await screen.findByRole("menuitemcheckbox", { name: /Codex CLI/ });
    fireEvent.click(codexItem);
    expect(setActiveProviders).toHaveBeenCalledWith(["codex"]);
    // The menu stays open for more choices; Escape closes it.
    fireEvent.keyDown(codexItem, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    store.activeProviders = ["codex"];
    rerenderWith({});
    expect(screen.getByRole("button", { name: "Filters (active)" })).toBeInTheDocument();
    // Two Codex locations are too few for a workspace root: the tree is home-relative.
    expect(row("dir:home/jack/projects")).not.toBeNull();
    expect(row(KEYS.relay)).toBeNull();
    // A single provider needs no chips.
    expect(document.body.textContent).not.toContain("CX");

    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Codex CLI" }));
    expect(setActiveProviders).toHaveBeenLastCalledWith(["claude", "codex"]);
    setActiveProviders.mockRestore();
  });

  it("shows a chip for a non-default source and resets it", async () => {
    const setSource = vi.spyOn(store, "setSessionEntrypointFilter");
    store.sessionEntrypointFilter = "cli";
    renderTree();

    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Source: CLI" }));

    expect(setSource).toHaveBeenCalledWith("all");
    setSource.mockRestore();
  });
});

describe("ProjectTree keyboard", () => {
  it("moves with arrows: Right opens then enters, Left goes up then closes", () => {
    renderTree();
    act(() => row(KEYS.app)!.focus());

    press("ArrowDown");
    expect(document.activeElement).toBe(row(KEYS.lab));
    press("ArrowRight");
    expect(row(KEYS.lab)).toHaveAttribute("aria-expanded", "true");
    press("ArrowRight");
    expect(document.activeElement).toBe(row(KEYS.relay));
    press("ArrowLeft");
    expect(document.activeElement).toBe(row(KEYS.lab));
    press("ArrowLeft");
    expect(row(KEYS.lab)).toHaveAttribute("aria-expanded", "false");
  });

  it("jumps with Home and End and finds rows by typing", () => {
    renderTree();
    act(() => row(KEYS.lab)!.focus());

    press("End");
    expect(document.activeElement).toBe(row(KEYS.unavailable));
    press("Home");
    expect(document.activeElement).toBe(row(KEYS.app));
    press("n");
    expect(document.activeElement).toBe(row(KEYS.tool));
  });

  it("expands collapsed siblings with *", () => {
    renderTree();
    act(() => row(KEYS.app)!.focus());

    press("*");

    expect(row(KEYS.lab)).toHaveAttribute("aria-expanded", "true");
    expect(row(KEYS.research)).toHaveAttribute("aria-expanded", "true");
  });
});

describe("ProjectTree reveal requests", () => {
  it("opens the ancestors, focuses and highlights the row, then clears the request", async () => {
    const clear = vi.spyOn(store, "clearExplorerRevealRequest");
    store.explorerRevealRequest = { path: "/home/jack/projects/lab/sessions/scratch/review", nonce: 1 };

    renderTree();

    await waitFor(() => expect(document.activeElement).toBe(row(KEYS.review)));
    expect(row(KEYS.lab)).toHaveAttribute("aria-expanded", "true");
    expect(row(KEYS.review)).toHaveAttribute("data-revealed", "true");
    expect(clear).toHaveBeenCalledTimes(1);
    clear.mockRestore();
  });

  it("unfolds a collapsed explorer first, once", async () => {
    const onToggleCollapse = vi.fn();
    store.explorerRevealRequest = { path: "/home/jack/notes", nonce: 2 };

    const { rerenderWith } = renderTree({ isCollapsed: true, onToggleCollapse });
    rerenderWith({ isCollapsed: true, onToggleCollapse });
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);

    rerenderWith({ isCollapsed: false, onToggleCollapse });
    await waitFor(() => expect(document.activeElement).toBe(row(KEYS.notes)));
  });

  it("opens a closed group to reveal a row in it", async () => {
    const { rerenderWith } = renderTree();
    fireEvent.click(row(KEYS.other)!);
    expect(row(KEYS.notes)).toBeNull();

    store.explorerRevealRequest = { path: "/home/jack/notes", nonce: 3 };
    rerenderWith({});

    await waitFor(() => expect(document.activeElement).toBe(row(KEYS.notes)));
    expect(row(KEYS.other)).toHaveAttribute("aria-expanded", "true");
  });

  it("reveals the first project for the workspace root itself", async () => {
    store.explorerRevealRequest = { path: "/home/jack/projects", nonce: 4 };

    renderTree();

    await waitFor(() => expect(document.activeElement).toBe(row(KEYS.app)));
    expect(store.explorerRevealRequest).toBeNull();
  });

  it("clears the request when nothing in the tree matches", async () => {
    const clear = vi.spyOn(store, "clearExplorerRevealRequest");
    store.explorerRevealRequest = { path: "/srv/elsewhere", nonce: 5 };

    renderTree();

    await waitFor(() => expect(clear).toHaveBeenCalled());
    clear.mockRestore();
  });

  it("keeps the filter when it already shows the requested row", async () => {
    const { rerenderWith } = renderTree();
    typeFilter("review");
    await waitFor(() => expect(row(KEYS.review)).not.toBeNull());

    store.explorerRevealRequest = { path: "/home/jack/projects/lab/sessions/scratch/review", nonce: 6 };
    rerenderWith({});

    await waitFor(() => expect(document.activeElement).toBe(row(KEYS.review)));
    expect(filterInput()).toHaveValue("review");
  });

  it("keeps the filter when a folder crumb without a row resolves to a row it shows", async () => {
    const { rerenderWith } = renderTree();
    typeFilter("app");
    await waitFor(() => expect(row(KEYS.lab)).toBeNull());

    store.explorerRevealRequest = { path: "/home/jack/projects", nonce: 8 };
    rerenderWith({});

    await waitFor(() => expect(document.activeElement).toBe(row(KEYS.app)));
    expect(filterInput()).toHaveValue("app");
  });

  it("keeps the filter for a path the tree does not hold at all", async () => {
    const clear = vi.spyOn(store, "clearExplorerRevealRequest");
    const { rerenderWith } = renderTree();
    typeFilter("app");
    await waitFor(() => expect(row(KEYS.lab)).toBeNull());

    store.explorerRevealRequest = { path: "/srv/elsewhere", nonce: 9 };
    rerenderWith({});

    await waitFor(() => expect(clear).toHaveBeenCalled());
    expect(filterInput()).toHaveValue("app");
    clear.mockRestore();
  });

  it("clears the filter when it hides the requested row", async () => {
    const { rerenderWith } = renderTree();
    typeFilter("review");
    await waitFor(() => expect(row(KEYS.review)).not.toBeNull());

    store.explorerRevealRequest = { path: "/home/jack/projects/notes-tool", nonce: 7 };
    rerenderWith({});

    await waitFor(() => expect(document.activeElement).toBe(row(KEYS.tool)));
    expect(filterInput()).toHaveValue("");
  });
});
