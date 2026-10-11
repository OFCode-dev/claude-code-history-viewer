/**
 * Previous / next prompt buttons, placed under (or beside) whichever control
 * opens the prompts navigator: the collapsed navigator rail, the navigator
 * header, or the mobile navigator button.
 *
 * They take exactly the path Alt+Up / Alt+Down take (`stepToAdjacentPrompt`),
 * keep focus on the pressed button so Enter / Space can step on, and stay
 * focusable at either end (`aria-disabled`, never `disabled`: a focused
 * disabled button would drop focus to <body>).
 */
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PromptJumpDirection } from "@/store/viewportAnchorStore";
import { promptStepShortcut, stepToAdjacentPrompt } from "@/utils/promptNavigation";
import { usePromptSeek } from "./usePromptSeek";

export type PromptSeekVariant = "rail" | "header" | "floating";

interface PromptSeekButtonsProps {
  variant: PromptSeekVariant;
  className?: string;
}

const GROUP_CLASS: Record<PromptSeekVariant, string> = {
  rail: "mt-1 flex flex-col items-center gap-0.5 border-t border-border/60 pt-1",
  header: "flex items-center gap-0.5",
  floating: "flex flex-col overflow-hidden rounded-full border border-border bg-card shadow-lg",
};

const BUTTON_CLASS: Record<PromptSeekVariant, string> = {
  // 24 px like the rail itself, 44 px on touch.
  rail: "size-6 rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground pointer-coarse:size-11",
  header: "size-6 rounded text-muted-foreground hover:bg-accent/10 hover:text-foreground",
  floating: "size-11 text-foreground hover:bg-muted",
};

const TOOLTIP_SIDE = { rail: "left", header: "bottom", floating: "left" } as const;

const DIRECTIONS: readonly PromptJumpDirection[] = ["previous", "next"];

export function PromptSeekButtons({ variant, className }: PromptSeekButtonsProps) {
  const { t } = useTranslation();
  const { available, atEnd } = usePromptSeek();
  if (!available) return null;

  return (
    <div
      role="group"
      aria-label={t("navigator.seek.group")}
      data-prompt-seek={variant}
      className={cn(GROUP_CLASS[variant], className)}
    >
      {DIRECTIONS.map((direction) => {
        const label = t(
          direction === "previous" ? "navigator.promptBar.previous" : "navigator.promptBar.next"
        );
        const shortcut = promptStepShortcut(direction);
        const Icon = direction === "previous" ? ChevronUp : ChevronDown;
        const isAtEnd = atEnd[direction];
        return (
          <Tooltip key={direction}>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-prompt-seek-direction={direction}
                aria-label={label}
                aria-keyshortcuts={shortcut.aria}
                aria-disabled={isAtEnd ? "true" : undefined}
                onClick={() => {
                  // At an end the press only announces it, and focus stays.
                  stepToAdjacentPrompt(direction);
                }}
                className={cn(
                  "flex shrink-0 items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  BUTTON_CLASS[variant],
                  "aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent"
                )}
              >
                <Icon aria-hidden="true" className={variant === "floating" ? "size-5" : "size-4"} />
              </button>
            </TooltipTrigger>
            <TooltipContent side={TOOLTIP_SIDE[variant]}>
              {t("navigator.seek.withShortcut", { label, shortcut: shortcut.label })}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
