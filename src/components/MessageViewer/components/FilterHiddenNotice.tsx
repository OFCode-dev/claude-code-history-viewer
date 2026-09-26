/**
 * FilterHiddenNotice — tells the reader that the message display filter hides
 * something they would otherwise see, with a one-click way to show it.
 *
 * - "emptyWindow": the loaded messages exist, but the filter leaves none of
 *   them visible (e.g. the newest page of a long tool run in the dialogue view).
 * - "searchMatches": some session-search matches are in hidden records and are
 *   left out of match navigation.
 */
import React from "react";
import { EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAppStore } from "../../../store/useAppStore";
import { focusMainContentIfLost } from "@/components/subagents/focusRestore";

type FilterHiddenNoticeProps =
  | { variant: "emptyWindow"; className?: string }
  | { variant: "searchMatches"; hiddenCount: number; className?: string };

export const FilterHiddenNotice: React.FC<FilterHiddenNoticeProps> = (props) => {
  const { t } = useTranslation();
  const isDialogue = useAppStore((s) => s.messageFilter.dialogue);
  const resetMessageFilter = useAppStore((s) => s.resetMessageFilter);

  // Showing everything removes this notice together with its button; keep
  // keyboard focus in the transcript instead of dropping it on <body>.
  const showAll = () => {
    resetMessageFilter();
    requestAnimationFrame(focusMainContentIfLost);
  };

  const message =
    props.variant === "searchMatches"
      ? t("filter.hiddenMatches", { count: props.hiddenCount })
      : isDialogue
        ? t("dialogue.emptyWindow")
        : t("filter.emptyWindow");

  return (
    <div
      role="status"
      className={cn(
        "flex items-center justify-center gap-2 text-xs text-muted-foreground",
        props.className,
      )}
    >
      <EyeOff aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
      <span>{message}</span>
      <button
        type="button"
        onClick={showAll}
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 font-medium text-foreground/80 underline-offset-2",
          "hover:text-foreground hover:underline",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {t("filter.showAll")}
      </button>
    </div>
  );
};

FilterHiddenNotice.displayName = "FilterHiddenNotice";
