import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, Filter, MessagesSquare, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { TooltipButton } from "@/shared/TooltipButton";

/** The control in the conversation tools a chip leads to. */
export type ChipTarget = "search" | "dialogue" | "filters";

interface TopStripChipsProps {
  /** Active conversation search, or empty. */
  query: string;
  /** 1-based position of the current match; 0 when there is none. */
  matchPosition: number;
  matchCount: number;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  isDialogue: boolean;
  /** Message types hidden by the filter row (ignored while Dialogue is on). */
  hiddenTypeCount: number;
  /** Expands the tools and focuses `target`'s control. */
  onActivate: (target: ChipTarget) => void;
}

// 24 px tall like the strip; 44 px where the pointer is coarse (touch).
const chipClass = cn(
  "inline-flex h-6 max-w-full min-w-0 pointer-coarse:h-11 items-center gap-1 rounded-md px-1.5 text-2xs",
  "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
);

const stepClass = cn(
  "inline-flex size-6 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-md",
  "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
  "disabled:pointer-events-none disabled:opacity-40",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
);

function Chip({
  name,
  icon,
  children,
  onClick,
}: {
  name: string;
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  // The name starts with the visible text (label in name); the tooltip
  // carries the full text the strip may truncate.
  return (
    <TooltipButton aria-label={name} content={name} onClick={onClick} className={chipClass}>
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </TooltipButton>
  );
}

/**
 * What the collapsed conversation tools are doing, shown only when it differs
 * from the default: an active search (with match stepping that expands
 * nothing), the Dialogue view, or hidden message types.
 */
export function TopStripChips({
  query,
  matchPosition,
  matchCount,
  onPrevMatch,
  onNextMatch,
  isDialogue,
  hiddenTypeCount,
  onActivate,
}: TopStripChipsProps) {
  const { t } = useTranslation();
  const position = `${matchPosition}/${matchCount}`;

  return (
    <>
      {query ? (
        <span className="flex min-w-0 shrink items-center">
          <Chip
            name={t("conversationTools.chips.search", { query, position })}
            icon={<Search className="size-3 shrink-0" aria-hidden="true" />}
            onClick={() => onActivate("search")}
          >
            <span>“{query}”</span> <span className="font-mono tabular-nums">{position}</span>
          </Chip>
          <button
            type="button"
            className={stepClass}
            onClick={onPrevMatch}
            disabled={matchCount === 0}
            aria-label={t("conversationTools.chips.prevMatch")}
            title={t("conversationTools.chips.prevMatch")}
          >
            <ChevronUp className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={stepClass}
            onClick={onNextMatch}
            disabled={matchCount === 0}
            aria-label={t("conversationTools.chips.nextMatch")}
            title={t("conversationTools.chips.nextMatch")}
          >
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ) : null}
      {isDialogue ? (
        <Chip
          name={t("conversationTools.chips.dialogue")}
          icon={<MessagesSquare className="size-3 shrink-0" aria-hidden="true" />}
          onClick={() => onActivate("dialogue")}
        >
          {t("conversationTools.chips.dialogueLabel")}
        </Chip>
      ) : hiddenTypeCount > 0 ? (
        <Chip
          name={t("conversationTools.chips.filtersName", { count: hiddenTypeCount })}
          icon={<Filter className="size-3 shrink-0" aria-hidden="true" />}
          onClick={() => onActivate("filters")}
        >
          {t("conversationTools.chips.filters", { count: hiddenTypeCount })}
        </Chip>
      ) : null}
    </>
  );
}
