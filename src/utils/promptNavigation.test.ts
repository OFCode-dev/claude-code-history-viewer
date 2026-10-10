import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeMessage } from "../types";
import { buildPromptTrack, useViewportAnchorStore } from "../store/viewportAnchorStore";
import {
  jumpToAdjacentPrompt,
  promptStepShortcut,
  stepToAdjacentPrompt,
} from "./promptNavigation";

const { storeState, useAppStoreMock } = vi.hoisted(() => {
  const state = {
    pagination: { hasMore: false, isLoadingMore: false },
    navigateToMessage: vi.fn(),
    announceLayout: vi.fn(),
    loadMoreMessages: vi.fn(async () => undefined),
  };
  const useAppStore = Object.assign(
    (selector: (store: typeof state) => unknown) => selector(state),
    { getState: () => state }
  );
  return { storeState: state, useAppStoreMock: useAppStore };
});

vi.mock("../store/useAppStore", () => ({ useAppStore: useAppStoreMock }));

const msg = (uuid: string, type: "user" | "assistant", content: unknown): ClaudeMessage =>
  ({ uuid, type, content, timestamp: "2026-09-25T10:00:00Z" }) as unknown as ClaudeMessage;

// p1 a1 p2 a2 a2b p3 a3
const messages = [
  msg("p1", "user", "First question"),
  msg("a1", "assistant", [{ type: "text", text: "answer" }]),
  msg("p2", "user", "Second question"),
  msg("a2", "assistant", [{ type: "text", text: "answer" }]),
  msg("a2b", "assistant", [{ type: "text", text: "more" }]),
  msg("p3", "user", "Third question"),
  msg("a3", "assistant", [{ type: "text", text: "answer" }]),
];
const SESSION = "/sessions/one.jsonl";

function lastAnnouncement(): string {
  const calls = storeState.announceLayout.mock.calls;
  return String(calls[calls.length - 1]?.[0] ?? "");
}

describe("stepToAdjacentPrompt", () => {
  beforeEach(() => {
    storeState.pagination = { hasMore: false, isLoadingMore: false };
    storeState.announceLayout.mockClear();
    storeState.loadMoreMessages.mockClear();
    // Like the viewer: a jump scrolls its prompt to the top.
    storeState.navigateToMessage = vi.fn((uuid: string) => {
      useViewportAnchorStore.getState().publishAnchor(SESSION, uuid);
    });
    const anchors = useViewportAnchorStore.getState();
    anchors.reset();
    anchors.setPromptTrack(buildPromptTrack(SESSION, messages));
  });

  it("returns to the current prompt first inside a turn, exactly like Alt+Up", () => {
    useViewportAnchorStore.getState().publishAnchor(SESSION, "a2b");

    expect(stepToAdjacentPrompt("previous")).toBe("moved");
    expect(storeState.navigateToMessage).toHaveBeenLastCalledWith("p2", { history: "replace" });
    expect(lastAnnouncement()).toMatch(/^Prompt 2 of 3, .+: Second question$/);

    // A rapid second press chains on from the prompt just reached.
    expect(stepToAdjacentPrompt("previous")).toBe("moved");
    expect(storeState.navigateToMessage).toHaveBeenLastCalledWith("p1", { history: "replace" });
    expect(lastAnnouncement()).toMatch(/^Prompt 1 of 3/);
  });

  it("is the path Alt+Up / Alt+Down take", () => {
    useViewportAnchorStore.getState().publishAnchor(SESSION, "a1");

    expect(jumpToAdjacentPrompt("next")).toBe(true);
    expect(storeState.navigateToMessage).toHaveBeenLastCalledWith("p2", { history: "replace" });
    expect(lastAnnouncement()).toMatch(/^Prompt 2 of 3/);
  });

  it("announces the last prompt at the end and does nothing else", () => {
    useViewportAnchorStore.getState().publishAnchor(SESSION, "a3");

    expect(stepToAdjacentPrompt("next")).toBe("atEnd");
    expect(storeState.navigateToMessage).not.toHaveBeenCalled();
    expect(lastAnnouncement()).toBe("This is the last prompt");
  });

  it("announces the first prompt at the start of a fully loaded session", () => {
    useViewportAnchorStore.getState().publishAnchor(SESSION, "p1");

    expect(stepToAdjacentPrompt("previous")).toBe("atEnd");
    expect(storeState.navigateToMessage).not.toHaveBeenCalled();
    expect(storeState.loadMoreMessages).not.toHaveBeenCalled();
    expect(lastAnnouncement()).toBe("This is the first prompt");
  });

  it("loads earlier messages at the first loaded prompt of a partly loaded session", () => {
    storeState.pagination = { hasMore: true, isLoadingMore: false };
    useViewportAnchorStore.getState().publishAnchor(SESSION, "p1");

    expect(stepToAdjacentPrompt("previous")).toBe("loadingEarlier");
    expect(storeState.loadMoreMessages).toHaveBeenCalledTimes(1);
    expect(storeState.navigateToMessage).not.toHaveBeenCalled();
    expect(lastAnnouncement()).toBe("Loading earlier messages");

    // A press while that page is still loading does not start another.
    storeState.pagination = { hasMore: true, isLoadingMore: true };
    expect(stepToAdjacentPrompt("previous")).toBe("loadingEarlier");
    expect(storeState.loadMoreMessages).toHaveBeenCalledTimes(1);
  });

  it("counts only the loaded prompts of a partly loaded session", () => {
    storeState.pagination = { hasMore: true, isLoadingMore: false };
    useViewportAnchorStore.getState().publishAnchor(SESSION, "a1");

    stepToAdjacentPrompt("next");
    expect(lastAnnouncement()).toMatch(/^Prompt 2 of 3 loaded/);
  });

  it("does nothing without prompts", () => {
    useViewportAnchorStore.getState().reset();
    expect(stepToAdjacentPrompt("next")).toBe("unavailable");
    expect(jumpToAdjacentPrompt("previous")).toBe(false);

    useViewportAnchorStore
      .getState()
      .setPromptTrack(buildPromptTrack(SESSION, [messages[1]!, messages[3]!]));
    expect(stepToAdjacentPrompt("next")).toBe("unavailable");
    expect(storeState.announceLayout).not.toHaveBeenCalled();
  });
});

describe("promptStepShortcut", () => {
  it("spells the shortcut for aria-keyshortcuts", () => {
    expect(promptStepShortcut("previous").aria).toBe("Alt+ArrowUp");
    expect(promptStepShortcut("next").aria).toBe("Alt+ArrowDown");
    expect(promptStepShortcut("next").label).toMatch(/↓$/);
  });
});
