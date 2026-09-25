/**
 * SystemRecordRow — a compact, muted line for user records nobody typed:
 * command output, task notifications, harness context, interrupts,
 * compaction summaries, bash-mode input and empty records.
 *
 * One line with an icon, a short label and a preview; expandable to the full
 * content so nothing is lost, but they no longer look like prompts.
 */
import React, { useEffect, useId, useMemo } from "react";
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
  isCurrentMatch?: boolean;
  currentMatchIndex?: number;
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
  isCurrentMatch = false,
  currentMatchIndex = 0,
}) => {
  const { t } = useTranslation();
  const detailsId = useId();
  const [isExpanded, setIsExpanded] = useCaptureExpandState("system-row", false);
  const { preview, expandable } = useMemo(() => getSystemRecordSummary(kind, text), [kind, text]);
  const Icon = KIND_ICONS[kind];
  const label = t(`systemRow.${kind}`);

  // Reveal the full content when a search hit is inside it.
  useEffect(() => {
    if (expandable && searchQuery && text.toLowerCase().includes(searchQuery.toLowerCase())) {
      setIsExpanded(true);
    }
  }, [expandable, searchQuery, text, setIsExpanded]);

  const summary = (
    <>
      {expandable ? (
        <ChevronRight
          aria-hidden="true"
          className={cn("w-3 h-3 shrink-0 transition-transform", isExpanded && "rotate-90")}
        />
      ) : (
        <span aria-hidden="true" className="w-3 shrink-0" />
      )}
      <Icon aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
      <span className="font-medium shrink-0">{label}</span>
      {preview && (
        <span className="min-w-0 truncate text-muted-foreground/80">
          {searchQuery && !isExpanded ? (
            <HighlightedText
              text={preview}
              searchQuery={searchQuery}
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

  return (
    <div className={cn(CONVERSATION_CARD_WIDTH, "mb-1")} data-system-record={kind}>
      {expandable ? (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          className={cn(
            rowClass,
            "hover:bg-muted/60 hover:text-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          {summary}
        </button>
      ) : (
        <div className={rowClass}>{summary}</div>
      )}

      {expandable && isExpanded && (
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
              {searchQuery ? (
                <HighlightedText
                  text={stripAnsiCodes(getCommandOutputBody(text))}
                  searchQuery={searchQuery}
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
              {searchQuery ? (
                <HighlightedText
                  text={text}
                  searchQuery={searchQuery}
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
