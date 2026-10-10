import { describe, expect, it } from "vitest";
import { overlayWidth, splitLeftOverlay } from "./overlayWidth";

describe("overlayWidth", () => {
  it("uses the panels' pinned width when the column has room", () => {
    expect(overlayWidth(556, 1392, 420)).toBe(556);
  });

  it("leaves 360 px of the reading column uncovered", () => {
    // 1024 px window: column 976 px, cap 616.
    expect(overlayWidth(700, 976, 420)).toBe(616);
  });

  it("lets the floor win when cap and floor cannot both hold", () => {
    // 800 px window: column 752 px, cap 392, floor 420 at lg+ (200 below).
    expect(overlayWidth(556, 752, 420)).toBe(420);
    expect(overlayWidth(256, 500, 200)).toBe(200);
  });

  it("never stretches the panels wider than they are", () => {
    expect(overlayWidth(256, 1392, 420)).toBe(256);
  });
});

describe("splitLeftOverlay", () => {
  it("keeps both widths when the overlay is not capped", () => {
    expect(splitLeftOverlay(556, 256, 300)).toEqual({ explorer: 256, sessions: 300 });
  });

  it("shares a capped overlay in proportion", () => {
    const split = splitLeftOverlay(420, 256, 300);
    expect(split.explorer + (split.sessions ?? 0)).toBe(420);
    expect(split.explorer).toBe(193);
  });

  it("gives everything to the explorer when there is no sessions pane", () => {
    expect(splitLeftOverlay(300, 256, null)).toEqual({ explorer: 300, sessions: null });
  });
});
