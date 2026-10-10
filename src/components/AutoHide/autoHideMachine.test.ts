import { describe, expect, it } from "vitest";
import {
  createAutoHideState,
  stepAutoHide,
  type AutoHideEffect,
  type AutoHideEnv,
  type AutoHideEvent,
  type AutoHideState,
  type PointerKind,
} from "./autoHideMachine";
import type { HoverRevealSetting, PanelGroup, RevealSource } from "@/store/slices/layoutSlice";

const ENV: AutoHideEnv = { documentFocused: true, layerOpen: false };

interface Where {
  x?: number;
  y?: number;
  hot?: PanelGroup | null;
  inside?: PanelGroup | null;
  inOverlay?: boolean;
  kind?: PointerKind;
  buttons?: number;
}

/**
 * Drives the reducer the way the DOM adapter does: every event carries its
 * time, and a tick is delivered at each wake-up the reducer asks for.
 */
function harness(hoverReveal: HoverRevealSetting = "standard") {
  let state: AutoHideState = createAutoHideState(hoverReveal);
  let wakeAt: number | null = null;
  let now = 0;
  let env: AutoHideEnv = ENV;
  let last = { x: 600, y: 400 };
  const effects: AutoHideEffect[] = [];

  const send = (event: AutoHideEvent) => {
    const result = stepAutoHide(state, event);
    state = result.state;
    wakeAt = result.wakeAt;
    effects.push(...result.effects);
    return result.effects;
  };

  /** Lets time pass, delivering every tick the reducer scheduled. */
  const advanceTo = (time: number) => {
    while (wakeAt != null && wakeAt <= time) {
      now = Math.max(now, wakeAt);
      send({ type: "tick", now, env });
    }
    now = time;
    send({ type: "tick", now, env });
  };

  const move = (time: number, where: Where = {}) => {
    advanceTo(time);
    last = { x: where.x ?? last.x, y: where.y ?? last.y };
    return send({
      type: "pointerMove",
      now,
      x: last.x,
      y: last.y,
      kind: where.kind ?? "mouse",
      buttons: where.buttons ?? 0,
      hot: where.hot ?? null,
      inside: where.inside ?? null,
      inOverlay: where.inOverlay ?? false,
      env,
    });
  };

  const at = (time: number, event: Omit<AutoHideEvent, "now"> & Record<string, unknown>) => {
    advanceTo(time);
    return send({ ...event, now } as AutoHideEvent);
  };

  const reveals = () => effects.filter((e) => e.type === "reveal");
  const hides = () => effects.filter((e) => e.type === "hide");

  return {
    send,
    move,
    at,
    advanceTo,
    reveals,
    hides,
    effects,
    get state() {
      return state;
    },
    get now() {
      return now;
    },
    setEnv(next: Partial<AutoHideEnv>) {
      env = { ...env, ...next };
    },
    /** Moves in the transcript so every zone arms (zones start disarmed). */
    warmUp() {
      move(0, { x: 600, y: 400 });
      move(10, { x: 610, y: 400 });
      advanceTo(400);
    },
    /** Pointer arrives in the left band and stays still. */
    enterLeftBand(time: number) {
      move(time, { x: 12, y: 60, hot: "left", inside: "left" });
    },
    open(group: PanelGroup, source: RevealSource, time = now) {
      return at(time, { type: "explicitOpen", group, source });
    },
  };
}

describe("autoHideMachine: hover dwell", () => {
  it("reveals after 300 ms at rest in the band, not before", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(1299);
    expect(m.reveals()).toHaveLength(0);
    m.advanceTo(1300);
    expect(m.reveals()).toEqual([{ type: "reveal", group: "left", quick: false, reason: "dwell" }]);
    expect(m.state.open).toEqual({ group: "left", source: "hover", awaitingEntry: false });
  });

  it("does not reveal a jittering pointer at 300 ms, but does at the 700 ms fallback", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    // 4 px of movement every 16 ms: never at rest.
    for (let t = 1016, dx = 4; t < 1700; t += 16, dx = -dx) {
      m.move(t, { x: 12 + (dx > 0 ? 4 : 0), y: 60, hot: "left", inside: "left" });
      if (t < 1690) expect(m.reveals()).toHaveLength(0);
    }
    m.advanceTo(1700);
    expect(m.reveals()).toEqual([{ type: "reveal", group: "left", quick: false, reason: "fallback" }]);
  });

  it("never reveals from below the band", () => {
    const m = harness();
    m.warmUp();
    // Below the band the gutter is part of the boundary but not hot.
    m.move(1000, { x: 12, y: 500, hot: null, inside: "left" });
    m.advanceTo(6000);
    expect(m.reveals()).toHaveLength(0);
  });

  it("reveals the top handle after 400 ms at rest", () => {
    const m = harness();
    m.warmUp();
    m.move(1000, { x: 700, y: 60, hot: "top", inside: "top" });
    m.advanceTo(1399);
    expect(m.reveals()).toHaveLength(0);
    m.advanceTo(1400);
    expect(m.reveals()[0]).toMatchObject({ group: "top" });
  });

  it("restarts the wait when the pointer leaves the band and comes back", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.move(1200, { x: 300, y: 60 });
    m.enterLeftBand(1250);
    m.advanceTo(1500);
    expect(m.reveals()).toHaveLength(0);
    m.advanceTo(1550);
    expect(m.reveals()).toHaveLength(1);
  });
});

describe("autoHideMachine: presets", () => {
  it("Slow waits 800 ms at rest", () => {
    const m = harness("slow");
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(1799);
    expect(m.reveals()).toHaveLength(0);
    m.advanceTo(1800);
    expect(m.reveals()).toHaveLength(1);
  });

  it("Slow falls back at 1200 ms", () => {
    const m = harness("slow");
    m.warmUp();
    m.enterLeftBand(1000);
    for (let t = 1016, flip = true; t < 2200; t += 16, flip = !flip) {
      m.move(t, { x: flip ? 16 : 12, y: 60, hot: "left", inside: "left" });
      if (t < 2190) expect(m.reveals()).toHaveLength(0);
    }
    m.advanceTo(2200);
    expect(m.reveals()).toHaveLength(1);
  });

  it("Off never reveals on hover", () => {
    const m = harness("off");
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(10_000);
    expect(m.reveals()).toHaveLength(0);
  });

  it("switching to Off mid-dwell cancels the reveal", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.at(1100, { type: "configure", hoverReveal: "off" });
    m.advanceTo(3000);
    expect(m.reveals()).toHaveLength(0);
  });
});

/** Hover-opens the left panel, leaves it and lets the grace run out. */
function closeOnPointerLeave(m: ReturnType<typeof harness>) {
  m.warmUp();
  m.enterLeftBand(1000);
  m.advanceTo(1300);
  m.move(1400, { x: 600, y: 300 });
  m.advanceTo(1900);
  expect(m.hides()).toEqual([{ type: "hide", group: "left", reason: "grace", focus: "handle" }]);
}

describe("autoHideMachine: warm re-entry", () => {
  it("reopens after 150 ms within 2 s of a pointer-leave close, with a quick slide", () => {
    const m = harness();
    closeOnPointerLeave(m);
    m.move(2500, { x: 14, y: 50, hot: "left", inside: "left" });
    // Still moving: warm re-entry has no rest rule.
    m.move(2600, { x: 18, y: 52, hot: "left", inside: "left" });
    m.advanceTo(2649);
    expect(m.reveals()).toHaveLength(1);
    m.advanceTo(2650);
    expect(m.reveals()[1]).toEqual({ type: "reveal", group: "left", quick: true, reason: "warm" });
  });

  it("is not warm after 2 s", () => {
    const m = harness();
    closeOnPointerLeave(m);
    m.move(4000, { x: 14, y: 50, hot: "left", inside: "left" });
    m.advanceTo(4200);
    expect(m.reveals()).toHaveLength(1);
    m.advanceTo(4300);
    expect(m.reveals()[1]).toMatchObject({ quick: false, reason: "dwell" });
  });

  it("is not warm after Esc", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(1300);
    m.move(1400, { x: 300, y: 200, inside: "left", inOverlay: true });
    m.at(1500, { type: "esc" });
    m.move(1600, { x: 600, y: 300 });
    m.move(2000, { x: 14, y: 50, hot: "left", inside: "left" });
    m.advanceTo(2200);
    expect(m.reveals()).toHaveLength(1);
    m.advanceTo(2300);
    expect(m.reveals()[1]).toMatchObject({ quick: false });
  });

  it("does not exist in Slow", () => {
    const m = harness("slow");
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(1800);
    m.move(1900, { x: 600, y: 300 });
    m.advanceTo(2400);
    expect(m.hides()).toHaveLength(1);
    m.move(2600, { x: 14, y: 50, hot: "left", inside: "left" });
    m.advanceTo(2800);
    expect(m.reveals()).toHaveLength(1);
  });
});

describe("autoHideMachine: what blocks a hover reveal", () => {
  it("a held button", () => {
    const m = harness();
    m.warmUp();
    m.move(1000, { x: 12, y: 60, hot: "left", inside: "left", buttons: 1 });
    m.advanceTo(3000);
    expect(m.reveals()).toHaveLength(0);
  });

  it("a drag that ends in the band (selection, scrollbar thumb) reveals nothing on release", () => {
    const m = harness();
    m.warmUp();
    m.move(1000, { x: 600, y: 400, buttons: 1 });
    m.move(1100, { x: 12, y: 60, hot: "left", inside: "left", buttons: 1 });
    m.at(1200, { type: "pointerUp", pointerId: 1, inside: "left" });
    m.move(1210, { x: 12, y: 60, hot: "left", inside: "left" });
    m.advanceTo(4000);
    expect(m.reveals()).toHaveLength(0);
    // Out and back: the band works again.
    m.move(4000, { x: 300, y: 300 });
    m.advanceTo(4300);
    m.enterLeftBand(4350);
    m.advanceTo(4650);
    expect(m.reveals()).toHaveLength(1);
  });

  it("a wheel event in the last 500 ms", () => {
    const m = harness();
    m.warmUp();
    m.at(900, { type: "wheel" });
    m.enterLeftBand(1000);
    m.advanceTo(1350);
    expect(m.reveals()).toHaveLength(0);
    m.advanceTo(1400);
    expect(m.reveals()).toHaveLength(1);
  });

  it("a key press in the last second, and a parked pointer needs to move again", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.at(1100, { type: "keydown", navigation: false });
    m.advanceTo(5000);
    expect(m.reveals()).toHaveLength(0);
    m.move(5000, { x: 13, y: 61, hot: "left", inside: "left" });
    m.advanceTo(5300);
    expect(m.reveals()).toHaveLength(1);
  });

  it("a key press blocks for a full second even when the pointer moves", () => {
    const m = harness();
    m.warmUp();
    m.at(1000, { type: "keydown", navigation: false });
    m.enterLeftBand(1100);
    m.advanceTo(1999);
    expect(m.reveals()).toHaveLength(0);
    m.advanceTo(2000);
    expect(m.reveals()).toHaveLength(1);
  });

  it("a zone the pointer was already in when reading mode started", () => {
    const m = harness();
    // The first event lands in the band: it stays disarmed until it leaves.
    m.enterLeftBand(0);
    m.move(50, { x: 13, y: 61, hot: "left", inside: "left" });
    m.advanceTo(2000);
    expect(m.reveals()).toHaveLength(0);
    m.move(2000, { x: 300, y: 300 });
    m.advanceTo(2300);
    m.enterLeftBand(2350);
    m.advanceTo(2650);
    expect(m.reveals()).toHaveLength(1);
  });

  it("a pointer first seen outside a zone does not have to leave it again", () => {
    const m = harness();
    // Straight from the transcript to the band, faster than the re-arm delay.
    m.move(0, { x: 300, y: 300 });
    m.move(16, { x: 150, y: 200 });
    m.enterLeftBand(32);
    m.advanceTo(400);
    expect(m.reveals()).toHaveLength(1);
  });

  it("the document not having focus", () => {
    const m = harness();
    m.warmUp();
    m.setEnv({ documentFocused: false });
    m.enterLeftBand(1000);
    m.advanceTo(2000);
    expect(m.reveals()).toHaveLength(0);
  });

  it("touch, and a pen that has not hovered", () => {
    const m = harness();
    m.warmUp();
    m.move(1000, { x: 12, y: 60, hot: "left", inside: "left", kind: "touch" });
    m.advanceTo(2000);
    m.move(2100, { x: 12, y: 60, hot: "left", inside: "left", kind: "pen", buttons: 1 });
    m.advanceTo(3000);
    expect(m.reveals()).toHaveLength(0);
  });

  it("a pen that hovers is treated like a mouse", () => {
    const m = harness();
    m.warmUp();
    m.move(1000, { x: 300, y: 60, kind: "pen" });
    m.move(1100, { x: 12, y: 60, hot: "left", inside: "left", kind: "pen" });
    m.advanceTo(1400);
    expect(m.reveals()).toHaveLength(1);
  });

  it("an open dialog or menu", () => {
    const m = harness();
    m.warmUp();
    m.setEnv({ layerOpen: true });
    m.enterLeftBand(1000);
    m.advanceTo(2000);
    expect(m.reveals()).toHaveLength(0);
  });

  it("a pointer that came into the window through the zone", () => {
    const m = harness();
    m.warmUp();
    m.at(1000, { type: "pointerLeaveDocument" });
    m.at(2000, { type: "pointerEnterDocument", hot: "left" });
    m.enterLeftBand(2000);
    m.advanceTo(4000);
    expect(m.reveals()).toHaveLength(0);
    // Out into the document and back: now it counts.
    m.move(4100, { x: 300, y: 60 });
    m.enterLeftBand(4500);
    m.advanceTo(4800);
    expect(m.reveals()).toHaveLength(1);
  });

  it("another group's open overlay: the dwell completes only after it closes", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "click", 500);
    // Enter the left overlay, then go to the right band.
    m.move(600, { x: 200, y: 300, inside: "left", inOverlay: true });
    m.move(700, { x: 1270, y: 60, hot: "right", inside: "right" });
    m.advanceTo(1150);
    expect(m.reveals()).toHaveLength(0);
    // Left closes at 700 + 500 grace; right then completes at once.
    m.advanceTo(1200);
    expect(m.hides()).toEqual([{ type: "hide", group: "left", reason: "grace", focus: "handle" }]);
    expect(m.reveals()).toEqual([{ type: "reveal", group: "right", quick: false, reason: "dwell" }]);
  });
});

describe("autoHideMachine: scrolling with the pointer in a zone", () => {
  it("disarms the zone until the pointer leaves it, and resets the wait", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.at(1200, { type: "scroll" });
    m.advanceTo(5000);
    expect(m.reveals()).toHaveLength(0);
    // Leave, wait for the re-arm, come back.
    m.move(5100, { x: 400, y: 300 });
    m.advanceTo(5400);
    m.enterLeftBand(5450);
    m.advanceTo(5750);
    expect(m.reveals()).toHaveLength(1);
  });

  it("a wheel over the band disarms it even when nothing could scroll", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.at(1100, { type: "wheel" });
    m.advanceTo(3100);
    m.at(3100, { type: "wheel" });
    m.advanceTo(6000);
    expect(m.reveals()).toHaveLength(0);
  });

  it("does not re-arm before 300 ms outside", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.at(1100, { type: "scroll" });
    m.move(1200, { x: 400, y: 300 });
    m.enterLeftBand(1400);
    m.advanceTo(4000);
    expect(m.reveals()).toHaveLength(0);
  });
});

describe("autoHideMachine: grace", () => {
  it("hides 500 ms after the pointer leaves", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(1300);
    m.move(1400, { x: 600, y: 300 });
    m.advanceTo(1899);
    expect(m.hides()).toHaveLength(0);
    m.advanceTo(1900);
    expect(m.hides()).toHaveLength(1);
    expect(m.state.open).toBeNull();
  });

  it("a return at 499 ms cancels it", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(1300);
    m.move(1400, { x: 600, y: 300 });
    m.move(1899, { x: 200, y: 300, inside: "left", inOverlay: true });
    m.advanceTo(5000);
    expect(m.hides()).toHaveLength(0);
  });

  it("starts when the pointer leaves the window", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(1300);
    m.at(1400, { type: "pointerLeaveDocument" });
    m.advanceTo(1900);
    expect(m.hides()).toHaveLength(1);
  });

  it("never hides after 60 s of inactivity with the pointer inside", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(1300);
    m.move(1400, { x: 200, y: 300, inside: "left", inOverlay: true });
    m.advanceTo(61_400);
    expect(m.hides()).toHaveLength(0);
  });
});

describe("autoHideMachine: holds", () => {
  function hoverOpenThenLeave(m: ReturnType<typeof harness>) {
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(1300);
    m.move(1400, { x: 200, y: 300, inside: "left", inOverlay: true });
  }

  it("an owned layer holds for as long as it is open", () => {
    const m = harness();
    hoverOpenThenLeave(m);
    m.at(1500, { type: "holdChange", group: "left", count: 1 });
    m.move(1600, { x: 700, y: 300 });
    m.advanceTo(11_600);
    expect(m.hides()).toHaveLength(0);
    m.at(11_700, { type: "holdChange", group: "left", count: 0 });
    m.advanceTo(12_200);
    expect(m.hides()).toHaveLength(1);
  });

  it("focus in a text field holds after the pointer has gone", () => {
    const m = harness();
    hoverOpenThenLeave(m);
    m.at(1500, { type: "focusIn", inside: "left", editable: true, modal: false });
    m.move(1600, { x: 700, y: 300 });
    m.move(1700, { x: 900, y: 500 });
    m.advanceTo(30_000);
    expect(m.hides()).toHaveLength(0);
  });

  it("other focus holds until the pointer has moved 24 px", () => {
    const m = harness();
    hoverOpenThenLeave(m);
    m.at(1500, { type: "focusIn", inside: "left", editable: false, modal: false });
    // Leave the panel with 20 px of travel since focus arrived.
    m.move(1600, { x: 220, y: 300 });
    m.move(1610, { x: 220, y: 300, inside: null });
    m.advanceTo(5000);
    expect(m.hides()).toHaveLength(0);
    m.move(5000, { x: 224, y: 300 });
    m.advanceTo(5499);
    expect(m.hides()).toHaveLength(0);
    m.advanceTo(5500);
    expect(m.hides()).toHaveLength(1);
  });

  it("a drag that started inside holds", () => {
    const m = harness();
    hoverOpenThenLeave(m);
    m.at(1500, { type: "pointerDown", pointerId: 1, kind: "mouse", inside: "left", swallowable: false });
    m.move(1600, { x: 700, y: 300, buttons: 1 });
    m.advanceTo(5000);
    expect(m.hides()).toHaveLength(0);
    m.at(5000, { type: "pointerUp", pointerId: 1, inside: null });
    m.move(5010, { x: 701, y: 300 });
    m.advanceTo(5510);
    expect(m.hides()).toHaveLength(1);
  });

  it("a click latch holds until the pointer has entered and left", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "click", 1000);
    // Pointer wanders outside without ever entering: stays.
    m.move(1100, { x: 700, y: 300 });
    m.advanceTo(5000);
    expect(m.hides()).toHaveLength(0);
    m.move(5000, { x: 200, y: 300, inside: "left", inOverlay: true });
    m.move(5100, { x: 700, y: 300 });
    m.advanceTo(5599);
    expect(m.hides()).toHaveLength(0);
    m.advanceTo(5600);
    expect(m.hides()).toHaveLength(1);
  });

  it("a keyboard open from the focused handle starts the 24 px count afresh", () => {
    const m = harness();
    m.warmUp();
    // Focus on the handle (inside the boundary), then the mouse is nudged.
    m.at(900, { type: "focusIn", inside: "left", editable: false, modal: false });
    m.move(950, { x: 660, y: 400 });
    m.open("left", "keyboard", 1000);
    // Focus moves from the handle into the panel: same boundary, no focusIn change.
    m.at(1016, { type: "focusIn", inside: "left", editable: false, modal: false });
    m.advanceTo(5000);
    expect(m.hides()).toHaveLength(0);
  });

  it("with hover reveal Off every open is sticky, keyboard opens included", () => {
    const m = harness("off");
    m.warmUp();
    m.open("left", "keyboard", 1000);
    m.at(1016, { type: "focusIn", inside: "left", editable: false, modal: false });
    m.move(1100, { x: 900, y: 600 });
    m.at(1200, { type: "pointerLeaveDocument" });
    m.advanceTo(20_000);
    expect(m.hides()).toHaveLength(0);
    // Still dismissible, and Esc still returns focus for a keyboard open.
    m.at(20_000, { type: "esc" });
    expect(m.hides()).toEqual([{ type: "hide", group: "left", reason: "esc", focus: "return" }]);
  });

  it("switching hover reveal Off makes an open hover panel stay", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(1300);
    m.at(1350, { type: "configure", hoverReveal: "off" });
    m.move(1400, { x: 600, y: 300 });
    m.advanceTo(5000);
    expect(m.hides()).toHaveLength(0);
  });

  it("a keyboard open holds until the pointer moves 24 px", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "keyboard", 1000);
    m.at(1016, { type: "focusIn", inside: "left", editable: false, modal: false });
    m.advanceTo(10_000);
    expect(m.hides()).toHaveLength(0);
    m.move(10_000, { x: 640, y: 400 });
    m.advanceTo(10_500);
    expect(m.hides()).toEqual([{ type: "hide", group: "left", reason: "grace", focus: "handle" }]);
  });
});

describe("autoHideMachine: sticky opens", () => {
  it("pointer leave never closes them; a tap outside does", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "sticky", 1000);
    m.at(1100, { type: "pointerLeaveDocument" });
    m.advanceTo(20_000);
    expect(m.hides()).toHaveLength(0);
    m.at(20_000, { type: "pointerDown", pointerId: 7, kind: "touch", inside: null, swallowable: false });
    m.at(20_050, { type: "pointerUp", pointerId: 7, inside: null });
    expect(m.hides()).toEqual([{ type: "hide", group: "left", reason: "dismiss", focus: "none" }]);
  });
});

describe("autoHideMachine: light dismiss", () => {
  it("closes on the up-event, not the down-event", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "click", 1000);
    m.at(1100, { type: "pointerDown", pointerId: 1, kind: "mouse", inside: null, swallowable: false });
    expect(m.hides()).toHaveLength(0);
    m.at(1150, { type: "pointerUp", pointerId: 1, inside: null });
    expect(m.hides()).toHaveLength(1);
  });

  it("swallows a press on a transcript control and sends focus to the transcript", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "click", 1000);
    const down = m.at(1100, { type: "pointerDown", pointerId: 1, kind: "mouse", inside: null, swallowable: true });
    expect(down).toContainEqual({ type: "swallow" });
    m.at(1150, { type: "pointerUp", pointerId: 1, inside: null });
    expect(m.hides()).toEqual([{ type: "hide", group: "left", reason: "dismiss", focus: "main" }]);
  });

  it("does not swallow when nothing is open", () => {
    const m = harness();
    m.warmUp();
    const down = m.at(1100, { type: "pointerDown", pointerId: 1, kind: "mouse", inside: null, swallowable: true });
    expect(down).toHaveLength(0);
  });

  it("focus moving on the down-event leaves the decision to the up-event", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "click", 1000);
    m.at(1050, { type: "keydown", navigation: false });
    m.at(1100, { type: "pointerDown", pointerId: 1, kind: "mouse", inside: null, swallowable: false });
    // Pressing on the transcript moves focus there before the button is up.
    m.at(1100, { type: "focusIn", inside: null, editable: false, modal: false });
    expect(m.hides()).toHaveLength(0);
    m.at(1180, { type: "pointerUp", pointerId: 1, inside: null });
    expect(m.hides()).toEqual([{ type: "hide", group: "left", reason: "dismiss", focus: "none" }]);
  });

  it("a press that comes back inside does not dismiss", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "click", 1000);
    m.at(1100, { type: "pointerDown", pointerId: 1, kind: "mouse", inside: null, swallowable: false });
    m.at(1150, { type: "pointerUp", pointerId: 1, inside: "left" });
    expect(m.hides()).toHaveLength(0);
  });

  it("a press inside the boundary never dismisses", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "click", 1000);
    m.at(1100, { type: "pointerDown", pointerId: 1, kind: "mouse", inside: "left", swallowable: true });
    m.at(1150, { type: "pointerUp", pointerId: 1, inside: "left" });
    expect(m.hides()).toHaveLength(0);
    expect(m.effects).not.toContainEqual({ type: "swallow" });
  });
});

describe("autoHideMachine: Esc", () => {
  it("closes at once and disarms the zone until the pointer leaves plus 300 ms", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(1300);
    m.at(1500, { type: "esc" });
    expect(m.hides()).toEqual([{ type: "hide", group: "left", reason: "esc", focus: "handle" }]);
    // Waiting without moving: stays closed.
    m.advanceTo(3500);
    expect(m.reveals()).toHaveLength(1);
    // Out and straight back (under 300 ms): still disarmed.
    m.move(3500, { x: 400, y: 300 });
    m.enterLeftBand(3600);
    m.advanceTo(4500);
    expect(m.reveals()).toHaveLength(1);
    // Out, past the re-arm, and back: reopens.
    m.move(4500, { x: 400, y: 300 });
    m.advanceTo(4800);
    m.enterLeftBand(4850);
    m.advanceTo(5150);
    expect(m.reveals()).toHaveLength(2);
  });

  it("returns focus to where it was after a keyboard open", () => {
    const m = harness();
    m.warmUp();
    m.open("right", "keyboard", 1000);
    m.at(1100, { type: "esc" });
    expect(m.hides()).toEqual([{ type: "hide", group: "right", reason: "esc", focus: "return" }]);
  });

  it("does nothing when no overlay is open", () => {
    const m = harness();
    m.warmUp();
    expect(m.at(1000, { type: "esc" })).toHaveLength(0);
  });
});

describe("autoHideMachine: focus moving outside the boundary", () => {
  it("closes the overlay at once", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "click", 1000);
    m.at(1100, { type: "keydown", navigation: true });
    m.at(1150, { type: "focusIn", inside: null, editable: false, modal: false });
    expect(m.hides()).toEqual([{ type: "hide", group: "left", reason: "focus-out", focus: "none" }]);
  });

  it("does not close when the pointer is inside and no key was pressed recently", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "click", 1000);
    m.move(1100, { x: 200, y: 300, inside: "left", inOverlay: true });
    m.at(1200, { type: "focusIn", inside: null, editable: false, modal: false });
    expect(m.hides()).toHaveLength(0);
  });

  it("closes when the pointer is inside but a key was pressed within 500 ms", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "click", 1000);
    m.move(1100, { x: 200, y: 300, inside: "left", inOverlay: true });
    m.at(1200, { type: "keydown", navigation: true });
    m.at(1300, { type: "focusIn", inside: null, editable: false, modal: false });
    expect(m.hides()).toHaveLength(1);
  });

  it("focus in an owned portal does not close it", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "keyboard", 1000);
    m.at(1100, { type: "keydown", navigation: true });
    m.at(1150, { type: "focusIn", inside: "left", editable: false, modal: false });
    expect(m.hides()).toHaveLength(0);
  });

  it("an unrelated modal closes every overlay", () => {
    const m = harness();
    m.warmUp();
    m.open("top", "click", 1000);
    m.move(1050, { x: 600, y: 80, inside: "top", inOverlay: true });
    m.at(1100, { type: "focusIn", inside: null, editable: true, modal: true });
    expect(m.hides()).toEqual([{ type: "hide", group: "top", reason: "modal", focus: "none" }]);
  });

  it("focus cleared to <body> closes nothing but no longer holds", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "keyboard", 1000);
    m.at(1016, { type: "focusIn", inside: "left", editable: true, modal: false });
    m.at(1100, { type: "keydown", navigation: false });
    m.at(1200, { type: "focusCleared" });
    expect(m.hides()).toHaveLength(0);
    m.advanceTo(1700);
    expect(m.hides()).toEqual([{ type: "hide", group: "left", reason: "grace", focus: "handle" }]);
  });

  it("losing focus to <body> is not a close", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "keyboard", 1000);
    m.at(1016, { type: "focusIn", inside: "left", editable: false, modal: false });
    m.at(2000, { type: "focusLost" });
    m.advanceTo(8000);
    expect(m.hides()).toHaveLength(0);
  });
});

describe("autoHideMachine: keys and switching", () => {
  it("navigation keys close a hover open while focus is outside", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(1300);
    m.at(1400, { type: "keydown", navigation: true });
    expect(m.hides()).toEqual([{ type: "hide", group: "left", reason: "nav-key", focus: "none" }]);
  });

  it("navigation keys leave a hover open alone when focus is inside it", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(1300);
    m.at(1350, { type: "focusIn", inside: "left", editable: false, modal: false });
    m.at(1400, { type: "keydown", navigation: true });
    expect(m.hides()).toHaveLength(0);
  });

  it("navigation keys do not close a keyboard open", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "keyboard", 1000);
    m.at(1100, { type: "keydown", navigation: true });
    expect(m.hides()).toHaveLength(0);
  });

  it("hover never evicts another overlay", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "keyboard", 1000);
    m.at(1016, { type: "focusIn", inside: "left", editable: true, modal: false });
    m.move(1100, { x: 1270, y: 60, hot: "right", inside: "right" });
    m.advanceTo(10_000);
    expect(m.reveals()).toHaveLength(0);
    expect(m.state.open?.group).toBe("left");
  });

  it("an explicit open replaces the open overlay", () => {
    const m = harness();
    m.warmUp();
    m.open("left", "keyboard", 1000);
    m.open("right", "keyboard", 1100);
    expect(m.state.open).toEqual({ group: "right", source: "keyboard", awaitingEntry: false });
  });

  it("an explicit close disarms the zone", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(1300);
    m.at(1400, { type: "explicitClose", group: "left" });
    expect(m.state.open).toBeNull();
    m.advanceTo(4000);
    expect(m.reveals()).toHaveLength(1);
  });
});

describe("autoHideMachine: timers and the window", () => {
  it("window blur cancels timers and closes nothing", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.advanceTo(1300);
    m.move(1400, { x: 600, y: 300 });
    m.at(1450, { type: "blur" });
    m.advanceTo(10_000);
    expect(m.hides()).toHaveLength(0);
    // Back: the next pointer event checks again.
    m.at(10_000, { type: "focus" });
    m.advanceTo(12_000);
    expect(m.hides()).toHaveLength(0);
    m.move(12_000, { x: 601, y: 300 });
    m.advanceTo(12_500);
    expect(m.hides()).toHaveLength(1);
  });

  it("blur cancels a pending dwell", () => {
    const m = harness();
    m.warmUp();
    m.enterLeftBand(1000);
    m.at(1100, { type: "blur" });
    m.advanceTo(3000);
    expect(m.reveals()).toHaveLength(0);
  });

  it("reset closes nothing on its own and disarms every zone", () => {
    const m = harness();
    m.warmUp();
    m.at(1000, { type: "reset" });
    m.enterLeftBand(1000);
    m.advanceTo(3000);
    expect(m.reveals()).toHaveLength(0);
  });

  it("asks for no wake-up when nothing is pending", () => {
    const m = harness();
    m.warmUp();
    const result = stepAutoHide(m.state, { type: "tick", now: 5000, env: ENV });
    expect(result.wakeAt).toBeNull();
  });
});
