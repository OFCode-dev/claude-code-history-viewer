// src/components/ProjectTree/components/ExplorerRow.tsx
import React from "react";
import { AlertCircle, ChevronRight, CircleDashed, GitBranch, Home } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { cn } from "@/lib/utils";
import type { ClaudeProject, ProviderId } from "../../../types";
import {
  getProviderProject,
  getProviderSessionCount,
  type ExplorerLocation,
  type ExplorerRow as ExplorerRowModel,
  type ExplorerRowMatch,
} from "../../../utils/explorerModel";
import { isProjectPathUnavailable } from "../../../utils/pathUtils";
import { getProviderId, getProviderLabel } from "../../../utils/providers";
import { formatTimeAgo } from "../../../utils/time";
import { HighlightText } from "./HighlightText";
import { ProviderChip, type ProviderChipEmphasis } from "./ProviderChip";

/** Left padding of a row: 8px, then 14px per level. Guides sit under each ancestor's chevron. */
const rowIndent = (level: number) => 8 + level * 14;
const guideOffset = (level: number) => rowIndent(level) + 7;

export interface ExplorerRowProps {
  row: ExplorerRowModel;
  /** Depth from 0: the indent, and `aria-level` minus one. */
  level: number;
  /** Children are shown (rows with children only). */
  isExpanded: boolean;
  /** The selected project when it is one of this row's providers, else null. */
  selectedProject: ClaudeProject | null;
  showProviderBadge: boolean;
  match?: ExplorerRowMatch;
  /** A leaf location row with inline sessions below `lg`: they are its expansion. */
  inlineSessions?: { isOpen: boolean; onToggle: () => void };
  /** Id of the `role="group"` holding the children (`aria-owns`). */
  ownsId?: string;
  onToggle: (row: ExplorerRowModel) => void;
  onActivate: (row: ExplorerRowModel) => void;
  onSelectProject: (project: ClaudeProject) => void;
  onContextMenu: (event: React.MouseEvent, row: ExplorerRowModel) => void;
}

const providerLabel = (t: TFunction, providerId: ProviderId) =>
  getProviderLabel((key, fallback) => t(key, fallback), providerId);

function providerSessionsText(t: TFunction, location: ExplorerLocation, providerId: ProviderId) {
  return t("project.providerSessions", {
    provider: providerLabel(t, providerId),
    count: getProviderSessionCount(location, providerId),
  });
}

/** One line per fact: path, sessions per provider, last activity. */
function locationTooltip(t: TFunction, row: ExplorerRowModel, location: ExplorerLocation) {
  const lines = [row.path || location.primary.name];
  for (const providerId of location.providers) {
    lines.push(providerSessionsText(t, location, providerId));
  }
  if (Number.isFinite(location.lastActivity)) {
    lines.push(
      t("project.lastActive", {
        time: formatTimeAgo(new Date(location.lastActivity).toISOString()),
      })
    );
  }
  return lines.join("\n");
}

const isUnavailableRow = (row: ExplorerRowModel) =>
  row.location?.projects.some(isProjectPathUnavailable) ?? false;

/** What the row's icon stands for, or "" for ordinary rows. */
function rowStatusLabel(t: TFunction, row: ExplorerRowModel): string {
  if (isUnavailableRow(row)) return t("project.pathUnavailable");
  switch (row.variant) {
    case "home":
      return t("project.homeFolder");
    case "worktree":
      return t("project.gitWorktree");
    case "unknown":
      return t("project.unknownPath");
    default:
      return "";
  }
}

const RowIcon: React.FC<{ row: ExplorerRowModel }> = ({ row }) => {
  const { t } = useTranslation();
  const iconClass = "size-3.5 shrink-0";
  if (row.location && isUnavailableRow(row)) {
    return (
      <span
        data-testid="project-path-unavailable"
        aria-label={t("project.pathUnavailable")}
        title={t("project.pathUnavailablePath", { path: row.path || row.location.primary.name })}
        className="flex shrink-0 text-warning"
      >
        <AlertCircle className={iconClass} aria-hidden="true" />
      </span>
    );
  }
  switch (row.variant) {
    case "home":
      return (
        <span title={t("project.homeFolder")} className="flex shrink-0 text-muted-foreground">
          <Home className={iconClass} aria-hidden="true" />
        </span>
      );
    case "worktree":
      return (
        <span title={t("project.gitWorktree")} className="flex shrink-0 text-success/80">
          <GitBranch className={iconClass} aria-hidden="true" />
        </span>
      );
    case "unknown":
      return (
        <span title={t("project.unknownPath")} className="flex shrink-0 text-muted-foreground/70">
          <CircleDashed className={iconClass} aria-hidden="true" />
        </span>
      );
    default:
      return null;
  }
};

/**
 * One explorer row: a single 28px line with the name (dim prefix and hint
 * around it), provider chips and the session count. A location row selects
 * its project; a pure folder row toggles.
 */
export const ExplorerRow: React.FC<ExplorerRowProps> = ({
  row,
  level,
  isExpanded,
  selectedProject,
  showProviderBadge,
  match,
  inlineSessions,
  ownsId,
  onToggle,
  onActivate,
  onSelectProject,
  onContextMenu,
}) => {
  const { t } = useTranslation();
  const { location } = row;
  const hasChildren = row.children.length > 0;
  const isSelected = selectedProject !== null;
  const isMultiProvider = (location?.providers.length ?? 0) > 1;
  const selectedProviderId = selectedProject ? getProviderId(selectedProject.provider) : null;

  const chipEmphasis = (providerId: ProviderId): ProviderChipEmphasis => {
    if (!isSelected || !isMultiProvider) return "normal";
    return providerId === selectedProviderId ? "selected" : "dimmed";
  };

  const name = `${row.prefix}${row.label}`;
  // The accessible name replaces the row's content, so it also says what the
  // icon (and its tooltip) would: unavailable, home, worktree, unknown path.
  const ariaLabel = location
    ? [
        name,
        row.hint,
        rowStatusLabel(t, row),
        showProviderBadge ? location.providers.map((id) => providerLabel(t, id)).join(", ") : "",
        t("project.sessionCount", { count: location.sessionCount }),
      ]
        .filter(Boolean)
        .join(", ")
    : name;

  const expanded = hasChildren ? isExpanded : inlineSessions?.isOpen;
  // A hint without a separator is an identifier (a scratchpad's session id)
  // that tells otherwise identical rows apart: it stays whole and the name
  // truncates. A path hint (`~/projects`) gives up its width first.
  const hintIsIdentifier = row.hint.length > 0 && !/[\\/]/.test(row.hint);

  return (
    <button
      type="button"
      role="treeitem"
      data-tree-node={location ? "location" : "folder"}
      data-tree-key={row.key}
      data-tree-expandable={hasChildren ? "true" : undefined}
      data-typeahead={row.label}
      aria-level={level + 1}
      aria-selected={location ? isSelected : undefined}
      aria-expanded={expanded}
      aria-owns={hasChildren && isExpanded ? ownsId : undefined}
      aria-label={ariaLabel}
      title={location ? locationTooltip(t, row, location) : row.path}
      tabIndex={-1}
      onClick={() => (location ? onActivate(row) : onToggle(row))}
      onKeyDown={(event) => {
        if (location && (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) {
          // Keyboard route to the row menu (hide, copy path, switch provider).
          event.preventDefault();
          onContextMenu(event as unknown as React.MouseEvent, row);
          return;
        }
        if (!inlineSessions || hasChildren) return;
        const opens = event.key === "ArrowRight" && !inlineSessions.isOpen;
        const closes = event.key === "ArrowLeft" && inlineSessions.isOpen;
        if (opens || closes) {
          event.preventDefault();
          inlineSessions.onToggle();
        }
      }}
      onContextMenu={location ? (event) => onContextMenu(event, row) : undefined}
      className={cn(
        "group/row relative flex h-7 w-full items-center gap-1 pr-2 text-left outline-none",
        "transition-colors hover:bg-muted/50",
        "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
        "data-[revealed=true]:ring-1 data-[revealed=true]:ring-inset data-[revealed=true]:ring-accent",
        isSelected && "bg-accent/10 shadow-[inset_2px_0_0_var(--accent)] hover:bg-accent/15"
      )}
      style={{ paddingLeft: rowIndent(level) }}
    >
      {Array.from({ length: level }, (_, depth) => (
        <span
          key={depth}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-border/60"
          style={{ left: guideOffset(depth) }}
        />
      ))}

      <span
        aria-hidden="true"
        data-testid="tree-chevron"
        onClick={
          hasChildren
            ? (event) => {
                event.stopPropagation();
                onToggle(row);
              }
            : undefined
        }
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/70",
          !hasChildren && "invisible",
          hasChildren && "rounded-sm hover:text-foreground"
        )}
      >
        <ChevronRight
          className={cn("size-3.5 transition-transform duration-150", isExpanded && "rotate-90")}
        />
      </span>

      <RowIcon row={row} />

      {/* The prefix and a path hint give up their width first; the name keeps
          its own (max-w-full) and truncates only when it alone does not fit.
          The prefix loses its start (`…mem/`): the folder next to the name
          says the most. */}
      <span className="flex min-w-0 flex-1 items-baseline">
        {row.prefix && (
          <span
            dir="rtl"
            className="min-w-0 shrink truncate text-px12-5 text-muted-foreground/60"
          >
            <bdi dir="ltr">
              <HighlightText text={row.prefix} ranges={match?.prefix} />
            </bdi>
          </span>
        )}
        <span
          className={cn(
            "min-w-0 truncate text-px12-5",
            hintIsIdentifier ? "shrink" : "max-w-full shrink-0",
            isSelected ? "font-medium text-foreground" : "text-sidebar-foreground/85"
          )}
        >
          <HighlightText text={row.label} ranges={match?.label} />
        </span>
        {row.hint && (
          <span
            className={cn(
              "ml-1.5 text-px11 text-muted-foreground/55",
              hintIsIdentifier ? "shrink-0" : "min-w-0 shrink-[3] truncate"
            )}
          >
            <HighlightText text={row.hint} ranges={match?.hint} />
          </span>
        )}
      </span>

      {location && showProviderBadge && (
        <span className="ml-1 flex shrink-0 items-center gap-0.5">
          {location.providers.map((providerId) => {
            const project = getProviderProject(location, providerId);
            return (
              <ProviderChip
                key={providerId}
                providerId={providerId}
                title={providerSessionsText(t, location, providerId)}
                emphasis={chipEmphasis(providerId)}
                onSelect={
                  isMultiProvider && project ? () => onSelectProject(project) : undefined
                }
              />
            );
          })}
        </span>
      )}

      {location && (
        <span
          className={cn(
            "min-w-7 shrink-0 text-right text-px10-5 tabular-nums",
            isSelected ? "text-foreground/70" : "text-muted-foreground"
          )}
        >
          {location.sessionCount}
        </span>
      )}
    </button>
  );
};
