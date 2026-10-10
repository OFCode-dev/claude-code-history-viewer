import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ImageRenderer } from "@/components/contentRenderer/ImageRenderer";
import { useAppStore } from "@/store/useAppStore";
import { AutoHideRegion } from "./AutoHideRegion";
import { revealPanel } from "./panelActions";
import { panelShortcut } from "./shortcuts";
import { useAutoHidePanel } from "./useAutoHidePanel";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

function Layout({ onTranscriptClick = () => {} }: { onTranscriptClick?: () => void }) {
  return (
    <TooltipProvider>
      <AutoHideRegion group="left" mode="autohide" label="Explorer and sessions" shortcut={panelShortcut("left")}>
        <aside id="project-explorer" tabIndex={-1}>
          <button type="button">row</button>
        </aside>
      </AutoHideRegion>
      <main id="main-content" tabIndex={-1}>
        <div data-transcript-area="">
          <button type="button" onClick={onTranscriptClick}>
            expand tool result
          </button>
          <p>plain text</p>
          <ImageRenderer imageUrl="data:image/png;base64,iVBORw0KGgo=" alt="shot" />
        </div>
      </main>
    </TooltipProvider>
  );
}

const pressEscape = (target: EventTarget = document.body) => {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    isReadingMode: true,
    readingProfile: { left: "autohide", right: "autohide", top: "autohide" },
    revealed: null,
    hoverReveal: "standard",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function openLeft() {
  act(() => {
    revealPanel("left", "click");
  });
  expect(useAppStore.getState().revealed?.group).toBe("left");
}

describe("useAutoHidePanel: Esc", () => {
  it("closes the open overlay", () => {
    renderHook(() => useAutoHidePanel(true));
    render(<Layout />);
    openLeft();
    act(() => {
      pressEscape();
    });
    expect(useAppStore.getState().revealed).toBeNull();
  });

  it("ignores an Esc another layer already used", () => {
    renderHook(() => useAutoHidePanel(true));
    render(<Layout />);
    openLeft();
    const claim = (event: KeyboardEvent) => event.preventDefault();
    document.addEventListener("keydown", claim);
    act(() => {
      pressEscape();
    });
    document.removeEventListener("keydown", claim);
    expect(useAppStore.getState().revealed?.group).toBe("left");
  });

  it("one Esc closes only the image lightbox", () => {
    renderHook(() => useAutoHidePanel(true));
    render(<Layout />);
    fireEvent.click(screen.getAllByRole("button", { name: "imageRenderer.viewFullscreen" })[0]!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    openLeft();

    act(() => {
      pressEscape();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useAppStore.getState().revealed?.group).toBe("left");

    act(() => {
      pressEscape();
    });
    expect(useAppStore.getState().revealed).toBeNull();
  });
});

describe("useAutoHidePanel: light dismiss", () => {
  it("swallows a press on a transcript control and moves focus out of the panel", () => {
    renderHook(() => useAutoHidePanel(true));
    const onTranscriptClick = vi.fn();
    render(<Layout onTranscriptClick={onTranscriptClick} />);
    openLeft();
    screen.getByRole("button", { name: "row" }).focus();

    const control = screen.getByRole("button", { name: "expand tool result" });
    act(() => {
      fireEvent.pointerDown(control, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1 });
      fireEvent.mouseDown(control);
      fireEvent.pointerUp(control, { pointerId: 1, pointerType: "mouse", button: 0 });
      fireEvent.mouseUp(control);
      fireEvent.click(control);
    });

    expect(onTranscriptClick).not.toHaveBeenCalled();
    expect(useAppStore.getState().revealed).toBeNull();
    expect(document.activeElement?.id).toBe("main-content");
  });

  it("lets a press on plain text through: caret and selection still work", () => {
    renderHook(() => useAutoHidePanel(true));
    render(<Layout />);
    openLeft();
    const text = screen.getByText("plain text");
    const mouseDown = vi.fn();
    text.addEventListener("mousedown", mouseDown);
    act(() => {
      fireEvent.pointerDown(text, { pointerId: 2, pointerType: "mouse", button: 0, buttons: 1 });
      fireEvent.mouseDown(text);
      fireEvent.pointerUp(text, { pointerId: 2, pointerType: "mouse", button: 0 });
    });
    expect(mouseDown).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().revealed).toBeNull();
  });

  it("a press alone does nothing: the overlay closes on the up-event", () => {
    renderHook(() => useAutoHidePanel(true));
    render(<Layout />);
    openLeft();
    act(() => {
      fireEvent.pointerDown(screen.getByText("plain text"), { pointerId: 3, pointerType: "mouse", buttons: 1 });
    });
    expect(useAppStore.getState().revealed?.group).toBe("left");
  });
});

describe("useAutoHidePanel: focus", () => {
  it("closes every overlay when an unrelated dialog takes focus", () => {
    renderHook(() => useAutoHidePanel(true));
    render(
      <>
        <Layout />
        <div role="dialog" aria-label="Search">
          <input aria-label="global search" />
        </div>
      </>,
    );
    openLeft();
    act(() => {
      screen.getByLabelText("global search").focus();
    });
    expect(useAppStore.getState().revealed).toBeNull();
  });

  it("stops when reading mode ends", () => {
    const { rerender } = renderHook(({ active }) => useAutoHidePanel(active), {
      initialProps: { active: true },
    });
    render(<Layout />);
    openLeft();
    rerender({ active: false });
    act(() => {
      pressEscape();
    });
    // Nothing listens any more: the overlay is left to the store.
    expect(useAppStore.getState().revealed?.group).toBe("left");
  });
});
