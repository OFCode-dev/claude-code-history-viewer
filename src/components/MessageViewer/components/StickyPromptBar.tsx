/**
 * StickyPromptBar
 *
 * While the reader is inside a long turn whose prompt has scrolled out of
 * view, a slim bar at the top of the conversation keeps the question in
 * sight: "You · time — preview"; activating it jumps back to that prompt.
 * Stepping between prompts lives in the seek buttons under the navigator
 * toggle (PromptSeekButtons), so it is not repeated here.
 *
 * Reads the viewport-anchor store directly (narrow selectors), so it updates
 * with the scroll position without re-rendering the conversation.
 */
import React, { useMemo } from "react";
import { CornerLeftUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ClaudeMessage } from "../../../types";
import { useAppStore } from "../../../store/useAppStore";
import {
  selectIsPromptBarVisible,
  useViewportAnchorStore,
} from "../../../store/viewportAnchorStore";
import { getPromptPreview, getUserMessageText } from "../../../utils/userMessageKind";
import { formatPromptTime, jumpToPrompt } from "../../../utils/promptNavigation";

interface StickyPromptBarProps {
  /** The list the conversation renders — the prompt text is read from it. */
  messages: ClaudeMessage[];
  /** Space kept free on the right (the session minimap strip), in px. */
  rightInset?: number;
}

const PREVIEW_MAX_LENGTH = 220;

export const StickyPromptBar: React.FC<StickyPromptBarProps> = React.memo(({ messages, rightInset = 0 }) => {
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
    };
  }, [isVisible, track, activeUuid, messages]);

  if (!current) return null;

  const { anchor, preview } = current;
  const time = formatPromptTime(anchor.timestamp);
  const previewText = preview.fromTail ? `… ${preview.text}` : preview.text;

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
      style={rightInset ? { right: rightInset } : undefined}
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
    </nav>
  );
});

StickyPromptBar.displayName = "StickyPromptBar";
