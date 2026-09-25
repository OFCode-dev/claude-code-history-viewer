/**
 * Reading position of the conversation viewport.
 *
 * - `useViewportAnchorPublisher` publishes the first visible message row to
 *   the viewport-anchor store (navigator scroll-spy, sticky prompt bar,
 *   Alt+Up/Down) and records it as the session's reading position. It runs
 *   off the scroll event, throttled, and writes only on change, so the
 *   conversation itself never re-renders because of it.
 * - `usePositionRestore` scrolls a re-selected session back to its recorded
 *   position (queued by `selectSession`), unless an explicit target such as
 *   a deep link or a search hit takes over, and only when the row is inside
 *   the loaded window.
 */
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import type { ClaudeMessage } from "../../../types";
import type { FlattenedMessage } from "../types";
import { useAppStore } from "../../../store/useAppStore";
import {
  buildPromptTrack,
  useViewportAnchorStore,
} from "../../../store/viewportAnchorStore";
import {
  forgetReadingPosition,
  rememberReadingPosition,
} from "../../../store/readingPositions";

/** At most 10 anchor updates per second. */
export const ANCHOR_THROTTLE_MS = 100;
/**
 * Top strip of the conversation that the sticky prompt bar may cover. Jump
 * targets land just below it, and rows ending inside it do not count as
 * visible — so after jumping to a prompt, that prompt is the anchor.
 */
export const CONVERSATION_TOP_CLEARANCE_PX = 44;
/** Within this distance of the bottom the session simply reopens at the bottom. */
const NEAR_BOTTOM_PX = 100;
/** Re-apply the restore while rows above it measure (same passes as deep links). */
const RESTORE_PASSES_MS = [50, 200, 450] as const;

export interface VisibleRow {
  uuid: string;
  /** `row.start - scrollTop`: where the row starts relative to the viewport top. */
  offset: number;
}

/**
 * The first message row whose bottom edge is below the viewport top (plus a
 * small inset). Date dividers, capture placeholders and collapsed group
 * members (rendered at height 0) are skipped.
 */
export function findFirstVisibleMessageRow(
  rows: readonly Pick<VirtualItem, "index" | "start" | "size">[],
  flattenedMessages: readonly FlattenedMessage[],
  scrollTop: number,
  topInset = CONVERSATION_TOP_CLEARANCE_PX
): VisibleRow | null {
  for (const row of rows) {
    if (row.start + row.size <= scrollTop + topInset) continue;
    const item = flattenedMessages[row.index];
    if (item?.type !== "message") continue;
    if (item.isGroupMember || item.isProgressGroupMember || item.isTaskOperationGroupMember) {
      continue;
    }
    return { uuid: item.message.uuid, offset: row.start - scrollTop };
  }
  return null;
}

/**
 * Scroll so row `index` starts just below the top clearance (a jump target
 * is then never hidden under the sticky prompt bar).
 */
export function scrollRowIntoTopView(
  virtualizer: Virtualizer<HTMLElement, Element>,
  viewport: HTMLElement | null,
  index: number,
  behavior: ScrollBehavior = "auto"
): void {
  const [start] = virtualizer.getOffsetForIndex(index, "start") ?? [];
  if (!viewport || typeof start !== "number") {
    virtualizer.scrollToIndex(index, { align: "start", behavior });
    return;
  }
  viewport.scrollTo({ top: Math.max(0, start - CONVERSATION_TOP_CLEARANCE_PX), behavior });
}

interface PublisherOptions {
  sessionPath: string | null;
  /** The list the viewer renders (after display filters). */
  displayMessages: ClaudeMessage[];
  flattenedMessages: FlattenedMessage[];
  virtualizer: Virtualizer<HTMLElement, Element>;
  getScrollElement: () => HTMLElement | null;
  /** Changes when the scroll viewport is (re)mounted for a session. */
  viewportKey: string | null;
}

export function useViewportAnchorPublisher({
  sessionPath,
  displayMessages,
  flattenedMessages,
  virtualizer,
  getScrollElement,
  viewportKey,
}: PublisherOptions): void {
  const publishAnchor = useViewportAnchorStore((s) => s.publishAnchor);
  const setPromptTrack = useViewportAnchorStore((s) => s.setPromptTrack);

  // Prompts of the rendered list: recomputed when the list changes, not on scroll.
  useEffect(() => {
    setPromptTrack(sessionPath ? buildPromptTrack(sessionPath, displayMessages) : null);
  }, [sessionPath, displayMessages, setPromptTrack]);
  useEffect(() => () => setPromptTrack(null), [setPromptTrack]);

  useEffect(() => {
    const viewport = getScrollElement();
    if (!viewport || !sessionPath) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRun = 0;

    const publish = () => {
      timer = null;
      lastRun = performance.now();
      if (!viewport.isConnected) return;
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const row = findFirstVisibleMessageRow(
        virtualizer.getVirtualItems(),
        flattenedMessages,
        scrollTop
      );
      publishAnchor(sessionPath, row?.uuid ?? null);
      if (!row || scrollHeight - scrollTop - clientHeight < NEAR_BOTTOM_PX) {
        forgetReadingPosition(sessionPath);
      } else {
        rememberReadingPosition(sessionPath, row);
      }
    };

    const schedule = () => {
      if (timer !== null) return;
      const wait = Math.max(0, ANCHOR_THROTTLE_MS - (performance.now() - lastRun));
      timer = setTimeout(publish, wait);
    };

    viewport.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      viewport.removeEventListener("scroll", schedule);
      if (timer !== null) clearTimeout(timer);
    };
  }, [sessionPath, flattenedMessages, virtualizer, getScrollElement, viewportKey, publishAnchor]);
}

interface RestoreOptions {
  sessionPath: string | null;
  uuidToIndexMap: Map<string, number>;
  virtualizer: Virtualizer<HTMLElement, Element>;
  getScrollElement: () => HTMLElement | null;
  scrollElementReady: boolean;
  targetMessageUuid: string | null;
  /** Set while restoring so the near-top auto-load does not page in history. */
  suppressAutoLoadRef: MutableRefObject<boolean>;
}

/**
 * Returns the uuid being restored (or null). Pass it to the initial-scroll
 * logic as a target so the session does not first jump to the bottom.
 */
export function usePositionRestore({
  sessionPath,
  uuidToIndexMap,
  virtualizer,
  getScrollElement,
  scrollElementReady,
  targetMessageUuid,
  suppressAutoLoadRef,
}: RestoreOptions): string | null {
  const pending = useAppStore((s) => s.pendingPositionRestore);
  const clearPending = useAppStore((s) => s.clearPendingPositionRestore);

  const indexMapRef = useRef(uuidToIndexMap);
  indexMapRef.current = uuidToIndexMap;

  // Applicable only for this session and when the row is in the loaded window;
  // the pending object itself is returned so its identity stays stable.
  const restore = useMemo(
    () =>
      pending &&
      pending.sessionPath === sessionPath &&
      !targetMessageUuid &&
      uuidToIndexMap.has(pending.uuid)
        ? pending
        : null,
    [pending, sessionPath, targetMessageUuid, uuidToIndexMap]
  );

  // Drop a restore that cannot apply: an explicit target won, or the session
  // loaded without the remembered row (no extra pages are fetched for it).
  useEffect(() => {
    if (!pending || pending.sessionPath !== sessionPath) return;
    if (targetMessageUuid || (uuidToIndexMap.size > 0 && !uuidToIndexMap.has(pending.uuid))) {
      clearPending();
    }
  }, [pending, sessionPath, targetMessageUuid, uuidToIndexMap, clearPending]);

  useEffect(() => {
    if (!restore || !scrollElementReady) return;
    const viewport = getScrollElement();
    if (!viewport) return;

    const apply = () => {
      const index = indexMapRef.current.get(restore.uuid);
      if (index === undefined) return;
      const [start] = virtualizer.getOffsetForIndex(index, "start") ?? [];
      if (typeof start !== "number") return;
      viewport.scrollTop = start - restore.offset;
    };

    const timers: ReturnType<typeof setTimeout>[] = [];
    let frame: number | null = null;
    const finish = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      suppressAutoLoadRef.current = false;
      viewport.removeEventListener("wheel", finish);
      viewport.removeEventListener("touchstart", finish);
      viewport.removeEventListener("keydown", finish);
      clearPending();
    };

    suppressAutoLoadRef.current = true;
    frame = requestAnimationFrame(apply);
    RESTORE_PASSES_MS.forEach((delay, pass) => {
      timers.push(
        setTimeout(() => {
          apply();
          if (pass === RESTORE_PASSES_MS.length - 1) finish();
        }, delay)
      );
    });
    // The user taking over the scroll ends the restore.
    viewport.addEventListener("wheel", finish, { passive: true });
    viewport.addEventListener("touchstart", finish, { passive: true });
    viewport.addEventListener("keydown", finish);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      suppressAutoLoadRef.current = false;
      viewport.removeEventListener("wheel", finish);
      viewport.removeEventListener("touchstart", finish);
      viewport.removeEventListener("keydown", finish);
    };
  }, [restore, scrollElementReady, getScrollElement, virtualizer, suppressAutoLoadRef, clearPending]);

  return restore?.uuid ?? null;
}
