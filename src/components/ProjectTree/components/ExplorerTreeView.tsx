// src/components/ProjectTree/components/ExplorerTreeView.tsx
import React from "react";
import { useTranslation } from "react-i18next";
import type { ClaudeProject } from "../../../types";
import type {
  ExplorerGroup,
  ExplorerModel,
  ExplorerRow as ExplorerRowModel,
  ExplorerRowMatch,
} from "../../../utils/explorerModel";
import { ExplorerGroupRow } from "./ExplorerGroupRow";
import { ExplorerRow } from "./ExplorerRow";

export interface ExplorerTreeViewProps {
  /** The (filtered) model to render. */
  model: ExplorerModel;
  matches: ReadonlyMap<string, ExplorerRowMatch>;
  /** Open `dir:` / `group:` keys, plus the store path of a project whose inline sessions are open. */
  expandedKeys: ReadonlySet<string>;
  selectedProject: ClaudeProject | null;
  showProviderBadge: boolean;
  /** Below `lg`: the selected location's sessions render under its row. */
  inlineSessions: boolean;
  /** The session list for the selected row; `level` is that row's depth. */
  renderSessions: (level: number) => React.ReactNode;
  onToggleKey: (key: string) => void;
  onActivateRow: (row: ExplorerRowModel) => void;
  onToggleSessions: (row: ExplorerRowModel) => void;
  onSelectProject: (project: ClaudeProject) => void;
  onContextMenu: (event: React.MouseEvent, row: ExplorerRowModel) => void;
  treeRef: React.Ref<HTMLDivElement>;
  treeLabel: string;
  describedBy: string;
  onTreeKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onTreeFocus: (event: React.FocusEvent<HTMLDivElement>) => void;
}

/** Section label, main rows, then the Other / Temporary / Unavailable groups. */
export const ExplorerTreeView: React.FC<ExplorerTreeViewProps> = ({
  model,
  matches,
  expandedKeys,
  selectedProject,
  showProviderBadge,
  inlineSessions,
  renderSessions,
  onToggleKey,
  onActivateRow,
  onToggleSessions,
  onSelectProject,
  onContextMenu,
  treeRef,
  treeLabel,
  describedBy,
  onTreeKeyDown,
  onTreeFocus,
}) => {
  const { t } = useTranslation();
  const idPrefix = React.useId();
  // A button cannot contain its `role="group"`, so the row claims it with aria-owns.
  const groupIdOf = (key: string) =>
    `${idPrefix}group-${key.replace(/[^A-Za-z0-9_-]/g, (char) => `_${char.charCodeAt(0).toString(16)}_`)}`;

  const toggle = (row: ExplorerRowModel) => onToggleKey(row.key);

  const renderRow = (row: ExplorerRowModel, level: number): React.ReactNode => {
    const hasChildren = row.children.length > 0;
    const isExpanded = hasChildren && expandedKeys.has(row.key);
    const selectedHere =
      selectedProject && row.location?.projects.some((p) => p.path === selectedProject.path)
        ? selectedProject
        : null;
    const areSessionsOpen =
      inlineSessions && selectedHere !== null && expandedKeys.has(selectedHere.path);
    const groupId = groupIdOf(row.key);

    return (
      <div key={row.key} role="none">
        <ExplorerRow
          row={row}
          level={level}
          isExpanded={isExpanded}
          selectedProject={selectedHere}
          showProviderBadge={showProviderBadge}
          match={matches.get(row.key)}
          inlineSessions={
            inlineSessions && row.location && !hasChildren
              ? { isOpen: areSessionsOpen, onToggle: () => onToggleSessions(row) }
              : undefined
          }
          ownsId={groupId}
          onToggle={toggle}
          onActivate={onActivateRow}
          onSelectProject={onSelectProject}
          onContextMenu={onContextMenu}
        />
        {areSessionsOpen && <div role="none">{renderSessions(level)}</div>}
        {isExpanded && (
          <div role="group" id={groupId}>
            {row.children.map((child) => renderRow(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderGroup = (group: ExplorerGroup) => {
    const isExpanded = expandedKeys.has(group.key);
    const groupId = groupIdOf(group.key);
    return (
      <div key={group.key} role="none">
        <ExplorerGroupRow
          group={group}
          isExpanded={isExpanded}
          ownsId={groupId}
          onToggle={() => onToggleKey(group.key)}
        />
        {isExpanded && (
          <div role="group" id={groupId}>
            {group.rows.map((row) => renderRow(row, 1))}
          </div>
        )}
      </div>
    );
  };

  const rootLabel = model.root?.displayPath ?? (model.homeDir ? "~" : "");
  const hasMain = model.main.length > 0;

  return (
    <>
      {hasMain && (
        <div className="flex h-7 items-end gap-2 px-3 pb-1.5">
          <span className="shrink-0 text-px10 font-semibold uppercase leading-none tracking-[0.08em] text-muted-foreground/80">
            {t("project.section.projects")}
          </span>
          {rootLabel && (
            <span
              className="min-w-0 truncate font-mono text-px10 leading-none text-muted-foreground/60"
              title={model.root?.path ?? model.homeDir ?? undefined}
            >
              {rootLabel}
            </span>
          )}
        </div>
      )}
      <div
        ref={treeRef}
        role="tree"
        aria-label={treeLabel}
        aria-describedby={describedBy}
        onKeyDown={onTreeKeyDown}
        onFocusCapture={onTreeFocus}
        className="pb-3"
      >
        {model.main.map((row) => renderRow(row, 0))}
        {hasMain && model.groups.length > 0 && (
          <div role="none" className="mx-3 my-1.5 h-px bg-border/60" />
        )}
        {model.groups.map(renderGroup)}
      </div>
    </>
  );
};
