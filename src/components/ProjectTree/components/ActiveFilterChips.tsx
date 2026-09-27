// src/components/ProjectTree/components/ActiveFilterChips.tsx
import React from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ENTRYPOINT_FILTER_LABEL_KEYS } from "../../../utils/entrypoint";
import { getProviderLabel } from "../../../utils/providers";
import type { ExplorerFilters } from "../hooks/useExplorerFilters";

const FilterChip: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => {
  const { t } = useTranslation();
  return (
    <span className="inline-flex h-5 max-w-full items-center gap-0.5 rounded bg-muted/70 pl-1.5 pr-0.5 text-px11 text-foreground/80">
      <span className="min-w-0 truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("project.filter.remove", { filter: label })}
        title={t("project.filter.remove", { filter: label })}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </span>
  );
};

/** One removable chip per filter that differs from the default; nothing when at defaults. */
export const ActiveFilterChips: React.FC<{ filters: ExplorerFilters }> = ({ filters }) => {
  const { t } = useTranslation();
  if (filters.areFiltersAtDefault) return null;

  return (
    <div className="flex shrink-0 flex-wrap gap-1 px-2 pb-2">
      {!filters.isAllProvidersSelected &&
        filters.selectedProviderIds.map((providerId) => (
          <FilterChip
            key={providerId}
            label={getProviderLabel((key, fallback) => t(key, fallback), providerId)}
            onRemove={() => void filters.toggleProvider(providerId)}
          />
        ))}
      {filters.entrypointFilter !== "all" && (
        <FilterChip
          label={t("project.filter.sourceChip", {
            source: t(ENTRYPOINT_FILTER_LABEL_KEYS[filters.entrypointFilter]),
          })}
          onRemove={() => filters.setEntrypointFilter("all")}
        />
      )}
    </div>
  );
};
