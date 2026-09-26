import { fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("useAppKeyboard focus mode shortcut focus handling", () => {
  let frames: FrameRequestCallback[] = [];
  const flushFrames = () => {
    const pending = frames;
    frames = [];
    pending.forEach((cb) => cb(0));
  };

  beforeEach(() => {
    store.toggleFocusMode.mockReset();
    platform.isMobile = false;
    frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("moves focus to the transcript when the focused panel row is folded away", () => {
    renderHook(() => useAppKeyboard());
    const { getByRole, getByTestId, rerender } = render(
      <>
        <aside id="project-explorer">
          <button type="button">row</button>
        </aside>
        <main id="main-content" tabIndex={-1} data-testid="main" />
      </>,
    );
    // Folding the panel unmounts the focused row, as the rail does.
    store.toggleFocusMode.mockImplementation(() =>
      rerender(
        <>
          <aside id="project-explorer" />
          <main id="main-content" tabIndex={-1} data-testid="main" />
        </>,
      ),
    );
    const row = getByRole("button", { name: "row" });
    row.focus();

    fireEvent.keyDown(row, { key: "F", ctrlKey: true, shiftKey: true });
    flushFrames();

    expect(store.toggleFocusMode).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(getByTestId("main"));
  });

  it("leaves focus alone when it was not inside a side panel", () => {
    renderHook(() => useAppKeyboard());
    const { getByRole } = render(
      <>
        <button type="button">header button</button>
        <main id="main-content" tabIndex={-1} />
      </>,
    );
    const button = getByRole("button", { name: "header button" });
    button.focus();

    fireEvent.keyDown(button, { key: "F", ctrlKey: true, shiftKey: true });
    flushFrames();

    expect(store.toggleFocusMode).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(button);
  });
});
