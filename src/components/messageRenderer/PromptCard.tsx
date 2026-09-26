/**
 * PromptCard — a message the person typed.
 *
 * Human prompts are the anchors of a conversation, so they render as wide,
 * left-aligned cards with an accent edge instead of chat bubbles. Long prompts
 * collapse, but keep their closing question visible (see promptCollapse).
 */
import React, { useId, useMemo } from "react";
import { ChevronDown, Copy, Hourglass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCaptureExpandState } from "@/contexts/CaptureExpandContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TooltipButton } from "@/shared/TooltipButton";
import { copyTextToClipboard } from "@/utils/clipboard";
import { formatTime, formatTimeShort } from "@/utils/time";
import { HighlightedText } from "../common";
import { CONVERSATION_CARD_WIDTH } from "./conversationLayout";
import { getPromptCollapse } from "./promptCollapse";
import { usePromptTurnNumber } from "./promptTurnNumber";

interface PromptCardProps {
  uuid: string;
  timestamp: string;
  /** Prompt text; null for a prompt that is only an attachment (e.g. an image). */
  text: string | null;
  searchQuery?: string;
  isCurrentMatch?: boolean;
  currentMatchIndex?: number;
  /**
   * Who wrote it: the person, or — inside a subagent transcript — the parent
   * agent that handed the task over.
   */
  author?: "user" | "parentAgent";
  /** Sent while Claude was still working (a mid-turn, queued message). */
  queued?: boolean;
  /** Further content blocks of the prompt (images, documents, later text blocks). */
  children?: React.ReactNode;
}

const ACTION_BUTTON =
  "inline-flex items-center justify-center w-6 h-6 rounded text-muted-foreground " +
  "hover:text-foreground hover:bg-accent/15 transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const PromptCard: React.FC<PromptCardProps> = ({
  uuid,
  timestamp,
  text,
  searchQuery = "",
  isCurrentMatch = false,
  currentMatchIndex = 0,
  author = "user",
  queued = false,
  children,
}) => {
  const { t } = useTranslation();
  const bodyId = useId();
  const turnNumber = usePromptTurnNumber(uuid);
  const [isExpanded, setIsExpanded] = useCaptureExpandState("content", false);

  const collapse = useMemo(() => (text ? getPromptCollapse(text) : null), [text]);
  const isSearching = searchQuery.length > 0;
  const canCollapse = !!collapse?.needsCollapse && !isSearching;
  const showCollapsed = canCollapse && !isExpanded;

  const isFromParentAgent = author === "parentAgent";
  const label = isFromParentAgent
    ? t("promptCard.taskAriaLabel")
    : turnNumber != null
      ? t("promptCard.ariaLabelWithTurn", { number: turnNumber })
      : t("promptCard.ariaLabel");

  const handleCopy = async () => {
    if (!text) return;
    try {
      await copyTextToClipboard(text);
      toast.success(t("promptCard.copied"));
    } catch {
      toast.error(t("promptCard.copyFailed"));
    }
  };

  const toggleLabel = isExpanded ? t("promptCard.collapse") : t("promptCard.expand");

  return (
    <article
      aria-label={label}
      data-prompt-card=""
      className={cn(
        CONVERSATION_CARD_WIDTH,
        "group/prompt w-full mb-3 rounded-lg border border-accent/20 border-l-[3px] border-l-accent",
        "bg-accent/[0.07] px-4 pt-2 pb-3 shadow-sm"
      )}
    >
      <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
        <span className="font-semibold text-accent">
          {isFromParentAgent ? t("promptCard.parentAgent") : t("promptCard.you")}
        </span>
        <span aria-hidden="true">·</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="cursor-default tabular-nums">
              <time dateTime={timestamp}>{formatTimeShort(timestamp)}</time>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {formatTime(timestamp)}
          </TooltipContent>
        </Tooltip>
        {turnNumber != null && (
          <>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{t("promptCard.turn", { number: turnNumber })}</span>
          </>
        )}
        {queued && (
          <>
            <span aria-hidden="true">·</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-prompt-queued=""
                  className="inline-flex min-w-0 items-center gap-1 cursor-default"
                >
                  <Hourglass className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{t("promptCard.queued")}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4} className="max-w-xs">
                {t("promptCard.queuedTooltip")}
              </TooltipContent>
            </Tooltip>
          </>
        )}

        {/* Actions appear on hover or keyboard focus (always on touch screens),
            so they stay out of the reading flow and out of screenshots. */}
        <div
          className={cn(
            "ml-auto flex items-center gap-0.5 transition-opacity",
            "opacity-0 group-hover/prompt:opacity-100 group-focus-within/prompt:opacity-100",
            "[@media(hover:none)]:opacity-100"
          )}
        >
          {canCollapse && (
            <TooltipButton
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-expanded={isExpanded}
              aria-controls={bodyId}
              className={ACTION_BUTTON}
              content={toggleLabel}
            >
              <ChevronDown
                className={cn("w-3.5 h-3.5 transition-transform", isExpanded && "rotate-180")}
              />
            </TooltipButton>
          )}
          {text && (
            <TooltipButton
              onClick={() => void handleCopy()}
              className={ACTION_BUTTON}
              content={t("promptCard.copy")}
            >
              <Copy className="w-3.5 h-3.5" />
            </TooltipButton>
          )}
        </div>
      </div>

      {text && collapse && (
        <div
          id={bodyId}
          className="mt-1 text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words"
        >
          {isSearching ? (
            <HighlightedText
              text={text}
              searchQuery={searchQuery}
              isCurrentMatch={isCurrentMatch}
              currentMatchIndex={currentMatchIndex}
            />
          ) : showCollapsed ? (
            <>
              <div>{collapse.head}</div>
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                aria-expanded={false}
                aria-controls={bodyId}
                className={cn(
                  "my-1 flex w-full items-center gap-2 rounded py-0.5 text-2xs text-muted-foreground",
                  "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
                <span className="whitespace-nowrap">
                  {collapse.hiddenLineCount > 0
                    ? t("promptCard.hiddenLines", { count: collapse.hiddenLineCount })
                    : t("promptCard.expand")}
                </span>
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
              </button>
              {collapse.tail && <div>{collapse.tail}</div>}
            </>
          ) : (
            text
          )}
        </div>
      )}

      {canCollapse && isExpanded && (
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          aria-expanded={true}
          aria-controls={bodyId}
          className={cn(
            "mt-1.5 flex items-center gap-1 text-2xs text-muted-foreground",
            "hover:text-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <ChevronDown className="w-3 h-3 rotate-180" />
          <span>{t("promptCard.collapse")}</span>
        </button>
      )}

      {children && <div className={cn(text && "mt-2")}>{children}</div>}
    </article>
  );
};

PromptCard.displayName = "PromptCard";
