import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bot, ChevronRight, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { usePlatform } from "@/contexts/platform";
import { restoreFocusAfterBack } from "@/components/subagents/focusRestore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getProjectDisplayName, isAbsolutePath } from "@/utils/pathUtils";
import { homeDirOf, pickHomeDir } from "@/utils/directoryTree";
import type { ClaudeProject, ClaudeSession } from "@/types";
import {
  buildPathCrumbs,
  buildSessionCrumbs,
  collapsePathCrumbs,
  maxCollapsiblePathCrumbs,
  type PathCrumb,
  type SessionCrumb,
} from "./breadcrumbModel";

interface HeaderBreadcrumbProps {
  project: ClaudeProject;
  /** Called after navigating to a parent session, to bring its transcript up. */
  onShowTranscript?: () => void;
}

const crumbButtonClass = cn(
  "min-w-0 max-w-[14rem] truncate rounded px-1 py-0.5 transition-colors",
  "text-muted-foreground hover:text-foreground hover:bg-muted",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
);

function isRevealablePath(path: string): boolean {
  return isAbsolutePath(path) || /^[\\/]{2}[^\\/]/.test(path);
}

const crumbTextClass = "min-w-0 max-w-[14rem] truncate px-1 py-0.5 text-muted-foreground";

/**
 * Path crumbs for a project; the last one is labelled like the explorer row.
 * `homeDir` is the home the explorer tree shows as `~`.
 */
function projectPathCrumbs(project: ClaudeProject, homeDir: string | null): PathCrumb[] {
  const displayName = getProjectDisplayName(project);
  const actualPath = project.actual_path || project.path;
  if (!isRevealablePath(actualPath)) {
    return [{ label: displayName, path: actualPath }];
  }
  const crumbs = buildPathCrumbs(actualPath, homeDir ?? homeDirOf(actualPath));
  const last = crumbs[crumbs.length - 1];
  if (last && last.label !== "~") {
    crumbs[crumbs.length - 1] = { ...last, label: displayName };
  }
  return crumbs;
}

function Separator() {
  return (
    <ChevronRight
      className="w-3 h-3 shrink-0 text-muted-foreground/50"
      aria-hidden="true"
    />
  );
}

/**
 * Clickable location of what is on screen: the project path (each directory
 * reveals itself in the explorer), then the session, and inside a subagent
 * transcript the chain of parent sessions down to the subagent. Middle path
 * directories fold into "…" when the header runs out of room.
 */
export function HeaderBreadcrumb({ project, onShowTranscript }: HeaderBreadcrumbProps) {
  const { t } = useTranslation();
  // Below md the explorer lives in a closed drawer, so a reveal would have
  // nothing to land in (and would fire later, when the drawer next opens).
  const { isMobile } = usePlatform();
  const canReveal = !isMobile;
  const projects = useAppStore((s) => s.projects);
  const selectedSession = useAppStore((s) => s.selectedSession);
  const parentSessionStack = useAppStore((s) => s.parentSessionStack);
  const subagentSessions = useAppStore((s) => s.subagentSessions);
  const requestExplorerReveal = useAppStore((s) => s.requestExplorerReveal);
  const setExplorerCollapsed = useAppStore((s) => s.setExplorerCollapsed);
  const navigateBackToParent = useAppStore((s) => s.navigateBackToParent);
  // Subscribed so a rename re-labels the session crumb.
  const sessionMetadata = useAppStore((s) => s.userMetadata.sessions);

  // The explorer shows as `~` the home most projects share; use the same one.
  const homeDir = useMemo(
    () => pickHomeDir(Array.from(new Set(projects.map((p) => p.actual_path || p.path)))),
    [projects]
  );
  const pathCrumbs = useMemo(() => projectPathCrumbs(project, homeDir), [project, homeDir]);
  const sessionCrumbs = useMemo(
    () =>
      buildSessionCrumbs({
        selectedSession,
        parentSessionStack,
        subagentSessions,
        untitledSession: (id) => t("header.breadcrumb.untitledSession", { id }),
        sessionName: (session: ClaudeSession) => sessionMetadata[session.session_id]?.customName,
      }),
    [selectedSession, parentSessionStack, subagentSessions, sessionMetadata, t]
  );

  // Fold middle directories until the trail fits. Start over whenever the
  // content changes or the header gets wider; `useLayoutEffect` below then
  // folds one more per pass before the browser paints.
  const contentKey = `${pathCrumbs.map((c) => c.path).join("\n")}\n${sessionCrumbs
    .map((c) => c.label)
    .join("\n")}`;
  const [collapsedCount, setCollapsedCount] = useState(0);
  const [measuredKey, setMeasuredKey] = useState(contentKey);
  if (measuredKey !== contentKey) {
    setMeasuredKey(contentKey);
    setCollapsedCount(0);
  }
  const maxCollapsed = maxCollapsiblePathCrumbs(pathCrumbs);
  const navRef = useRef<HTMLElement>(null);
  const [navWidth, setNavWidth] = useState(0);
  const [fontsLoaded, setFontsLoaded] = useState(0);

  // Re-measured after every fold, content change, resize and font load; each
  // pass folds at most one more directory, so this settles within
  // `maxCollapsed` passes.
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    if (nav.scrollWidth > nav.clientWidth + 1 && collapsedCount < maxCollapsed) {
      setCollapsedCount((count) => Math.min(count + 1, maxCollapsed));
    }
  }, [collapsedCount, maxCollapsed, contentKey, navWidth, fontsLoaded]);

  // The crumbs change width without the header changing size when a web font
  // (the bundled Geist Mono) swaps in after the first paint, so fold again
  // from scratch once fonts have loaded.
  useEffect(() => {
    const fonts = typeof document === "undefined" ? undefined : document.fonts;
    if (!fonts) return;
    let active = true;
    const remeasure = () => {
      if (!active) return;
      setCollapsedCount(0);
      setFontsLoaded((n) => n + 1);
    };
    fonts.ready.then(remeasure).catch(() => {});
    fonts.addEventListener?.("loadingdone", remeasure);
    return () => {
      active = false;
      fonts.removeEventListener?.("loadingdone", remeasure);
    };
  }, []);

  // The nav is only as wide as its crumbs, so growth is detected on the space
  // it sits in: when that widens, unfold everything and measure again.
  useLayoutEffect(() => {
    const container = navRef.current?.parentElement;
    if (!container || typeof ResizeObserver === "undefined") return;
    let lastWidth = container.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = container.clientWidth;
      if (width > lastWidth) setCollapsedCount(0);
      lastWidth = width;
      setNavWidth(width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const { leading, hidden, trailing } = collapsePathCrumbs(pathCrumbs, collapsedCount);
  const isFullyCollapsed = collapsedCount >= maxCollapsed;
  const projectPath = pathCrumbs[pathCrumbs.length - 1]?.path;

  const reveal = (path: string) => {
    if (!canReveal) return;
    // A reveal into a folded explorer would be invisible, so unfold it first.
    setExplorerCollapsed(false);
    requestExplorerReveal(path);
  };

  const goUp = async (levels: number) => {
    // The crumb pressed turns into the current page (or goes away), so
    // focus moves to the row of the session just left, or the transcript.
    const chain = selectedSession ? [...parentSessionStack, selectedSession] : parentSessionStack;
    const leaving = chain[chain.length - levels]?.file_path;
    await navigateBackToParent(levels);
    restoreFocusAfterBack(leaving);
    onShowTranscript?.();
  };

  const renderPathCrumb = (crumb: PathCrumb, isFirst: boolean) => {
    const isProject = crumb.path === projectPath;
    return (
      <li key={crumb.path} className="flex items-center shrink-0">
        {!isFirst && <Separator />}
        {canReveal ? (
          <button
            type="button"
            onClick={() => reveal(crumb.path)}
            className={cn(crumbButtonClass, isProject && "text-foreground font-medium")}
            title={t("header.breadcrumb.reveal", { path: crumb.path })}
          >
            {crumb.label}
          </button>
        ) : (
          <span
            className={cn(crumbTextClass, isProject && "text-foreground font-medium")}
            title={crumb.path}
          >
            {crumb.label}
          </span>
        )}
      </li>
    );
  };

  const renderSessionCrumb = (crumb: SessionCrumb) => {
    const isCurrent = crumb.popCount === 0;
    const icon =
      crumb.kind === "subagent" ? (
        <Bot className="w-3.5 h-3.5 shrink-0 text-accent" aria-hidden="true" />
      ) : null;
    const kindLabel =
      crumb.kind === "subagent" ? (
        <span className="sr-only">{`${t("header.breadcrumb.subagent")}: `}</span>
      ) : null;

    return (
      <li
        key={`${crumb.kind}-${crumb.popCount}`}
        className={cn(
          "flex items-center gap-0.5",
          isCurrent ? "max-w-[28rem]" : "max-w-[14rem]",
          // Session titles outrank directories: up to their cap they do not
          // give up width, so directories fold first. Once nothing is left
          // to fold they shrink and share what remains.
          isFullyCollapsed ? cn("shrink", isCurrent ? "min-w-0" : "min-w-[3rem]") : "shrink-0"
        )}
      >
        <Separator />
        {isCurrent ? (
          <span
            aria-current="page"
            className="flex items-center gap-1 min-w-0 px-1 py-0.5 text-foreground font-semibold"
            title={crumb.title}
          >
            {icon}
            {kindLabel}
            <span className="truncate">{crumb.label}</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void goUp(crumb.popCount)}
            className={cn(crumbButtonClass, "flex items-center gap-1")}
            title={t("header.breadcrumb.backTo", { title: crumb.title })}
          >
            {icon}
            {kindLabel}
            <span className="truncate">{crumb.label}</span>
          </button>
        )}
      </li>
    );
  };

  return (
    <nav
      ref={navRef}
      aria-label={t("header.breadcrumb.label")}
      className="min-w-0 overflow-hidden pointer-events-auto"
      title={project.actual_path || undefined}
    >
      <ol className="flex items-center min-w-0 text-xs whitespace-nowrap">
        {leading.map((crumb) => renderPathCrumb(crumb, true))}
        {hidden.length > 0 && !canReveal && (
          <li className="flex items-center shrink-0">
            <Separator />
            <span
              className={cn(crumbTextClass, "px-1.5")}
              title={hidden.map((crumb) => crumb.path).join("\n")}
            >
              …
            </span>
          </li>
        )}
        {hidden.length > 0 && canReveal && (
          <li className="flex items-center shrink-0">
            <Separator />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(crumbButtonClass, "px-1.5")}
                  aria-label={t("header.breadcrumb.showCollapsed")}
                  title={t("header.breadcrumb.showCollapsed")}
                >
                  <MoreHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                // A chosen directory takes focus in the explorer; do not pull
                // it back to "…" when the menu finishes closing.
                onCloseAutoFocus={(event) => {
                  const explorer = document.getElementById("project-explorer");
                  if (explorer?.contains(document.activeElement)) event.preventDefault();
                }}
              >
                {hidden.map((crumb) => (
                  <DropdownMenuItem
                    key={crumb.path}
                    onSelect={() => reveal(crumb.path)}
                    title={t("header.breadcrumb.reveal", { path: crumb.path })}
                  >
                    {crumb.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        )}
        {trailing.map((crumb) => renderPathCrumb(crumb, false))}
        {sessionCrumbs.map(renderSessionCrumb)}
      </ol>
    </nav>
  );
}
