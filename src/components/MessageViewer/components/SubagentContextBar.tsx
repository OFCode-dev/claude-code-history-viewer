import { memo, useMemo } from "react";
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

const navButton = cn(
  "inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors",
  "text-muted-foreground hover:text-foreground hover:bg-primary/10",
  "disabled:opacity-40 disabled:pointer-events-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

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
  const navigateBackToParent = useAppStore((s) => s.navigateBackToParent);
  const navigateToSubagent = useAppStore((s) => s.navigateToSubagent);
  // Selected as a string so a rename of the parent session re-renders the bar.
  const parentDisplayName = useAppStore((s) => {
    const p = s.parentSessionStack[s.parentSessionStack.length - 1];
    return p ? s.getSessionDisplayName(p.session_id, p.summary) : undefined;
  });

  const frame = useMemo(
    () => getActiveSubagentFrame({ subagentNavStack, parentSessionStack, selectedSession }),
    [subagentNavStack, parentSessionStack, selectedSession],
  );
  const position = useMemo(() => (frame ? getSubagentSiblingPosition(frame) : null), [frame]);

  const parent = parentSessionStack[parentSessionStack.length - 1];
  if (!parent) return null;

  const parentTitle =
    parentDisplayName?.replace(/\s+/g, " ").trim() || parent.actual_session_id.slice(0, 8);
  const label = frame
    ? getSubagentLabel(frame.subagent)
    : selectedSession?.summary ?? selectedSession?.actual_session_id ?? "";
  const backLabel = parentTitle
    ? t("subagent.backTo", { title: parentTitle })
    : t("subagent.backToParent");

  return (
    // Container queries: the conversation column can be narrow even on a wide
    // window, so lower-priority parts (badges, the "Subagent" word) drop out
    // by the bar's own width. Priority: label > previous/next > back > badges.
    <nav
      aria-label={t("subagent.contextAria")}
      className="@container border-b bg-primary/5 border-primary/20 min-w-0"
    >
      <div className="flex items-center gap-2 px-4 py-1.5 min-w-0">
        <button
          type="button"
          onClick={() => void navigateBackToParent()}
          title={backLabel}
          aria-label={backLabel}
          className={cn(
            "inline-flex items-center gap-1.5 min-w-0 max-w-[30%] @2xl:max-w-[40%] shrink-0 px-2 py-1 text-xs font-medium rounded-md",
            "bg-primary/10 text-primary hover:bg-primary/20 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{backLabel}</span>
        </button>

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Bot className="w-3.5 h-3.5 shrink-0 text-accent" aria-hidden="true" />
          <span className="hidden @3xl:inline text-px10 font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
            {t("subagent.contextLabel")}
          </span>
          <span className="hidden @3xl:inline text-muted-foreground/60 shrink-0" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-semibold text-foreground truncate min-w-[4rem]" title={label}>
            {label}
          </span>
          {frame && (
            <SubagentMetaBadges
              subagent={frame.subagent}
              className="hidden @2xl:inline-flex shrink-0"
            />
          )}
        </div>

        {position && position.total > 1 && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              className={navButton}
              disabled={position.previous == null}
              onClick={() => {
                if (position.previous) void navigateToSubagent(position.previous);
              }}
              aria-label={t("subagent.previous")}
              title={
                position.previous
                  ? `${t("subagent.previous")}: ${getSubagentLabel(position.previous)}`
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
              type="button"
              className={navButton}
              disabled={position.next == null}
              onClick={() => {
                if (position.next) void navigateToSubagent(position.next);
              }}
              aria-label={t("subagent.next")}
              title={
                position.next
                  ? `${t("subagent.next")}: ${getSubagentLabel(position.next)}`
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
