import { describe, expect, it } from "vitest";
import {
  MIN_TRANSCRIPT_WIDTH_PX,
  panelsFoldedForRoom,
  panelsToCollapseForOpening,
  type FitInput,
  type SidePanel,
} from "./fitPanels";

/** Explorer 256, sessions 312, navigator 280, rails 24: the app's defaults. */
function layout(
  viewportWidth: number,
  open: Partial<Record<SidePanel, boolean>> = {},
  shown: Partial<Record<SidePanel, boolean>> = {},
  reservedWidth = 0
): FitInput {
  const panel = (name: SidePanel, width: number) => ({
    shown: shown[name] ?? true,
    open: open[name] ?? true,
    width,
  });
  return {
    viewportWidth,
    railWidth: 24,
    reservedWidth,
    panels: {
      explorer: panel("explorer", 256),
      sessions: panel("sessions", 312),
      navigator: panel("navigator", 280),
    },
  };
}

const folded = (input: FitInput) => [...panelsFoldedForRoom(input)].sort();

/** What the transcript gets once the folded panels render as rails. */
function transcriptWidth(input: FitInput): number {
  const rails = panelsFoldedForRoom(input);
  let used = input.reservedWidth;
  for (const [name, panel] of Object.entries(input.panels) as [SidePanel, FitInput["panels"]["explorer"]][]) {
    if (!panel.shown) continue;
    used += panel.open && !rails.has(name) ? panel.width : input.railWidth;
  }
  return input.viewportWidth - used;
}

describe("panelsFoldedForRoom", () => {
  it("folds nothing when the transcript keeps its minimum (1440 px, all open)", () => {
    expect(folded(layout(1440))).toEqual([]);
    expect(transcriptWidth(layout(1440))).toBe(592);
  });

  it("folds the navigator first (1280 px, all open)", () => {
    expect(folded(layout(1280))).toEqual(["navigator"]);
    expect(transcriptWidth(layout(1280))).toBeGreaterThanOrEqual(MIN_TRANSCRIPT_WIDTH_PX);
  });

  it("then the sessions pane (1024 px, all open)", () => {
    expect(folded(layout(1024))).toEqual(["navigator", "sessions"]);
    expect(transcriptWidth(layout(1024))).toBeGreaterThanOrEqual(MIN_TRANSCRIPT_WIDTH_PX);
  });

  it("then the explorer, last", () => {
    expect(folded(layout(760))).toEqual(["explorer", "navigator", "sessions"]);
  });

  it("skips panels that are folded already or not on screen", () => {
    // Below lg there is no sessions pane: the navigator alone makes room.
    expect(folded(layout(900, {}, { sessions: false }))).toEqual(["navigator"]);
    // A folded navigator is already a rail; the sessions pane folds next.
    expect(folded(layout(1024, { navigator: false }))).toEqual(["sessions"]);
  });

  it("counts other fixed columns such as the recent-edits dock", () => {
    expect(folded(layout(1440, {}, {}, 340))).toEqual(["navigator"]);
    expect(folded(layout(1280, {}, {}, 340))).toEqual(["navigator", "sessions"]);
  });
});

describe("panelsToCollapseForOpening", () => {
  it("opening the auto-folded navigator collapses the sessions pane (1280 px)", () => {
    expect(panelsToCollapseForOpening("navigator", layout(1280))).toEqual(["sessions"]);
    const after = layout(1280, { sessions: false });
    expect(panelsFoldedForRoom(after).has("navigator")).toBe(false);
    expect(transcriptWidth(after)).toBeGreaterThanOrEqual(MIN_TRANSCRIPT_WIDTH_PX);
  });

  it("collapses as many panels as it takes, in fold order (1024 px)", () => {
    expect(panelsToCollapseForOpening("navigator", layout(1024))).toEqual(["sessions", "explorer"]);
    expect(panelsToCollapseForOpening("sessions", layout(1024))).toEqual(["navigator", "explorer"]);
  });

  it("collapses nothing when the panel cannot fit even alone", () => {
    expect(panelsToCollapseForOpening("sessions", layout(800))).toEqual([]);
  });

  it("collapses nothing when the panel already fits", () => {
    expect(panelsToCollapseForOpening("explorer", layout(1440))).toEqual([]);
  });
});
