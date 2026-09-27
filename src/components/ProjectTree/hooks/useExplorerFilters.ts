// src/components/ProjectTree/hooks/useExplorerFilters.ts
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ClaudeProject, ProviderId } from "../../../types";
import type { SessionEntrypointFilter } from "../../../types/metadata.types";
import { useAppStore } from "../../../store/useAppStore";
import {
  DEFAULT_PROVIDER_ID,
  getProviderId,
  normalizeProviderIds,
  PROVIDER_IDS,
} from "../../../utils/providers";

export type ProviderToggleTarget = "all" | ProviderId;

interface UseExplorerFiltersArgs {
  /** Visible projects (hidden ones already removed). */
  projects: ClaudeProject[];
  selectedProject: ClaudeProject | null;
  isViewingGlobalStats: boolean;
}

export interface ExplorerFilters {
  /** Projects per provider among the visible ones. */
  providerCounts: Record<ProviderId, number>;
  /** Providers that can be turned on: detected as available, or holding projects. */
  selectableProviderIds: ProviderId[];
  selectedProviderIds: ProviderId[];
  isAllProvidersSelected: boolean;
  /** Provider chips only help when more than one provider can show. */
  showProviderBadge: boolean;
  entrypointFilter: SessionEntrypointFilter;
  areFiltersAtDefault: boolean;
  isDiscoveringProviders: boolean;
  matchesProviderFilter: (project: ClaudeProject) => boolean;
  /** "all" selects every provider; a provider joins, leaves or (from "all") narrows to itself. */
  toggleProvider: (target: ProviderToggleTarget) => Promise<void>;
  setEntrypointFilter: (filter: SessionEntrypointFilter) => void;
  discoverProviders: () => void;
  resetFilters: () => void;
}

/** Provider and source (entrypoint) filter state and actions for the explorer. */
export function useExplorerFilters({
  projects,
  selectedProject,
  isViewingGlobalStats,
}: UseExplorerFiltersArgs): ExplorerFilters {
  const { t } = useTranslation();
  const activeProviders = useAppStore((state) => state.activeProviders);
  const detectedProviders = useAppStore((state) => state.providers);
  const isDetectingProviders = useAppStore((state) => state.isDetectingProviders);
  const isLoadingProjects = useAppStore((state) => state.isLoadingProjects);
  const discoverProvidersInStore = useAppStore((state) => state.discoverProviders);
  const setActiveProviders = useAppStore((state) => state.setActiveProviders);
  const entrypointFilter = useAppStore((state) => state.sessionEntrypointFilter);
  const setSessionEntrypointFilter = useAppStore((state) => state.setSessionEntrypointFilter);
  const loadGlobalStats = useAppStore((state) => state.loadGlobalStats);
  const clearProjectSelection = useAppStore((state) => state.clearProjectSelection);

  const providerCounts = useMemo(() => {
    const counts = Object.fromEntries(PROVIDER_IDS.map((id) => [id, 0])) as Record<
      ProviderId,
      number
    >;
    for (const project of projects) counts[getProviderId(project.provider)] += 1;
    return counts;
  }, [projects]);

  const selectableProviderIds = useMemo<ProviderId[]>(() => {
    const detected = detectedProviders
      .filter((provider) => provider.is_available)
      .map((provider) => provider.id as ProviderId);
    const ordered = PROVIDER_IDS.filter(
      (id) => detected.includes(id) || providerCounts[id] > 0
    );
    return ordered.length > 0 ? ordered : [DEFAULT_PROVIDER_ID];
  }, [detectedProviders, providerCounts]);

  const selectedProviderIds = useMemo<ProviderId[]>(
    () =>
      PROVIDER_IDS.filter(
        (id) => activeProviders.includes(id) && selectableProviderIds.includes(id)
      ),
    [activeProviders, selectableProviderIds]
  );

  // While provider detection runs, treat the filter as "all" so it does not flash.
  const isAllProvidersSelected =
    isDetectingProviders ||
    (selectableProviderIds.length > 0 &&
      selectableProviderIds.every((id) => selectedProviderIds.includes(id)));

  const showProviderBadge = isAllProvidersSelected
    ? selectableProviderIds.length > 1
    : selectedProviderIds.length !== 1;

  const areFiltersAtDefault = isAllProvidersSelected && entrypointFilter === "all";

  const matchesProviderFilter = useCallback(
    (project: ClaudeProject) =>
      isAllProvidersSelected || selectedProviderIds.includes(getProviderId(project.provider)),
    [isAllProvidersSelected, selectedProviderIds]
  );

  const applyProviderSelection = useCallback(
    async (nextProviders: ProviderId[]) => {
      const normalized = normalizeProviderIds(nextProviders);
      if (normalized.length === 0) return;

      const current = normalizeProviderIds(activeProviders);
      const isUnchanged =
        current.length === normalized.length &&
        current.every((id, index) => id === normalized[index]);
      if (isUnchanged) return;

      const previousSelectedProjectPath = selectedProject?.path;
      const shouldClearSelection =
        selectedProject !== null && !normalized.includes(getProviderId(selectedProject.provider));

      try {
        setActiveProviders(normalized);
        if (isViewingGlobalStats) await loadGlobalStats();
        // Clear the selection only once the switch succeeded, so a rollback
        // never leaves it cleared.
        if (shouldClearSelection) {
          const latestSelectedProject = useAppStore.getState().selectedProject;
          if (latestSelectedProject?.path === previousSelectedProjectPath) {
            clearProjectSelection();
          }
        }
      } catch (error) {
        console.error("Failed to apply provider selection:", error);
        setActiveProviders(current);
        toast.error(t("common.provider.filterApplyError", "Failed to apply provider filter"));
      }
    },
    [
      activeProviders,
      clearProjectSelection,
      isViewingGlobalStats,
      loadGlobalStats,
      selectedProject,
      setActiveProviders,
      t,
    ]
  );

  const toggleProvider = useCallback(
    async (target: ProviderToggleTarget) => {
      if (target === "all") {
        await applyProviderSelection(selectableProviderIds);
        return;
      }
      if (isAllProvidersSelected) {
        await applyProviderSelection([target]);
        return;
      }
      if (selectedProviderIds.includes(target)) {
        const next = selectedProviderIds.filter((id) => id !== target);
        await applyProviderSelection(next.length === 0 ? selectableProviderIds : next);
        return;
      }
      const next = PROVIDER_IDS.filter(
        (id) =>
          selectableProviderIds.includes(id) && (selectedProviderIds.includes(id) || id === target)
      );
      await applyProviderSelection(next.length > 0 ? next : [target]);
    },
    [applyProviderSelection, isAllProvidersSelected, selectableProviderIds, selectedProviderIds]
  );

  const setEntrypointFilter = useCallback(
    (filter: SessionEntrypointFilter) => {
      void Promise.resolve(setSessionEntrypointFilter(filter)).catch((error: unknown) => {
        console.error("Failed to apply source filter:", error);
        toast.error(t("common.provider.filterApplyError", "Failed to apply provider filter"));
      });
    },
    [setSessionEntrypointFilter, t]
  );

  const discoverProviders = useCallback(() => {
    void discoverProvidersInStore().catch((error: unknown) => {
      console.error("Failed to discover providers:", error);
      toast.error(t("common.provider.detectError"));
    });
  }, [discoverProvidersInStore, t]);

  const resetFilters = useCallback(() => {
    void toggleProvider("all");
    if (entrypointFilter !== "all") setEntrypointFilter("all");
  }, [entrypointFilter, setEntrypointFilter, toggleProvider]);

  return {
    providerCounts,
    selectableProviderIds,
    selectedProviderIds,
    isAllProvidersSelected,
    showProviderBadge,
    entrypointFilter,
    areFiltersAtDefault,
    isDiscoveringProviders: isDetectingProviders || isLoadingProjects,
    matchesProviderFilter,
    toggleProvider,
    setEntrypointFilter,
    discoverProviders,
    resetFilters,
  };
}
