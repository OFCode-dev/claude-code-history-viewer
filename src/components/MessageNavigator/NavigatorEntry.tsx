import React, { useCallback } from "react";
import { Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatPromptTime } from "../../utils/promptNavigation";
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
  /** Row offset inside the virtual list, in px. */
  start: number;
}

const ROLE_STYLES = {
  user: { dot: "bg-info" },
  assistant: { dot: "bg-warning" },
  system: { dot: "bg-muted-foreground" },
  summary: { dot: "bg-tool-mcp" },
} as const;

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

  const roleStyle = ROLE_STYLES[entry.role] || ROLE_STYLES.system;
  const roleLabel = t(`navigator.role.${entry.role}`, { defaultValue: entry.role });

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
      aria-selected={isActive}
      aria-current={isActive ? "true" : undefined}
      aria-label={t("navigator.a11y.entryLabel", {
        role: roleLabel,
        turnIndex: entry.turnIndex,
        defaultValue: `${roleLabel} message ${entry.turnIndex}`,
      })}
    >
      {/* Header row: role dot + turn label + time + tool icon */}
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={cn("w-2 h-2 rounded-full shrink-0", roleStyle.dot)} />
        <span className="text-2xs font-medium text-muted-foreground">
          #{entry.turnIndex}
        </span>
        {entry.hasToolUse && (
          <Wrench className="w-2.5 h-2.5 text-muted-foreground/60" />
        )}
        <span className="ml-auto text-2xs text-muted-foreground/60">
          {formattedTime}
        </span>
      </div>
      {/* Preview text */}
      <p className="text-xs text-foreground/80 line-clamp-2 leading-relaxed">
        {entry.preview}
      </p>
    </button>
  );
});

NavigatorEntry.displayName = "NavigatorEntry";
