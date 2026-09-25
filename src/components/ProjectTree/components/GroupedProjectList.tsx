// src/components/ProjectTree/components/GroupedProjectList.tsx
import React from "react";
import { AlertCircle, FolderTree, GitBranch, Timer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ClaudeProject, ClaudeSession } from "../../../types";
import type { WorktreeGroup, DirectoryGroup } from "../../../utils/worktreeUtils";
import {
  buildDirectoryTree,
  getLocationKey,
  type DirectoryFolderNode,
  type DirectoryLocation,
  type DirectoryTree,
  type DirectoryTreeNode,
} from "../../../utils/directoryTree";
import type { GroupingStrategy } from "../types";
import { ProjectItem } from "./ProjectItem";
import { SessionList } from "./SessionList";
import { GroupHeader } from "./GroupHeader";
import { isProjectPathUnavailable, isProjectTemporary } from "../../../utils/pathUtils";

interface GroupedProjectListProps {
  groupingMode: GroupingStrategy;
  projects: ClaudeProject[];
  directoryGroups: DirectoryGroup[];
  /** Prebuilt directory tree; built from `directoryGroups` when omitted. */
  directoryTree?: DirectoryTree | null;
  worktreeGroups: WorktreeGroup[];
  ungroupedProjects?: ClaudeProject[];
  showProviderBadge?: boolean;
  sessions: ClaudeSession[];
  sessionsTotal?: number;
  hasMoreSessions?: boolean;
  selectedProject: ClaudeProject | null;
  selectedSession: ClaudeSession | null;
  isLoading: boolean;
  isLoadingMoreSessions?: boolean;
  expandedProjects: Set<string>;
  setExpandedProjects: React.Dispatch<React.SetStateAction<Set<string>>>;
  isProjectExpanded: (path: string) => boolean;
  handleProjectClick: (project: ClaudeProject) => void;
  handleContextMenu: (e: React.MouseEvent, project: ClaudeProject, providerSiblings?: ClaudeProject[]) => void;
  onSessionSelect: (session: ClaudeSession) => void;
  onSessionHover?: (session: ClaudeSession) => void;
  onLoadMoreSessions?: () => void;
  formatTimeAgo: (date: string) => string;
  inlineSessions?: boolean;
}

export const GroupedProjectList: React.FC<GroupedProjectListProps> = ({
  groupingMode,
  projects,
  directoryGroups,
  directoryTree,
  worktreeGroups,
  ungroupedProjects,
  showProviderBadge = true,
  sessions,
  sessionsTotal = sessions.length,
  hasMoreSessions = false,
  selectedProject,
  selectedSession,
  isLoading,
  isLoadingMoreSessions = false,
  expandedProjects,
  setExpandedProjects,
  isProjectExpanded,
  handleProjectClick,
  handleContextMenu,
  onSessionSelect,
  onSessionHover,
  onLoadMoreSessions = () => {},
  formatTimeAgo,
  inlineSessions = true,
}) => {
  const { t } = useTranslation();
  const groupIdPrefix = React.useId();
  /**
   * The `role="group"` of a group row sits next to its treeitem (a button
   * cannot contain it), so the row claims it with `aria-owns`.
   */
  const groupIdOf = (groupKey: string) =>
    `${groupIdPrefix}group-${groupKey.replace(
      /[^A-Za-z0-9_-]/g,
      (char) => `_${char.charCodeAt(0).toString(16)}_`
    )}`;

  const toggleGroup = (groupKey: string, projectsInGroup: ClaudeProject[]) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
        // Also collapse child projects when collapsing group
        for (const p of projectsInGroup) {
          next.delete(p.path);
        }
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  /** Nested folders are independent: collapsing one keeps its descendants' state. */
  const toggleFolder = (folderKey: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(folderKey)) {
        next.delete(folderKey);
      } else {
        next.add(folderKey);
      }
      return next;
    });
  };

  const renderProjectWithSessions = (
    project: ClaudeProject,
    variant: "default" | "main" | "worktree" = "default",
    ariaLevel = 1,
    providerSiblings: ClaudeProject[] = [],
    row: { subtitle?: string; treeKey?: string; nested?: boolean } = {}
  ) => {
    const isExpanded = isProjectExpanded(project.path);
    const showSessions = inlineSessions && isExpanded && selectedProject?.path === project.path;

    // NOTE: collapsed rows previously used `content-visibility: auto` to skip
    // offscreen paint (#460). Removed because WebKit (WKWebView/WebKitGTK)
    // mis-tracks viewport intersection when the list mutates quickly — e.g.
    // rapid provider-filter toggling — leaving some rows rendered without
    // their chevron/folder icons until expansion forced a repaint. Collapsed
    // rows are cheap to paint; search re-filter cost is covered by
    // useDeferredValue, so the optimization is not worth the rendering bug.

    return (
      <div key={project.path} role="none">
        <ProjectItem
          project={project}
          isExpanded={isExpanded}
          isSelected={selectedProject?.path === project.path}
          ariaLevel={ariaLevel}
          onToggle={() => handleProjectClick(project)}
          onClick={() => handleProjectClick(project)}
          onContextMenu={(e) => handleContextMenu(e, project, providerSiblings)}
          variant={variant}
          showProviderBadge={showProviderBadge}
          providerSiblings={providerSiblings}
          onSelectSibling={handleProjectClick}
          hasInlineChildren={inlineSessions}
          subtitle={row.subtitle}
          treeKey={row.treeKey}
          nested={row.nested}
        />
        {showSessions && (
          <div role="none">
            <SessionList
              sessions={sessions}
              sessionsTotal={sessionsTotal}
              hasMoreSessions={hasMoreSessions}
              selectedSession={selectedSession}
              isLoading={isLoading}
              isLoadingMoreSessions={isLoadingMoreSessions}
              onSessionSelect={onSessionSelect}
              onSessionHover={onSessionHover}
              onLoadMoreSessions={onLoadMoreSessions}
              formatTimeAgo={formatTimeAgo}
              variant={variant}
            />
          </div>
        )}
      </div>
    );
  };

  /**
   * Collapsed-by-default bucket for projects the user rarely wants in the main
   * list (unavailable working directories, OS temp locations). One header row
   * instead of N rows of noise.
   */
  const renderBucketGroup = (
    kind: "unavailable" | "temporary",
    bucketProjects: ClaudeProject[]
  ) => {
    if (bucketProjects.length === 0) return null;

    const groupKey = `group:${kind}-projects`;
    const isGroupExpanded = expandedProjects.has(groupKey);
    const isTemporary = kind === "temporary";

    return (
      <div className="space-y-0.5" role="none" data-testid={`${kind}-projects-group`}>
        <GroupHeader
          groupKey={groupKey}
          label={
            isTemporary
              ? t("project.temporaryGroup", "Temporary locations")
              : t("project.pathUnavailableGroup", "Unavailable locations")
          }
          icon={
            isTemporary ? <Timer className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />
          }
          count={bucketProjects.length}
          isExpanded={isGroupExpanded}
          ariaLevel={1}
          onToggle={() => toggleGroup(groupKey, bucketProjects)}
          variant={kind}
          ownsId={groupIdOf(groupKey)}
        />
        {isGroupExpanded && (
          <div
            role="group"
            id={groupIdOf(groupKey)}
            className={
              isTemporary
                ? "ml-4 pl-3 border-l-2 border-border space-y-0.5"
                : "ml-4 pl-3 border-l-2 border-warning/20 space-y-0.5"
            }
          >
            {bucketProjects.map((project) =>
              renderProjectWithSessions(project, "default", 2, [], {
                treeKey: getLocationKey(project.actual_path || project.path),
              })
            )}
          </div>
        )}
      </div>
    );
  };

  /** Split projects into main list / temporary bucket / unavailable bucket. */
  const partition = (list: ClaudeProject[]) => ({
    main: list.filter((p) => !isProjectPathUnavailable(p) && !isProjectTemporary(p)),
    temporary: list.filter(isProjectTemporary),
    unavailable: list.filter(isProjectPathUnavailable),
  });

  // Strategy 1: Directory Grouping (nested tree)
  if (groupingMode === "directory") {
    const tree =
      directoryTree ?? buildDirectoryTree(directoryGroups.flatMap((group) => group.projects));

    /**
     * One row per working directory; other providers become chips. The tree
     * already grouped the location by path identity (separators, trailing
     * slash, Windows case), so it is not split again by the raw string.
     */
    const renderLocation = (location: DirectoryLocation, ariaLevel: number, subtitle: string) => {
      const lead = pickLocationLead(location.projects, selectedProject);
      if (!lead) return null;
      return renderProjectWithSessions(
        lead,
        "default",
        ariaLevel,
        location.projects.filter((project) => project !== lead),
        { subtitle, treeKey: getLocationKey(location.path), nested: ariaLevel > 1 }
      );
    };

    const renderNode = (node: DirectoryTreeNode, ariaLevel: number): React.ReactNode =>
      node.kind === "project"
        ? renderLocation(node.location, ariaLevel, node.relativeParent)
        : renderFolder(node, ariaLevel);

    const renderFolder = (node: DirectoryFolderNode, ariaLevel: number) => {
      const isFolderExpanded = expandedProjects.has(node.key);
      const groupId = groupIdOf(node.key);
      return (
        <div key={node.key} className="space-y-0.5" role="none">
          <GroupHeader
            groupKey={node.key}
            label={node.label}
            title={node.path}
            icon={<FolderTree className="w-3.5 h-3.5" aria-hidden="true" />}
            count={node.projectCount}
            isExpanded={isFolderExpanded}
            ariaLevel={ariaLevel}
            onToggle={() => toggleFolder(node.key)}
            variant="directory"
            nested={ariaLevel > 1}
            ownsId={groupId}
          />
          {isFolderExpanded && (
            <div
              role="group"
              id={groupId}
              // The guide line sits under the parent's chevron; nested rows use
              // compact padding, so each level costs ~18px of name width.
              className={cn(
                "border-l-2 border-info/20 space-y-0.5",
                ariaLevel === 1 ? "ml-6" : "ml-4"
              )}
            >
              {/* The folder is itself a project: its row comes first. */}
              {node.self && renderLocation(node.self, ariaLevel + 1, "")}
              {node.children.map((child) => renderNode(child, ariaLevel + 1))}
            </div>
          )}
        </div>
      );
    };

    return (
      <>
        {tree.roots.map((root) => renderFolder(root, 1))}
        {renderBucketGroup("temporary", tree.temporary)}
        {renderBucketGroup("unavailable", tree.unavailable)}
      </>
    );
  }

  // Strategy 2: Worktree Grouping
  if (groupingMode === "worktree") {
    const groupedPaths = new Set(
      worktreeGroups.flatMap((group) => [group.parent.path, ...group.children.map((child) => child.path)])
    );
    const displayProjects = ungroupedProjects ?? projects.filter((project) => !groupedPaths.has(project.path));
    const {
      main: availableDisplayProjects,
      temporary: temporaryDisplayProjects,
      unavailable: unavailableDisplayProjects,
    } = partition(displayProjects);

    return (
      <>
        {worktreeGroups.map((group) => {
          const groupKey = `group:${group.parent.path}`;
          const isGroupExpanded = expandedProjects.has(groupKey);
          const allGroupProjects = [group.parent, ...group.children];

          return (
            <div key={group.parent.path} className="space-y-0.5" role="none">
              <GroupHeader
                groupKey={groupKey}
                label={group.parent.name}
                icon={<GitBranch className="w-3.5 h-3.5" />}
                count={allGroupProjects.length}
                isExpanded={isGroupExpanded}
                ariaLevel={1}
                onToggle={() => toggleGroup(groupKey, allGroupProjects)}
                variant="worktree"
                ownsId={groupIdOf(groupKey)}
              />
              {isGroupExpanded && (
                <div
                  role="group"
                  id={groupIdOf(groupKey)}
                  className="ml-4 pl-3 border-l-2 border-success/20 space-y-0.5"
                >
                  {allGroupProjects.map((project, idx) =>
                    renderProjectWithSessions(project, idx === 0 ? "main" : "worktree", 2)
                  )}
                </div>
              )}
            </div>
          );
        })}
        {availableDisplayProjects.map((project) => renderProjectWithSessions(project, "default", 1))}
        {renderBucketGroup("temporary", temporaryDisplayProjects)}
        {renderBucketGroup("unavailable", unavailableDisplayProjects)}
      </>
    );
  }

  // Strategy 3: No Grouping (Flat List)
  const { main: availableProjects, temporary: temporaryProjects, unavailable: unavailableProjects } =
    partition(projects);

  return (
    <>
      {mergeByFolder(availableProjects, selectedProject).map(({ lead, siblings }) =>
        renderProjectWithSessions(lead, "default", 1, siblings)
      )}
      {renderBucketGroup("temporary", temporaryProjects)}
      {renderBucketGroup("unavailable", unavailableProjects)}
    </>
  );
};

const activityTime = (project: ClaudeProject) => {
  const time = Date.parse(project.last_modified);
  return Number.isNaN(time) ? -Infinity : time;
};

/**
 * Lead row of a directory-tree location: the selected project, so highlight
 * and expansion follow the user, otherwise the most recently active provider.
 */
function pickLocationLead(
  list: ClaudeProject[],
  selectedProject: ClaudeProject | null
): ClaudeProject | undefined {
  const selected =
    selectedProject != null ? list.find((p) => p.path === selectedProject.path) : undefined;
  if (selected) return selected;
  return list.reduce<ClaudeProject | undefined>(
    (best, project) =>
      best === undefined || activityTime(project) > activityTime(best) ? project : best,
    undefined
  );
}

/**
 * One row per working directory. Several providers (Claude Code, Codex,
 * oh-my-pi…) record sessions for the same folder under different store
 * paths; showing them as five rows fragments the list. The selected
 * project leads its group so highlight and expansion follow the user;
 * otherwise the most recent one (input order) leads.
 */
function mergeByFolder(
  list: ClaudeProject[],
  selectedProject: ClaudeProject | null
): Array<{ lead: ClaudeProject; siblings: ClaudeProject[] }> {
  const byFolder: Record<string, ClaudeProject[]> = {};
  const order: string[] = [];
  for (const project of list) {
    const key = project.actual_path || project.path;
    if (!byFolder[key]) {
      byFolder[key] = [];
      order.push(key);
    }
    byFolder[key]!.push(project);
  }
  return order.map((key) => {
    const group = byFolder[key]!;
    const leadIndex = selectedProject
      ? group.findIndex((p) => p.path === selectedProject.path)
      : -1;
    const lead = group[leadIndex === -1 ? 0 : leadIndex]!;
    return { lead, siblings: group.filter((p) => p !== lead) };
  });
}
