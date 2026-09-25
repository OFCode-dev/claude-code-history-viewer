import { fireEvent, render, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppKeyboard } from "./useAppKeyboard";

const { store, platform } = vi.hoisted(() => ({
  store: {
    toggleNavigator: vi.fn(),
    toggleFocusMode: vi.fn(),
  },
  platform: { isMobile: false },
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (selector: (state: typeof store) => unknown) => selector(store),
}));

vi.mock("@/contexts/modal", () => ({
  useModal: () => ({ openModal: vi.fn() }),
}));

vi.mock("@/contexts/platform", () => ({
  usePlatform: () => platform,
}));

describe("useAppKeyboard focus mode shortcut", () => {
  beforeEach(() => {
    store.toggleFocusMode.mockClear();
    store.toggleNavigator.mockClear();
    platform.isMobile = false;
  });

  it("toggles focus mode on Ctrl+Shift+F", () => {
    renderHook(() => useAppKeyboard());

    const event = new KeyboardEvent("keydown", {
      key: "F",
      ctrlKey: true,
      shiftKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(store.toggleFocusMode).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("toggles focus mode on Cmd+Shift+F", () => {
    renderHook(() => useAppKeyboard());
    fireEvent.keyDown(window, { key: "f", metaKey: true, shiftKey: true });
    expect(store.toggleFocusMode).toHaveBeenCalledTimes(1);
  });

  it("ignores the shortcut while typing in a field", () => {
    renderHook(() => useAppKeyboard());
    const { getByRole } = render(<input type="text" aria-label="query" />);

    fireEvent.keyDown(getByRole("textbox"), { key: "F", ctrlKey: true, shiftKey: true });

    expect(store.toggleFocusMode).not.toHaveBeenCalled();
  });

  it("ignores the shortcut inside a contenteditable region", () => {
    renderHook(() => useAppKeyboard());
    const { getByTestId } = render(
      <div contentEditable suppressContentEditableWarning data-testid="editor">
        <span data-testid="inner">text</span>
      </div>,
    );

    fireEvent.keyDown(getByTestId("inner"), { key: "F", ctrlKey: true, shiftKey: true });

    expect(store.toggleFocusMode).not.toHaveBeenCalled();
  });

  it("needs both the modifier and Shift", () => {
    renderHook(() => useAppKeyboard());
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    fireEvent.keyDown(window, { key: "F", shiftKey: true });
    expect(store.toggleFocusMode).not.toHaveBeenCalled();
  });

  it("does nothing on mobile, where there are no side panels", () => {
    platform.isMobile = true;
    renderHook(() => useAppKeyboard());
    fireEvent.keyDown(window, { key: "F", ctrlKey: true, shiftKey: true });
    expect(store.toggleFocusMode).not.toHaveBeenCalled();
  });
});
