import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { StickyPromptBar } from "./StickyPromptBar";
import { buildPromptTrack, useViewportAnchorStore } from "@/store/viewportAnchorStore";
import { FOCUS_AFTER_JUMP_MS, jumpToAdjacentPrompt } from "@/utils/promptNavigation";

const { storeState, useAppStoreMock } = vi.hoisted(() => {
  const state = {
    pagination: { hasMore: false },
    parentSessionStack: [] as string[],
    navigateToMessage: vi.fn(),
    announceLayout: vi.fn(),
    loadMoreMessages: vi.fn(),
  };
  const useAppStore = Object.assign(
    (selector: (store: typeof state) => unknown) => selector(state),
    { getState: () => state }
  );
  return { storeState: state, useAppStoreMock: useAppStore };
});

vi.mock("@/store/useAppStore", () => ({ useAppStore: useAppStoreMock }));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => undefined },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && "shortcut" in options
        ? `${key}|${String(options.label)}|${String(options.shortcut)}`
        : key,
  }),
}));

const SESSION = "/s.jsonl";
const messages = [
  { uuid: "p1", type: "user", content: "Deploy the api", timestamp: "2026-02-27T10:00:00Z" },
  { uuid: "a1", type: "assistant", content: [{ type: "text", text: "On it" }], timestamp: "2026-02-27T10:01:00Z" },
  { uuid: "p2", type: "user", content: "Write the changelog", timestamp: "2026-02-27T10:02:00Z" },
  { uuid: "a2", type: "assistant", content: [{ type: "text", text: "Done" }], timestamp: "2026-02-27T10:03:00Z" },
] as never[];

/** Stand-in for the conversation: a rendered prompt row with its card. */
function renderPromptRow(uuid: string) {
  const row = document.createElement("div");
  row.setAttribute("data-message-uuid", uuid);
  const card = document.createElement("article");
  card.setAttribute("data-prompt-card", "");
  card.setAttribute("aria-label", `prompt ${uuid}`);
  row.appendChild(card);
  document.body.appendChild(row);
  return card;
}

describe("StickyPromptBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storeState.parentSessionStack = [];
    storeState.pagination = { hasMore: false };
    // Like the viewer: the jump scrolls the prompt to the top, so it becomes
    // the anchor and the bar hides.
    storeState.navigateToMessage = vi.fn((uuid: string) => {
      useViewportAnchorStore.getState().publishAnchor(SESSION, uuid);
    });
    const anchors = useViewportAnchorStore.getState();
    anchors.reset();
    anchors.setPromptTrack(buildPromptTrack(SESSION, messages));
    // Inside turn 1, below its prompt: the bar shows.
    anchors.publishAnchor(SESSION, "a1");
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("moves focus to the prompt card when a keyboard jump hides the bar", () => {
    const card = renderPromptRow("p2");
    render(<StickyPromptBar messages={messages} />);
    const next = screen.getByRole("button", { name: "navigator.promptBar.next" });

    act(() => {
      next.focus();
    });
    act(() => {
      fireEvent.click(next);
    });

    expect(storeState.navigateToMessage).toHaveBeenCalledWith("p2", { history: "replace" });
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(FOCUS_AFTER_JUMP_MS);
    });
    expect(document.activeElement).toBe(card);
    expect(card).toHaveAttribute("tabindex", "-1");

    // Leaving the card restores it to its unfocusable self.
    act(() => {
      card.blur();
    });
    expect(card).not.toHaveAttribute("tabindex");
    expect(card.style.outline).toBe("");
  });

  it("moves focus for Alt+Arrow pressed on a bar button", () => {
    const card = renderPromptRow("p2");
    render(<StickyPromptBar messages={messages} />);

    act(() => {
      screen.getByRole("button", { name: /^navigator\.promptBar\.jump/ }).focus();
    });
    act(() => {
      expect(jumpToAdjacentPrompt("next")).toBe(true);
    });
    act(() => {
      vi.advanceTimersByTime(FOCUS_AFTER_JUMP_MS);
    });

    expect(document.activeElement).toBe(card);
  });

  it("leaves focus alone for jumps started outside the bar", () => {
    const card = renderPromptRow("p2");
    render(
      <>
        <input aria-label="elsewhere" />
        <StickyPromptBar messages={messages} />
      </>
    );
    const elsewhere = screen.getByRole("textbox", { name: "elsewhere" });

    act(() => {
      elsewhere.focus();
    });
    act(() => {
      jumpToAdjacentPrompt("next");
    });
    act(() => {
      vi.advanceTimersByTime(FOCUS_AFTER_JUMP_MS);
    });

    expect(document.activeElement).toBe(elsewhere);
    expect(card).not.toHaveAttribute("tabindex");
  });

  it("names the parent agent as the author inside a subagent transcript", () => {
    storeState.parentSessionStack = ["/parent.jsonl"];
    render(<StickyPromptBar messages={messages} />);

    expect(screen.getByText("promptCard.parentAgent")).toBeInTheDocument();
    expect(screen.queryByText("navigator.promptBar.you")).not.toBeInTheDocument();
  });

  it("labels the reader's own prompt as theirs", () => {
    render(<StickyPromptBar messages={messages} />);

    expect(screen.getByText("navigator.promptBar.you")).toBeInTheDocument();
  });

  it("announces the next-prompt shortcut through i18n and aria-keyshortcuts", () => {
    render(<StickyPromptBar messages={messages} />);
    const next = screen.getByRole("button", { name: "navigator.promptBar.next" });

    expect(next).toHaveAttribute(
      "title",
      "navigator.promptBar.nextWithShortcut|navigator.promptBar.next|Alt+↓"
    );
    expect(next).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowDown");
  });
});
