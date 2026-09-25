import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ClaudeMessage } from "@/types";

vi.mock("@/contexts/modal", () => ({
  useModal: () => ({ openModal: vi.fn() }),
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

  it("leaves the key alone when there is no prompt to go to", () => {
    renderHook(() => useAppKeyboard());
    useViewportAnchorStore.getState().publishAnchor(SESSION, "a2");

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
});
