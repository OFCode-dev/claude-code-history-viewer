import React, { useRef, useCallback, useState, useMemo, useEffect } from "react";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { EyeOff, ListTree, Search, X, PanelRightClose, PanelRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClaudeMessage } from "../../types";
import { useAppStore } from "../../store/useAppStore";
import { useViewportAnchorStore } from "../../store/viewportAnchorStore";
import { isHumanPrompt } from "../../utils/userMessageKind";
import {
  filterMessagesByCategory,
  getMessageUuidsByCategory,
} from "../MessageViewer/helpers";
import { NavigatorEntry } from "./NavigatorEntry";
import { NavigatorModeToggle } from "./NavigatorModeToggle";
import { NavigatorPromptRow } from "./NavigatorPromptRow";
import { buildPromptEntries, buildPromptListRows, type PromptListRow } from "./promptEntries";
import { useNavigatorEntries } from "./useNavigatorEntries";
import { PromptSeekButtons } from "../PromptSeek/PromptSeekButtons";

// Height estimation constants for virtual scrolling
const ESTIMATED_CHARS_PER_LINE = 40; // Conservative estimate for small text
const BASE_ENTRY_HEIGHT = 34; // py-2 (16px) + header row (~16px) + mb-0.5 (2px)
const PREVIEW_LINE_HEIGHT = 20; // Approximate height of one text line with line-height
const PROMPT_ROW_BASE_HEIGHT = 50; // padding + header row + steps line
const PROMPT_PREVIEW_LINE_HEIGHT = 17;
const SPAWN_ROW_HEIGHT = 24;

/**
 * After the user scrolls the list or moves through it with the keyboard,
 * scroll-spy leaves it alone for this long.
 */
const USER_SCROLL_GRACE_MS = 1500;

interface MessageNavigatorProps {
  messages: ClaudeMessage[];
  width?: number;
  isResizing: boolean;
  /** Omitted where the panel cannot be resized (the reading-mode overlay). */
  onResizeStart?: (e: React.MouseEvent<HTMLElement>) => void;
  isCollapsed: boolean;
  /** Omitted in reading mode, which has no rail. */
  onToggleCollapse?: () => void;
  /** Reading mode: the pin toggle, at the end of the header. */
  headerAccessory?: React.ReactNode;
  /**
   * Previous / next prompt buttons beside the panel toggle (under it on the
   * rail). Off where another toggle carries them (the reading-mode gutter)
   * or where there is none (the mobile sheet).
   */
  showPromptSeek?: boolean;
  asideId?: string;
}

function estimatePreviewLines(text: string): number {
  return Math.min(2, Math.max(1, Math.ceil(text.length / ESTIMATED_CHARS_PER_LINE)));
}

export const MessageNavigator: React.FC<MessageNavigatorProps> = ({
  messages,
  width,
  isResizing,
  onResizeStart,
  isCollapsed,
  onToggleCollapse,
  headerAccessory,
  showPromptSeek = false,
  asideId = "message-navigator",
}) => {
  const { t } = useTranslation();
  const keyboardHelpId = `${asideId}-keyboard-help`;
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const isPointerInsideRef = useRef(false);
  const lastUserScrollAtRef = useRef(0);
  const lastListKeyAtRef = useRef(Number.NEGATIVE_INFINITY);
  const [filterText, setFilterText] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);

  const navigateToMessage = useAppStore((s) => s.navigateToMessage);
  const targetMessageUuid = useAppStore((s) => s.targetMessageUuid);
  const showParallelTasksInNavigator = useAppStore((s) => s.showParallelTasksInNavigator);
  const toggleShowParallelTasksInNavigator = useAppStore(
    (s) => s.toggleShowParallelTasksInNavigator
  );
  const navigatorMode = useAppStore((s) => s.navigatorMode);
  const setNavigatorMode = useAppStore((s) => s.setNavigatorMode);
  // Turn numbers are only absolute when the loaded window starts at the
  // beginning of the session; otherwise they are omitted.
  const isWindowComplete = useAppStore((s) => !s.pagination.hasMore);
  const selectedSessionPath = useAppStore((s) => s.selectedSession?.file_path ?? null);
  const isInSubagent = useAppStore((s) => (s.parentSessionStack?.length ?? 0) > 0);
  const isMessageFilterActive = useAppStore((s) => s.isMessageFilterActive());
  const resetMessageFilter = useAppStore((s) => s.resetMessageFilter);
  const loadMoreMessages = useAppStore((s) => s.loadMoreMessages);
  const isLoadingOlder = useAppStore((s) => s.pagination.isLoadingMore);

  const isPromptsMode = navigatorMode !== "all";
  // Scroll-spy: the turn (Prompts) or the row (All) at the top of the conversation.
  const spyUuid = useViewportAnchorStore((s) =>
    isPromptsMode ? s.activePromptUuid : s.anchorUuid
  );
  // The list the conversation renders (after its display filters). Prompt and
  // subagent rows are built from it, so each row has a row to scroll to even
  // when a filter hides tool calls or user messages. Changes with the list,
  // not with the scroll position.
  const promptTrack = useViewportAnchorStore((s) => s.promptTrack);
  const renderedMessages =
    promptTrack && promptTrack.sessionPath === selectedSessionPath
      ? promptTrack.messages
      : messages;

  const hasParallelTasks = useMemo(
    () => getMessageUuidsByCategory(messages, "parallel-task").size > 0,
    [messages],
  );

  // All mode: every non-noise record the conversation renders (optionally
  // without parallel tasks), so each row has a row to scroll to.
  const navigatorMessages = useMemo(
    () => filterMessagesByCategory(
      renderedMessages,
      "parallel-task",
      showParallelTasksInNavigator,
    ),
    [renderedMessages, showParallelTasksInNavigator],
  );
  const allEntries = useNavigatorEntries(navigatorMessages);

  const entries = useMemo(() => {
    const lower = filterText.trim().toLowerCase();
    if (!lower) return allEntries;
    return allEntries.filter(
      (e) =>
        e.preview.toLowerCase().includes(lower) ||
        e.role.toLowerCase().includes(lower)
    );
  }, [allEntries, filterText]);

  // Prompts mode: human prompts with their spawned subagents
  const promptEntries = useMemo(
    () =>
      buildPromptEntries(
        filterMessagesByCategory(
          renderedMessages,
          "parallel-task",
          showParallelTasksInNavigator,
        ),
      ),
    [renderedMessages, showParallelTasksInNavigator],
  );
  const promptRows = useMemo(
    () => buildPromptListRows(promptEntries, filterText),
    [promptEntries, filterText]
  );
  // The session has prompts, but the conversation's display filter (e.g.
  // User unchecked) hides all of them.
  const promptsHiddenByFilter = useMemo(
    () =>
      isPromptsMode &&
      isMessageFilterActive &&
      promptEntries.length === 0 &&
      messages.some(isHumanPrompt),
    [isPromptsMode, isMessageFilterActive, promptEntries.length, messages]
  );

  const rowCount = isPromptsMode ? promptRows.length : entries.length;
  const rowKey = useCallback(
    (index: number): string =>
      (isPromptsMode ? promptRows[index]?.key : entries[index]?.uuid) ?? String(index),
    [isPromptsMode, promptRows, entries]
  );

  const estimateSize = useCallback((index: number) => {
    if (isPromptsMode) {
      const row = promptRows[index];
      if (!row) return PROMPT_ROW_BASE_HEIGHT;
      if (row.kind === "spawn") return SPAWN_ROW_HEIGHT;
      return (
        PROMPT_ROW_BASE_HEIGHT +
        estimatePreviewLines(row.entry.preview) * PROMPT_PREVIEW_LINE_HEIGHT
      );
    }
    const entry = entries[index];
    if (!entry) return 60;
    return BASE_ENTRY_HEIGHT + estimatePreviewLines(entry.preview ?? "") * PREVIEW_LINE_HEIGHT;
  }, [isPromptsMode, promptRows, entries]);

  // Always render the roving tab stop, even when it is scrolled far out of
  // view (scroll-spy moving the list, Alt+Arrow jumps from a focused row):
  // unmounting the focused option would drop focus to <body>, and Tab would
  // skip the list when its only tabIndex=0 row is gone.
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      if (focusedIndex >= rowCount || indexes.includes(focusedIndex)) return indexes;
      return [...indexes, focusedIndex].sort((a, b) => a - b);
    },
    [focusedIndex, rowCount]
  );

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElementRef.current,
    estimateSize,
    getItemKey: rowKey,
    overscan: 5,
    rangeExtractor,
  });

  const activeIndex = useMemo(() => {
    if (isPromptsMode) {
      if (!spyUuid) return -1;
      return promptRows.findIndex(
        (row) => row.kind === "prompt" && row.entry.uuid === spyUuid
      );
    }
    const activeUuid = targetMessageUuid ?? spyUuid;
    return activeUuid ? entries.findIndex((entry) => entry.uuid === activeUuid) : -1;
  }, [isPromptsMode, promptRows, entries, spyUuid, targetMessageUuid]);

  const activateRow = useCallback(
    (index: number) => {
      if (isPromptsMode) {
        const row = promptRows[index];
        if (!row) return;
        navigateToMessage(row.kind === "spawn" ? row.spawn.messageUuid : row.entry.uuid);
        return;
      }
      const entry = entries[index];
      if (entry) navigateToMessage(entry.uuid);
    },
    [isPromptsMode, promptRows, entries, navigateToMessage]
  );

  const handleEntryClick = useCallback(
    (uuid: string) => {
      navigateToMessage(uuid);
    },
    [navigateToMessage]
  );

  const handlePromptRowActivate = useCallback(
    (row: PromptListRow) => {
      navigateToMessage(row.kind === "spawn" ? row.spawn.messageUuid : row.entry.uuid);
    },
    [navigateToMessage]
  );

  const isListFocused = useCallback(
    () => scrollElementRef.current?.contains(document.activeElement) ?? false,
    []
  );

  // Focus alone does not count: a clicked row keeps focus while the reader
  // goes on scrolling the conversation, and the list must still follow.
  const isUserInteracting = useCallback(() => {
    const now = performance.now();
    return (
      isPointerInsideRef.current ||
      now - lastUserScrollAtRef.current < USER_SCROLL_GRACE_MS ||
      now - lastListKeyAtRef.current < USER_SCROLL_GRACE_MS
    );
  }, []);

  // Keep the roving tab stop on the active row unless the user is moving
  // through the list with the keyboard.
  useEffect(() => {
    if (rowCount === 0) {
      setFocusedIndex(0);
      return;
    }
    if (activeIndex >= 0 && !isListFocused()) {
      setFocusedIndex(activeIndex);
      return;
    }
    setFocusedIndex((prev) => Math.max(0, Math.min(prev, rowCount - 1)));
  }, [rowCount, activeIndex, isListFocused]);

  // Scroll-spy: keep the active row in view, without fighting the user.
  useEffect(() => {
    if (activeIndex < 0 || isUserInteracting()) return;
    virtualizer.scrollToIndex(activeIndex, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow the active row only
  }, [activeIndex, isPromptsMode]);

  const focusRowAt = useCallback((index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, rowCount - 1));
    setFocusedIndex(clampedIndex);
    virtualizer.scrollToIndex(clampedIndex, { align: "auto" });

    const key = rowKey(clampedIndex);
    requestAnimationFrame(() => {
      rowRefs.current.get(key)?.focus();
    });
  }, [rowCount, rowKey, virtualizer]);

  const handleRowKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    // Alt+Arrow belongs to the global previous/next prompt shortcut.
    if (rowCount === 0 || event.altKey) return;
    lastListKeyAtRef.current = performance.now();

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusRowAt(focusedIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusRowAt(focusedIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        focusRowAt(0);
        break;
      case "End":
        event.preventDefault();
        focusRowAt(rowCount - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        activateRow(focusedIndex);
        break;
      default:
        break;
    }
  }, [rowCount, focusRowAt, focusedIndex, activateRow]);

  const registerRowRef = useCallback((key: string, element: HTMLButtonElement | null) => {
    if (element) {
      rowRefs.current.set(key, element);
    } else {
      rowRefs.current.delete(key);
    }
  }, []);

  const noteUserScroll = useCallback(() => {
    lastUserScrollAtRef.current = performance.now();
  }, []);

  // Get virtual items
  const virtualItems = virtualizer.getVirtualItems();

  const promptCountLabel = t("navigator.promptCount", { count: promptEntries.length });

  // Collapsed view
  if (isCollapsed) {
    return (
      <aside
        id={asideId}
        role="complementary"
        aria-label={t("navigator.title")}
        tabIndex={-1}
        className={cn(
          "flex-shrink-0 bg-sidebar border-l border-border/50 flex h-full",
          isResizing && "select-none"
        )}
        style={{ width: "48px" }}
      >
        <div className="flex-1 flex flex-col items-center py-3 gap-2 relative">
          {/* Left accent border */}
          <div className="absolute left-0 inset-y-0 w-[2px] bg-gradient-to-b from-accent/40 via-accent/60 to-accent/40" />

          {/* Expand Button */}
          <button
            onClick={onToggleCollapse}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              "bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
            )}
            title={t("navigator.toggle")}
            aria-label={t("navigator.toggle")}
          >
            <PanelRight className="w-4 h-4" />
          </button>

          {showPromptSeek && <PromptSeekButtons variant="rail" />}

          <div className="w-6 h-px bg-accent/20" />

          {/* Prompt count */}
          <div className="flex flex-col items-center gap-1" title={promptCountLabel}>
            <ListTree aria-hidden className="w-4 h-4 text-muted-foreground" />
            <span aria-hidden className="text-2xs font-mono text-muted-foreground">
              {promptEntries.length}
            </span>
            <span className="sr-only">{promptCountLabel}</span>
          </div>
        </div>
      </aside>
    );
  }

  const listLabel = isPromptsMode ? t("navigator.mode.prompts") : t("navigator.title");
  const visibleCount = isPromptsMode
    ? promptRows.reduce((count, row) => (row.kind === "prompt" ? count + 1 : count), 0)
    : entries.length;
  const emptyLabel = promptsHiddenByFilter
    ? t("navigator.promptsHidden")
    : filterText
      ? t("messageViewer.noSearchResults")
      : isPromptsMode
        ? isWindowComplete
          ? t("navigator.noPrompts")
          : t("navigator.noPromptsLoaded")
        : t("navigator.noMessages");
  // Long sessions load newest-first: the prompts may simply be on older pages.
  const canLoadOlderForPrompts =
    isPromptsMode && !promptsHiddenByFilter && !filterText && !isWindowComplete;

  // Expanded view
  return (
    <aside
      id={asideId}
      role="complementary"
      aria-label={t("navigator.title")}
      aria-describedby={keyboardHelpId}
      tabIndex={-1}
      className={cn(
        "relative flex flex-col bg-sidebar border-l border-border/50 h-full",
        isResizing && "select-none",
        width == null && "w-full"
      )}
      style={width != null ? { width, minWidth: width, maxWidth: width } : undefined}
    >
      {/* Resize handle (left edge) */}
      {onResizeStart && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 z-10"
          onMouseDown={onResizeStart}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 shrink-0">
        <ListTree aria-hidden className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <NavigatorModeToggle
          mode={isPromptsMode ? "prompts" : "all"}
          onChange={setNavigatorMode}
          inSubagent={isInSubagent}
        />
        <span
          className="ml-auto text-2xs text-muted-foreground tabular-nums"
          title={isPromptsMode ? promptCountLabel : undefined}
        >
          {visibleCount}
        </span>
        {hasParallelTasks && (
          <button
            onClick={toggleShowParallelTasksInNavigator}
            className={cn(
              "p-0.5 rounded transition-colors",
              showParallelTasksInNavigator
                ? "bg-tool-task/20 text-tool-task"
                : "hover:bg-accent/10 text-muted-foreground hover:text-foreground"
            )}
            aria-label={t("navigator.showParallelTasks")}
            aria-pressed={showParallelTasksInNavigator}
            title={t("navigator.showParallelTasks")}
          >
            <Zap className="w-3.5 h-3.5" />
          </button>
        )}
        {showPromptSeek && <PromptSeekButtons variant="header" />}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-0.5 rounded hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("navigator.toggle")}
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        )}
        {headerAccessory}
      </div>

      {/* Filter input */}
      <div className="px-2 py-1.5 border-b border-border/30 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            onKeyDown={(e) => {
              // Esc clears a filter; an empty one lets the press go on
              // (to close the reading-mode overlay, for one).
              if (e.key !== "Escape" || !filterText) return;
              e.preventDefault();
              setFilterText("");
            }}
            placeholder={isPromptsMode ? t("navigator.filterPrompts") : t("navigator.filter")}
            aria-label={isPromptsMode ? t("navigator.filterPrompts") : t("navigator.filter")}
            className="w-full pl-6 pr-2 py-1 text-xs bg-muted/30 border border-border/30 rounded focus:outline-none focus:ring-1 focus:ring-accent/40 placeholder:text-muted-foreground/40"
          />
          {filterText && (
            <button
              onClick={() => setFilterText("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent/10"
              aria-label={t("common.cancel")}
            >
              <X className="w-2.5 h-2.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Entry list with virtual scrolling */}
      {rowCount === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4">
          {promptsHiddenByFilter && (
            <EyeOff aria-hidden className="w-4 h-4 text-muted-foreground/70" />
          )}
          <p className="text-xs text-muted-foreground text-center">{emptyLabel}</p>
          {promptsHiddenByFilter && (
            <button
              type="button"
              onClick={resetMessageFilter}
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium text-foreground/80 underline-offset-2",
                "hover:text-foreground hover:underline",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              {t("filter.showAll")}
            </button>
          )}
          {canLoadOlderForPrompts && (
            <button
              type="button"
              onClick={() => void loadMoreMessages()}
              disabled={isLoadingOlder}
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium text-foreground/80 underline-offset-2",
                "hover:text-foreground hover:underline disabled:opacity-60 disabled:no-underline",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              {isLoadingOlder ? t("common.loading") : t("navigator.loadEarlier")}
            </button>
          )}
        </div>
      ) : (
        <div
          ref={scrollElementRef}
          role="listbox"
          aria-label={listLabel}
          // Alt+Up/Down pressed here still reaches the global prompt jump.
          data-prompt-jump-passthrough=""
          aria-describedby={keyboardHelpId}
          className="flex-1 overflow-auto"
          style={{ contain: "strict" }}
          onPointerEnter={() => {
            isPointerInsideRef.current = true;
          }}
          onPointerLeave={() => {
            isPointerInsideRef.current = false;
          }}
          onWheel={noteUserScroll}
          onTouchMove={noteUserScroll}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((virtualItem) => {
              if (isPromptsMode) {
                const row = promptRows[virtualItem.index];
                if (!row) return null;
                return (
                  <NavigatorPromptRow
                    key={row.key}
                    row={row}
                    index={virtualItem.index}
                    setSize={rowCount}
                    showTurnNumber={isWindowComplete}
                    isActive={row.entry.uuid === spyUuid}
                    isFocused={virtualItem.index === focusedIndex}
                    onActivate={handlePromptRowActivate}
                    onFocus={setFocusedIndex}
                    onNavigate={handleRowKeyDown}
                    registerRef={registerRowRef}
                    measureRef={virtualizer.measureElement}
                    start={virtualItem.start}
                  />
                );
              }

              const entry = entries[virtualItem.index];
              if (!entry) return null;

              return (
                <NavigatorEntry
                  key={entry.uuid}
                  entry={entry}
                  isActive={virtualItem.index === activeIndex}
                  isFocused={virtualItem.index === focusedIndex}
                  onClick={handleEntryClick}
                  onFocus={setFocusedIndex}
                  onNavigate={handleRowKeyDown}
                  registerRef={registerRowRef}
                  // Real heights, so two-line previews never overlap.
                  measureRef={virtualizer.measureElement}
                  index={virtualItem.index}
                  setSize={rowCount}
                  start={virtualItem.start}
                />
              );
            })}
          </div>
        </div>
      )}

      <p id={keyboardHelpId} className="sr-only">
        {isPromptsMode
          ? t("navigator.a11y.promptsKeyboardHelp")
          : t(
              "navigator.a11y.keyboardHelp",
              "Keyboard: use arrow keys to move between messages, Home and End to jump, and Enter or Space to open the focused message."
            )}
      </p>
    </aside>
  );
};
