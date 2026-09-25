import React, { useCallback } from "react";
import { Bot } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatPromptTime } from "../../utils/promptNavigation";
import type { PromptListRow } from "./promptEntries";

interface NavigatorPromptRowProps {
  row: PromptListRow;
  index: number;
  /** Show "Turn N" — only when the loaded window starts at the session start. */
  showTurnNumber: boolean;
  /** Scroll-spy: this prompt's turn contains the first visible conversation row. */
  isActive: boolean;
  isFocused: boolean;
  onActivate: (row: PromptListRow) => void;
  onFocus: (index: number) => void;
  onNavigate: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  registerRef: (key: string, element: HTMLButtonElement | null) => void;
  measureRef: (element: HTMLElement | null) => void;
  /** Row offset inside the virtual list, in px. */
  start: number;
}

/** One row of the Prompts list: a prompt (turn) or a subagent it spawned. */
export const NavigatorPromptRow = React.memo<NavigatorPromptRowProps>(
  ({
    row,
    index,
    showTurnNumber,
    isActive,
    isFocused,
    onActivate,
    onFocus,
    onNavigate,
    registerRef,
    measureRef,
    start,
  }) => {
    const { t } = useTranslation();

    const setRef = useCallback(
      (element: HTMLButtonElement | null) => {
        registerRef(row.key, element);
        measureRef(element);
      },
      [registerRef, measureRef, row.key]
    );

    const common = {
      type: "button" as const,
      ref: setRef,
      role: "option",
      "data-index": index,
      tabIndex: isFocused ? 0 : -1,
      onClick: () => onActivate(row),
      onFocus: () => onFocus(index),
      onKeyDown: onNavigate,
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${start}px)`,
      } satisfies React.CSSProperties,
    };

    if (row.kind === "spawn") {
      return (
        <button
          {...common}
          aria-selected={false}
          aria-label={t("navigator.a11y.spawnLabel", { label: row.spawn.label })}
          title={t("navigator.spawnHint")}
          className={cn(
            "w-full flex items-center gap-1.5 pl-6 pr-3 py-1 text-left outline-none",
            "border-l-2 transition-colors hover:bg-accent/10",
            "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
            isActive ? "border-l-accent/40 bg-accent/5" : "border-l-transparent"
          )}
        >
          <Bot aria-hidden className="w-3 h-3 shrink-0 text-tool-task" />
          <span className="min-w-0 truncate text-2xs text-muted-foreground">
            {row.spawn.label}
          </span>
        </button>
      );
    }

    const { entry } = row;
    const time = formatPromptTime(entry.timestamp);
    const turnLabel = showTurnNumber
      ? t("navigator.turn", { number: entry.turnNumber })
      : null;
    const preview = entry.preview || t("navigator.emptyPrompt");
    const previewText = entry.fromTail ? `… ${preview}` : preview;
    const stepsLabel = t("navigator.steps", { count: entry.steps });

    return (
      <button
        {...common}
        aria-selected={isActive}
        aria-current={isActive ? "location" : undefined}
        aria-label={
          turnLabel
            ? t("navigator.a11y.promptLabel", { turn: turnLabel, time, preview })
            : t("navigator.a11y.promptLabelNoTurn", { time, preview })
        }
        className={cn(
          "w-full text-left px-3 pt-2 pb-1.5 outline-none border-l-2 transition-colors",
          "hover:bg-accent/10",
          "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
          isActive ? "border-l-accent bg-accent/10" : "border-l-transparent"
        )}
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          {turnLabel && (
            <>
              <span
                className={cn(
                  "text-2xs font-medium",
                  isActive ? "text-accent" : "text-muted-foreground"
                )}
              >
                {turnLabel}
              </span>
              {time && <span aria-hidden className="text-2xs text-muted-foreground/50">·</span>}
            </>
          )}
          <span
            className={cn(
              "text-2xs tabular-nums",
              isActive && !turnLabel ? "text-accent" : "text-muted-foreground/80"
            )}
          >
            {time}
          </span>
        </div>
        <p
          className={cn(
            "text-xs leading-snug line-clamp-2 break-words",
            isActive ? "text-foreground" : "text-foreground/85"
          )}
        >
          {previewText}
        </p>
        <p className="mt-0.5 text-2xs text-muted-foreground/70">{stepsLabel}</p>
      </button>
    );
  }
);

NavigatorPromptRow.displayName = "NavigatorPromptRow";
