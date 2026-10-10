/**
 * Every tuning value of reading mode's auto-hiding panels, in one place.
 * The values and their acceptable ranges come from the design spec
 * (specs/20261010-reading-mode-autohide/spec.md §3); the owner task check
 * adjusts them within those ranges: band height first, then dwell, then grace.
 */

/** Hover-reactive band at the top of a side gutter (px). Range 80–120. */
export const HOVER_BAND_PX = 96;

/** Hover reveal timing for one speed preset (ms). */
export interface DwellTiming {
  /** Pointer in the band and at rest this long. */
  rest: number;
  /** Pointer in the band this long, at rest or not. */
  fallback: number;
}

/** Standard preset, side gutters: 300 ms at rest (250–400), 700 ms fallback (600–1000). */
export const STANDARD_SIDE_DWELL: DwellTiming = { rest: 300, fallback: 700 };
/** Standard preset, top handle: 400 ms at rest (350–500); the inner edge sees more traffic. */
export const STANDARD_TOP_DWELL: DwellTiming = { rest: 400, fallback: 700 };
/** Slow preset, every edge: 800 ms at rest (700–1000), 1200 ms fallback (1000–1500). */
export const SLOW_DWELL: DwellTiming = { rest: 800, fallback: 1200 };

/** At rest: total |dx|+|dy| at most this many px … (5–8) */
export const REST_DISTANCE_PX = 6;
/** … over this window (ms). */
export const REST_WINDOW_MS = 100;

/** Warm re-entry: within this long of a pointer-leave close (1500–3000) … */
export const WARM_WINDOW_MS = 2000;
/** … presence this long reveals, with no rest rule (Standard only). */
export const WARM_DWELL_MS = 150;

/** Hide grace once no hold is active (400–700). */
export const HIDE_GRACE_MS = 500;
/** Hysteresis margin around the overlay rectangle (12–24). */
export const HYSTERESIS_PX = 16;
/** Trusted pointer travel that releases a non-editable focus hold (16–40). */
export const FOCUS_RELEASE_MOVE_PX = 24;
/** A focus change outside the panel counts as keyboard-driven within this long of a key (300–700). */
export const KEY_FOCUS_WINDOW_MS = 500;
/** A disarmed zone re-arms this long after the pointer moved out of it (250–400). */
export const REARM_MS = 300;
/** No hover reveal this long after any wheel event (300–600). */
export const WHEEL_VETO_MS = 500;
/** No hover reveal this long after a key press (700–1500). */
export const KEY_VETO_MS = 1000;

/** Left overlay: never narrower than this from 1024 px up … */
export const LEFT_OVERLAY_FLOOR_WIDE_PX = 420;
/** … and from 768 to 1023 px. Right overlay floor too. */
export const OVERLAY_FLOOR_NARROW_PX = 200;
/** Overlays leave at least this much of the reading column uncovered (320–400). */
export const OVERLAY_TRANSCRIPT_RESERVE_PX = 360;

/** Wheel forwarding from a gutter: one "line" of `deltaMode === 1`. */
export const WHEEL_LINE_PX = 40;

/** Slide durations (ms); reduced motion uses an opacity fade instead. */
export const SLIDE_IN_MS = { left: 200, right: 180, top: 150 } as const;
export const SLIDE_OUT_MS = { left: 150, right: 150, top: 120 } as const;
/** Slide-in after a warm re-entry. */
export const WARM_SLIDE_MS = 100;

/**
 * A pointerdown outside the panel on one of these, inside the transcript
 * area, is swallowed: a dismiss click must not expand, copy or navigate.
 */
export const DISMISS_SWALLOW_SELECTOR = [
  "a[href]",
  "button",
  "summary",
  "input",
  "select",
  "textarea",
  "label",
  "[role=button]",
  "[role=link]",
  "[role=tab]",
  "[role=checkbox]",
  "[role=switch]",
  "[role=menuitem]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Marks controls inside a side gutter that work without opening the panel
 * (the previous / next prompt buttons): the pointer over them is never in
 * the hover band, and a click on them does not open the panel.
 */
export const AUTOHIDE_COLD_ATTR = "data-autohide-cold";

/** Marks the container of the sticky prompt bar and the transcript scroller. */
export const TRANSCRIPT_AREA_ATTR = "data-transcript-area";

/** localStorage flag that logs every reveal and close decision to the console. */
export const AUTOHIDE_DEBUG_KEY = "autohide-debug";
