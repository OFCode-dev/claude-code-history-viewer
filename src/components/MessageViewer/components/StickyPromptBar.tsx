/**
 * StickyPromptBar
 *
 * While the reader is inside a long turn whose prompt has scrolled out of
 * view, a slim bar at the top of the conversation keeps the question in
 * sight: "You · time — preview", with jumps to this / the previous / the
 * next prompt.
 *
 * Reads the viewport-anchor store directly (narrow selectors), so it updates
 * with the scroll position without re-rendering the conversation.
 */
import React, { useMemo } from "react";
import { ChevronDown, ChevronUp, CornerLeftUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ClaudeMessage } from "../../../types";
import { useAppStore } from "../../../store/useAppStore";
import {
  selectIsPromptBarVisible,
  useViewportAnchorStore,
} from "../../../store/viewportAnchorStore";
import { getPromptPreview, getUserMessageText } from "../../../utils/userMessageKind";
import {
  formatPromptTime,
  jumpToPrompt,
  promptStepShortcut,
} from "../../../utils/promptNavigation";

interface StickyPromptBarProps {
  /** The list the conversation renders — the prompt text is read from it. */
  messages: ClaudeMessage[];
}

const PREVIEW_MAX_LENGTH = 220;

/** The next-prompt shortcut as the keyboard labels it. */
const NEXT_PROMPT_SHORTCUT = promptStepShortcut("next").label;

const iconButtonClass = cn(
  "shrink-0 p-1.5 rounded-md transition-colors",
  "text-muted-foreground hover:text-foreground hover:bg-muted",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
  "disabled:opacity-40 disabled:pointer-events-none"
);

export const StickyPromptBar: React.FC<StickyPromptBarProps> = React.memo(({ messages }) => {
  const { t } = useTranslation();
  const isVisible = useViewportAnchorStore(selectIsPromptBarVisible);
  const activeUuid = useViewportAnchorStore((s) => s.activePromptUuid);
  const track = useViewportAnchorStore((s) => s.promptTrack);
  const isWindowComplete = useAppStore((s) => !s.pagination.hasMore);
  // In a subagent transcript the prompt came from the parent agent.
  const isInSubagent = useAppStore((s) => (s.parentSessionStack?.length ?? 0) > 0);

  const current = useMemo(() => {
    if (!isVisible || !track || !activeUuid) return null;
    const position = track.anchors.findIndex((anchor) => anchor.uuid === activeUuid);
    const anchor = track.anchors[position];
    const message = messages[track.indexByUuid.get(activeUuid) ?? -1];
    if (!anchor || message?.uuid !== activeUuid) return null;
    return {
      anchor,
      preview: getPromptPreview(getUserMessageText(message), PREVIEW_MAX_LENGTH),
      previous: track.anchors[position - 1] ?? null,
      next: track.anchors[position + 1] ?? null,
    };
  }, [isVisible, track, activeUuid, messages]);

  if (!current) return null;

  const { anchor, preview, previous, next } = current;
  const time = formatPromptTime(anchor.timestamp);
  const previewText = preview.fromTail ? `… ${preview.text}` : preview.text;
  const previousLabel = t("navigator.promptBar.previous");
  const nextLabel = t("navigator.promptBar.next");

  return (
    <nav
      // PROMPT_BAR_ATTRIBUTE: a jump from here moves focus to the prompt.
      data-sticky-prompt-bar=""
      aria-label={t("navigator.promptBar.label")}
      className={cn(
        "absolute inset-x-0 top-0 z-20",
        "flex items-center gap-1 px-2 py-1",
        "bg-card/95 backdrop-blur-sm border-b border-border/60 shadow-sm",
        "animate-in fade-in slide-in-from-top-1 duration-150"
      )}
    >
      <button
        type="button"
        onClick={() => jumpToPrompt(anchor.uuid)}
        className={cn(
          "group flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left",
          "hover:bg-muted/70 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        )}
        title={t("navigator.promptBar.jump")}
        aria-label={`${t("navigator.promptBar.jump")}: ${preview.text}`}
      >
        <span aria-hidden className="w-[3px] self-stretch rounded-full bg-accent" />
        <span className="shrink-0 text-2xs font-semibold text-accent">
          {isInSubagent ? t("promptCard.parentAgent") : t("navigator.promptBar.you")}
        </span>
        {time && (
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{time}</span>
        )}
        {isWindowComplete && (
          <span className="shrink-0 text-2xs text-muted-foreground">
            {t("navigator.turn", { number: anchor.turnNumber })}
          </span>
        )}
        <span aria-hidden className="shrink-0 text-muted-foreground/60">—</span>
        <span className="min-w-0 truncate text-xs text-foreground/90">{previewText}</span>
        <CornerLeftUp
          aria-hidden
          className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </button>
      <button
        type="button"
        onClick={() => previous && jumpToPrompt(previous.uuid)}
        disabled={!previous}
        className={iconButtonClass}
        aria-label={previousLabel}
        // No Alt+↑ hint: inside a turn, Alt+↑ first returns to this turn's
        // own prompt, while this button goes to the turn before it.
        title={previousLabel}
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => next && jumpToPrompt(next.uuid)}
        disabled={!next}
        className={iconButtonClass}
        aria-label={nextLabel}
        aria-keyshortcuts="Alt+ArrowDown"
        title={t("navigator.promptBar.nextWithShortcut", {
          label: nextLabel,
          shortcut: NEXT_PROMPT_SHORTCUT,
        })}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </nav>
  );
});

StickyPromptBar.displayName = "StickyPromptBar";
