/**
 * Keeps the message list usable while the display filter hides records.
 *
 * - Session search re-runs when the filter changes, so matches in hidden
 *   records are left out of navigation (and come back when shown again).
 * - While the loaded window shows nothing under the filter, a few older
 *   pages load automatically, so a long tool run at the end of a session
 *   does not leave the dialogue view blank.
 * - A deep-link target that is loaded but hidden by the filter is cleared
 *   with a toast offering to show everything, instead of lingering and firing
 *   later when the filter changes.
 */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ClaudeMessage } from "../../../types";
import type { MessageFilter } from "../../../store/slices/filterSlice";
import { useAppStore } from "../../../store/useAppStore";

/** Pages loaded automatically, per session and filter, to find a visible row. */
export const MAX_AUTO_LOAD_PAGES = 5;

interface FilteredViewGuardsOptions {
  sessionId: string | undefined;
  messageFilter: MessageFilter;
  /** The loaded window. */
  messages: ClaudeMessage[];
  /** The loaded window after the display filter. */
  displayMessages: ClaudeMessage[];
}

export function useFilteredViewGuards({
  sessionId,
  messageFilter,
  messages,
  displayMessages,
}: FilteredViewGuardsOptions): void {
  const { t } = useTranslation();
  const refreshSessionSearch = useAppStore((s) => s.refreshSessionSearch);
  const isLoadingMore = useAppStore((s) => s.pagination.isLoadingMore);
  const targetMessageUuid = useAppStore((s) => s.targetMessageUuid);

  // 1. Search follows the filter.
  const searchedFilterRef = useRef(messageFilter);
  useEffect(() => {
    if (searchedFilterRef.current === messageFilter) return;
    searchedFilterRef.current = messageFilter;
    void refreshSessionSearch();
  }, [messageFilter, refreshSessionSearch]);

  // 2. Fill an empty filtered window from older pages (bounded).
  const autoLoadRef = useRef<{ key: string; pages: number }>({ key: "", pages: 0 });
  const isWindowEmpty = messages.length > 0 && displayMessages.length === 0;
  useEffect(() => {
    const key = `${sessionId ?? ""}|${JSON.stringify(messageFilter)}`;
    if (autoLoadRef.current.key !== key) autoLoadRef.current = { key, pages: 0 };
    if (!isWindowEmpty || isLoadingMore) return;
    const { pagination, loadMoreMessages } = useAppStore.getState();
    if (!pagination.hasMore || autoLoadRef.current.pages >= MAX_AUTO_LOAD_PAGES) return;
    autoLoadRef.current.pages++;
    void loadMoreMessages();
  }, [isWindowEmpty, isLoadingMore, sessionId, messageFilter, messages.length]);

  // 3. A loaded deep-link target the filter hides.
  useEffect(() => {
    if (!targetMessageUuid) return;
    const isLoaded = messages.some((m) => m.uuid === targetMessageUuid);
    if (!isLoaded || displayMessages.some((m) => m.uuid === targetMessageUuid)) return;

    const uuid = targetMessageUuid;
    const { clearTargetMessage } = useAppStore.getState();
    clearTargetMessage();
    toast(t("filter.targetHidden"), {
      action: {
        label: t("filter.showAll"),
        onClick: () => {
          const { resetMessageFilter, navigateToMessage } = useAppStore.getState();
          resetMessageFilter();
          navigateToMessage(uuid, { history: "replace" });
        },
      },
    });
  }, [targetMessageUuid, messages, displayMessages, t]);
}
