/**
 * @fileoverview Tests for worktree detection utilities
 * Tests for detectWorktreeGroupsByGit, detectWorktreeGroupsHybrid and toDisplayPath.
 */
import { describe, it, expect } from "vitest";
import {
  detectWorktreeGroupsByGit,
  detectWorktreeGroupsHybrid,
  toDisplayPath,
} from "../utils/worktreeUtils";
import type { ClaudeProject } from "../types";

// Helper to create mock ClaudeProject
function createMockProject(overrides: Partial<ClaudeProject> = {}): ClaudeProject {
  const path = overrides.path ?? "/Users/test/test-project";
  return {
    name: overrides.name ?? "test-project",
    path,
    actual_path: overrides.actual_path ?? path,
    session_count: overrides.session_count ?? 1,
    message_count: overrides.message_count ?? 10,
    last_modified: overrides.last_modified ?? new Date().toISOString(),
    git_info: overrides.git_info,
  };
}

describe("detectWorktreeGroupsByGit", () => {
  it("should group linked worktrees with their main repos", () => {
    const mainRepo = createMockProject({
      name: "myproject",
      path: "/Users/jack/.claude/projects/-Users-jack-myproject",
      actual_path: "/Users/jack/myproject",
    });
    mainRepo.git_info = { worktree_type: "main" };

    const linkedWorktree = createMockProject({
      name: "myproject",
      path: "/Users/jack/.claude/projects/-tmp-feature-myproject",
      actual_path: "/tmp/feature/myproject",
    });
    linkedWorktree.git_info = {
      worktree_type: "linked",
      main_project_path: "/Users/jack/myproject",
    };

    const result = detectWorktreeGroupsByGit([mainRepo, linkedWorktree]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].parent.path).toBe(mainRepo.path);
    expect(result.groups[0].children).toHaveLength(1);
    expect(result.groups[0].children[0].path).toBe(linkedWorktree.path);
    expect(result.ungrouped).toHaveLength(0);
  });

  it("should leave not_git projects ungrouped", () => {
    const notGitProject = createMockProject({
      name: "no-git",
      path: "/Users/jack/.claude/projects/-Users-jack-no-git",
      actual_path: "/Users/jack/no-git",
    });
    notGitProject.git_info = { worktree_type: "not_git" };

    const result = detectWorktreeGroupsByGit([notGitProject]);

    expect(result.groups).toHaveLength(0);
    expect(result.ungrouped).toHaveLength(1);
  });

  it("should leave orphan linked worktrees ungrouped", () => {
    // Linked worktree without corresponding main repo in the list
    const linkedWorktree = createMockProject({
      name: "orphan",
      path: "/Users/jack/.claude/projects/-tmp-feature-orphan",
      actual_path: "/tmp/feature/orphan",
    });
    linkedWorktree.git_info = {
      worktree_type: "linked",
      main_project_path: "/Users/jack/main-not-in-list",
    };

    const result = detectWorktreeGroupsByGit([linkedWorktree]);

    expect(result.groups).toHaveLength(0);
    expect(result.ungrouped).toHaveLength(1);
  });

  it("should handle multiple worktrees under same main repo", () => {
    const mainRepo = createMockProject({
      name: "main",
      path: "/Users/jack/.claude/projects/-Users-jack-main",
      actual_path: "/Users/jack/main",
    });
    mainRepo.git_info = { worktree_type: "main" };

    const worktree1 = createMockProject({
      name: "main",
      path: "/Users/jack/.claude/projects/-tmp-feature1-main",
      actual_path: "/tmp/feature1/main",
    });
    worktree1.git_info = {
      worktree_type: "linked",
      main_project_path: "/Users/jack/main",
    };

    const worktree2 = createMockProject({
      name: "main",
      path: "/Users/jack/.claude/projects/-tmp-feature2-main",
      actual_path: "/tmp/feature2/main",
    });
    worktree2.git_info = {
      worktree_type: "linked",
      main_project_path: "/Users/jack/main",
    };

    const result = detectWorktreeGroupsByGit([mainRepo, worktree1, worktree2]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].children).toHaveLength(2);
    expect(result.ungrouped).toHaveLength(0);
  });
});

// ============================================================================
// Directory-based Grouping Tests
// ============================================================================

describe("toDisplayPath", () => {
  it("should convert macOS home path to ~", () => {
    expect(toDisplayPath("/Users/jack/client")).toBe("~/client");
  });

  it("should convert Linux home path to ~", () => {
    expect(toDisplayPath("/home/user/projects")).toBe("~/projects");
  });

  it("should not modify tmp paths", () => {
    expect(toDisplayPath("/tmp/worktree")).toBe("/tmp/worktree");
  });

  it("should not modify private tmp paths", () => {
    expect(toDisplayPath("/private/tmp/feature")).toBe("/private/tmp/feature");
  });

  it("should handle deeply nested home paths", () => {
    expect(toDisplayPath("/Users/jack/code/work/clients")).toBe(
      "~/code/work/clients"
    );
  });

  it("should use explicit homePath when provided", () => {
    expect(toDisplayPath("/custom/home/projects", "/custom/home")).toBe(
      "~/projects"
    );
  });

  it("should not modify path if homePath doesn't match", () => {
    expect(toDisplayPath("/other/path/projects", "/Users/jack")).toBe(
      "/other/path/projects"
    );
  });

  it("should handle Windows paths with forward slashes", () => {
    // Note: Windows paths are not currently supported, returned as-is
    expect(toDisplayPath("C:/Users/jack/Documents")).toBe("C:/Users/jack/Documents");
  });

  it("should handle Windows paths with backslashes", () => {
    // Note: Windows paths are not currently supported, returned as-is
    expect(toDisplayPath("C:\\Users\\jack\\Documents")).toBe("C:\\Users\\jack\\Documents");
  });
});

describe("detectWorktreeGroupsHybrid", () => {
  it("should group projects with git_info", () => {
    const mainRepo = createMockProject({
      name: "gitproject",
      path: "/Users/jack/.claude/projects/-Users-jack-gitproject",
      actual_path: "/Users/jack/gitproject",
    });
    mainRepo.git_info = { worktree_type: "main" };

    const linkedWorktree = createMockProject({
      name: "gitproject",
      path: "/Users/jack/.claude/projects/-tmp-feature-gitproject",
      actual_path: "/tmp/feature/gitproject",
    });
    linkedWorktree.git_info = {
      worktree_type: "linked",
      main_project_path: "/Users/jack/gitproject",
    };

    const result = detectWorktreeGroupsHybrid([mainRepo, linkedWorktree]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].parent.git_info?.worktree_type).toBe("main");
    expect(result.groups[0].children).toHaveLength(1);
  });

  it("should treat projects without git_info as ungrouped", () => {
    const mainRepo = createMockProject({
      name: "gitproject",
      path: "/Users/jack/.claude/projects/-Users-jack-gitproject",
      actual_path: "/Users/jack/gitproject",
    });
    mainRepo.git_info = { worktree_type: "main" };

    const linkedWorktree = createMockProject({
      name: "gitproject",
      path: "/Users/jack/.claude/projects/-tmp-feature-gitproject",
      actual_path: "/tmp/feature/gitproject",
    });
    linkedWorktree.git_info = {
      worktree_type: "linked",
      main_project_path: "/Users/jack/gitproject",
    };

    // Projects without git_info should be ungrouped
    const noGitParent = createMockProject({
      name: "legacyproject",
      path: "/Users/jack/.claude/projects/-Users-jack-legacyproject",
      actual_path: "/Users/jack/legacyproject",
    });

    const noGitWorktree = createMockProject({
      name: "legacyproject",
      path: "/Users/jack/.claude/projects/-tmp-branch-legacyproject",
      actual_path: "/tmp/branch/legacyproject",
    });

    const result = detectWorktreeGroupsHybrid([
      mainRepo,
      linkedWorktree,
      noGitParent,
      noGitWorktree,
    ]);

    // Only git-based group should be created
    expect(result.groups).toHaveLength(1);
    // Projects without git_info should be ungrouped
    expect(result.ungrouped).toHaveLength(2);
  });

  it("should use git_info for grouping", () => {
    const mainRepo = createMockProject({
      name: "myproject",
      path: "/Users/jack/.claude/projects/-Users-jack-myproject",
      actual_path: "/Users/jack/myproject",
    });
    mainRepo.git_info = { worktree_type: "main" };

    const linkedWorktree = createMockProject({
      name: "myproject",
      path: "/Users/jack/.claude/projects/-tmp-feature-myproject",
      actual_path: "/tmp/feature/myproject",
    });
    linkedWorktree.git_info = {
      worktree_type: "linked",
      main_project_path: "/Users/jack/myproject",
    };

    const result = detectWorktreeGroupsHybrid([mainRepo, linkedWorktree]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].parent.git_info?.worktree_type).toBe("main");
  });

  it("should not group projects without git_info", () => {
    const parent = createMockProject({
      name: "noinfo",
      path: "/Users/jack/.claude/projects/-Users-jack-noinfo",
      actual_path: "/Users/jack/noinfo",
    });

    const worktree = createMockProject({
      name: "noinfo",
      path: "/Users/jack/.claude/projects/-tmp-feature-noinfo",
      actual_path: "/tmp/feature/noinfo",
    });

    const result = detectWorktreeGroupsHybrid([parent, worktree]);

    // Without git_info, no grouping should happen
    expect(result.groups).toHaveLength(0);
    expect(result.ungrouped).toHaveLength(2);
  });
});
