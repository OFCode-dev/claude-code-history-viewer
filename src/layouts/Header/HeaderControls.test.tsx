import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReadingModeButton } from "./ReadingModeButton";
import { HistoryNavButtons } from "./HistoryNavButtons";

const { store } = vi.hoisted(() => ({
  store: {
    isReadingMode: false,
    readingProfile: { left: "autohide", right: "autohide", top: "autohide" },
    isExplorerCollapsed: false,
    isSessionsPaneCollapsed: false,
    isNavigatorOpen: true,
    toggleReadingMode: vi.fn(),
    announceLayout: vi.fn(),
  },
}));

vi.mock("@/store/useAppStore", () => {
  const useAppStore = (selector: (state: typeof store) => unknown) => selector(store);
  useAppStore.getState = () => store;
  return { useAppStore };
});

vi.mock("@/contexts/platform", () => ({
  usePlatform: () => ({ isMobile: false }),
}));

vi.mock("sonner", () => ({ toast: vi.fn() }));

vi.mock("react-i18next", () => ({
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
  beforeEach(() => {
    store.isReadingMode = false;
    store.toggleReadingMode.mockClear();
    store.announceLayout.mockClear();
    localStorage.clear();
  });

  it("toggles reading mode and reports its state", () => {
    const { rerender } = render(
      <TooltipProvider>
        <ReadingModeButton />
      </TooltipProvider>,
    );

    const button = screen.getByRole("button", { name: "header.readingMode.label" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveAttribute("aria-keyshortcuts", "Control+Shift+F");
    fireEvent.click(button);
    expect(store.toggleReadingMode).toHaveBeenCalledTimes(1);

    store.isReadingMode = true;
    rerender(
      <TooltipProvider>
        <ReadingModeButton />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "header.readingMode.label" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("announces later entries; the very first one shows the hint instead", async () => {
    const { toast } = await import("sonner");
    vi.mocked(toast).mockClear();
    render(
      <TooltipProvider>
        <ReadingModeButton />
      </TooltipProvider>,
    );
    const button = screen.getByRole("button", { name: "header.readingMode.label" });

    fireEvent.click(button);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(store.announceLayout).not.toHaveBeenCalled();

    fireEvent.click(button);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(store.announceLayout).toHaveBeenCalledWith("readingMode.announce.on");
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
