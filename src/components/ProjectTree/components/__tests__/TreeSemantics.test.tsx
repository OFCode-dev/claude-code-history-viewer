import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ClaudeProject } from "../../../../types";
import type { DirectoryGroup } from "../../../../utils/worktreeUtils";
import { ProjectItem } from "../ProjectItem";
import { GroupHeader } from "../GroupHeader";
import { GroupedProjectList } from "../GroupedProjectList";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: string | { defaultValue?: string; [name: string]: unknown }
    ) => {
      if (typeof options === "string") {
        return options;
      }
      return options?.defaultValue ?? key;
    },
  }),
}));

vi.mock("../SessionList", () => ({
  SessionList: () => <div data-testid="session-list" />,
}));

function createProject(path: string, name: string): ClaudeProject {
  return {
    name,
    path,
    actual_path: path,
    session_count: 1,
    message_count: 1,
    last_modified: "2026-02-21T00:00:00Z",
    provider: "claude",
  };
}

describe("ProjectTree tree semantics", () => {
  it("renders project item as treeitem with aria-level", () => {
    const project = createProject("/work/project-a", "project-a");

    render(
      <ProjectItem
        project={project}
        isExpanded={false}
        isSelected={false}
        ariaLevel={2}
        onToggle={vi.fn()}
        onClick={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );

    const treeItem = screen.getByRole("treeitem", { name: /project-a/i });
    expect(treeItem).toHaveAttribute("aria-level", "2");
  });

  it("puts the provider badge under the name in nested tree rows", () => {
    const project = createProject("/work/project-a", "project-a");
    const { rerender } = render(
      <ProjectItem
        project={project}
        isExpanded={false}
        isSelected={false}
        ariaLevel={3}
        nested
        onToggle={vi.fn()}
        onClick={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );
    const nameColumn = screen.getByText("project-a").parentElement!;
    expect(nameColumn).toHaveTextContent(/Claude Code/);

    // Top-level rows keep the badge inline on the right, outside the name column.
    rerender(
      <ProjectItem
        project={project}
        isExpanded={false}
        isSelected={false}
        ariaLevel={1}
        onToggle={vi.fn()}
        onClick={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );
    expect(screen.getByText("project-a").parentElement!).not.toHaveTextContent(/Claude Code/);
    expect(screen.getByRole("treeitem")).toHaveTextContent(/Claude Code/);
  });

  it("keeps an unavailable project selectable and exposes its location status", () => {
    const project = {
      ...createProject("/work/deleted-worktree", "deleted-worktree"),
      path_status: "unavailable" as const,
    };

    render(
      <ProjectItem
        project={project}
        isExpanded={false}
        isSelected={false}
        onToggle={vi.fn()}
        onClick={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );

    expect(screen.getByRole("treeitem", { name: /deleted-worktree/i })).toBeInTheDocument();
    expect(screen.getByTestId("project-path-unavailable")).toHaveAttribute(
      "aria-label",
      "Location unavailable"
    );
  });

  it("renders group header as expandable treeitem", () => {
    render(
      <GroupHeader
        groupKey="client-group"
        label="client"
        icon={<span>icon</span>}
        count={3}
        isExpanded={true}
        ariaLevel={1}
        onToggle={vi.fn()}
        variant="directory"
      />
    );

    const groupItem = screen.getByRole("treeitem", { name: /collapse client group/i });
    expect(groupItem).toHaveAttribute("aria-level", "1");
    expect(groupItem).toHaveAttribute("aria-expanded", "true");
  });

  it("marks a focused group header, including programmatic (reveal) focus", () => {
    render(
      <GroupHeader
        groupKey="dir:/work"
        label="work"
        icon={<span>icon</span>}
        count={2}
        isExpanded={false}
        onToggle={vi.fn()}
        variant="directory"
      />
    );

    // The base layer removes the outline from :focus-visible; `focus:` (not
    // `focus-visible:`) also covers row.focus() after a breadcrumb click.
    const groupItem = screen.getByRole("treeitem", { name: /expand work group/i });
    expect(groupItem).toHaveClass("focus:ring-2", "focus:ring-inset", "focus:ring-accent");
  });

  it("renders nested group container for expanded directory groups", () => {
    const project = createProject("/work/project-a", "project-a");
    const directoryGroup: DirectoryGroup = {
      name: "work",
      path: "/work",
      displayPath: "/work",
      projects: [project],
    };

    render(
      <GroupedProjectList
        groupingMode="directory"
        projects={[]}
        directoryGroups={[directoryGroup]}
        worktreeGroups={[]}
        sessions={[]}
        selectedProject={null}
        selectedSession={null}
        isLoading={false}
        expandedProjects={new Set(["dir:/"])}
        setExpandedProjects={vi.fn()}
        isProjectExpanded={() => false}
        handleProjectClick={vi.fn()}
        handleContextMenu={vi.fn()}
        onSessionSelect={vi.fn()}
        formatTimeAgo={(date) => date}
      />
    );

    const treeItems = screen.getAllByRole("treeitem");
    expect(treeItems[0]).toHaveAttribute("aria-level", "1");
    expect(treeItems[1]).toHaveAttribute("aria-level", "2");
    expect(screen.getByRole("group")).toBeInTheDocument();
  });

  it("renders a folder's own project first, lifted subtitles and provider chips", () => {
    const repo = createProject("/home/jack/repo", "repo");
    const repoCodex = { ...createProject("/home/jack/repo", "repo"), path: "/codex/repo", provider: "codex" };
    const tool = createProject("/home/jack/repo/tools/deep/cli", "cli");
    const directoryGroups: DirectoryGroup[] = [
      { name: "jack", path: "/home/jack", displayPath: "~", projects: [repo, repoCodex] },
      { name: "deep", path: "/home/jack/repo/tools/deep", displayPath: "~/repo/tools/deep", projects: [tool] },
    ];

    render(
      <GroupedProjectList
        groupingMode="directory"
        projects={[]}
        directoryGroups={directoryGroups}
        worktreeGroups={[]}
        sessions={[]}
        selectedProject={null}
        selectedSession={null}
        isLoading={false}
        expandedProjects={new Set(["dir:/home/jack"])}
        setExpandedProjects={vi.fn()}
        isProjectExpanded={() => false}
        handleProjectClick={vi.fn()}
        handleContextMenu={vi.fn()}
        onSessionSelect={vi.fn()}
        formatTimeAgo={(date) => date}
      />
    );

    // Root compacts into `~/repo`, which is itself a project.
    const items = screen.getAllByRole("treeitem");
    expect(items.map((item) => item.getAttribute("data-tree-key"))).toEqual([
      "dir:/home/jack",
      "loc:/home/jack/repo",
      "loc:/home/jack/repo/tools/deep/cli",
    ]);
    expect(items[0]).toHaveTextContent("~/repo");
    expect(items[0]).toHaveTextContent("2");
    expect(items[1]).toHaveTextContent("Codex");
    expect(items[2]).toHaveTextContent("tools/deep");
  });
});
