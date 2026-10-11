import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ClaudeMessage } from "@/types";

const { openModalMock } = vi.hoisted(() => ({ openModalMock: vi.fn() }));

vi.mock("@/contexts/modal", () => ({
  useModal: () => ({ openModal: openModalMock }),
}));

vi.mock("@/contexts/platform", () => ({
  usePlatform: () => ({ isMobile: false }),
}));

import { useAppStore } from "@/store/useAppStore";
import { buildPromptTrack, useViewportAnchorStore } from "@/store/viewportAnchorStore";
import { useAppKeyboard } from "./useAppKeyboard";

const msg = (uuid: string, type: "user" | "assistant", content: unknown): ClaudeMessage =>
  ({ uuid, type, content, timestamp: "2026-09-25T10:00:00Z" }) as unknown as ClaudeMessage;

const SESSION = "/sessions/one.jsonl";
const messages = [
  msg("p1", "user", "First"),
  msg("a1", "assistant", [{ type: "text", text: "a" }]),
  msg("p2", "user", "Second"),
  msg("a2", "assistant", [{ type: "text", text: "b" }]),
];

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("useAppKeyboard prompt jumps", () => {
  const navigateToMessage = vi.fn();
  const originalNavigate = useAppStore.getState().navigateToMessage;

  beforeEach(() => {
    vi.useFakeTimers();
    navigateToMessage.mockReset();
    useAppStore.setState({ navigateToMessage });
    const anchors = useViewportAnchorStore.getState();
    anchors.reset();
    anchors.setPromptTrack(buildPromptTrack(SESSION, messages));
    anchors.publishAnchor(SESSION, "a1");
  });

  afterEach(() => {
    useAppStore.setState({ navigateToMessage: originalNavigate });
    vi.useRealTimers();
  });

  it("Alt+Down jumps to the next prompt without pushing history", () => {
    renderHook(() => useAppKeyboard());

    const event = press("ArrowDown", { altKey: true });

    expect(navigateToMessage).toHaveBeenCalledWith("p2", { history: "replace" });
    expect(event.defaultPrevented).toBe(true);
  });

  it("Alt+Up jumps to the prompt above the viewport", () => {
    renderHook(() => useAppKeyboard());

    press("ArrowUp", { altKey: true });

    expect(navigateToMessage).toHaveBeenCalledWith("p1", { history: "replace" });
  });

  it("is ignored while typing in a field", () => {
    renderHook(() => useAppKeyboard());
    const input = document.createElement("input");
    document.body.appendChild(input);

    const event = press("ArrowDown", { altKey: true }, input);

    expect(navigateToMessage).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    input.remove();
  });

  it("announces the end, like the next-prompt button, when there is no prompt to go to", () => {
    renderHook(() => useAppKeyboard());
    useViewportAnchorStore.getState().publishAnchor(SESSION, "a2");

    const event = press("ArrowDown", { altKey: true });

    expect(navigateToMessage).not.toHaveBeenCalled();
    expect(useAppStore.getState().layoutAnnouncement?.text).toBe("This is the last prompt");
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves the key alone when the conversation has no prompts", () => {
    renderHook(() => useAppKeyboard());
    useViewportAnchorStore.getState().setPromptTrack(buildPromptTrack(SESSION, [messages[1]!]));

    const event = press("ArrowDown", { altKey: true });

    expect(navigateToMessage).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores plain arrows and other modifier combinations", () => {
    renderHook(() => useAppKeyboard());

    press("ArrowDown");
    press("ArrowDown", { altKey: true, shiftKey: true });
    press("ArrowDown", { altKey: true, ctrlKey: true });

    expect(navigateToMessage).not.toHaveBeenCalled();
  });

  it("is ignored when a widget already handled the key", () => {
    renderHook(() => useAppKeyboard());
    const button = document.createElement("button");
    button.addEventListener("keydown", (event) => event.preventDefault());
    document.body.appendChild(button);

    press("ArrowDown", { altKey: true }, button);

    expect(navigateToMessage).not.toHaveBeenCalled();
    button.remove();
  });

  it.each(["dialog", "menu", "listbox", "tree"])(
    "is ignored inside a %s that uses the arrow keys",
    (role) => {
      renderHook(() => useAppKeyboard());
      const widget = document.createElement("div");
      widget.setAttribute("role", role);
      const item = document.createElement("button");
      widget.appendChild(item);
      document.body.appendChild(widget);

      const event = press("ArrowDown", { altKey: true }, item);

      expect(navigateToMessage).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
      widget.remove();
    }
  );

  it("works inside a list that passes Alt+Arrow through (the navigator)", () => {
    renderHook(() => useAppKeyboard());
    const list = document.createElement("div");
    list.setAttribute("role", "listbox");
    list.setAttribute("data-prompt-jump-passthrough", "");
    const option = document.createElement("button");
    option.setAttribute("role", "option");
    list.appendChild(option);
    document.body.appendChild(list);

    press("ArrowDown", { altKey: true }, option);

    expect(navigateToMessage).toHaveBeenCalledWith("p2", { history: "replace" });
    list.remove();
  });
});

describe("useAppKeyboard global search", () => {
  afterEach(() => {
    openModalMock.mockReset();
  });

  it("opens global search on Mod+K", () => {
    renderHook(() => useAppKeyboard());

    const event = press("k", { ctrlKey: true });

    expect(openModalMock).toHaveBeenCalledWith("globalSearch");
    expect(event.defaultPrevented).toBe(true);
  });

  it("stops listening after unmount", () => {
    const { unmount } = renderHook(() => useAppKeyboard());
    unmount();

    press("k", { ctrlKey: true });

    expect(openModalMock).not.toHaveBeenCalled();
  });
});
