import { memo, useCallback, useMemo, useRef } from "react";
import { ArrowLeft, Bot, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { getSubagentLabel } from "@/utils/subagentLabel";
import {
  getActiveSubagentFrame,
  getSubagentSiblingPosition,
} from "@/utils/subagentNavigation";
import { SubagentMetaBadges } from "@/components/subagents/SubagentMetaBadges";
import { SUBAGENT_PATH_ATTR } from "@/components/subagents/subagentDom";
import { isFocusLost } from "@/components/subagents/subagentFocus";
import type { SubagentSession } from "@/types";

const navButton = cn(
  "inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors",
  "text-muted-foreground hover:text-foreground hover:bg-primary/10",
  "disabled:opacity-40 disabled:pointer-events-none",
  "aria-disabled:opacity-60 aria-disabled:cursor-progress",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

/**
 * After "Back" the bar unmounts (at top level) and would drop focus on
 * <body>. Land on the row of the subagent just left when a list shows it,
 * otherwise on the main content region (the skip-link target).
 */
function restoreFocusAfterBack(fromFilePath: string | undefined): void {
  if (!isFocusLost()) return;
  const row =
    fromFilePath != null
      ? document.querySelector<HTMLElement>(
          `[${SUBAGENT_PATH_ATTR}="${CSS.escape(fromFilePath)}"]`,
        )
      : null;
  (row ?? document.getElementById("main-content"))?.focus({ preventScroll: true });
}

/**
 * Bar above a subagent transcript: what is being viewed (label, agent type,
 * model), a way back to the parent session and previous/next navigation
 * through the parent's other subagents. Renders nothing at top level.
 */
export const SubagentContextBar = memo(function SubagentContextBar() {
  const { t } = useTranslation();
  const parentSessionStack = useAppStore((s) => s.parentSessionStack);
  const subagentNavStack = useAppStore((s) => s.subagentNavStack);
  const selectedSession = useAppStore((s) => s.selectedSession);
  // A navigation already running drops new requests; show that instead of
  // letting clicks vanish silently.
  const isBusy = useAppStore((s) => s.isLoadingMessages);
  const navigateBackToParent = useAppStore((s) => s.navigateBackToParent);
  const navigateToSubagent = useAppStore((s) => s.navigateToSubagent);
  // Selected as a string so a rename of the parent session re-renders the bar.
  const parentDisplayName = useAppStore((s) => {
    const p = s.parentSessionStack[s.parentSessionStack.length - 1];
    return p ? s.getSessionDisplayName(p.session_id, p.summary) : undefined;
  });
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const frame = useMemo(
    () => getActiveSubagentFrame({ subagentNavStack, parentSessionStack, selectedSession }),
    [subagentNavStack, parentSessionStack, selectedSession],
  );
  const position = useMemo(() => (frame ? getSubagentSiblingPosition(frame) : null), [frame]);

  const goBack = useCallback(async () => {
    const leaving = selectedSession?.file_path;
    await navigateBackToParent();
    restoreFocusAfterBack(leaving);
  }, [navigateBackToParent, selectedSession?.file_path]);

  const goToSibling = useCallback(
    async (target: SubagentSession) => {
      if (isBusy) return;
      await navigateToSubagent(target);
      // Reaching the first or last sibling disables the button just pressed.
      if (isFocusLost()) {
        const fallback = [nextRef.current, previousRef.current].find(
          (button) => button != null && !button.disabled,
        );
        fallback?.focus();
      }
    },
    [isBusy, navigateToSubagent],
  );

  const parent = parentSessionStack[parentSessionStack.length - 1];
  if (!parent) return null;

  const parentTitle =
    parentDisplayName?.replace(/\s+/g, " ").trim() || parent.actual_session_id.slice(0, 8);
  const label = frame
    ? getSubagentLabel(frame.subagent)
    : selectedSession?.summary ?? selectedSession?.actual_session_id ?? "";
  // The tooltip carries everything the row may have to truncate.
  const labelTitle = [
    label,
    frame?.subagent.agent_type?.trim(),
    frame?.subagent.model?.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
  const backLabel = parentTitle
    ? t("subagent.backTo", { title: parentTitle })
    : t("subagent.backToParent");
  const hasSiblingNav = position != null && position.total > 1;

  return (
    // Container queries: the conversation column is often narrow even on a
    // wide window (about 480–600px at 1440px). Narrow, the bar takes two
    // rows — back and previous/next on top, the subagent's identity below —
    // so the label, type and model all stay readable; from @3xl it is one row.
    <nav
      aria-label={t("subagent.contextAria")}
      aria-busy={isBusy || undefined}
      className="@container border-b bg-primary/5 border-primary/20 min-w-0"
    >
      <div
        className={cn(
          "grid items-center gap-x-2 gap-y-1 px-4 py-1.5 min-w-0",
          "grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[auto_minmax(0,1fr)_auto]",
        )}
      >
        <button
          type="button"
          onClick={() => void goBack()}
          // SUBAGENT_BACK_ATTR: where focus lands after entering a subagent.
          data-subagent-back=""
          title={backLabel}
          aria-label={backLabel}
          className={cn(
            "col-start-1 row-start-1 justify-self-start",
            "inline-flex items-center gap-1.5 min-w-0 max-w-full @3xl:max-w-[18rem] px-2 py-1 text-xs font-medium rounded-md",
            "bg-primary/10 text-primary hover:bg-primary/20 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{backLabel}</span>
        </button>

        <div
          className={cn(
            "col-span-2 row-start-2 @3xl:col-span-1 @3xl:col-start-2 @3xl:row-start-1",
            "flex items-center gap-1.5 min-w-0",
          )}
        >
          <Bot className="w-3.5 h-3.5 shrink-0 text-accent" aria-hidden="true" />
          <span className="text-px10 font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
            {t("subagent.contextLabel")}
          </span>
          <span className="text-muted-foreground/60 shrink-0" aria-hidden="true">
            ·
          </span>
          <span
            className="text-xs font-semibold text-foreground truncate min-w-[4rem]"
            title={labelTitle}
          >
            {label}
          </span>
          {frame && (
            <SubagentMetaBadges
              subagent={frame.subagent}
              className="shrink-[2] min-w-0 max-w-[45%]"
            />
          )}
        </div>

        {hasSiblingNav && (
          <div className="col-start-2 row-start-1 @3xl:col-start-3 flex items-center gap-0.5 shrink-0">
            <button
              ref={previousRef}
              type="button"
              className={navButton}
              disabled={position.previous == null}
              aria-disabled={isBusy || undefined}
              onClick={() => {
                if (position.previous) void goToSibling(position.previous);
              }}
              aria-label={t("subagent.previous")}
              title={
                position.previous
                  ? t("subagent.previousTo", { label: getSubagentLabel(position.previous) })
                  : t("subagent.previous")
              }
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span
              className="px-1 text-px11 tabular-nums text-muted-foreground"
              aria-label={t("subagent.positionAria", { index: position.index, total: position.total })}
              role="status"
            >
              {t("subagent.position", { index: position.index, total: position.total })}
            </span>
            <button
              ref={nextRef}
              type="button"
              className={navButton}
              disabled={position.next == null}
              aria-disabled={isBusy || undefined}
              onClick={() => {
                if (position.next) void goToSibling(position.next);
              }}
              aria-label={t("subagent.next")}
              title={
                position.next
                  ? t("subagent.nextTo", { label: getSubagentLabel(position.next) })
                  : t("subagent.next")
              }
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
});
