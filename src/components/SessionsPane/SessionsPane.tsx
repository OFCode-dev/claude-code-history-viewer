import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { cn } from "@/lib/utils";
import { SessionList } from "@/components/ProjectTree/components/SessionList";
import { getProviderBadgeStyle, getProviderId, getProviderLabel } from "@/utils/providers";
import type { ClaudeProject, ClaudeSession } from "@/types";

interface SessionsPaneProps {
  selectedProject: ClaudeProject;
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
  width: number;
  isResizing?: boolean;
  onResizeStart?: (e: React.MouseEvent<HTMLElement>) => void;
  /** Show the pane as a narrow rail (session count + expand button). */
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

// Header + list controls (search/sort/source/selection bar) above the virtual
// list; subtracted from the measured pane height so the list fills the rest.
const LIST_CHROME_HEIGHT = 150;

/**
 * Sessions of the selected project as their own column beside the project
 * explorer, so expanding a project never pushes the other projects out of view
 * and the session list keeps its own scroll.
 */
export function SessionsPane({
  selectedProject,
  sessions,
  sessionsTotal,
  hasMoreSessions,
  selectedSession,
  isLoading,
  isLoadingMoreSessions,
  onSessionSelect,
  onSessionHover,
  onLoadMoreSessions,
  formatTimeAgo,
  width,
  isResizing,
  onResizeStart,
  isCollapsed = false,
  onToggleCollapse,
}: SessionsPaneProps) {
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBodyHeight(entry.contentRect.height);
    });
    observer.observe(el);
    setBodyHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  const providerId = getProviderId(selectedProject.provider ?? undefined);
  const providerLabel = getProviderLabel((key, fallback) => t(key, fallback), providerId);
  const count = sessionsTotal ?? sessions.length;

  if (isCollapsed) {
    return (
      <SessionsPaneRail
        count={count}
        projectPath={selectedProject.actual_path}
        onExpand={onToggleCollapse}
      />
    );
  }

  return (
    <aside
      id="sessions-pane"
      aria-label={t("session.pane.title")}
      tabIndex={-1}
      className="flex shrink-0 h-full outline-none"
    >
      <div
        className="flex flex-col min-w-0 h-full bg-sidebar border-r border-border/50"
        style={{ width }}
      >
        <div className="px-3 py-2.5 border-b border-border/50 flex items-center gap-2 min-w-0">
          <MessageSquare className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground shrink-0">
            {t("session.pane.title")}
          </span>
          <span className="text-xs text-foreground truncate min-w-0" title={selectedProject.actual_path}>
            {selectedProject.name}
          </span>
          <span
            className={cn(
              "px-1.5 py-0.5 text-2xs font-medium rounded-full shrink-0 leading-none",
              getProviderBadgeStyle(providerId),
            )}
          >
            {providerLabel}
          </span>
          <span className="ml-auto text-2xs text-muted-foreground shrink-0 tabular-nums">
            {count}
          </span>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="-my-1 -mr-1 p-1 rounded-md shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={t("session.pane.collapse")}
              aria-label={t("session.pane.collapse")}
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div ref={bodyRef} className="flex-1 min-h-0">
          <OverlayScrollbarsComponent
            className="h-full"
            options={{ scrollbars: { theme: "os-theme-custom", autoHide: "leave" } }}
          >
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
              variant="pane"
              listHeight={Math.max(200, bodyHeight - LIST_CHROME_HEIGHT)}
            />
          </OverlayScrollbarsComponent>
        </div>
      </div>

      {onResizeStart && (
        <div
          className={cn(
            "w-3 cursor-col-resize flex-shrink-0",
            "hover:bg-accent/20 active:bg-accent/30 transition-colors",
            isResizing && "bg-accent/30",
          )}
          onMouseDown={onResizeStart}
        />
      )}
    </aside>
  );
}

interface SessionsPaneRailProps {
  count: number;
  projectPath: string;
  onExpand?: () => void;
}

/** Collapsed form of the pane, matching the explorer and navigator rails. */
function SessionsPaneRail({ count, projectPath, onExpand }: SessionsPaneRailProps) {
  const { t } = useTranslation();
  const countLabel = t("session.count", { count });

  return (
    <aside
      id="sessions-pane"
      aria-label={t("session.pane.title")}
      tabIndex={-1}
      className="flex shrink-0 h-full outline-none bg-sidebar border-r border-border/50"
      style={{ width: 48 }}
    >
      <div className="flex-1 flex flex-col items-center py-3 gap-2">
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
            title={t("session.pane.expand")}
            aria-label={t("session.pane.expand")}
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}

        <div className="w-6 h-px bg-accent/20" />

        <div className="flex flex-col items-center gap-1" title={`${countLabel} · ${projectPath}`}>
          <MessageSquare className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-2xs font-mono text-muted-foreground tabular-nums" aria-hidden="true">
            {count}
          </span>
          <span className="sr-only">{countLabel}</span>
        </div>
      </div>
    </aside>
  );
}
