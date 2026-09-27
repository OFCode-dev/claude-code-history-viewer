// src/components/ProjectTree/components/ExplorerFilterMenu.tsx
import React from "react";
import { ListFilter, RotateCcw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionEntrypointFilter } from "../../../types/metadata.types";
import {
  ENTRYPOINT_FILTER_LABEL_KEYS,
  ENTRYPOINT_FILTER_OPTIONS,
} from "../../../utils/entrypoint";
import { getProviderLabel } from "../../../utils/providers";
import type { ExplorerFilters } from "../hooks/useExplorerFilters";
import { ExplorerIconButton } from "./ExplorerIconButton";
import { ProviderChip } from "./ProviderChip";

const headingClass = "text-2xs font-medium uppercase tracking-wider text-muted-foreground";
const itemClass = "text-xs";

/** Keeps the menu open while several checkboxes are toggled. */
const keepOpen = (event: Event) => event.preventDefault();

/** The filter button at the end of the filter input, and its menu. */
export const ExplorerFilterMenu: React.FC<{ filters: ExplorerFilters }> = ({ filters }) => {
  const { t } = useTranslation();
  const isActive = !filters.areFiltersAtDefault;
  const label = isActive ? t("project.filter.menuActive") : t("project.filter.menu");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ExplorerIconButton label={label} className="mr-1">
          <ListFilter aria-hidden="true" />
          {isActive && (
            <span
              aria-hidden="true"
              className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-accent"
            />
          )}
        </ExplorerIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className={headingClass}>{t("project.filter.providers")}</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          className={itemClass}
          checked={filters.isAllProvidersSelected}
          onCheckedChange={() => void filters.toggleProvider("all")}
          onSelect={keepOpen}
        >
          {t("project.filter.allProviders")}
        </DropdownMenuCheckboxItem>
        {filters.selectableProviderIds.map((providerId) => {
          const providerLabel = getProviderLabel((key, fallback) => t(key, fallback), providerId);
          const count = filters.providerCounts[providerId];
          return (
            <DropdownMenuCheckboxItem
              key={providerId}
              className={itemClass}
              checked={
                !filters.isAllProvidersSelected && filters.selectedProviderIds.includes(providerId)
              }
              onCheckedChange={() => void filters.toggleProvider(providerId)}
              onSelect={keepOpen}
            >
              <ProviderChip
                providerId={providerId}
                title={providerLabel}
                className="mr-2"
              />
              <span className="min-w-0 flex-1 truncate">{providerLabel}</span>
              <span className="ml-2 text-2xs tabular-nums text-muted-foreground">{count}</span>
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className={headingClass}>{t("session.filter.source.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={filters.entrypointFilter}
          onValueChange={(value) => filters.setEntrypointFilter(value as SessionEntrypointFilter)}
        >
          {ENTRYPOINT_FILTER_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={option}
              className={itemClass}
              onSelect={keepOpen}
            >
              {t(ENTRYPOINT_FILTER_LABEL_KEYS[option])}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className={itemClass}
          disabled={filters.isDiscoveringProviders}
          onSelect={filters.discoverProviders}
        >
          <Search className="mr-2 size-3.5" aria-hidden="true" />
          {filters.isDiscoveringProviders
            ? t("project.discoveringProviders")
            : t("project.discoverProviders")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className={itemClass}
          disabled={filters.areFiltersAtDefault}
          onSelect={filters.resetFilters}
        >
          <RotateCcw className="mr-2 size-3.5" aria-hidden="true" />
          {t("project.filter.reset")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
