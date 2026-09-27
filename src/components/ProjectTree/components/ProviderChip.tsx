// src/components/ProjectTree/components/ProviderChip.tsx
import React from "react";
import { cn } from "@/lib/utils";
import type { ProviderId } from "../../../types";
import { PROVIDER_BADGE_STYLES, PROVIDER_SHORT_CODES } from "../../../utils/providers";

export type ProviderChipEmphasis = "normal" | "selected" | "dimmed";

interface ProviderChipProps {
  providerId: ProviderId;
  /** `"<Provider label> · <n> sessions"`: the tooltip and accessible name. */
  title: string;
  emphasis?: ProviderChipEmphasis;
  /**
   * Makes the chip a provider switch. It is a span, not a button, because it
   * sits inside the row's treeitem button; the tree's keyboard model reaches
   * the same switch through the row's context menu.
   */
  onSelect?: () => void;
  className?: string;
}

/** Two-letter provider code (`CC`, `CX`) in the provider's badge colours. */
export const ProviderChip: React.FC<ProviderChipProps> = ({
  providerId,
  title,
  emphasis = "normal",
  onSelect,
  className,
}) => (
  <span
    role={onSelect ? "button" : undefined}
    tabIndex={onSelect ? -1 : undefined}
    title={title}
    aria-label={onSelect ? title : undefined}
    onClick={
      onSelect
        ? (event) => {
            event.stopPropagation();
            onSelect();
          }
        : undefined
    }
    className={cn(
      "inline-flex h-4 shrink-0 items-center rounded-[3px] px-[3px] font-mono text-px9-5 font-semibold leading-none",
      PROVIDER_BADGE_STYLES[providerId],
      emphasis === "selected" && "ring-1 ring-current",
      emphasis === "dimmed" && "opacity-60 transition-opacity hover:opacity-100",
      onSelect && "cursor-pointer",
      className
    )}
  >
    {PROVIDER_SHORT_CODES[providerId]}
  </span>
);
