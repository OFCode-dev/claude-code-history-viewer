// src/components/ProjectTree/components/ExplorerSearch.tsx
import React from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useIsInAutoHideOverlay } from "@/components/AutoHide/autoHideHolds";
import type { ExplorerFilters } from "../hooks/useExplorerFilters";
import { ExplorerFilterMenu } from "./ExplorerFilterMenu";
import { ExplorerIconButton } from "./ExplorerIconButton";

interface ExplorerSearchProps {
  value: string;
  onChange: (value: string) => void;
  filters: ExplorerFilters;
}

/** The 32px "Filter projects…" input with its clear button and filter menu. */
export const ExplorerSearch: React.FC<ExplorerSearchProps> = ({ value, onChange, filters }) => {
  const { t } = useTranslation();
  const inputId = React.useId();
  const placeholder = t("project.filter.placeholder");
  const inOverlay = useIsInAutoHideOverlay();

  return (
    <div className="shrink-0 px-2 pb-2">
      <div className="flex h-8 items-center rounded-md border border-border/60 bg-background/40 transition-colors focus-within:border-ring/70">
        <Search className="ml-2 size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
        <label htmlFor={inputId} className="sr-only">
          {placeholder}
        </label>
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            if (inOverlay) {
              // In a reading-mode overlay, Esc layers: clear and stay, then
              // (empty) let the press close the overlay.
              if (!value) return;
              event.preventDefault();
              onChange("");
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            onChange("");
            event.currentTarget.blur();
          }}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-px12-5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
        />
        {value && (
          <ExplorerIconButton label={t("project.filter.clear")} onClick={() => onChange("")}>
            <X aria-hidden="true" />
          </ExplorerIconButton>
        )}
        <ExplorerFilterMenu filters={filters} />
      </div>
    </div>
  );
};
