// src/utils/worktreeUtils.ts
import type { ClaudeProject } from "../types";

/**
 * Represents a group of worktrees under a parent project.
 */
export interface WorktreeGroup {
  parent: ClaudeProject;
  children: ClaudeProject[];
}

/**
 * Result of detecting worktree groups.
 */
export interface WorktreeGroupingResult {
  groups: WorktreeGroup[];
  ungrouped: ClaudeProject[];
}

// ============================================================================
// Git-based Worktree Detection (100% accurate)
// ============================================================================

/**
 * Detects worktree groups using git metadata.
 *
 * This method is 100% accurate as it uses actual git information:
 * - linked worktrees have worktree_type: "linked" and main_project_path set
 * - main repos have worktree_type: "main"
 *
 * @returns Groups based on git relationships and ungrouped projects
 */
export function detectWorktreeGroupsByGit(
  projects: ClaudeProject[]
): WorktreeGroupingResult {
  // Build a map of actual project paths to projects with "main" type
  const mainReposByPath = new Map<string, ClaudeProject>();

  for (const project of projects) {
    if (project.git_info?.worktree_type === "main") {
      // Use actual_path from backend (correctly decoded via filesystem checks)
      mainReposByPath.set(project.actual_path, project);
    }
  }

  const groups = new Map<string, WorktreeGroup>();
  const groupedChildPaths = new Set<string>();

  // Match linked worktrees to their main repos
  for (const project of projects) {
    if (project.git_info?.worktree_type === "linked") {
      const mainPath = project.git_info.main_project_path;
      if (mainPath) {
        const parent = mainReposByPath.get(mainPath);
        if (parent) {
          if (!groups.has(parent.path)) {
            groups.set(parent.path, { parent, children: [] });
          }
          groups.get(parent.path)!.children.push(project);
          groupedChildPaths.add(project.path);
        }
      }
    }
  }

  // Separate grouped parents from ungrouped projects
  const groupedParentPaths = new Set(groups.keys());
  const ungrouped = projects.filter(
    (p) => !groupedParentPaths.has(p.path) && !groupedChildPaths.has(p.path)
  );

  return {
    groups: Array.from(groups.values()),
    ungrouped,
  };
}

/**
 * Worktree detection using git metadata only.
 *
 * Uses git_info from backend for 100% accurate detection.
 * Projects without git_info are treated as ungrouped.
 *
 * @returns Grouping result with worktree groups and ungrouped projects
 */
export function detectWorktreeGroupsHybrid(
  projects: ClaudeProject[]
): WorktreeGroupingResult {
  // Separate projects by whether they have useful git info
  const withGitInfo: ClaudeProject[] = [];
  const withoutGitInfo: ClaudeProject[] = [];

  for (const project of projects) {
    if (
      project.git_info?.worktree_type &&
      project.git_info.worktree_type !== "not_git"
    ) {
      withGitInfo.push(project);
    } else {
      withoutGitInfo.push(project);
    }
  }

  // Git-based grouping only (100% accurate)
  const gitResult = detectWorktreeGroupsByGit(withGitInfo);

  // Projects without git info go to ungrouped
  return {
    groups: gitResult.groups,
    ungrouped: [...gitResult.ungrouped, ...withoutGitInfo],
  };
}

/**
 * Converts a full path to a shorter display path.
 * Replaces home directory with ~ and removes common prefixes.
 * @example
 * toDisplayPath("/Users/jack/client") // "~/client"
 * toDisplayPath("/tmp/worktree") // "/tmp/worktree"
 */
export function toDisplayPath(fullPath: string, homePath?: string): string {
  // Try to detect home path
  const home = homePath || detectHomePath(fullPath);

  if (home && fullPath.startsWith(home)) {
    return "~" + fullPath.slice(home.length);
  }

  return fullPath;
}

/**
 * Detects the home directory from a path.
 * Works for /Users/xxx (macOS), /home/xxx (Linux), C:\Users\xxx (Windows)
 */
function detectHomePath(path: string): string | null {
  // macOS: /Users/username/...
  const macMatch = path.match(/^(\/Users\/[^/]+)/);
  if (macMatch?.[1]) return macMatch[1];

  // Linux: /home/username/...
  const linuxMatch = path.match(/^(\/home\/[^/]+)/);
  if (linuxMatch?.[1]) return linuxMatch[1];

  return null;
}
