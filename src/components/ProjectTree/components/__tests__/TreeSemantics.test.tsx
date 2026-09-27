import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ClaudeProject } from "../../../../types";
import { englishT } from "../../../../test/utils/englishTranslator";
import {
  buildExplorerModel,
  type ExplorerGroup,
  type ExplorerRow as ExplorerRowModel,
} from "../../../../utils/explorerModel";
import { ExplorerGroupRow } from "../ExplorerGroupRow";
import { ExplorerRow, type ExplorerRowProps } from "../ExplorerRow";
import { ProviderChip } from "../ProviderChip";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: englishT }),
}));

function project(actualPath: string, overrides: Partial<ClaudeProject> = {}): ClaudeProject {
  const provider = overrides.provider ?? "claude";
  return {
    name: actualPath.split("/").pop() ?? actualPath,
    path: `/store/${provider}${actualPath}`,
    actual_path: actualPath,
    session_count: 2,
    message_count: 1,
    last_modified: "2026-09-25T00:00:00Z",
    provider,
    ...overrides,
  };
}

const model = buildExplorerModel([
  project("/home/jack/projects/app"),
  project("/home/jack/projects/app", { provider: "codex", session_count: 1 }),
  project("/home/jack/projects/lab"),
  project("/home/jack/projects/lab/tools/cli"),
  project("/home/jack/projects/lab/relay"),
  project("/home/jack/projects/research/a"),
  project("/home/jack/projects/research/b"),
  project("/home/jack/projects/gone", { path_status: "unavailable" }),
]);
function findRow(label: string, rows: ExplorerRowModel[]): ExplorerRowModel | undefined {
  for (const candidate of rows) {
    if (candidate.label === label) return candidate;
    const nested = findRow(label, candidate.children);
    if (nested) return nested;
  }
  return undefined;
}
const rowOf = (label: string): ExplorerRowModel => {
  const found = findRow(label, model.main);
  if (!found) throw new Error(`no row ${label}`);
  return found;
};

function renderRow(props: Partial<ExplorerRowProps> & { row: ExplorerRowModel }) {
  const handlers = {
    onToggle: vi.fn(),
    onActivate: vi.fn(),
    onSelectProject: vi.fn(),
    onContextMenu: vi.fn(),
  };
  render(
    <ExplorerRow
      level={0}
      isExpanded={false}
      selectedProject={null}
      showProviderBadge
      {...handlers}
      {...props}
    />
  );
  return { item: screen.getByRole("treeitem"), ...handlers };
}

describe("ExplorerRow", () => {
  it("is a single-line treeitem with its level, count and provider chips", () => {
    const { item } = renderRow({ row: rowOf("app"), level: 1 });

    expect(item).toHaveAttribute("aria-level", "2");
    expect(item).toHaveAttribute("aria-selected", "false");
    expect(item).not.toHaveAttribute("aria-expanded");
    expect(item).toHaveClass("h-7");
    expect(item.style.paddingLeft).toBe("22px");
    expect(within(item).getByText("3")).toHaveClass("tabular-nums");
    expect(within(item).getByText("CC")).toHaveAttribute("title", "Claude Code · 2 sessions");
    // One indent guide per ancestor level.
    expect(item.querySelectorAll("span.bg-border\\/60")).toHaveLength(1);
  });

  it("exposes children expansion and claims its group only while open", () => {
    const lab = rowOf("lab");
    const { item, onToggle } = renderRow({ row: lab, isExpanded: true, ownsId: "g1" });

    expect(item).toHaveAttribute("aria-expanded", "true");
    expect(item).toHaveAttribute("aria-owns", "g1");
    expect(item).toHaveAttribute("data-tree-expandable", "true");
    fireEvent.click(within(item).getByTestId("tree-chevron"));
    expect(onToggle).toHaveBeenCalledWith(lab);
  });

  it("shows a pure folder without chips, count or selection state", () => {
    const { item, onToggle, onActivate } = renderRow({ row: rowOf("research") });

    expect(item).not.toHaveAttribute("aria-selected");
    expect(item).toHaveAttribute("data-tree-node", "folder");
    expect(within(item).queryByText("CC")).toBeNull();
    expect(item.textContent).toBe("research");
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("dims the compacted prefix and highlights filter matches", () => {
    const { item } = renderRow({
      row: rowOf("cli"),
      level: 1,
      match: { prefix: [{ start: 0, end: 5 }], label: [], hint: [] },
    });

    const prefix = within(item).getByText("tools", { selector: "mark" });
    // The prefix truncates first, from its start; the name keeps its width.
    expect(prefix.closest('span[dir="rtl"]')).toHaveClass("text-muted-foreground/60", "truncate");
    expect(within(item).getByText("cli")).toHaveClass("shrink-0", "max-w-full", "truncate");
  });

  it("marks the selected row and emphasises the selected provider chip", () => {
    const app = rowOf("app");
    const codex = app.location!.projects[1]!;
    const { item, onSelectProject } = renderRow({ row: app, selectedProject: codex });

    expect(item).toHaveAttribute("aria-selected", "true");
    expect(item).toHaveClass("bg-accent/10");
    expect(within(item).getByText("CX")).toHaveClass("ring-1");
    fireEvent.click(within(item).getByText("CC"));
    expect(onSelectProject).toHaveBeenCalledWith(app.location!.projects[0]);
  });

  it("opens the row menu from the keyboard", () => {
    const app = rowOf("app");
    const { item, onContextMenu } = renderRow({ row: app });

    fireEvent.keyDown(item, { key: "F10", shiftKey: true });
    fireEvent.keyDown(item, { key: "ContextMenu" });

    expect(onContextMenu).toHaveBeenCalledTimes(2);
  });

  it("keeps the unavailable warning hook", () => {
    const unavailable = model.groups.find((group) => group.id === "unavailable")!;
    const { item } = renderRow({ row: unavailable.rows[0]!, level: 1 });

    expect(within(item).getByTestId("project-path-unavailable")).toHaveAttribute(
      "aria-label",
      "Location unavailable"
    );
    expect(within(item).getByText("~/projects")).toHaveClass("shrink-[3]");
    // The row's accessible name replaces its content, so it carries the status.
    expect(item).toHaveAttribute("aria-label", "gone, ~/projects, Location unavailable, Claude Code, 2 sessions");
  });

  it("names what the icon means for home, worktree and path-less rows", () => {
    const homeModel = buildExplorerModel([
      project("/home/jack"),
      project("/home/jack/projects/a"),
      project("/home/jack/projects/b"),
      project("/home/jack/projects/c"),
    ]);
    const home = homeModel.groups[0]!.rows[0]!;
    const { item } = renderRow({ row: home, level: 1 });

    expect(home.variant).toBe("home");
    expect(item).toHaveAttribute("aria-label", "~, Home folder, Claude Code, 2 sessions");
  });
});

describe("ExplorerGroupRow", () => {
  const group: ExplorerGroup = { id: "unavailable", key: "group:unavailable-projects", rows: [], locationCount: 4 };

  it("is an expandable level-1 treeitem with a count and a warning tint", () => {
    const onToggle = vi.fn();
    render(<ExplorerGroupRow group={group} isExpanded={false} ownsId="g" onToggle={onToggle} />);

    const item = screen.getByRole("treeitem", { name: "Unavailable, 4 projects" });
    expect(item).toHaveAttribute("aria-level", "1");
    expect(item).toHaveAttribute("aria-expanded", "false");
    expect(item).not.toHaveAttribute("aria-owns");
    expect(item).toHaveClass("text-warning");
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("ProviderChip", () => {
  it("is a plain label unless it switches provider", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<ProviderChip providerId="codex" title="Codex CLI · 1 session" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("CX")).toHaveAttribute("title", "Codex CLI · 1 session");

    rerender(<ProviderChip providerId="codex" title="Codex CLI · 1 session" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Codex CLI · 1 session" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
