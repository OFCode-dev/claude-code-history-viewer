import React, { useCallback } from "react";
import {
  BookOpen,
  Bot,
  Info,
  ScrollText,
  SquareSlash,
  User,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatPromptTime } from "../../utils/promptNavigation";
import { isFailedTaskStatus, type MessageKind } from "../MessageViewer/helpers/messageKinds";
import { getKindLabelKey } from "./kindLabels";
import type { NavigatorEntryData } from "./types";

interface NavigatorEntryProps {
  entry: NavigatorEntryData;
  isActive: boolean;
  isFocused: boolean;
  onClick: (uuid: string) => void;
  onFocus: (index: number) => void;
  onNavigate: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  /** Keeps the list's key → element map for roving focus. */
  registerRef: (key: string, element: HTMLButtonElement | null) => void;
  /** The virtualizer's `measureElement`, so real row heights are used. */
  measureRef: (element: HTMLElement | null) => void;
  /** Position in the virtual list (read by the virtualizer when measuring). */
  index: number;
  /** Rows in the whole (virtualized) list, for aria-setsize. */
  setSize: number;
  /** Row offset inside the virtual list, in px. */
  start: number;
}

interface KindStyle {
  icon: LucideIcon;
  /** Icon color */
  iconClass: string;
  /** Preview text weight; typed prompts read strongest, injected rows weakest */
  textClass: string;
}

const KIND_STYLES: Record<MessageKind, KindStyle> = {
  prompt: { icon: User, iconClass: "text-info", textClass: "text-foreground font-medium" },
  command: { icon: SquareSlash, iconClass: "text-info", textClass: "text-foreground/80 font-mono" },
  "agent-update": { icon: Zap, iconClass: "text-tool-task", textClass: "text-foreground/80" },
  context: { icon: BookOpen, iconClass: "text-muted-foreground", textClass: "text-muted-foreground italic" },
  reply: { icon: Bot, iconClass: "text-warning", textClass: "text-foreground/80" },
  tool: { icon: Wrench, iconClass: "text-muted-foreground", textClass: "text-muted-foreground" },
  system: { icon: Info, iconClass: "text-muted-foreground", textClass: "text-muted-foreground" },
  summary: { icon: ScrollText, iconClass: "text-tool-mcp", textClass: "text-foreground/80" },
};

export const NavigatorEntry = React.memo<NavigatorEntryProps>(({
  entry,
  isActive,
  isFocused,
  onClick,
  onFocus,
  onNavigate,
  registerRef,
  measureRef,
  index,
  setSize,
  start,
}) => {
  const { t } = useTranslation();
  const handleClick = useCallback(() => onClick(entry.uuid), [onClick, entry.uuid]);
  const handleFocus = useCallback(() => onFocus(index), [onFocus, index]);
  const setRef = useCallback(
    (element: HTMLButtonElement | null) => {
      registerRef(entry.uuid, element);
      measureRef(element);
    },
    [registerRef, measureRef, entry.uuid]
  );

  const kindStyle = KIND_STYLES[entry.kind];
  const KindIcon = kindStyle.icon;
  const kindLabel = t(getKindLabelKey(entry.kind));
  const isFailed = isFailedTaskStatus(entry.status);

  const formattedTime = formatPromptTime(entry.timestamp);

  return (
    <button
      type="button"
      ref={setRef}
      data-index={index}
      tabIndex={isFocused ? 0 : -1}
      className={cn(
        "w-full text-left px-3 py-2 cursor-pointer border-l-2 transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
        "hover:bg-accent/10",
        isActive
          ? "border-l-accent bg-accent/5"
          : "border-l-transparent"
      )}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${start}px)`,
      }}
      onClick={handleClick}
      onFocus={handleFocus}
      onKeyDown={onNavigate}
      role="option"
      // Only a window of rows is in the DOM: give the real position.
      aria-setsize={setSize}
      aria-posinset={index + 1}
      aria-selected={isActive}
      aria-current={isActive ? "true" : undefined}
      aria-label={t("navigator.a11y.entryLabel", {
        role: kindLabel,
        turnIndex: entry.turnIndex,
        defaultValue: `${kindLabel} message ${entry.turnIndex}`,
      })}
    >
      {/* Header row: kind icon + turn label + tool icon + time */}
      <div className="flex items-center gap-1.5 mb-0.5">
        <span title={kindLabel} className="shrink-0 inline-flex">
          <KindIcon
            className={cn("w-3 h-3", isFailed ? "text-destructive" : kindStyle.iconClass)}
            aria-hidden="true"
          />
        </span>
        <span className="text-2xs font-medium text-muted-foreground">
          #{entry.turnIndex}
        </span>
        {entry.hasToolUse && entry.kind !== "tool" && (
          <Wrench className="w-2.5 h-2.5 text-muted-foreground/60" aria-hidden="true" />
        )}
        <span className="ml-auto text-2xs text-muted-foreground/60">
          {formattedTime}
        </span>
      </div>
      {/* Preview text; rows without text show their kind instead */}
      <p
        className={cn(
          "text-xs line-clamp-2 leading-relaxed",
          entry.preview ? kindStyle.textClass : "text-muted-foreground italic"
        )}
      >
        {entry.preview || kindLabel}
      </p>
    </button>
  );
});

NavigatorEntry.displayName = "NavigatorEntry";
