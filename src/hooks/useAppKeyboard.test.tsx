import { render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import { useAppKeyboard } from "./useAppKeyboard";

const { platform } = vi.hoisted(() => ({ platform: { isMobile: false } }));

vi.mock("@/contexts/modal", () => ({
  useModal: () => ({ openModal: vi.fn() }),
}));

vi.mock("@/contexts/platform", () => ({
  usePlatform: () => platform,
}));

vi.mock("sonner", () => ({ toast: vi.fn() }));

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

let frames: FrameRequestCallback[] = [];
const flushFrames = () => {
  for (let round = 0; round < 3; round += 1) {
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback(0));
  }
};

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

const ctrlShift = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) =>
  press(key, { ctrlKey: true, shiftKey: true, ...init }, target);

/** The DOM the shortcuts act on: the three regions, main and the search field. */
function Layout({ withRight = true, withSessions = false }: { withRight?: boolean; withSessions?: boolean }) {
  return (
    <>
      <section id="autohide-region-left">
        <button type="button" id="autohide-handle-left">left handle</button>
        <div id="autohide-overlay-left">
          <aside id="project-explorer" tabIndex={-1}>
            <div role="treeitem" tabIndex={-1} aria-selected="false">other</div>
            <div role="treeitem" tabIndex={-1} aria-selected="true">selected project</div>
          </aside>
          {withSessions && (
            <aside id="sessions-pane" tabIndex={-1}>
              <div data-session-list="">
                <button type="button" data-session-open="" tabIndex={-1}>other session</button>
                <button type="button" data-session-open="" aria-current="true" tabIndex={0}>
                  selected session
                </button>
              </div>
            </aside>
          )}
        </div>
      </section>
      <main id="main-content" tabIndex={-1}>
        <section id="autohide-region-top">
          <button type="button" id="autohide-handle-top">top handle</button>
          <div id="autohide-overlay-top">
            <input aria-label="search" data-autohide-focus="search" defaultValue="" />
          </div>
        </section>
        <button type="button">transcript button</button>
      </main>
      {withRight && (
        <section id="autohide-region-right">
          <button type="button" id="autohide-handle-right">right handle</button>
          <div id="autohide-overlay-right">
            <aside id="message-navigator" tabIndex={-1}>
              <div role="listbox">
                <button type="button" role="option" tabIndex={0}>current prompt</button>
              </div>
            </aside>
          </div>
        </section>
      )}
    </>
  );
}

const initialState = useAppStore.getState();

beforeEach(() => {
  localStorage.clear();
  platform.isMobile = false;
  frames = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  useAppStore.setState(
    {
      ...initialState,
      isReadingMode: false,
      readingProfile: { left: "autohide", right: "autohide", top: "autohide" },
      revealed: null,
      isExplorerCollapsed: false,
      isNavigatorOpen: true,
      sessionSearch: { ...initialState.sessionSearch, query: "" },
    },
    true
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function enterReadingMode() {
  useAppStore.setState({ isReadingMode: true });
}

describe("Mod+Shift+F: reading mode", () => {
  it("toggles reading mode with Ctrl+Shift+F", () => {
    renderHook(() => useAppKeyboard());
    const event = ctrlShift("F");
    expect(useAppStore.getState().isReadingMode).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    ctrlShift("F");
    expect(useAppStore.getState().isReadingMode).toBe(false);
  });

  it("ignores key repeat", () => {
    renderHook(() => useAppKeyboard());
    ctrlShift("F", { repeat: true });
    expect(useAppStore.getState().isReadingMode).toBe(false);
  });

  it("is ignored while typing in a field", () => {
    renderHook(() => useAppKeyboard());
    const { getByRole } = render(<input type="text" aria-label="query" />);
    ctrlShift("F", {}, getByRole("textbox"));
    expect(useAppStore.getState().isReadingMode).toBe(false);
  });

  it("does nothing below 768 px", () => {
    platform.isMobile = true;
    renderHook(() => useAppKeyboard());
    ctrlShift("F");
    expect(useAppStore.getState().isReadingMode).toBe(false);
  });

  it("moves focus out of a panel that is about to hide", () => {
    renderHook(() => useAppKeyboard());
    const { getByText } = render(<Layout />);
    const row = getByText("selected project");
    row.focus();
    ctrlShift("F", {}, row);
    expect(document.activeElement?.id).toBe("main-content");
  });

  it("leaves focus alone when it is not in a panel", () => {
    renderHook(() => useAppKeyboard());
    const { getByText } = render(<Layout />);
    const button = getByText("transcript button");
    button.focus();
    ctrlShift("F", {}, button);
    expect(document.activeElement).toBe(button);
  });
});

describe("Mod+Shift+E: explorer and sessions", () => {
  it("reveals the hidden left panel from the keyboard and focuses the selected row", () => {
    enterReadingMode();
    renderHook(() => useAppKeyboard());
    const { getByText } = render(<Layout />);
    const before = getByText("transcript button");
    before.focus();

    ctrlShift("E", {}, before);
    expect(useAppStore.getState().revealed).toMatchObject({ group: "left", source: "keyboard" });
    flushFrames();
    expect(document.activeElement).toBe(getByText("selected project"));

    // Pressed again: closes, and focus returns to where it was.
    ctrlShift("E", {}, document.activeElement ?? window);
    expect(useAppStore.getState().revealed).toBeNull();
    expect(document.activeElement).toBe(before);
  });

  it("lands on the selected session row first when the sessions are listed", () => {
    enterReadingMode();
    renderHook(() => useAppKeyboard());
    const { getByText } = render(<Layout withSessions />);
    ctrlShift("E");
    flushFrames();
    expect(document.activeElement).toBe(getByText("selected session"));
  });

  it("focuses the row of a pinned panel without revealing anything", () => {
    enterReadingMode();
    useAppStore.getState().setReadingPin("left", true);
    renderHook(() => useAppKeyboard());
    const { getByText } = render(<Layout />);
    ctrlShift("E");
    flushFrames();
    expect(useAppStore.getState().revealed).toBeNull();
    expect(document.activeElement).toBe(getByText("selected project"));
  });

  it("unfolds the explorer rail first in the normal layout", () => {
    useAppStore.setState({ isExplorerCollapsed: true });
    renderHook(() => useAppKeyboard());
    const { getByText } = render(<Layout />);
    ctrlShift("E");
    flushFrames();
    expect(useAppStore.getState().isExplorerCollapsed).toBe(false);
    expect(document.activeElement).toBe(getByText("selected project"));
  });

  it("falls back to the physical key on a non-Latin layout", () => {
    enterReadingMode();
    renderHook(() => useAppKeyboard());
    render(<Layout />);
    ctrlShift("У", { code: "KeyE" });
    expect(useAppStore.getState().revealed?.group).toBe("left");
  });

  it("is ignored inside a dialog or a menu", () => {
    enterReadingMode();
    renderHook(() => useAppKeyboard());
    const { getByText } = render(
      <div role="dialog">
        <button type="button">in dialog</button>
      </div>,
    );
    ctrlShift("E", {}, getByText("in dialog"));
    expect(useAppStore.getState().revealed).toBeNull();
  });

  it("ignores IME composition", () => {
    enterReadingMode();
    renderHook(() => useAppKeyboard());
    render(<Layout />);
    ctrlShift("E", { isComposing: true });
    expect(useAppStore.getState().revealed).toBeNull();
  });

  it("an explicit open replaces another overlay", () => {
    enterReadingMode();
    renderHook(() => useAppKeyboard());
    render(<Layout />);
    ctrlShift("E");
    ctrlShift("M");
    expect(useAppStore.getState().revealed).toMatchObject({ group: "right", source: "keyboard" });
  });
});

describe("Mod+Shift+M: prompts", () => {
  it("reveals the hidden navigator and focuses the current prompt row", () => {
    enterReadingMode();
    renderHook(() => useAppKeyboard());
    const { getByText } = render(<Layout />);
    ctrlShift("M");
    flushFrames();
    expect(useAppStore.getState().revealed?.group).toBe("right");
    expect(document.activeElement).toBe(getByText("current prompt"));
  });

  it("does nothing in reading mode when no navigator is shown", () => {
    enterReadingMode();
    renderHook(() => useAppKeyboard());
    render(<Layout withRight={false} />);
    ctrlShift("M");
    expect(useAppStore.getState().revealed).toBeNull();
    expect(useAppStore.getState().isNavigatorOpen).toBe(true);
  });

  it("toggles the navigator rail in the normal layout", () => {
    renderHook(() => useAppKeyboard());
    ctrlShift("M");
    expect(useAppStore.getState().isNavigatorOpen).toBe(false);
  });
});

describe("Mod+F: conversation search", () => {
  it("reveals the tools and selects the search field; a repeat keeps them open", () => {
    enterReadingMode();
    renderHook(() => useAppKeyboard());
    const { getByLabelText } = render(<Layout />);
    const input = getByLabelText("search") as HTMLInputElement;

    expect(press("f", { ctrlKey: true }).defaultPrevented).toBe(true);
    flushFrames();
    expect(useAppStore.getState().revealed?.group).toBe("top");
    expect(document.activeElement).toBe(input);

    input.value = "query";
    input.setSelectionRange(5, 5);
    expect(press("f", { ctrlKey: true }, input).defaultPrevented).toBe(true);
    flushFrames();
    expect(useAppStore.getState().revealed?.group).toBe("top");
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 5]);

    // Fully selected: the press goes to browser find.
    expect(press("f", { ctrlKey: true }, input).defaultPrevented).toBe(false);
    expect(useAppStore.getState().revealed?.group).toBe("top");
  });

  it("focuses the field directly in the normal layout", () => {
    renderHook(() => useAppKeyboard());
    const { getByLabelText } = render(<Layout />);
    press("f", { ctrlKey: true });
    expect(useAppStore.getState().revealed).toBeNull();
    expect(document.activeElement).toBe(getByLabelText("search"));
  });

  it("is not taken when no conversation is showing", () => {
    renderHook(() => useAppKeyboard());
    expect(press("f", { ctrlKey: true }).defaultPrevented).toBe(false);
  });
});

describe("Mod+G and F3: search matches", () => {
  function withSearch(query: string) {
    const goToNextMatch = vi.fn();
    const goToPrevMatch = vi.fn();
    useAppStore.setState({
      sessionSearch: { ...useAppStore.getState().sessionSearch, query },
      goToNextMatch,
      goToPrevMatch,
    });
    return { goToNextMatch, goToPrevMatch };
  }

  it("steps through matches without revealing anything", () => {
    enterReadingMode();
    const { goToNextMatch, goToPrevMatch } = withSearch("needle");
    renderHook(() => useAppKeyboard());
    render(<Layout />);

    expect(press("g", { ctrlKey: true }).defaultPrevented).toBe(true);
    press("G", { ctrlKey: true, shiftKey: true });
    press("F3");
    press("F3", { shiftKey: true });

    expect(goToNextMatch).toHaveBeenCalledTimes(2);
    expect(goToPrevMatch).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().revealed).toBeNull();
  });

  it("leaves the keys to the browser when no search is active", () => {
    const { goToNextMatch } = withSearch("");
    renderHook(() => useAppKeyboard());
    render(<Layout />);
    expect(press("g", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press("F3").defaultPrevented).toBe(false);
    expect(goToNextMatch).not.toHaveBeenCalled();
  });
});

describe("modifier matching", () => {
  it("needs Mod and Shift together, and no single-character shortcut exists", () => {
    renderHook(() => useAppKeyboard());
    press("f", { ctrlKey: true, shiftKey: false, altKey: true });
    press("F", { shiftKey: true });
    for (const key of ["e", "f", "m", "g"]) press(key);
    expect(useAppStore.getState().isReadingMode).toBe(false);
  });

  it("uses Cmd on macOS, where Ctrl does nothing", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)"
    );
    renderHook(() => useAppKeyboard());
    ctrlShift("F");
    expect(useAppStore.getState().isReadingMode).toBe(false);
    press("F", { metaKey: true, shiftKey: true });
    expect(useAppStore.getState().isReadingMode).toBe(true);
  });

  it("uses Ctrl elsewhere, where Cmd does nothing", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (X11; Linux x86_64)");
    renderHook(() => useAppKeyboard());
    press("F", { metaKey: true, shiftKey: true });
    expect(useAppStore.getState().isReadingMode).toBe(false);
    press("F", { ctrlKey: true, shiftKey: true, metaKey: true });
    expect(useAppStore.getState().isReadingMode).toBe(false);
  });
});
