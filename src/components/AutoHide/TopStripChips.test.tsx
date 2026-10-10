import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "@/store/useAppStore";
import { AutoHideRegion } from "./AutoHideRegion";
import { revealPanel, sourceFromActivation } from "./panelActions";
import { panelShortcut } from "./shortcuts";
import { TopStripChips } from "./TopStripChips";
import { countHiddenMessageTypes } from "./topStripModel";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));

const defaults = {
  query: "",
  matchPosition: 0,
  matchCount: 0,
  onPrevMatch: vi.fn(),
  onNextMatch: vi.fn(),
  isDialogue: false,
  hiddenTypeCount: 0,
  onActivate: vi.fn(),
};

function Chips(props: Partial<typeof defaults>) {
  return (
    <TooltipProvider>
      <TopStripChips {...defaults} {...props} />
    </TooltipProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TopStripChips", () => {
  it("shows nothing while every tool is at its default", () => {
    render(<Chips />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("shows the search as a button whose name holds the full text", () => {
    render(<Chips query="needle" matchPosition={3} matchCount={14} />);
    const chip = screen.getByRole("button", { name: /readingMode\.chips\.search/ });
    expect(chip.getAttribute("aria-label")).toContain('"query":"needle"');
    expect(chip.getAttribute("aria-label")).toContain('"position":"3/14"');
    expect(chip).toHaveTextContent("“needle” 3/14");
  });

  it("steps through matches with the arrow buttons without opening anything", () => {
    render(<Chips query="needle" matchPosition={1} matchCount={2} />);
    fireEvent.click(screen.getByRole("button", { name: "readingMode.chips.nextMatch" }));
    fireEvent.click(screen.getByRole("button", { name: "readingMode.chips.prevMatch" }));
    expect(defaults.onNextMatch).toHaveBeenCalledTimes(1);
    expect(defaults.onPrevMatch).toHaveBeenCalledTimes(1);
    expect(defaults.onActivate).not.toHaveBeenCalled();
  });

  it("disables the arrows when nothing matches", () => {
    render(<Chips query="nothing" />);
    expect(screen.getByRole("button", { name: "readingMode.chips.nextMatch" })).toBeDisabled();
  });

  it("shows Dialogue instead of the filter count while the dialogue view is on", () => {
    render(<Chips isDialogue hiddenTypeCount={2} />);
    expect(screen.getByRole("button", { name: "readingMode.chips.dialogue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /filtersName/ })).toBeNull();
  });

  it("shows how many message types are hidden", () => {
    render(<Chips hiddenTypeCount={2} />);
    fireEvent.click(screen.getByRole("button", { name: /readingMode\.chips\.filtersName/ }));
    expect(defaults.onActivate).toHaveBeenCalledWith("filters", expect.anything());
  });
});

describe("countHiddenMessageTypes", () => {
  const filter = {
    roles: { user: true, assistant: false },
    contentTypes: { text: true, thinking: false, toolCalls: true, commands: true, parallelTasks: false },
  };

  it("counts each toggle that is off, parallel tasks only when the session has any", () => {
    expect(countHiddenMessageTypes(filter, false)).toBe(2);
    expect(countHiddenMessageTypes(filter, true)).toBe(3);
  });
});

describe("chip activation", () => {
  let frames: FrameRequestCallback[] = [];

  beforeEach(() => {
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

  it("opens the tools overlay and focuses that chip's control, text selected", () => {
    const chips = (
      <TopStripChips
        {...defaults}
        query="needle"
        matchPosition={1}
        matchCount={1}
        isDialogue
        onActivate={(target, event) => revealPanel("top", sourceFromActivation(event, "standard"), { focus: target })}
      />
    );
    render(
      <TooltipProvider>
        <AutoHideRegion group="top" mode="autohide" label="Conversation tools" shortcut={panelShortcut("top")} chips={chips}>
          <input aria-label="search" data-autohide-focus="search" defaultValue="needle" />
          <button type="button" data-autohide-focus="dialogue">Dialogue</button>
        </AutoHideRegion>
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /readingMode\.chips\.search/ }), { detail: 1 });
    expect(useAppStore.getState().revealed).toMatchObject({ group: "top", source: "click" });
    act(() => frames.splice(0).forEach((callback) => callback(0)));
    const input = screen.getByLabelText("search") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 6]);

    fireEvent.click(screen.getByRole("button", { name: "readingMode.chips.dialogue" }), { detail: 1 });
    act(() => frames.splice(0).forEach((callback) => callback(0)));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Dialogue" }));
  });
});
