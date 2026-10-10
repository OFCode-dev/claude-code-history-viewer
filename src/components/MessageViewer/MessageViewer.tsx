/**
 * MessageViewer Component
 *
 * Main component for displaying conversation messages with search and navigation.
 * Uses @tanstack/react-virtual for efficient rendering of large message lists.
 */

import { useRef, useCallback, useMemo, useState, useEffect, useLayoutEffect } from "react";
import { OverlayScrollbarsComponent, type OverlayScrollbarsComponentRef } from "overlayscrollbars-react";
import { MessageCircle, ChevronDown, ChevronUp, Search, X, Camera, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { LoadingSpinner, LoadingState } from "@/components/ui/loading";

// Local imports
import type { MessageViewerProps } from "./types";
import { VirtualizedMessageRow } from "./components/VirtualizedMessageRow";
import { FloatingDateOverlay } from "./components/FloatingDateOverlay";
import { StickyPromptBar } from "./components/StickyPromptBar";
import { CaptureModeToolbar } from "./components/CaptureModeToolbar";
import { FilterToolbar } from "./components/FilterToolbar";
import { FilterHiddenNotice } from "./components/FilterHiddenNotice";
import { SessionBoardButton } from "./components/SessionBoardButton";
import { OffScreenCaptureRenderer } from "./components/OffScreenCaptureRenderer";
import { ScreenshotPreviewModal } from "./components/ScreenshotPreviewModal";
import { SubagentContextBar } from "./components/SubagentContextBar";
import { useSearchState } from "./hooks/useSearchState";
import { useScrollNavigation } from "./hooks/useScrollNavigation";
import { useMessageVirtualization } from "./hooks/useMessageVirtualization";
import { useFilteredViewGuards } from "./hooks/useFilteredViewGuards";
import {
  findFirstVisibleMessageRow,
  registerTranscript,
  scrollRowIntoTopView,
  setTopOverlayClearance,
  usePositionRestore,
  useViewportAnchorPublisher,
} from "./hooks/useReadingPosition";
import { useCapturePreview } from "../../hooks/useCapturePreview";
import { MAX_CAPTURE_MESSAGES } from "../../hooks/useCaptureScreenshot";
import {
  groupAgentTasks,
  getMessageUuidsByCategory,
  groupAgentProgressMessages,
  groupTaskOperations,
  applyMessageDisplayFilter,
} from "./helpers";
import { useAppStore } from "../../store/useAppStore";
import { useExpandRegistry } from "../../store/expandRegistryStore";
import { useExport } from "../../hooks/useExport";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExportFormat } from "@/types/export";
import { useIsMobile } from "@/hooks/useIsMobile";
import { effectiveGroupMode } from "@/store/slices/layoutSlice";
import { AutoHideRegion } from "@/components/AutoHide/AutoHideRegion";
import { PinToggle } from "@/components/AutoHide/PinToggle";
import { TopStripChips, type ChipTarget } from "@/components/AutoHide/TopStripChips";
import { countHiddenMessageTypes } from "@/components/AutoHide/topStripModel";
import { panelShortcut } from "@/components/AutoHide/shortcuts";
import {
  concealPanel,
  PANEL_FOCUS_ATTR,
  revealPanel,
  sourceFromActivation,
} from "@/components/AutoHide/panelActions";
export const MessageViewer: React.FC<MessageViewerProps> = ({
  messages,
  isLoading,
  selectedSession,
  sessionSearch,
  onSearchChange,
  onFilterTypeChange,
  onClearSearch,
  onNextMatch,
  onPrevMatch,
  onOpenBoard,
}) => {
  const { t } = useTranslation();
  // Reading mode: the toolbar and filter row hide in a strip at the top.
  const isMobile = useIsMobile();
  const topMode = useAppStore((s) => effectiveGroupMode(s, "top", isMobile));
  const isReadingMode = topMode !== "normal";
  const hoverReveal = useAppStore((s) => s.hoverReveal);
  const scrollContainerRef = useRef<OverlayScrollbarsComponentRef>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const virtualHeaderRef = useRef<HTMLDivElement>(null);

  // Track when OverlayScrollbars is initialized
  const [scrollElementReady, setScrollElementReady] = useState(false);
  const [virtualScrollMargin, setVirtualScrollMargin] = useState(0);

  // Capture mode state
  const {
    isCaptureMode,
    hiddenMessageIds,
    selectedMessageIds,
    enterCaptureMode,
    hideMessage,
    showMessage,
    restoreMessages,
    isCapturing,
    handleSelectionClick,
    clearSelection,
    // Navigation state
    targetMessageUuid,
    targetRequestId,
    shouldHighlightTarget,
    clearTargetMessage,
    messageFilter,
    // SubAgent navigation
    parentSessionStack,
    // 메시지 로딩 상태 — 로딩 스피너 표시 조건
    isLoadingMessages,
    setActiveSessionNearBottom,
  } = useAppStore();

  const isInSubagent = parentSessionStack.length > 0;
  const hasParallelTasks = useMemo(
    () => getMessageUuidsByCategory(messages, "parallel-task").size > 0,
    [messages],
  );

  // Apply role + content type filters
  const displayMessages = useMemo(
    () => applyMessageDisplayFilter(messages, messageFilter),
    [messages, messageFilter],
  );
  useFilteredViewGuards({
    sessionId: selectedSession?.session_id,
    messageFilter,
    messages,
    displayMessages,
  });

  // Message pagination state + actions (store holds a chat-style window)
  const pagination = useAppStore((s) => s.pagination);
  const loadMoreMessages = useAppStore((s) => s.loadMoreMessages);
  const ensureMessageLoaded = useAppStore((s) => s.ensureMessageLoaded);
  const fetchFullSessionMessages = useAppStore((s) => s.fetchFullSessionMessages);

  // Export must cover the COMPLETE session even when only a window is
  // loaded — fetch the full message list and apply the same display filter.
  const resolveExportMessages = useCallback(async () => {
    if (!useAppStore.getState().pagination.hasMore) return displayMessages;
    const fullMessages = await fetchFullSessionMessages();
    return applyMessageDisplayFilter(fullMessages, messageFilter);
  }, [displayMessages, fetchFullSessionMessages, messageFilter]);

  // Export hook — uses role-filtered displayMessages
  const { isExporting, exportConversation } = useExport(
    displayMessages,
    selectedSession?.project_name ?? selectedSession?.session_id ?? "conversation",
    { includeSidechain: isInSubagent, resolveMessages: resolveExportMessages },
  );
  const handleExport = useCallback((format: ExportFormat) => {
    if (isExporting || displayMessages.length === 0) return;
    void exportConversation(format);
  }, [isExporting, displayMessages.length, exportConversation]);

  // Clear expand registry on session change
  const clearExpandStates = useExpandRegistry((s) => s.clearAll);
  useEffect(() => {
    clearExpandStates();
  }, [selectedSession?.session_id, clearExpandStates]);

  // Screenshot preview hook
  const {
    previewDataUrl,
    previewWidth,
    previewHeight,
    captureAndPreview,
    savePreview,
    discardPreview,
  } = useCapturePreview();
  const { setIsCapturing } = useAppStore();
  const offScreenRef = useRef<HTMLDivElement>(null);
  const [captureToast, setCaptureToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Search state management
  const {
    searchQuery,
    isSearchPending,
    handleSearchInput,
    handleClearSearch: handleClearSearchState,
  } = useSearchState({
    onSearchChange,
    sessionId: selectedSession?.session_id,
  });

  // 매치된 메시지 UUID Set (효율적인 조회용)
  const matchedUuids = useMemo(() => {
    return new Set(sessionSearch.matches?.map(m => m.messageUuid) || []);
  }, [sessionSearch.matches]);

  // 현재 매치 정보 (UUID와 메시지 내 인덱스)
  const currentMatch = useMemo(() => {
    if (sessionSearch.currentMatchIndex >= 0 && sessionSearch.matches?.length > 0) {
      const match = sessionSearch.matches[sessionSearch.currentMatchIndex];
      return match ? {
        messageUuid: match.messageUuid,
        matchIndex: match.matchIndex,
      } : null;
    }
    return null;
  }, [sessionSearch.currentMatchIndex, sessionSearch.matches]);

  const currentMatchUuid = currentMatch?.messageUuid ?? null;
  // ... (skip down to render loop)
  // We need to apply the highlight logic in the map function

  // ... inside map ...
  // const isMessage = item.type === "message";
  // const isMatch = isMessage && matchedUuids.has(item.message.uuid);
  // const isTarget = isMessage && shouldHighlightTarget && targetMessageUuid === item.message.uuid;
  // const isCurrentMatch = (isMessage && currentMatchUuid === item.message.uuid) || isTarget;


  // Deduplicate messages for grouping
  const uniqueMessages = useMemo(() => {
    if (displayMessages.length === 0) return [];
    return Array.from(
      new Map(displayMessages.map((msg) => [msg.uuid, msg])).values()
    );
  }, [displayMessages]);

  // Agent task grouping
  const agentTaskGroups = useMemo(() => {
    if (import.meta.env.DEV && uniqueMessages.length > 0) {
      const start = performance.now();
      const result = groupAgentTasks(uniqueMessages);
      console.log(`[MessageViewer] groupAgentTasks: ${uniqueMessages.length} messages, ${(performance.now() - start).toFixed(1)}ms`);
      return result;
    }
    return groupAgentTasks(uniqueMessages);
  }, [uniqueMessages]);

  // Pre-compute Set of all agent task member UUIDs for O(1) membership checks
  const agentTaskMemberUuids = useMemo(() => {
    const memberSet = new Set<string>();
    for (const group of agentTaskGroups.values()) {
      for (const uuid of group.messageUuids) {
        memberSet.add(uuid);
      }
    }
    return memberSet;
  }, [agentTaskGroups]);

  // Agent progress grouping (group agent_progress messages by agentId)
  const agentProgressGroups = useMemo(() => {
    return groupAgentProgressMessages(uniqueMessages);
  }, [uniqueMessages]);

  // Pre-compute Set of all agent progress member UUIDs for O(1) membership checks
  const agentProgressMemberUuids = useMemo(() => {
    const memberSet = new Set<string>();
    for (const group of agentProgressGroups.values()) {
      for (const uuid of group.messageUuids) {
        memberSet.add(uuid);
      }
    }
    return memberSet;
  }, [agentProgressGroups]);

  // Task operation grouping (group consecutive TaskCreate/TaskUpdate/etc. messages)
  const taskOperationGroups = useMemo(() => {
    return groupTaskOperations(uniqueMessages);
  }, [uniqueMessages]);

  // Pre-compute Set of all task operation member UUIDs for O(1) membership checks
  const taskOperationMemberUuids = useMemo(() => {
    const memberSet = new Set<string>();
    for (const group of taskOperationGroups.values()) {
      for (const uuid of group.messageUuids) {
        memberSet.add(uuid);
      }
    }
    return memberSet;
  }, [taskOperationGroups]);

  // Helper to get scroll element from OverlayScrollbars
  // Include scrollElementReady to force virtualizer update when ready
  const getScrollElement = useCallback(() => {
    return scrollContainerRef.current?.osInstance()?.elements().viewport ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollElementReady]);

  // OverlayScrollbars initialized callback (stable ref to avoid re-bindingclear)
  const handleScrollbarsInitialized = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log(`[MessageViewer] scrollElementReady via initialized event`);
    }
    setScrollElementReady(true);
  }, []);

  // Reserve a top scroll-margin equal to the sticky "all messages loaded"
  // header height so the first virtualized rows aren't hidden behind it as a
  // blank gap (#371).
  // Based on the loaded window, not the filtered rows: when the filter hides
  // every loaded message, "Load earlier" must stay reachable.
  const hasMessageListHeader = messages.length > 0 && !sessionSearch.query;
  const isFilteredWindowEmpty =
    messages.length > 0 && displayMessages.length === 0 && !sessionSearch.query;

  useEffect(() => {
    if (!hasMessageListHeader) {
      setVirtualScrollMargin(0);
      return;
    }

    const element = virtualHeaderRef.current;
    if (!element) {
      setVirtualScrollMargin(0);
      return;
    }

    const updateMargin = () => {
      setVirtualScrollMargin(Math.ceil(element.getBoundingClientRect().height));
    };

    updateMargin();

    if (!("ResizeObserver" in window)) {
      return;
    }

    const observer = new ResizeObserver(updateMargin);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMessageListHeader]);

  // Fallback: if OverlayScrollbars already initialized before event binding (e.g. fast mount)
  useEffect(() => {
    if (!scrollElementReady) {
      const element = scrollContainerRef.current?.osInstance()?.elements().viewport;
      if (element) {
        setScrollElementReady(true);
      }
    }
  }, [scrollElementReady, selectedSession?.session_id]);

  // Virtual scrolling
  const {
    virtualizer,
    flattenedMessages,
    uuidToIndexMap,
    virtualRows,
    totalSize,
    getScrollIndex,
    rowTranslateOffset,
  } = useMessageVirtualization({
    messages: displayMessages,
    agentTaskGroups,
    agentTaskMemberUuids,
    agentProgressGroups,
    agentProgressMemberUuids,
    taskOperationGroups,
    taskOperationMemberUuids,
    getScrollElement,
    hiddenMessageIds,
    isCaptureMode,
    // Inside a subagent session every row is `isSidechain` but rendered at full
    // height, so the height estimate must not collapse them to 0 (issue #334).
    isInSubagent: parentSessionStack.length > 0,
    scrollMargin: virtualScrollMargin,
  });

  // Set of selected message UUIDs for O(1) lookup
  const selectedSet = useMemo(
    () => new Set(selectedMessageIds),
    [selectedMessageIds],
  );

  // Ordered list of message UUIDs (for range selection)
  const orderedMessageUuids = useMemo(
    () =>
      flattenedMessages
        .filter(
          (item): item is Extract<typeof item, { type: "message" }> =>
            item.type === "message" &&
            !item.isGroupMember &&
            !item.isProgressGroupMember &&
            !item.isTaskOperationGroupMember,
        )
        .map((item) => item.message.uuid),
    [flattenedMessages],
  );

  // Stable selection handler (avoids creating new function per row in render loop)
  const handleRangeSelect = useCallback(
    (uuid: string, modifiers: { shift: boolean; cmdOrCtrl: boolean }) => {
      handleSelectionClick(uuid, orderedMessageUuids, modifiers);
    },
    [handleSelectionClick, orderedMessageUuids],
  );

  // Count selected visible messages (excluding hidden)
  const selectedVisibleCount = useMemo(() => {
    const hiddenSet = new Set(hiddenMessageIds);
    let count = 0;
    for (const uuid of selectedMessageIds) {
      if (!hiddenSet.has(uuid)) count++;
    }
    return count;
  }, [selectedMessageIds, hiddenMessageIds]);

  const hasSelection = selectedMessageIds.length > 0;

  const waitForCaptureAssets = useCallback(async (root: HTMLElement) => {
    const CAPTURE_ASSET_TIMEOUT_MS = 3000;
    const images = Array.from(root.querySelectorAll("img"));

    const imagePromises = images.map((img) => new Promise<void>((resolve) => {
      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve();
        return;
      }

      const done = () => {
        clearTimeout(timer);
        resolve();
      };

      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });

      // Never block capture indefinitely for broken/slow resources.
      const timer = setTimeout(() => {
        img.removeEventListener("load", done);
        img.removeEventListener("error", done);
        resolve();
      }, CAPTURE_ASSET_TIMEOUT_MS);
    }));

    const fontsPromise =
      "fonts" in document
        ? Promise.race([
            document.fonts?.ready ?? Promise.resolve(),
            new Promise<void>((resolve) => setTimeout(resolve, CAPTURE_ASSET_TIMEOUT_MS)),
          ])
        : Promise.resolve();

    await Promise.all([...imagePromises, fontsPromise]);
  }, []);

  // Screenshot handler — capture to preview modal
  const handleScreenshot = useCallback(async () => {
    if (!hasSelection || selectedVisibleCount === 0) {
      setCaptureToast({
        type: "error",
        message: t("captureMode.selectMessages"),
      });
      return;
    }
    if (selectedVisibleCount > MAX_CAPTURE_MESSAGES) {
      setCaptureToast({
        type: "error",
        message: t("captureMode.tooManyMessages", { max: MAX_CAPTURE_MESSAGES }),
      });
      return;
    }

    // 1. Mount the capture renderer
    setIsCapturing(true);
    try {
      // 2. Wait for React to render + browser to lay out the content
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      // 3. Capture the rendered element → open preview (no file save yet)
      const el = offScreenRef.current;
      if (!el) {
        setCaptureToast({ type: "error", message: t("captureMode.captureError") });
        return;
      }

      await waitForCaptureAssets(el);

      const result = await captureAndPreview(el, selectedSession?.session_id);
      if (!result.success && result.message) {
        setCaptureToast({ type: "error", message: result.message });
      }
    } catch {
      setCaptureToast({ type: "error", message: t("captureMode.captureError") });
    } finally {
      setIsCapturing(false);
    }
  }, [
    hasSelection,
    selectedVisibleCount,
    captureAndPreview,
    setIsCapturing,
    selectedSession?.session_id,
    t,
    waitForCaptureAssets,
  ]);

  // Save from preview modal
  const handlePreviewSave = useCallback(async () => {
    try {
      const result = await savePreview();
      if (result.message) {
        setCaptureToast({
          type: result.success ? "success" : "error",
          message: result.message,
        });
      }
    } catch {
      setCaptureToast({ type: "error", message: t("captureMode.captureError") });
    }
  }, [savePreview, t]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!captureToast) return;
    const timer = setTimeout(() => setCaptureToast(null), 3000);
    return () => clearTimeout(timer);
  }, [captureToast]);

  // Reading position: resume a revisited session where it was left, and
  // publish the first visible row (navigator scroll-spy, sticky prompt bar).
  const positionRestoringRef = useRef(false);
  const restoringUuid = usePositionRestore({
    sessionPath: selectedSession?.file_path ?? null,
    uuidToIndexMap,
    virtualizer,
    getScrollElement,
    scrollElementReady,
    targetMessageUuid,
    suppressAutoLoadRef: positionRestoringRef,
  });

  // Scroll navigation with virtualizer support
  const {
    showScrollToTop,
    showScrollToBottom,
    scrollToTop,
    scrollToBottom,
    scrollReadyForSessionId,
  } = useScrollNavigation({
    scrollContainerRef,
    currentMatchUuid,
    currentMatchIndex: sessionSearch.currentMatchIndex,
    messagesLength: flattenedMessages.length,
    selectedSessionId: selectedSession?.session_id,
    isLoading,
    virtualizer,
    getScrollIndex,
    scrollElementReady,
    targetMessageUuid: targetMessageUuid ?? restoringUuid,
    onNearBottomChange: setActiveSessionNearBottom,
    firstItemKey: messages[0]?.uuid ?? null,
  });

  useViewportAnchorPublisher({
    sessionPath: selectedSession?.file_path ?? null,
    displayMessages,
    flattenedMessages,
    virtualizer,
    getScrollElement,
    viewportKey: scrollReadyForSessionId,
  });

  // ─── Load-earlier (chat-style message pagination) ──────────────────────
  // The store holds only a window of the session; older pages are prepended
  // on demand. The anchor pins the first visible MESSAGE row: its uuid and
  // its on-screen offset are recorded before the load, and after the prepend
  // the viewport is scrolled so the same row sits at the same place. This is
  // robust against the virtualizer's estimate-vs-measured drift, which makes
  // a naive totalSize-delta compensation land far off.
  const prependAnchorRef = useRef<{ uuid: string; screenOffset: number } | null>(null);
  // True while a prepend restore is converging — suppresses the near-top
  // autoload so restore-induced scroll events cannot cascade page loads.
  const anchorRestoringRef = useRef(false);
  // uuid currently being ensured into the window (deep link / search match)
  const ensureInFlightRef = useRef<string | null>(null);

  const handleLoadEarlier = useCallback(() => {
    if (pagination.isLoadingMore || !pagination.hasMore) return;
    const viewport = getScrollElement();
    const scrollTop = viewport?.scrollTop ?? 0;
    const firstVisible = virtualizer
      .getVirtualItems()
      .find(
        (row) =>
          row.start + row.size > scrollTop &&
          flattenedMessages[row.index]?.type === "message",
      );
    const item = firstVisible ? flattenedMessages[firstVisible.index] : undefined;
    prependAnchorRef.current =
      firstVisible && item?.type === "message"
        ? {
            uuid: item.message.uuid,
            screenOffset: firstVisible.start - scrollTop,
          }
        : null;
    void loadMoreMessages();
  }, [pagination.isLoadingMore, pagination.hasMore, getScrollElement, virtualizer, flattenedMessages, loadMoreMessages]);

  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current;
    if (!anchor || pagination.isLoadingMore) return;
    prependAnchorRef.current = null;
    const viewport = getScrollElement();
    if (!viewport) return;

    // Multi-pass restore (same technique as the deep-link scroll): the rows
    // prepended above the anchor render with estimated heights first, so a
    // single-pass restore lands off once they measure. Re-anchoring after
    // each render pass converges on the true offset.
    const restore = () => {
      const newIndex = uuidToIndexMap.get(anchor.uuid);
      if (newIndex === undefined) return;
      const [newStart] = virtualizer.getOffsetForIndex(newIndex, "start") ?? [];
      if (typeof newStart !== "number") return;
      viewport.scrollTop = newStart - anchor.screenOffset;
    };

    anchorRestoringRef.current = true;
    restore();
    const passes = [
      setTimeout(restore, 50),
      setTimeout(restore, 200),
      setTimeout(() => {
        restore();
        anchorRestoringRef.current = false;
      }, 450),
    ];
    return () => {
      passes.forEach(clearTimeout);
      anchorRestoringRef.current = false;
    };
  }, [flattenedMessages, uuidToIndexMap, pagination.isLoadingMore, getScrollElement, virtualizer]);

  // Auto-load the previous page when the user scrolls near the top.
  // Guarded on scrollReadyForSessionId so the initial scroll-to-bottom pass
  // of a freshly opened session cannot trigger a spurious page load.
  useEffect(() => {
    if (!scrollElementReady) return;
    if (scrollReadyForSessionId !== selectedSession?.session_id) return;
    const viewport = getScrollElement();
    if (!viewport) return;

    const NEAR_TOP_AUTOLOAD_PX = 300;
    const handleScroll = () => {
      if (anchorRestoringRef.current || positionRestoringRef.current) return;
      if (viewport.scrollTop >= NEAR_TOP_AUTOLOAD_PX) return;
      const { pagination: p } = useAppStore.getState();
      if (!p.hasMore || p.isLoadingMore) return;
      handleLoadEarlier();
    };
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [scrollElementReady, scrollReadyForSessionId, selectedSession?.session_id, getScrollElement, handleLoadEarlier]);

  // Search-match navigation into an unloaded region: extend the window until
  // the match is present (scrollToHighlight re-fires via getScrollIndex once
  // the uuid map includes it).
  useEffect(() => {
    if (!currentMatchUuid || uuidToIndexMap.has(currentMatchUuid)) return;
    const p = useAppStore.getState().pagination;
    if (!p.hasMore || ensureInFlightRef.current) return;
    ensureInFlightRef.current = currentMatchUuid;
    void ensureMessageLoaded(currentMatchUuid).finally(() => {
      ensureInFlightRef.current = null;
    });
  }, [currentMatchUuid, uuidToIndexMap, ensureMessageLoaded]);

  // Handle Deep Linking / Scrolling to Target
  useEffect(() => {
    if (targetMessageUuid && scrollElementReady && flattenedMessages.length > 0) {
      // Find the index of the target message in the flattened list
      const index = flattenedMessages.findIndex(
        (item) => item.type === "message" && item.message.uuid === targetMessageUuid
      );

      if (index === -1) {
        // Loaded but not rendered (a display filter hides it): there is
        // nothing to scroll to, so drop the target instead of leaving it set
        // (it would hold off following new messages and pin highlights).
        if (messages.some((message) => message.uuid === targetMessageUuid)) {
          clearTargetMessage();
          return;
        }
        // Target may live in an unloaded older page — extend the window.
        // The effect re-runs when flattenedMessages grows and then scrolls.
        const p = useAppStore.getState().pagination;
        if (p.hasMore && !ensureInFlightRef.current) {
          const uuid = targetMessageUuid;
          ensureInFlightRef.current = uuid;
          void ensureMessageLoaded(uuid).then((found) => {
            ensureInFlightRef.current = null;
            if (!found) clearTargetMessage();
          });
        }
        return;
      }

      if (index !== -1) {
        // Multi-pass scroll to correct for height-estimate inaccuracy (#269).
        // `estimateMessageHeight` returns a fixed bucket per message type, but
        // real heights vary by 5-10x with code blocks, tool results, etc.
        // A single scrollToIndex on a far-off target lands at the estimate-based
        // offset and misses once the rows in between render and measure their
        // real heights. Re-issuing scrollToIndex after each render pass lets
        // TanStack Virtual recompute against the now-measured totals and
        // converge on the target.
        // The target lands just below the sticky prompt bar's strip.
        const initialPass = setTimeout(() => {
          scrollRowIntoTopView(virtualizer, getScrollElement(), index);
        }, 50);

        const correctionPass = setTimeout(() => {
          scrollRowIntoTopView(virtualizer, getScrollElement(), index);
        }, 200);

        const finalPass = setTimeout(() => {
          scrollRowIntoTopView(virtualizer, getScrollElement(), index, "smooth");
        }, 450);

        // Auto-clear the target after a few seconds so the highlight fades
        const clearTimer = setTimeout(() => {
          clearTargetMessage();
        }, 3000);

        return () => {
          clearTimeout(initialPass);
          clearTimeout(correctionPass);
          clearTimeout(finalPass);
          clearTimeout(clearTimer);
        };
      }
    }
    // targetRequestId: a repeated jump to the same message scrolls again.
  }, [targetMessageUuid, targetRequestId, scrollElementReady, flattenedMessages, messages, virtualizer, clearTargetMessage, ensureMessageLoaded, getScrollElement]);

  // The mounted transcript, for reading-mode layout switches (keep the
  // reader's place) and the gutters (forward the wheel).
  const flattenedRef = useRef(flattenedMessages);
  flattenedRef.current = flattenedMessages;
  const uuidToIndexRef = useRef(uuidToIndexMap);
  uuidToIndexRef.current = uuidToIndexMap;
  useEffect(
    () =>
      registerTranscript({
        getViewport: getScrollElement,
        captureRow: () => {
          const viewport = getScrollElement();
          if (!viewport) return null;
          return findFirstVisibleMessageRow(
            virtualizer.getVirtualItems(),
            flattenedRef.current,
            viewport.scrollTop
          );
        },
        scrollRowTo: (row) => {
          const viewport = getScrollElement();
          const index = uuidToIndexRef.current.get(row.uuid);
          if (!viewport || index === undefined) return;
          const [start] = virtualizer.getOffsetForIndex(index, "start") ?? [];
          if (typeof start === "number") viewport.scrollTop = start - row.offset;
        },
      }),
    [getScrollElement, virtualizer]
  );

  // Search resets for each session, so its overlay closes with the session.
  useEffect(() => {
    if (useAppStore.getState().revealed?.group === "top") concealPanel("top", "handle");
  }, [selectedSession?.session_id]);

  // While the tools overlay is open, jump and search targets land below it.
  const handleTopOverlayHeight = useCallback((height: number) => {
    setTopOverlayClearance(height);
  }, []);
  useEffect(() => () => setTopOverlayClearance(0), []);

  const hiddenMessageTypeCount = useMemo(
    () => countHiddenMessageTypes(messageFilter, hasParallelTasks),
    [messageFilter, hasParallelTasks]
  );
  const handleChipActivate = useCallback(
    (target: ChipTarget, event: React.MouseEvent<HTMLButtonElement>) => {
      revealPanel("top", sourceFromActivation(event, hoverReveal), { focus: target });
    },
    [hoverReveal]
  );

  // Capture mode replaces the capture button with its own toolbar: hand
  // focus to that toolbar instead of losing it (and close the tools overlay).
  const handleEnterCaptureMode = useCallback(() => {
    concealPanel("top", "handle");
    enterCaptureMode();
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-capture-toolbar] button")?.focus();
    });
  }, [enterCaptureMode]);

  // 검색어 초기화 핸들러
  const handleClearSearch = useCallback(() => {
    handleClearSearchState();
    onClearSearch();
    searchInputRef.current?.focus();
  }, [onClearSearch, handleClearSearchState]);

  // 키보드 단축키 핸들러
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        onPrevMatch?.();
      } else {
        onNextMatch?.();
      }
    } else if (e.key === "Escape") {
      // Clears and keeps focus; an empty field lets the press go on (it
      // then closes the reading-mode tools overlay).
      if (!searchQuery) return;
      e.preventDefault();
      handleClearSearch();
    }
  }, [onNextMatch, onPrevMatch, handleClearSearch, searchQuery]);

  // 로딩 중일 때 로딩 표시 (isLoadingMessages 기반 — scrollReady 의존 제거로 빈 세션 무한 스피너 방지)
  if ((isLoading || isLoadingMessages) && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <LoadingState
          isLoading={true}
          loadingMessage={t("messageViewer.loadingMessages")}
          spinnerSize="md"
          withSparkle={false}
        />
      </div>
    );
  }

  // 로딩 종료 후 메시지가 없으면 "No Messages" 표시 (위 L606 스피너 분기가 로딩을 먼저 처리).
  // isSessionTransitioning 의존 제거: scrollReadyForSessionId는 messagesLength>0 일 때만 세팅되어
  // 빈 세션에서 영구 true가 되는 회귀를 유발.
  if (messages.length === 0) {
    return (
      <LoadingState
        isLoading={false}
        isEmpty={true}
        className="flex-1 h-full"
        emptyComponent={
          <div className="flex flex-col items-center justify-center text-muted-foreground h-full">
            <div className="mb-4">
              <MessageCircle className="w-16 h-16 mx-auto text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium mb-2 text-foreground">
              {t("messageViewer.noMessages")}
            </h3>
            <p className="text-sm text-center whitespace-pre-line">
              {t("messageViewer.noMessagesDescription")}
            </p>
          </div>
        }
      />
    );
  }

  const chips = (
    <TopStripChips
      query={sessionSearch.query}
      matchPosition={sessionSearch.matches?.length ? sessionSearch.currentMatchIndex + 1 : 0}
      matchCount={sessionSearch.matches?.length ?? 0}
      onPrevMatch={() => onPrevMatch?.()}
      onNextMatch={() => onNextMatch?.()}
      isDialogue={messageFilter.dialogue}
      hiddenTypeCount={hiddenMessageTypeCount}
      onActivate={handleChipActivate}
    />
  );

  return (
    <div className="relative flex-1 h-full flex flex-col overflow-clip">
      <AutoHideRegion
        group="top"
        mode={topMode}
        label={t("readingMode.group.top")}
        shortcut={panelShortcut("top")}
        chips={chips}
        onOverlayHeightChange={handleTopOverlayHeight}
      >
      {/* Search Toolbar - Editorial aesthetic */}
      <div
        role="search"
        className={cn(
          "flex items-center gap-2 lg:gap-3 px-3 lg:px-4 py-2 lg:py-2.5 border-b sticky top-0 z-10",
          "flex-wrap",
          "bg-card/95 backdrop-blur-sm border-border"
        )}
      >
        {onOpenBoard && <SessionBoardButton onClick={onOpenBoard} />}

        {/* Filter Toggle - Segmented control style */}
        <div className="shrink-0 flex items-center bg-muted/60 rounded-lg p-0.5 border border-border/60 order-2 lg:order-none">
          <button
            type="button"
            onClick={() => onFilterTypeChange("content")}
            className={cn(
              "text-xs px-2.5 py-1 rounded-md transition-all duration-200 whitespace-nowrap",
              sessionSearch.filterType === "content"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={t("messageViewer.filterType")}
          >
            {t("messageViewer.filterContent")}
          </button>
          <button
            type="button"
            onClick={() => onFilterTypeChange("toolId")}
            className={cn(
              "text-xs px-2.5 py-1 rounded-md transition-all duration-200 whitespace-nowrap",
              sessionSearch.filterType === "toolId"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={t("messageViewer.filterType")}
          >
            {t("messageViewer.filterToolId")}
          </button>
        </div>

        {/* Search Input - Glass morphism */}
        <div className="relative flex-1 group order-1 lg:order-none w-full lg:w-auto">
          <Search className={cn(
            "absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4",
            "text-muted-foreground group-focus-within:text-foreground transition-colors"
          )} />
          <input
            ref={searchInputRef}
            {...{ [PANEL_FOCUS_ATTR]: "search" }}
            type="text"
            value={searchQuery}
            onChange={handleSearchInput}
            onKeyDown={handleSearchKeyDown}
            placeholder={t("messageViewer.searchPlaceholder")}
            aria-label={t("messageViewer.searchPlaceholder")}
            className={cn(
              "w-full pl-9 pr-9 py-2 rounded-lg text-sm",
              "bg-muted/50 border border-border/60",
              "text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring/70",
              "transition-all duration-200"
            )}
          />
          {searchQuery && (
            isSearchPending ? (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <LoadingSpinner size="xs" variant="muted" />
              </div>
            ) : (
              <button
                type="button"
                onClick={handleClearSearch}
                aria-label={t("messageViewer.clearSearch")}
                className={cn(
                  "absolute right-2.5 top-1/2 transform -translate-y-1/2",
                  "p-1 rounded-md text-muted-foreground",
                  "hover:bg-muted hover:text-foreground",
                  "transition-all duration-150"
                )}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>

        {/* Match Navigation - Enhanced touch targets */}
        {sessionSearch.query && sessionSearch.matches && sessionSearch.matches.length > 0 && (
          <div className="shrink-0 flex items-center gap-1.5 order-3 lg:order-none">
            <span className="whitespace-nowrap text-xs font-mono tabular-nums text-foreground bg-muted px-2 py-1 rounded-md border border-border/60">
              {sessionSearch.currentMatchIndex + 1}/{sessionSearch.matches.length}
            </span>
            <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5 border border-border/60">
              <button
                type="button"
                onClick={onPrevMatch}
                disabled={sessionSearch.matches.length === 0}
                aria-label={t("messageViewer.prevMatch")}
                title="Shift+Enter"
                className={cn(
                  "p-1.5 rounded-md transition-all duration-150",
                  "text-muted-foreground hover:text-foreground hover:bg-muted",
                  "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                )}
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onNextMatch}
                disabled={sessionSearch.matches.length === 0}
                aria-label={t("messageViewer.nextMatch")}
                title="Enter"
                className={cn(
                  "p-1.5 rounded-md transition-all duration-150",
                  "text-muted-foreground hover:text-foreground hover:bg-muted",
                  "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                )}
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Capture & Export Buttons */}
        {!isCaptureMode && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleEnterCaptureMode}
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg whitespace-nowrap",
                "transition-all duration-200",
                "bg-muted/60 hover:bg-muted",
                "text-foreground/80 hover:text-foreground",
                "border border-border/60 hover:border-border",
                "shadow-sm hover:shadow-md"
              )}
              title={t("captureMode.tooltip")}
              aria-label={t("captureMode.enter")}
            >
              <Camera className="w-3.5 h-3.5" />
              <span className="hidden lg:inline font-medium">{t("captureMode.enter")}</span>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={isExporting || displayMessages.length === 0}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg whitespace-nowrap",
                    "transition-all duration-200",
                    "bg-muted/60 hover:bg-muted",
                    "text-foreground/80 hover:text-foreground",
                    "border border-border/60 hover:border-border",
                    "shadow-sm hover:shadow-md",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                  title={t("session.export.button")}
                  aria-label={t("session.export.button")}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline font-medium">
                    {isExporting ? t("session.export.exporting") : t("session.export.button")}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("markdown")}>
                  {t("session.export.markdown")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("json")}>
                  {t("session.export.json")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("html")}>
                  {t("session.export.html")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {isReadingMode && <PinToggle group="top" />}
      </div>

      {/* Filter Toolbar */}
      {!isCaptureMode && messages.length > 0 && (
        <FilterToolbar
          totalCount={messages.length}
          filteredCount={displayMessages.length}
          hasParallelTasks={hasParallelTasks}
        />
      )}
      </AutoHideRegion>
      {!isCaptureMode && sessionSearch.query && sessionSearch.hiddenMatchCount > 0 && (
        <FilterHiddenNotice
          variant="searchMatches"
          hiddenCount={sessionSearch.hiddenMatchCount}
          className="px-4 py-1.5 border-b border-border/50 bg-muted/30"
        />
      )}

      {/* Capture Mode Toolbar */}
      {isCaptureMode && (
        <CaptureModeToolbar
          selectedCount={selectedVisibleCount}
          hasSelection={hasSelection}
          onScreenshot={handleScreenshot}
          onClearSelection={clearSelection}
        />
      )}

      {/* SubAgent: context bar (back, label, previous/next sibling) */}
      <SubagentContextBar />

      <div className="relative flex-1 min-h-0" data-transcript-area="">
        {/* Current prompt while reading inside a long turn */}
        {flattenedMessages.length > 0 && scrollElementReady && (
          <StickyPromptBar messages={displayMessages} />
        )}

        {/* Floating date overlay — outside scroll container to stay fixed */}
        {flattenedMessages.length > 0 && scrollElementReady && (
          <FloatingDateOverlay
            virtualRows={virtualRows}
            flattenedMessages={flattenedMessages}
          />
        )}

        <OverlayScrollbarsComponent
          ref={scrollContainerRef}
          className="h-full"
          options={{
            scrollbars: { theme: "os-theme-custom", autoHide: "leave", autoHideDelay: 400 },
          }}
          events={{ initialized: handleScrollbarsInitialized }}
        >
        {/* 디버깅 정보 */}
        {import.meta.env.DEV && (
          <div className="bg-muted/60 p-2 text-xs text-foreground border-b border-border space-y-1">
            <div>
              {t("messageViewer.debugInfo.messages", {
                current: displayMessages.length,
                total: messages.length,
              })}{" "}
              |{" "}
              {t("messageViewer.debugInfo.search", {
                query:
                  sessionSearch.query ||
                  t("messageViewer.debugInfo.noSearch", { defaultValue: "(none)" }),
              })}
            </div>
            <div>
              {t("messageViewer.debugInfo.session", {
                sessionId: selectedSession?.session_id?.slice(-8),
              })}{" "}
              |{" "}
              {t("messageViewer.debugInfo.file", {
                fileName: selectedSession?.file_path
                  ?.split(/[\\/]/)
                  .pop()
                  ?.slice(0, 20),
              })}
            </div>
            <div>
              {t("messageViewer.debugInfo.virtual", {
                flat: flattenedMessages.length,
                rows: virtualRows.length,
                size: totalSize,
                ready: scrollElementReady
                  ? t("messageViewer.debugInfo.yes", { defaultValue: "Y" })
                  : t("messageViewer.debugInfo.no", { defaultValue: "N" }),
              })}
            </div>
            <div>
              {t("messageViewer.debugInfo.overlay", {
                scrollReady:
                  scrollReadyForSessionId?.slice(-8) ??
                  t("messageViewer.debugInfo.null", { defaultValue: "null" }),
                current:
                  selectedSession?.session_id?.slice(-8) ??
                  t("messageViewer.debugInfo.null", { defaultValue: "null" }),
                show:
                  selectedSession?.session_id && scrollReadyForSessionId !== selectedSession?.session_id
                    ? t("messageViewer.debugInfo.yes", { defaultValue: "Y" })
                    : t("messageViewer.debugInfo.no", { defaultValue: "N" }),
              })}
            </div>
          </div>
        )}
        {/* 검색 결과 없음 */}
        {sessionSearch.query && (!sessionSearch.matches || sessionSearch.matches.length === 0) && !sessionSearch.isSearching && (
          <div className="max-w-4xl mx-auto flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="w-12 h-12 mb-4 text-muted-foreground/50" />
            <p className="text-lg font-medium mb-2 text-foreground">
              {t("messageViewer.noSearchResults")}
            </p>
            <p className="text-sm">
              {t("messageViewer.tryDifferentKeyword")}
            </p>
          </div>
        )}

        {/* 메시지 목록 헤더 — 이전 페이지 로드 버튼 또는 완료 안내 */}
        {hasMessageListHeader && (
          <div
            ref={virtualHeaderRef}
            className="max-w-4xl mx-auto flex items-center justify-center py-4"
          >
            {pagination.hasMore ? (
              <button
                type="button"
                onClick={handleLoadEarlier}
                disabled={pagination.isLoadingMore}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md",
                  "text-muted-foreground bg-muted/50 hover:bg-muted transition-colors",
                  "disabled:opacity-60 disabled:cursor-default",
                )}
                aria-label={t("messageViewer.loadMoreMessages", {
                  count: Math.min(
                    pagination.pageSize || messages.length,
                    Math.max(pagination.totalCount - pagination.currentOffset, 0),
                  ),
                  current: messages.length,
                  total: pagination.totalCount,
                })}
              >
                {pagination.isLoadingMore && (
                  <LoadingSpinner size="sm" variant="muted" />
                )}
                {t("messageViewer.loadMoreMessages", {
                  count: Math.min(
                    pagination.pageSize || messages.length,
                    Math.max(pagination.totalCount - pagination.currentOffset, 0),
                  ),
                  current: messages.length,
                  total: pagination.totalCount,
                })}
              </button>
            ) : (
              <div className="text-sm text-muted-foreground">
                {t("messageViewer.allMessagesLoaded", {
                  count: messages.length,
                })}
              </div>
            )}
          </div>
        )}

        {isFilteredWindowEmpty && !pagination.isLoadingMore && (
          <FilterHiddenNotice variant="emptyWindow" className="max-w-4xl mx-auto pb-6" />
        )}

        {/* 스크롤 준비 중 로딩 오버레이 */}
        {flattenedMessages.length > 0 && scrollElementReady &&
          scrollReadyForSessionId !== selectedSession?.session_id && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <LoadingSpinner size="sm" variant="muted" />
            </div>
          )}

        {/* 가상화된 메시지 렌더링 */}
        {flattenedMessages.length > 0 && scrollElementReady && (
          <div
            style={{
              height: totalSize,
              width: "100%",
              position: "relative",
              // 스크롤 준비 완료 전까지 투명하게 처리하여 점프 현상 방지
              opacity: scrollReadyForSessionId === selectedSession?.session_id ? 1 : 0,
              transition: "opacity 50ms ease-in",
            }}
          >
            {virtualRows.map((virtualRow) => {
              const item = flattenedMessages[virtualRow.index];
              if (!item) return null;

              // Hidden placeholders don't have search match info
              const isMessage = item.type === "message";
              const isMatch = isMessage && matchedUuids.has(item.message.uuid);

              const isTarget = isMessage && shouldHighlightTarget && targetMessageUuid === item.message.uuid;
              const isCurrentMatch = (isMessage && currentMatchUuid === item.message.uuid) || isTarget;

              const messageMatchIndex = (isMessage && currentMatchUuid === item.message.uuid) ? currentMatch?.matchIndex : undefined;

              const itemIsSelected = isMessage && selectedSet.has(item.message.uuid);

              return (
                <VirtualizedMessageRow
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  virtualRow={virtualRow}
                  item={item}
                  translateOffset={rowTranslateOffset}
                  isMatch={isMatch}
                  isCurrentMatch={isCurrentMatch}
                  searchQuery={sessionSearch.query}
                  filterType={sessionSearch.filterType}
                  currentMatchIndex={messageMatchIndex}
                  isCaptureMode={isCaptureMode}
                  onHideMessage={hideMessage}
                  onRestoreOne={showMessage}
                  onRestoreAll={restoreMessages}
                  isSelected={itemIsSelected}
                  onRangeSelect={isCaptureMode ? handleRangeSelect : undefined}
                  isInSubagent={isInSubagent}
                />
              );
            })}
          </div>
        )}

        </OverlayScrollbarsComponent>

        {/* Floating scroll buttons — bottom-right of message area */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-30">
          {/* Scroll to top */}
          {showScrollToTop && (
            <button
              type="button"
              onClick={scrollToTop}
              className={cn(
                "p-3 rounded-full shadow-lg transition-all duration-300",
                "bg-accent/60 hover:bg-accent text-accent-foreground",
                "hover:scale-110 focus:outline-none focus:ring-4 focus:ring-accent/30"
              )}
              title={t("messageViewer.scrollToTop")}
              aria-label={t("messageViewer.scrollToTop")}
            >
              <ChevronUp className="w-3 h-3" />
            </button>
          )}
          {/* Scroll to bottom */}
          {showScrollToBottom && (
            <button
              type="button"
              onClick={scrollToBottom}
              className={cn(
                "p-3 rounded-full shadow-lg transition-all duration-300",
                "bg-accent/60 hover:bg-accent text-accent-foreground",
                "hover:scale-110 focus:outline-none focus:ring-4 focus:ring-accent/30"
              )}
              title={t("messageViewer.scrollToBottom")}
              aria-label={t("messageViewer.scrollToBottom")}
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Capture renderer — only mounted during active capture */}
      {isCapturing && hasSelection && (
        <OffScreenCaptureRenderer
          ref={offScreenRef}
          flattenedMessages={flattenedMessages}
          selectedMessageIds={selectedMessageIds}
          hiddenMessageIds={hiddenMessageIds}
        />
      )}

      {/* Screenshot preview modal */}
      {previewDataUrl && (
        <ScreenshotPreviewModal
          dataUrl={previewDataUrl}
          width={previewWidth}
          height={previewHeight}
          onSave={handlePreviewSave}
          onClose={discardPreview}
        />
      )}

      {/* Capture toast notification */}
      {captureToast && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
            "px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium",
            "animate-in fade-in slide-in-from-bottom-2 duration-200",
            captureToast.type === "success"
              ? "bg-success text-success-foreground"
              : "bg-destructive text-destructive-foreground"
          )}
        >
          {captureToast.message}
        </div>
      )}
    </div>
  );
};
