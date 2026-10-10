// src/components/ProjectTree/types.ts
import type { ClaudeProject, ClaudeSession } from "../../types";
import type { Boundary } from "../../utils/contextMenu";

export interface ContextMenuState {
  project: ClaudeProject;
  position: { x: number; y: number; boundary?: Boundary | null };
  /** Other providers' projects for the same folder (merged row). */
  providerSiblings?: ClaudeProject[];
}

export interface ProjectTreeProps {
  projects: ClaudeProject[];
  sessions: ClaudeSession[];
  sessionsTotal?: number;
  hasMoreSessions?: boolean;
  selectedProject: ClaudeProject | null;
  selectedSession: ClaudeSession | null;
  onProjectSelect: (project: ClaudeProject) => void;
  onSessionSelect: (session: ClaudeSession) => void;
  onSessionHover?: (session: ClaudeSession) => void;
  onLoadMoreSessions?: () => void;
  onGlobalStatsClick: () => void;
  isLoading: boolean;
  isLoadingMoreSessions?: boolean;
  isViewingGlobalStats: boolean;
  /**
   * Render the selected project's sessions inline under its row. Off when the
   * layout shows them in a dedicated SessionsPane column.
   */
  inlineSessions?: boolean;
  width?: number;
  isResizing?: boolean;
  onResizeStart?: (e: React.MouseEvent<HTMLElement>) => void;
  // Project visibility: hidden projects are left out of the tree.
  onHideProject?: (projectPath: string) => void;
  onUnhideProject?: (projectPath: string) => void;
  isProjectHidden?: (projectPath: string) => boolean;
  // Collapse props
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Reading mode: the pin toggle, shown where the rail button would be. */
  headerAccessory?: React.ReactNode;
  asideId?: string;
  // Mobile drawer close callback
  onClose?: () => void;
}

export interface SessionListProps {
  sessions: ClaudeSession[];
  sessionsTotal?: number;
  hasMoreSessions?: boolean;
  selectedSession: ClaudeSession | null;
  isLoading: boolean;
  isLoadingMoreSessions?: boolean;
  onSessionSelect: (session: ClaudeSession) => void;
  onSessionHover?: (session: ClaudeSession) => void;
  onLoadMoreSessions?: () => void;
  formatTimeAgo: (date: string) => string;
  /** `pane`: standalone column (no tree indentation, virtual list fills `listHeight`). */
  variant?: "default" | "main" | "worktree" | "pane";
  /** Available height for the virtual list when `variant="pane"`. */
  listHeight?: number;
}
