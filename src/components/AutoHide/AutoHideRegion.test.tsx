import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "@/store/useAppStore";
import type { EffectiveGroupMode, PanelGroup } from "@/store/slices/layoutSlice";
import { AutoHideRegion } from "./AutoHideRegion";
import { PinToggle } from "./PinToggle";
import { concealPanel, revealPanel } from "./panelActions";
import { panelShortcut } from "./shortcuts";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "readingMode.handle.tooltip") return `${options?.name} (${options?.shortcut})`;
      if (key === "readingMode.pin.tooltip") return `${options?.name}: keep visible in reading mode`;
      return key;
    },
  }),
}));

let frames: FrameRequestCallback[] = [];
const flushFrames = () => {
  for (let round = 0; round < 3; round += 1) {
    const pending = frames;
    frames = [];
    pending.forEach((callback) => callback(0));
  }
};

const LABELS: Record<PanelGroup, string> = {
  left: "Explorer and sessions",
  right: "Prompts",
  top: "Conversation tools",
};

function Region({
  group = "left",
  mode = "autohide",
  showBefore = true,
}: {
  group?: PanelGroup;
  mode?: EffectiveGroupMode;
  showBefore?: boolean;
}) {
  return (
    <TooltipProvider>
      {showBefore && <button type="button">before</button>}
      <AutoHideRegion group={group} mode={mode} label={LABELS[group]} shortcut={panelShortcut(group)}>
        <aside id="project-explorer" tabIndex={-1} aria-label="Explorer">
          <div role="treeitem" tabIndex={-1} aria-selected="true">selected row</div>
          <input aria-label="filter" />
        </aside>
      </AutoHideRegion>
      <main id="main-content" tabIndex={-1}>
        <button type="button">in transcript</button>
      </main>
    </TooltipProvider>
  );
}

const overlay = () => document.getElementById("autohide-overlay-left") as HTMLElement;
const handle = () => screen.getByRole("button", { name: "Explorer and sessions" });

beforeEach(() => {
  localStorage.clear();
  frames = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
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

describe("AutoHideRegion: hidden state and ARIA", () => {
  it("is a labelled region whose hidden panel is inert", () => {
    render(<Region />);
    expect(screen.getByRole("region", { name: "Explorer and sessions" })).toBeInTheDocument();
    expect(overlay()).toHaveAttribute("inert");
    expect(overlay()).toHaveAttribute("data-state", "closed");
  });

  it("names the handle and reports the real visibility, hover reveals included", () => {
    render(<Region />);
    expect(handle()).toHaveAttribute("aria-expanded", "false");
    expect(handle()).toHaveAttribute("aria-controls", "autohide-overlay-left");
    expect(handle()).toHaveAttribute("aria-keyshortcuts", "Control+Shift+E");

    act(() => {
      revealPanel("left", "hover");
    });
    expect(handle()).toHaveAttribute("aria-expanded", "true");
    expect(overlay()).not.toHaveAttribute("inert");
    expect(overlay()).toHaveAttribute("data-state", "open");
  });

  it("shows a tooltip that starts with the accessible name, on hover only with hover reveal Off", () => {
    useAppStore.setState({ hoverReveal: "off" });
    render(<Region />);
    fireEvent.pointerEnter(handle());
    expect(screen.getByRole("tooltip")).toHaveTextContent(/^Explorer and sessions \(Ctrl\+Shift\+E\)/);
  });

  it("shows no hover tooltip while hover reveal is on (the opening panel is the feedback)", () => {
    render(<Region />);
    fireEvent.pointerEnter(handle());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("renders the panel in flow, unlabelled and without a handle, outside auto-hide", () => {
    for (const mode of ["normal", "pinned"] as const) {
      const view = render(<Region mode={mode} />);
      expect(screen.queryByRole("region", { name: "Explorer and sessions" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Explorer and sessions" })).toBeNull();
      expect(overlay()).not.toHaveAttribute("inert");
      expect(screen.getByRole("treeitem")).toBeInTheDocument();
      view.unmount();
    }
  });

  it("keeps the panel mounted across a pin, so its state and focus survive", () => {
    const { rerender } = render(<Region mode="autohide" />);
    act(() => {
      revealPanel("left", "click");
    });
    const input = screen.getByLabelText("filter") as HTMLInputElement;
    input.value = "kept";
    input.focus();
    rerender(<Region mode="pinned" />);
    expect(screen.getByLabelText("filter")).toBe(input);
    expect(input.value).toBe("kept");
    expect(document.activeElement).toBe(input);
  });
});

describe("AutoHideRegion: focus on close", () => {
  it("moves focus out before the panel becomes inert, to the handle", () => {
    render(<Region />);
    act(() => {
      revealPanel("left", "click");
    });
    const row = screen.getByRole("treeitem");
    row.focus();
    let focusWhenInert: Element | null = null;
    const setAttribute = Element.prototype.setAttribute;
    vi.spyOn(Element.prototype, "setAttribute").mockImplementation(function (
      this: Element,
      name: string,
      value: string
    ) {
      if (name === "inert" && this === overlay()) focusWhenInert = document.activeElement;
      setAttribute.call(this, name, value);
    });

    act(() => concealPanel("left", "handle"));
    expect(overlay()).toHaveAttribute("inert");
    expect(focusWhenInert).toBe(handle());
    expect(document.activeElement).toBe(handle());
  });

  it("returns focus to where it was after a keyboard open closed with Esc", () => {
    render(<Region />);
    const before = screen.getByRole("button", { name: "before" });
    before.focus();
    act(() => {
      revealPanel("left", "keyboard");
    });
    act(() => flushFrames());
    expect(document.activeElement).toBe(screen.getByRole("treeitem"));

    act(() => concealPanel("left", "return"));
    expect(document.activeElement).toBe(before);
  });

  it("falls back to the handle when the return target has gone", () => {
    const { rerender } = render(<Region />);
    const before = screen.getByRole("button", { name: "before" });
    before.focus();
    act(() => {
      revealPanel("left", "keyboard");
    });
    act(() => flushFrames());
    rerender(<Region showBefore={false} />);
    expect(before.isConnected).toBe(false);
    act(() => concealPanel("left", "return"));
    expect(document.activeElement).toBe(handle());
  });

  it("never moves focus that is outside the panel", () => {
    render(<Region />);
    act(() => {
      revealPanel("left", "hover");
    });
    const elsewhere = screen.getByRole("button", { name: "in transcript" });
    elsewhere.focus();
    act(() => concealPanel("left", "handle"));
    expect(document.activeElement).toBe(elsewhere);
  });

  it("a handle click on a hover-opened panel confirms it instead of closing it", () => {
    render(<Region />);
    act(() => {
      revealPanel("left", "hover");
    });
    fireEvent.click(handle(), { detail: 1 });
    expect(useAppStore.getState().revealed).toMatchObject({ group: "left", source: "click" });
    fireEvent.click(handle(), { detail: 1 });
    expect(useAppStore.getState().revealed).toBeNull();
  });

  it("a handle activated from the keyboard opens with focus in the panel", () => {
    render(<Region />);
    fireEvent.click(handle(), { detail: 0 });
    expect(useAppStore.getState().revealed).toMatchObject({ group: "left", source: "keyboard" });
    act(() => flushFrames());
    expect(document.activeElement).toBe(screen.getByRole("treeitem"));
  });

  it("opens sticky from a click while hover reveal is Off", () => {
    useAppStore.setState({ hoverReveal: "off" });
    render(<Region />);
    fireEvent.click(handle(), { detail: 1 });
    expect(useAppStore.getState().revealed).toMatchObject({ group: "left", source: "sticky" });
  });
});

describe("PinToggle", () => {
  it("has a stable name per group and reports the pin in aria-pressed", () => {
    useAppStore.setState({ readingProfile: { left: "pinned", right: "autohide", top: "autohide" } });
    render(
      <TooltipProvider>
        <PinToggle group="left" />
        <PinToggle group="right" />
        <PinToggle group="top" />
      </TooltipProvider>,
    );
    const names = ["readingMode.pin.left", "readingMode.pin.right", "readingMode.pin.top"];
    const buttons = names.map((name) => screen.getByRole("button", { name }));
    expect(new Set(buttons).size).toBe(3);
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(buttons[1]!);
    expect(useAppStore.getState().readingProfile.right).toBe("pinned");
    expect(useAppStore.getState().layoutAnnouncement?.text).toBe("readingMode.pin.announcePinned");
  });

  it("unpinning hands focus to the group's handle", () => {
    useAppStore.setState({ readingProfile: { left: "pinned", right: "autohide", top: "autohide" } });
    function Pinned() {
      const mode = useAppStore((s) => s.readingProfile.left);
      return (
        <TooltipProvider>
          <AutoHideRegion group="left" mode={mode} label="Explorer and sessions" shortcut={panelShortcut("left")}>
            <PinToggle group="left" />
          </AutoHideRegion>
          <main id="main-content" tabIndex={-1} />
        </TooltipProvider>
      );
    }
    render(<Pinned />);
    const pin = screen.getByRole("button", { name: "readingMode.pin.left" });
    pin.focus();
    fireEvent.click(pin);
    expect(useAppStore.getState().readingProfile.left).toBe("autohide");
    expect(document.activeElement).toBe(handle());
  });
});
