import React, { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { NavigatorMode } from "../../store/slices/navigatorSlice";

const MODES: readonly NavigatorMode[] = ["prompts", "all"];

interface NavigatorModeToggleProps {
  mode: NavigatorMode;
  onChange: (mode: NavigatorMode) => void;
  /** In a subagent transcript the prompts come from the parent agent. */
  inSubagent?: boolean;
}

/**
 * Two-option segmented control (Prompts | All) as a radio group: one tab
 * stop, arrow keys move and select.
 */
export const NavigatorModeToggle: React.FC<NavigatorModeToggleProps> = ({
  mode,
  onChange,
  inSubagent = false,
}) => {
  const { t } = useTranslation();
  const buttonRefs = useRef(new Map<NavigatorMode, HTMLButtonElement>());

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const step =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? -1
            : 0;
      if (step === 0 || event.altKey) return;
      event.preventDefault();
      const next = MODES[(MODES.indexOf(mode) + step + MODES.length) % MODES.length]!;
      onChange(next);
      buttonRefs.current.get(next)?.focus();
    },
    [mode, onChange]
  );

  return (
    <div
      role="radiogroup"
      aria-label={t("navigator.mode.label")}
      className="flex items-center rounded-md bg-muted/60 p-0.5 border border-border/50"
    >
      {MODES.map((option) => {
        const isSelected = option === mode;
        return (
          <button
            key={option}
            ref={(element) => {
              if (element) buttonRefs.current.set(option, element);
              else buttonRefs.current.delete(option);
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(option)}
            onKeyDown={handleKeyDown}
            title={
              option === "prompts" && inSubagent
                ? t("navigator.mode.promptsHintSubagent")
                : t(`navigator.mode.${option}Hint`)
            }
            className={cn(
              "px-2 py-0.5 rounded text-2xs font-medium transition-colors whitespace-nowrap",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              isSelected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(`navigator.mode.${option}`)}
          </button>
        );
      })}
    </div>
  );
};
