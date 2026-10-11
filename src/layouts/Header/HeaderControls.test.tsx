import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReadingModeButton } from "./ReadingModeButton";
import { HistoryNavButtons } from "./HistoryNavButtons";
import { useAppStore } from "@/store/useAppStore";

vi.mock("@/contexts/platform", () => ({
  usePlatform: () => ({ isMobile: false }),
}));

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

type TauriWindow = typeof window & { __TAURI_INTERNALS__?: unknown };
type NavigationWindow = typeof window & { navigation?: unknown };

describe("HistoryNavButtons", () => {
  afterEach(() => {
    delete (window as TauriWindow).__TAURI_INTERNALS__;
    delete (window as NavigationWindow).navigation;
    vi.restoreAllMocks();
  });

  it("walks the browser history in the WebUI", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const forward = vi.spyOn(window.history, "forward").mockImplementation(() => {});
    render(
      <TooltipProvider>
        <HistoryNavButtons />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "header.history.back" }));
    fireEvent.click(screen.getByRole("button", { name: "header.history.forward" }));

    expect(back).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledTimes(1);
  });

  it("disables a direction the Navigation API reports as unavailable", () => {
    const navigation = Object.assign(new EventTarget(), {
      canGoBack: true,
      canGoForward: false,
    });
    (window as NavigationWindow).navigation = navigation;
    render(
      <TooltipProvider>
        <HistoryNavButtons />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "header.history.back" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "header.history.forward" })).toBeDisabled();
  });

  it("is hidden in the desktop build", () => {
    (window as TauriWindow).__TAURI_INTERNALS__ = {};
    const { container } = render(
      <TooltipProvider>
        <HistoryNavButtons />
      </TooltipProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ReadingModeButton", () => {
  const original = useAppStore.getState();

  function renderButton() {
    return render(
      <TooltipProvider>
        <ReadingModeButton />
      </TooltipProvider>,
    );
  }
  const button = () => screen.getByRole("button", { name: "header.readingMode.label" });
  const state = () => useAppStore.getState();

  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      isExplorerCollapsed: false,
      isSessionsPaneCollapsed: false,
      isConversationToolsCollapsed: false,
      isNavigatorOpen: true,
      layoutAnnouncement: null,
    });
  });

  afterEach(() => {
    useAppStore.setState({
      isExplorerCollapsed: original.isExplorerCollapsed,
      isSessionsPaneCollapsed: original.isSessionsPaneCollapsed,
      isConversationToolsCollapsed: original.isConversationToolsCollapsed,
      isNavigatorOpen: original.isNavigatorOpen,
      layoutAnnouncement: null,
    });
  });

  it("collapses all four areas, is then pressed, and expands all four again", () => {
    renderButton();
    expect(button()).toHaveAttribute("aria-pressed", "false");
    expect(button()).toHaveAttribute("aria-keyshortcuts", "Control+Shift+F");

    fireEvent.click(button());
    expect(state().isExplorerCollapsed).toBe(true);
    expect(state().isSessionsPaneCollapsed).toBe(true);
    expect(state().isConversationToolsCollapsed).toBe(true);
    expect(state().isNavigatorOpen).toBe(false);
    expect(button()).toHaveAttribute("aria-pressed", "true");
    expect(state().layoutAnnouncement?.text).toBe("readingMode.announce.collapsed");

    fireEvent.click(button());
    expect(state().isExplorerCollapsed).toBe(false);
    expect(state().isNavigatorOpen).toBe(true);
    expect(button()).toHaveAttribute("aria-pressed", "false");
    expect(state().layoutAnnouncement?.text).toBe("readingMode.announce.expanded");
  });

  it("collapses the rest when only some areas are folded (no earlier combination is restored)", () => {
    useAppStore.setState({ isExplorerCollapsed: true, isNavigatorOpen: false });
    renderButton();
    expect(button()).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button());
    expect(button()).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button());
    expect(state().isExplorerCollapsed).toBe(false);
    expect(state().isNavigatorOpen).toBe(true);
  });
});

describe("header controls focus indicator", () => {
  afterEach(() => {
    delete (window as TauriWindow).__TAURI_INTERNALS__;
  });

  it("draws a focus ring on each header control for keyboard users", () => {
    render(
      <TooltipProvider>
        <HistoryNavButtons />
        <ReadingModeButton />
      </TooltipProvider>,
    );

    for (const name of ["header.history.back", "header.history.forward", "header.readingMode.label"]) {
      expect(screen.getByRole("button", { name })).toHaveClass("focus-visible:ring-2");
    }
  });
});
