/**
 * SystemRecordRow — a compact, muted line for user records nobody typed:
 * command output, task notifications, harness context, interrupts,
 * compaction summaries, bash-mode input and empty records.
 *
 * One line with an icon, a short label and a preview; expandable to the full
 * content so nothing is lost, but they no longer look like prompts.
 */
import React, { useId, useMemo, useState } from "react";
import {
  Archive,
  Bell,
  ChevronRight,
  CircleDashed,
  CircleSlash,
  Info,
  TerminalSquare,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useCaptureExpandState } from "@/contexts/CaptureExpandContext";
import { formatTime, formatTimeShort } from "@/utils/time";
import { TaskNotificationRenderer } from "../contentRenderer";
import { AnsiText, HighlightedText } from "../common";
import { stripAnsiCodes } from "@/utils/ansiToHtml";
import { layout } from "@/components/renderers";
import type { SearchFilterType } from "@/store/slices/types";
import { CONVERSATION_CARD_WIDTH } from "./conversationLayout";
import {
  getCommandOutputBody,
  getSystemRecordSummary,
  type SystemRecordKind,
} from "./systemRecordSummary";

interface SystemRecordRowProps {
  kind: SystemRecordKind;
  text: string;
  timestamp: string;
  searchQuery?: string;
  /** Session search mode; only content search reveals hits inside the row. */
  filterType?: SearchFilterType;
  isCurrentMatch?: boolean;
  currentMatchIndex?: number;
  /**
   * Capture mode: clicking the row selects the message, so only the chevron
   * toggles the details.
   */
  selectable?: boolean;
}

const KIND_ICONS: Record<SystemRecordKind, LucideIcon> = {
  commandOutput: Terminal,
  taskNotification: Bell,
  systemContext: Info,
  interrupt: CircleSlash,
  compactSummary: Archive,
  empty: CircleDashed,
  shellCommand: TerminalSquare,
};

export const SystemRecordRow: React.FC<SystemRecordRowProps> = ({
  kind,
  text,
  timestamp,
  searchQuery = "",
  filterType = "content",
  isCurrentMatch = false,
  currentMatchIndex = 0,
  selectable = false,
}) => {
  const { t } = useTranslation();
  const detailsId = useId();
  const [isExpanded, setIsExpanded] = useCaptureExpandState("system-row", false);
  const { preview, expandable } = useMemo(() => getSystemRecordSummary(kind, text), [kind, text]);
  const Icon = KIND_ICONS[kind];
  const label = t(`systemRow.${kind}`);

  // A content-search hit inside the details reveals them for as long as that
  // search is active — derived, not stored, so the row closes again when the
  // search is cleared. Collapsing by hand dismisses the reveal for that query.
  const highlightQuery = filterType === "content" ? searchQuery : "";
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  const isRevealedBySearch =
    expandable &&
    highlightQuery.length > 0 &&
    dismissedQuery !== highlightQuery &&
    text.toLowerCase().includes(highlightQuery.toLowerCase());
  const expanded = isExpanded || isRevealedBySearch;
  const toggle = () => {
    if (!expanded) {
      setIsExpanded(true);
      return;
    }
    setIsExpanded(false);
    if (isRevealedBySearch) setDismissedQuery(highlightQuery);
  };

  const summary = (
    <>
      {expandable ? (
        <ChevronRight
          aria-hidden="true"
          className={cn("w-3 h-3 shrink-0 transition-transform", expanded && "rotate-90")}
        />
      ) : (
        <span aria-hidden="true" className="w-3 shrink-0" />
      )}
      <Icon aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
      <span className="font-medium shrink-0">{label}</span>
      {preview && (
        <span className="min-w-0 truncate text-muted-foreground/80">
          {highlightQuery && !expanded ? (
            <HighlightedText
              text={preview}
              searchQuery={highlightQuery}
              isCurrentMatch={isCurrentMatch}
              currentMatchIndex={currentMatchIndex}
            />
          ) : (
            preview
          )}
        </span>
      )}
      <time
        dateTime={timestamp}
        title={formatTime(timestamp)}
        className="ml-auto shrink-0 pl-2 tabular-nums text-muted-foreground/70"
      >
        {formatTimeShort(timestamp)}
      </time>
    </>
  );

  const rowClass = cn(
    "flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-2xs text-muted-foreground"
  );

  const toggleLabel = expanded ? t("systemRow.collapse") : t("systemRow.expand");

  return (
    <div className={cn(CONVERSATION_CARD_WIDTH, "mb-1")} data-system-record={kind}>
      {expandable && !selectable ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={detailsId}
          className={cn(
            rowClass,
            "hover:bg-muted/60 hover:text-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          {summary}
        </button>
      ) : expandable ? (
        // Capture mode: the row itself stays a selection target.
        <div className={cn(rowClass, "relative")}>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={`${label}: ${toggleLabel}`}
            className={cn(
              "absolute left-1 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded",
              "hover:bg-muted/60 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          />
          {summary}
        </div>
      ) : (
        <div className={rowClass}>{summary}</div>
      )}

      {expandable && expanded && (
        <div id={detailsId} className="mt-1 ml-5 mb-2">
          {kind === "taskNotification" ? (
            <TaskNotificationRenderer text={text} />
          ) : kind === "commandOutput" ? (
            <div
              className={cn(
                layout.monoText,
                layout.rounded,
                layout.contentMaxHeight,
                "overflow-auto whitespace-pre-wrap break-words border border-border/60 bg-muted/30 px-3 py-2 text-foreground/80"
              )}
            >
              {highlightQuery ? (
                <HighlightedText
                  text={stripAnsiCodes(getCommandOutputBody(text))}
                  searchQuery={highlightQuery}
                  isCurrentMatch={isCurrentMatch}
                  currentMatchIndex={currentMatchIndex}
                />
              ) : (
                <AnsiText text={getCommandOutputBody(text)} />
              )}
            </div>
          ) : (
            <div
              className={cn(
                layout.bodyText,
                layout.rounded,
                layout.contentMaxHeight,
                "overflow-auto whitespace-pre-wrap break-words border border-border/60 bg-muted/30 px-3 py-2 text-muted-foreground"
              )}
            >
              {highlightQuery ? (
                <HighlightedText
                  text={text}
                  searchQuery={highlightQuery}
                  isCurrentMatch={isCurrentMatch}
                  currentMatchIndex={currentMatchIndex}
                />
              ) : (
                text
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

SystemRecordRow.displayName = "SystemRecordRow";
