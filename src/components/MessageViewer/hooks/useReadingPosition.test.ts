import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { ClaudeMessage } from "../../../types";
import type { FlattenedMessage } from "../types";
import { useAppStore } from "../../../store/useAppStore";
import {
  clearReadingPositions,
  recallReadingPosition,
} from "../../../store/readingPositions";
import { useViewportAnchorStore } from "../../../store/viewportAnchorStore";
import {
  ANCHOR_THROTTLE_MS,
  CONVERSATION_TOP_CLEARANCE_PX,
  findFirstVisibleMessageRow,
  scrollRowIntoTopView,
  usePositionRestore,
  useViewportAnchorPublisher,
} from "./useReadingPosition";

const message = (uuid: string, type: "user" | "assistant" = "assistant") =>
  ({ uuid, type, content: uuid, timestamp: "2026-09-25T10:00:00Z" }) as unknown as ClaudeMessage;

const item = (uuid: string, extra: Partial<FlattenedMessage> = {}): FlattenedMessage =>
  ({
    type: "message",
    message: message(uuid),
    depth: 0,
    originalIndex: 0,
    isGroupLeader: false,
    isGroupMember: false,
    isProgressGroupLeader: false,
    isProgressGroupMember: false,
    isTaskOperationGroupLeader: false,
    isTaskOperationGroupMember: false,
    isContinuation: false,
    ...extra,
  }) as FlattenedMessage;

describe("findFirstVisibleMessageRow", () => {
  const flattened: FlattenedMessage[] = [
    item("m0"),
    { type: "date-divider", timestamp: "2026-09-25T00:00:00Z" },
    item("m2"),
    item("m3", { isGroupMember: true }),
    item("m4"),
  ];
  const rows = [
    { index: 0, start: 0, size: 100 },
    { index: 1, start: 100, size: 30 },
    { index: 2, start: 130, size: 200 },
    { index: 3, start: 330, size: 0 },
    { index: 4, start: 330, size: 300 },
  ];

  it("returns the first message row still showing below the top inset", () => {
    expect(findFirstVisibleMessageRow(rows, flattened, 0, 16)).toEqual({ uuid: "m0", offset: 0 });
    expect(findFirstVisibleMessageRow(rows, flattened, 90, 16)).toEqual({ uuid: "m2", offset: 40 });
  });

  it("skips date dividers and collapsed group members", () => {
    expect(findFirstVisibleMessageRow(rows, flattened, 120, 0)).toEqual({ uuid: "m2", offset: 10 });
    expect(findFirstVisibleMessageRow(rows, flattened, 320, 16)).toEqual({ uuid: "m4", offset: 10 });
  });

  it("returns null when nothing is visible", () => {
    expect(findFirstVisibleMessageRow(rows, flattened, 1000, 0)).toBeNull();
  });
});

function fakeViewport(scrollTop = 0) {
  const viewport = document.createElement("div");
  document.body.appendChild(viewport);
  Object.defineProperty(viewport, "scrollHeight", { value: 5000, configurable: true });
  Object.defineProperty(viewport, "clientHeight", { value: 800, configurable: true });
  viewport.scrollTop = scrollTop;
  return viewport;
}

describe("useViewportAnchorPublisher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearReadingPositions();
    useViewportAnchorStore.getState().reset();
  });
  afterEach(() => vi.useRealTimers());

  it("publishes the first visible row, throttled, and records the reading position", () => {
    const flattened = [item("m0"), item("m1"), item("m2")];
    const rows = [
      { index: 0, start: 0, size: 400, key: "m0", end: 400, lane: 0 },
      { index: 1, start: 400, size: 400, key: "m1", end: 800, lane: 0 },
      { index: 2, start: 800, size: 400, key: "m2", end: 1200, lane: 0 },
    ];
    const virtualizer = { getVirtualItems: () => rows } as unknown as Virtualizer<HTMLElement, Element>;
    const viewport = fakeViewport(500);

    renderHook(() =>
      useViewportAnchorPublisher({
        sessionPath: "/s.jsonl",
        displayMessages: flattened.map((f) => (f.type === "message" ? f.message : message("x"))),
        flattenedMessages: flattened,
        virtualizer,
        getScrollElement: () => viewport,
        viewportKey: "s",
      })
    );
    vi.advanceTimersByTime(ANCHOR_THROTTLE_MS);
    expect(useViewportAnchorStore.getState().anchorUuid).toBe("m1");
    expect(recallReadingPosition("/s.jsonl")).toEqual({ uuid: "m1", offset: -100 });

    // A burst of scroll events produces a single trailing update.
    viewport.scrollTop = 900;
    viewport.dispatchEvent(new Event("scroll"));
    viewport.dispatchEvent(new Event("scroll"));
    expect(useViewportAnchorStore.getState().anchorUuid).toBe("m1");
    vi.advanceTimersByTime(ANCHOR_THROTTLE_MS);
    expect(useViewportAnchorStore.getState().anchorUuid).toBe("m2");
    viewport.remove();
  });
});

describe("usePositionRestore", () => {
  const indexMap = new Map([
    ["m0", 0],
    ["m1", 1],
  ]);
  const virtualizer = {
    getOffsetForIndex: (index: number) => [index * 400, "start"],
  } as unknown as Virtualizer<HTMLElement, Element>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  });
  afterEach(() => {
    useAppStore.setState({ pendingPositionRestore: null });
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const render = (targetMessageUuid: string | null, viewport: HTMLElement) =>
    renderHook(() =>
      usePositionRestore({
        sessionPath: "/s.jsonl",
        uuidToIndexMap: indexMap,
        virtualizer,
        getScrollElement: () => viewport,
        scrollElementReady: true,
        targetMessageUuid,
        suppressAutoLoadRef: { current: false },
      })
    );

  it("scrolls back to the remembered row and then clears the request", () => {
    useAppStore.setState({
      pendingPositionRestore: { sessionPath: "/s.jsonl", uuid: "m1", offset: -120 },
    });
    const viewport = fakeViewport(0);

    const { result } = render(null, viewport);
    expect(result.current).toBe("m1");

    vi.advanceTimersByTime(500);
    expect(viewport.scrollTop).toBe(520);
    expect(useAppStore.getState().pendingPositionRestore).toBeNull();
    viewport.remove();
  });

  it("yields to an explicit target such as a deep link", () => {
    useAppStore.setState({
      pendingPositionRestore: { sessionPath: "/s.jsonl", uuid: "m1", offset: -120 },
    });
    const viewport = fakeViewport(0);

    const { result } = render("m0", viewport);
    vi.advanceTimersByTime(500);

    expect(result.current).toBeNull();
    expect(viewport.scrollTop).toBe(0);
    expect(useAppStore.getState().pendingPositionRestore).toBeNull();
    viewport.remove();
  });

  it("drops a position outside the loaded window instead of loading pages", () => {
    useAppStore.setState({
      pendingPositionRestore: { sessionPath: "/s.jsonl", uuid: "older", offset: 0 },
    });
    const viewport = fakeViewport(0);

    const { result } = render(null, viewport);
    vi.advanceTimersByTime(500);

    expect(result.current).toBeNull();
    expect(viewport.scrollTop).toBe(0);
    expect(useAppStore.getState().pendingPositionRestore).toBeNull();
    viewport.remove();
  });
});

describe("scrollRowIntoTopView", () => {
  it("lands the row just below the sticky prompt bar strip", () => {
    const viewport = fakeViewport(0);
    const scrollTo = vi.fn();
    viewport.scrollTo = scrollTo as unknown as typeof viewport.scrollTo;
    const virtualizer = {
      getOffsetForIndex: () => [1000, "start"],
      scrollToIndex: vi.fn(),
    } as unknown as Virtualizer<HTMLElement, Element>;

    scrollRowIntoTopView(virtualizer, viewport, 3, "smooth");

    expect(scrollTo).toHaveBeenCalledWith({
      top: 1000 - CONVERSATION_TOP_CLEARANCE_PX,
      behavior: "smooth",
    });
    viewport.remove();
  });

  it("falls back to the virtualizer without a viewport", () => {
    const scrollToIndex = vi.fn();
    const virtualizer = {
      getOffsetForIndex: () => [1000, "start"],
      scrollToIndex,
    } as unknown as Virtualizer<HTMLElement, Element>;

    scrollRowIntoTopView(virtualizer, null, 3);

    expect(scrollToIndex).toHaveBeenCalledWith(3, { align: "start", behavior: "auto" });
  });
});
