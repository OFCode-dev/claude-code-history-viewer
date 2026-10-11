import { render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import { areAllCollapsed } from "@/store/slices/layoutSlice";
import { AREA_TOGGLE_ATTR, RAIL_ATTR } from "@/layouts/areaToggleAttr";
import { changeLayout } from "@/layouts/collapsibleAreas";
import {
  CONVERSATION_TOOLS_ID,
  CONVERSATION_TOOLS_PANEL_ID,
  TOOL_FOCUS_ATTR,
} from "@/components/MessageViewer/components/conversationToolsActions";
import { useAppKeyboard } from "./useAppKeyboard";

const { platform } = vi.hoisted(() => ({ platform: { isMobile: false } }));

vi.mock("@/contexts/modal", () => ({
  useModal: () => ({ openModal: vi.fn() }),
}));

vi.mock("@/contexts/platform", () => ({
  usePlatform: () => platform,
}));

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

const toggle = { [AREA_TOGGLE_ATTR]: "" };
const rail = { [RAIL_ATTR]: "" };

/**
 * The four areas as the layout renders them, each in its current form, with
 * toggles that flip their flag as AppLayout's do. `navigatorRoomFolded`
 * renders the navigator as a rail although its flag is open (folded for lack
 * of room), with `onNavigatorToggle` standing in for AppLayout's handler.
 */
function Layout({
  withSessions = false,
  navigatorRoomFolded = false,
  onNavigatorToggle,
}: {
  withSessions?: boolean;
  navigatorRoomFolded?: boolean;
  onNavigatorToggle?: () => void;
}) {
  const explorerCollapsed = useAppStore((s) => s.isExplorerCollapsed);
  const sessionsCollapsed = useAppStore((s) => s.isSessionsPaneCollapsed);
  const navigatorOpen = useAppStore((s) => s.isNavigatorOpen) && !navigatorRoomFolded;
  const toolsCollapsed = useAppStore((s) => s.isConversationToolsCollapsed);
  const store = useAppStore.getState();
  const toggleExplorer = () => changeLayout(store.toggleExplorerCollapsed);
  const toggleSessions = () => changeLayout(store.toggleSessionsPaneCollapsed);
  const toggleNavigator = onNavigatorToggle ?? (() => changeLayout(store.toggleNavigator));
  return (
    <>
      <aside id="project-explorer" tabIndex={-1} {...(explorerCollapsed ? rail : {})}>
        {explorerCollapsed ? (
          <button type="button" {...toggle} onClick={toggleExplorer}>expand explorer</button>
        ) : (
          <>
            <button type="button" {...toggle} onClick={toggleExplorer}>collapse explorer</button>
            <div role="treeitem" tabIndex={-1} aria-selected="false">other</div>
            <div role="treeitem" tabIndex={-1} aria-selected="true">selected project</div>
          </>
        )}
      </aside>
      {withSessions && (
        <aside id="sessions-pane" tabIndex={-1} {...(sessionsCollapsed ? rail : {})}>
          {sessionsCollapsed ? (
            <button type="button" {...toggle} onClick={toggleSessions}>expand sessions</button>
          ) : (
            <div data-session-list="">
              <button type="button" data-session-open="" tabIndex={-1}>other session</button>
              <button type="button" data-session-open="" aria-current="true" tabIndex={0}>
                selected session
              </button>
            </div>
          )}
        </aside>
      )}
      <main id="main-content" tabIndex={-1}>
        <div id={CONVERSATION_TOOLS_ID}>
          {toolsCollapsed && <button type="button" {...toggle}>expand tools</button>}
          <div id={CONVERSATION_TOOLS_PANEL_ID} hidden={toolsCollapsed}>
            <input aria-label="search" {...{ [TOOL_FOCUS_ATTR]: "search" }} defaultValue="" />
          </div>
        </div>
        <button type="button">transcript button</button>
      </main>
      <aside id="message-navigator" tabIndex={-1} {...(navigatorOpen ? {} : rail)}>
        {navigatorOpen ? (
          <>
            <button type="button" {...toggle} onClick={toggleNavigator}>collapse navigator</button>
            <button type="button" role="option" tabIndex={0}>current prompt</button>
          </>
        ) : (
          <button type="button" {...toggle} onClick={toggleNavigator}>expand navigator</button>
        )}
      </aside>
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
      isExplorerCollapsed: false,
      isSessionsPaneCollapsed: false,
      isConversationToolsCollapsed: false,
      isNavigatorOpen: true,
      layoutAnnouncement: null,
      sessionSearch: { ...initialState.sessionSearch, query: "" },
    },
    true
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const allCollapsed = () => areAllCollapsed(useAppStore.getState());

describe("Mod+Shift+F: collapse all / expand all", () => {
  it("collapses all four areas, then expands all four, and announces each", () => {
    renderHook(() => useAppKeyboard());
    const event = ctrlShift("F");
    expect(event.defaultPrevented).toBe(true);
    expect(allCollapsed()).toBe(true);
    expect(useAppStore.getState().layoutAnnouncement?.text).toBe("readingMode.announce.collapsed");

    ctrlShift("F");
    const state = useAppStore.getState();
    expect(state.isExplorerCollapsed || state.isSessionsPaneCollapsed).toBe(false);
    expect(state.isConversationToolsCollapsed).toBe(false);
    expect(state.isNavigatorOpen).toBe(true);
    expect(state.layoutAnnouncement?.text).toBe("readingMode.announce.expanded");
  });

  it("collapses everything while any one area is still open", () => {
    useAppStore.setState({
      isExplorerCollapsed: true,
      isSessionsPaneCollapsed: true,
      isNavigatorOpen: false,
      isConversationToolsCollapsed: false,
    });
    renderHook(() => useAppKeyboard());
    ctrlShift("F");
    expect(allCollapsed()).toBe(true);
  });

  it("ignores key repeat", () => {
    renderHook(() => useAppKeyboard());
    ctrlShift("F", { repeat: true });
    expect(allCollapsed()).toBe(false);
  });

  it("is ignored while typing in a field", () => {
    renderHook(() => useAppKeyboard());
    const { getByRole } = render(<input type="text" aria-label="query" />);
    ctrlShift("F", {}, getByRole("textbox"));
    expect(allCollapsed()).toBe(false);
  });

  it("does nothing below 768 px", () => {
    platform.isMobile = true;
    renderHook(() => useAppKeyboard());
    ctrlShift("F");
    expect(allCollapsed()).toBe(false);
  });

  it("moves focus from a folded panel to that panel's expand button", () => {
    renderHook(() => useAppKeyboard());
    const { getByText } = render(<Layout />);
    const row = getByText("selected project");
    row.focus();
    ctrlShift("F", {}, row);
    expect(document.activeElement).toBe(getByText("expand explorer"));
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
  it("unfolds the explorer rail and focuses the selected row", () => {
    useAppStore.setState({ isExplorerCollapsed: true });
    renderHook(() => useAppKeyboard());
    const { getByText } = render(<Layout />);
    ctrlShift("E");
    flushFrames();
    expect(useAppStore.getState().isExplorerCollapsed).toBe(false);
    expect(document.activeElement).toBe(getByText("selected project"));
  });

  it("also unfolds the sessions rail and lands on the selected session first", () => {
    useAppStore.setState({
      isExplorerCollapsed: true,
      isSessionsPaneCollapsed: true,
      selectedSession: { session_id: "s1" } as never,
    });
    renderHook(() => useAppKeyboard());
    const { getByText } = render(<Layout withSessions />);
    ctrlShift("E");
    flushFrames();
    expect(useAppStore.getState().isExplorerCollapsed).toBe(false);
    expect(useAppStore.getState().isSessionsPaneCollapsed).toBe(false);
    expect(document.activeElement).toBe(getByText("selected session"));
  });

  it("falls back to the physical key on a non-Latin layout", () => {
    useAppStore.setState({ isExplorerCollapsed: true });
    renderHook(() => useAppKeyboard());
    render(<Layout />);
    ctrlShift("У", { code: "KeyE" });
    expect(useAppStore.getState().isExplorerCollapsed).toBe(false);
  });

  it("is ignored inside a dialog or a menu", () => {
    useAppStore.setState({ isExplorerCollapsed: true });
    renderHook(() => useAppKeyboard());
    const { getByText } = render(
      <div role="dialog">
        <button type="button">in dialog</button>
      </div>,
    );
    ctrlShift("E", {}, getByText("in dialog"));
    expect(useAppStore.getState().isExplorerCollapsed).toBe(true);
  });

  it("ignores IME composition", () => {
    useAppStore.setState({ isExplorerCollapsed: true });
    renderHook(() => useAppKeyboard());
    render(<Layout />);
    ctrlShift("E", { isComposing: true });
    expect(useAppStore.getState().isExplorerCollapsed).toBe(true);
  });
});

describe("Mod+Shift+M: prompts", () => {
  it("folds and unfolds the navigator", () => {
    renderHook(() => useAppKeyboard());
    ctrlShift("M");
    expect(useAppStore.getState().isNavigatorOpen).toBe(false);
    ctrlShift("M");
    expect(useAppStore.getState().isNavigatorOpen).toBe(true);
  });

  it("hands focus from a folded navigator row to its expand button", () => {
    renderHook(() => useAppKeyboard());
    const { getByText } = render(<Layout />);
    const row = getByText("current prompt");
    row.focus();
    ctrlShift("M", {}, row);
    expect(document.activeElement).toBe(getByText("expand navigator"));
  });

  it("presses the navigator's own toggle, so a rail folded for lack of room makes room", () => {
    const onNavigatorToggle = vi.fn();
    renderHook(() => useAppKeyboard());
    render(<Layout navigatorRoomFolded onNavigatorToggle={onNavigatorToggle} />);
    ctrlShift("M");
    expect(onNavigatorToggle).toHaveBeenCalledTimes(1);
    // The flag is left to that handler.
    expect(useAppStore.getState().isNavigatorOpen).toBe(true);
  });

  it("below 768 px swallows the chord (browser profile menu) and changes nothing", () => {
    platform.isMobile = true;
    renderHook(() => useAppKeyboard());
    expect(ctrlShift("M").defaultPrevented).toBe(true);
    expect(useAppStore.getState().isNavigatorOpen).toBe(true);
  });
});

describe("Mod+F: conversation search", () => {
  it("expands collapsed tools and selects the search field; then passes to browser find", () => {
    useAppStore.setState({ isConversationToolsCollapsed: true });
    renderHook(() => useAppKeyboard());
    const { getByLabelText } = render(<Layout />);
    const input = getByLabelText("search") as HTMLInputElement;

    expect(press("f", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(useAppStore.getState().isConversationToolsCollapsed).toBe(false);
    expect(document.activeElement).toBe(input);

    input.value = "query";
    input.setSelectionRange(5, 5);
    expect(press("f", { ctrlKey: true }, input).defaultPrevented).toBe(true);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 5]);

    // Fully selected: the press goes to browser find.
    expect(press("f", { ctrlKey: true }, input).defaultPrevented).toBe(false);
  });

  it("focuses the field directly when the tools are open", () => {
    renderHook(() => useAppKeyboard());
    const { getByLabelText } = render(<Layout />);
    press("f", { ctrlKey: true });
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

  it("steps through matches without expanding the collapsed tools", () => {
    useAppStore.setState({ isConversationToolsCollapsed: true });
    const { goToNextMatch, goToPrevMatch } = withSearch("needle");
    renderHook(() => useAppKeyboard());
    render(<Layout />);

    expect(press("g", { ctrlKey: true }).defaultPrevented).toBe(true);
    press("G", { ctrlKey: true, shiftKey: true });
    press("F3");
    press("F3", { shiftKey: true });

    expect(goToNextMatch).toHaveBeenCalledTimes(2);
    expect(goToPrevMatch).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().isConversationToolsCollapsed).toBe(true);
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
    expect(allCollapsed()).toBe(false);
    expect(useAppStore.getState().isNavigatorOpen).toBe(true);
  });

  it("uses Cmd on macOS, where Ctrl does nothing", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)"
    );
    renderHook(() => useAppKeyboard());
    ctrlShift("F");
    expect(allCollapsed()).toBe(false);
    press("F", { metaKey: true, shiftKey: true });
    expect(allCollapsed()).toBe(true);
  });

  it("uses Ctrl elsewhere, where Cmd does nothing", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (X11; Linux x86_64)");
    renderHook(() => useAppKeyboard());
    press("F", { metaKey: true, shiftKey: true });
    expect(allCollapsed()).toBe(false);
    press("F", { ctrlKey: true, shiftKey: true, metaKey: true });
    expect(allCollapsed()).toBe(false);
  });
});
