import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "@/store/useAppStore";
import { buildPromptTrack, useViewportAnchorStore } from "@/store/viewportAnchorStore";
import type { ClaudeMessage, ClaudeSession } from "@/types";
import { FOCUS_AFTER_JUMP_MS, jumpToAdjacentPrompt } from "@/utils/promptNavigation";
import { PromptSeekButtons, type PromptSeekVariant } from "./PromptSeekButtons";

const SESSION = "/sessions/longform.jsonl";

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

const original = useAppStore.getState();
const navigateToMessage = vi.fn((uuid: string) => {
  // Like the viewer: the jump scrolls its prompt to the top of the list.
  useViewportAnchorStore.getState().publishAnchor(SESSION, uuid);
});
const loadMoreMessages = vi.fn(async () => undefined);

function setPagination(hasMore: boolean, isLoadingMore = false) {
  useAppStore.setState({
    pagination: { ...original.pagination, hasMore, isLoadingMore },
  });
}

function renderSeek(variant: PromptSeekVariant = "header") {
  render(
    <TooltipProvider>
      <PromptSeekButtons variant={variant} />
    </TooltipProvider>
  );
  return {
    previous: screen.getByRole("button", { name: "Previous prompt" }),
    next: screen.getByRole("button", { name: "Next prompt" }),
  };
}

const announcement = () => useAppStore.getState().layoutAnnouncement?.text;

beforeEach(() => {
  vi.useFakeTimers();
  navigateToMessage.mockClear();
  loadMoreMessages.mockClear();
  useAppStore.setState({
    navigateToMessage,
    loadMoreMessages,
    selectedSession: { file_path: SESSION } as ClaudeSession,
    layoutAnnouncement: null,
  });
  setPagination(false);
  const anchors = useViewportAnchorStore.getState();
  anchors.reset();
  anchors.setPromptTrack(buildPromptTrack(SESSION, messages));
  anchors.publishAnchor(SESSION, "p1");
});

afterEach(() => {
  vi.useRealTimers();
  useAppStore.setState({
    navigateToMessage: original.navigateToMessage,
    loadMoreMessages: original.loadMoreMessages,
    selectedSession: original.selectedSession,
    pagination: original.pagination,
  });
  useViewportAnchorStore.getState().reset();
});

describe("PromptSeekButtons", () => {
  it("is hidden while the conversation has no human prompts", () => {
    useViewportAnchorStore
      .getState()
      .setPromptTrack(buildPromptTrack(SESSION, [messages[1]!, messages[3]!]));
    render(<PromptSeekButtons variant="header" />);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("is hidden when the prompt track belongs to another session", () => {
    useAppStore.setState({ selectedSession: { file_path: "/other.jsonl" } as ClaudeSession });
    render(<PromptSeekButtons variant="header" />);
    expect(screen.queryByRole("button", { name: "Next prompt" })).toBeNull();
  });

  it("labels both buttons with their shortcut", () => {
    const { previous, next } = renderSeek();
    expect(screen.getByRole("group", { name: "Previous and next prompt" })).toBeInTheDocument();
    expect(previous).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowUp");
    expect(next).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowDown");
  });

  it("goes back to the current prompt's start inside a turn, the same target as Alt+Up", () => {
    useViewportAnchorStore.getState().publishAnchor(SESSION, "a2b");
    const { previous } = renderSeek();

    fireEvent.click(previous);
    expect(navigateToMessage).toHaveBeenLastCalledWith("p2", { history: "replace" });

    // Alt+Up from the same position lands on the same prompt.
    act(() => {
      vi.advanceTimersByTime(5000);
      useViewportAnchorStore.getState().publishAnchor(SESSION, "a2b");
    });
    act(() => {
      jumpToAdjacentPrompt("previous");
    });
    expect(navigateToMessage).toHaveBeenLastCalledWith("p2", { history: "replace" });
  });

  it("keeps focus on the next button through every step and at the end", () => {
    const { next } = renderSeek();
    act(() => {
      next.focus();
    });

    act(() => {
      fireEvent.click(next);
    });
    expect(navigateToMessage).toHaveBeenLastCalledWith("p2", { history: "replace" });
    expect(announcement()).toMatch(/^Prompt 2 of 3, .+: Second question$/);
    expect(document.activeElement).toBe(next);

    act(() => {
      fireEvent.click(next);
    });
    expect(navigateToMessage).toHaveBeenLastCalledWith("p3", { history: "replace" });
    expect(announcement()).toMatch(/^Prompt 3 of 3/);
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(next).not.toBeDisabled();

    // At the end a press only announces it, and focus stays.
    act(() => {
      fireEvent.click(next);
    });
    expect(navigateToMessage).toHaveBeenCalledTimes(2);
    expect(announcement()).toBe("This is the last prompt");
    act(() => {
      vi.advanceTimersByTime(FOCUS_AFTER_JUMP_MS * 2);
    });
    expect(document.activeElement).toBe(next);
  });

  it("marks the previous button inactive at the first prompt of a fully loaded session", () => {
    const { previous, next } = renderSeek();
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(next).not.toHaveAttribute("aria-disabled");

    act(() => {
      previous.focus();
      fireEvent.click(previous);
    });
    expect(navigateToMessage).not.toHaveBeenCalled();
    expect(loadMoreMessages).not.toHaveBeenCalled();
    expect(announcement()).toBe("This is the first prompt");
    expect(document.activeElement).toBe(previous);
  });

  it("loads earlier messages at the first loaded prompt of a partly loaded session", () => {
    setPagination(true);
    const { previous } = renderSeek();
    expect(previous).not.toHaveAttribute("aria-disabled");

    fireEvent.click(previous);
    expect(loadMoreMessages).toHaveBeenCalledTimes(1);
    expect(navigateToMessage).not.toHaveBeenCalled();
    expect(announcement()).toBe("Loading earlier messages");
  });

  it("on the 24 px navigator rail, steps prompts with buttons sized for the rail", () => {
    const { next } = renderSeek("rail");
    const group = screen.getByRole("group", { name: "Previous and next prompt" });
    expect(within(group).getAllByRole("button")).toHaveLength(2);
    expect(next.className).toContain("size-6");
    expect(next.className).toContain("pointer-coarse:size-11");

    fireEvent.click(next);
    expect(navigateToMessage).toHaveBeenCalledWith("p2", expect.anything());
  });
});
