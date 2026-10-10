/**
 * The decision core of reading mode's auto-hiding panels: a pure reducer.
 *
 * It decides when a hidden panel reveals on hover, what keeps an open panel
 * open, and when and how it hides. It knows nothing about the DOM: the
 * adapter (`useAutoHidePanel`) hit-tests the pointer, reads focus and feeds
 * it events that carry their own timestamp. The reducer answers with
 * effects (reveal, hide, swallow a click) and the time it next needs to be
 * woken up, so timers live in exactly one place and tests need no clock.
 *
 * Vocabulary (spec §2.3–2.5):
 * - zone: the hover-reactive part of a group, the top band of a side
 *   gutter or the top strip's handle. A disarmed zone ignores hover until
 *   the pointer has left it for a moment.
 * - boundary B: the overlay (plus a hysteresis margin), its gutter or
 *   strip, and the menus and dialogs it opened. `inside` names the group
 *   whose boundary holds the pointer or focus.
 * - holds H1–H6: while any is true, an open panel never starts hiding.
 */
import type { HoverRevealSetting, PanelGroup, RevealSource } from "@/store/slices/layoutSlice";
import {
  FOCUS_RELEASE_MOVE_PX,
  HIDE_GRACE_MS,
  KEY_FOCUS_WINDOW_MS,
  KEY_VETO_MS,
  REARM_MS,
  REST_DISTANCE_PX,
  REST_WINDOW_MS,
  SLOW_DWELL,
  STANDARD_SIDE_DWELL,
  STANDARD_TOP_DWELL,
  WARM_DWELL_MS,
  WARM_WINDOW_MS,
  WHEEL_VETO_MS,
  type DwellTiming,
} from "./constants";

const GROUPS: readonly PanelGroup[] = ["left", "right", "top"];

export type PointerKind = "mouse" | "pen" | "touch";

/** Where focus goes when a panel closes with focus inside it. */
export type CloseFocus = "handle" | "return" | "main" | "none";
export type CloseReason = "grace" | "esc" | "dismiss" | "focus-out" | "nav-key" | "modal";
export type RevealReason = "dwell" | "fallback" | "warm";

/** Facts only the DOM knows, read when a reveal might be decided. */
export interface AutoHideEnv {
  documentFocused: boolean;
  /** A dialog, menu or the global search is open (not one a panel owns). */
  layerOpen: boolean;
}

interface ZoneState {
  armed: boolean;
  /** When a real movement took the pointer out of the zone; null while inside. */
  exitedAt: number | null;
  /** Start of the pointer's presence in the zone; null when there is none to count. */
  presenceSince: number | null;
  /** The current presence is a warm re-entry. */
  warm: boolean;
  /** The pointer entered the window through this zone and has not left it since. */
  enteredFromOutside: boolean;
  /** Last close because the pointer left (for warm re-entry). */
  leaveClosedAt: number | null;
}

export interface OpenPanel {
  group: PanelGroup;
  source: RevealSource;
  /** H5: opened by a click and the pointer has not been in the overlay yet. */
  awaitingEntry: boolean;
}

interface PointerSample {
  t: number;
  /** Distance from the previous sample. */
  d: number;
}

export interface AutoHideState {
  hoverReveal: HoverRevealSetting;
  zones: Record<PanelGroup, ZoneState>;
  open: OpenPanel | null;
  /** When the open panel hides unless a hold returns. */
  graceDeadline: number | null;
  pointer: {
    kind: PointerKind;
    penHovered: boolean;
    buttons: number;
    last: { x: number; y: number } | null;
    samples: PointerSample[];
    hot: PanelGroup | null;
    inside: PanelGroup | null;
    inOverlay: boolean;
    inDocument: boolean;
  };
  /** H3: the button now held went down inside the open panel's boundary. */
  pressInside: boolean;
  /** A press that started outside the open panel's boundary: a light dismiss in progress. */
  dismiss: { pointerId: number; swallowed: boolean } | null;
  focus: { inside: PanelGroup | null; editable: boolean; movedPx: number };
  ownedLayers: Record<PanelGroup, number>;
  lastWheelAt: number;
  lastKeyAt: number;
  windowFocused: boolean;
  /** The window came back: wait for a pointer event before judging holds. */
  recheckPending: boolean;
  env: AutoHideEnv;
}

export type AutoHideEvent =
  | { type: "configure"; now: number; hoverReveal: HoverRevealSetting }
  | { type: "reset"; now: number }
  | {
      type: "pointerMove";
      now: number;
      x: number;
      y: number;
      kind: PointerKind;
      buttons: number;
      hot: PanelGroup | null;
      inside: PanelGroup | null;
      inOverlay: boolean;
      env: AutoHideEnv;
    }
  | { type: "pointerEnterDocument"; now: number; hot: PanelGroup | null }
  | { type: "pointerLeaveDocument"; now: number }
  | {
      type: "pointerDown";
      now: number;
      pointerId: number;
      kind: PointerKind;
      inside: PanelGroup | null;
      /** The target is a transcript control a dismiss click must not press. */
      swallowable: boolean;
    }
  | { type: "pointerUp"; now: number; pointerId: number; inside: PanelGroup | null }
  | { type: "pointerCancel"; now: number }
  | { type: "wheel"; now: number }
  | { type: "scroll"; now: number }
  | { type: "keydown"; now: number; navigation: boolean }
  | { type: "focusIn"; now: number; inside: PanelGroup | null; editable: boolean; modal: boolean }
  | { type: "focusLost"; now: number }
  | { type: "holdChange"; now: number; group: PanelGroup; count: number }
  | { type: "esc"; now: number }
  | { type: "explicitOpen"; now: number; group: PanelGroup; source: RevealSource }
  | { type: "explicitClose"; now: number; group: PanelGroup }
  | { type: "modalOpen"; now: number }
  | { type: "blur"; now: number }
  | { type: "focus"; now: number }
  | { type: "tick"; now: number; env: AutoHideEnv };

export type AutoHideEffect =
  | { type: "reveal"; group: PanelGroup; quick: boolean; reason: RevealReason }
  | { type: "hide"; group: PanelGroup; reason: CloseReason; focus: CloseFocus }
  | { type: "swallow" };

export interface AutoHideStep {
  state: AutoHideState;
  effects: AutoHideEffect[];
  /** When to deliver the next `tick`, or null when nothing is pending. */
  wakeAt: number | null;
}

function createZone(): ZoneState {
  return {
    armed: false,
    exitedAt: null,
    presenceSince: null,
    warm: false,
    enteredFromOutside: false,
    leaveClosedAt: null,
  };
}

/** Every zone starts disarmed, as on entering reading mode. */
export function createAutoHideState(hoverReveal: HoverRevealSetting): AutoHideState {
  return {
    hoverReveal,
    zones: { left: createZone(), right: createZone(), top: createZone() },
    open: null,
    graceDeadline: null,
    pointer: {
      kind: "mouse",
      penHovered: false,
      buttons: 0,
      last: null,
      samples: [],
      hot: null,
      inside: null,
      inOverlay: false,
      inDocument: true,
    },
    pressInside: false,
    dismiss: null,
    focus: { inside: null, editable: false, movedPx: 0 },
    ownedLayers: { left: 0, right: 0, top: 0 },
    lastWheelAt: -Infinity,
    lastKeyAt: -Infinity,
    windowFocused: true,
    recheckPending: false,
    env: { documentFocused: true, layerOpen: false },
  };
}

function cloneState(state: AutoHideState): AutoHideState {
  return {
    ...state,
    zones: {
      left: { ...state.zones.left },
      right: { ...state.zones.right },
      top: { ...state.zones.top },
    },
    open: state.open && { ...state.open },
    pointer: { ...state.pointer, samples: [...state.pointer.samples] },
    dismiss: state.dismiss && { ...state.dismiss },
    focus: { ...state.focus },
    ownedLayers: { ...state.ownedLayers },
  };
}

export function dwellTiming(group: PanelGroup, setting: HoverRevealSetting): DwellTiming {
  if (setting === "slow") return SLOW_DWELL;
  return group === "top" ? STANDARD_TOP_DWELL : STANDARD_SIDE_DWELL;
}

/** Σ|movement| over the rest window is small (no events at all counts as at rest). */
function isAtRest(state: AutoHideState, now: number): boolean {
  let travelled = 0;
  for (const sample of state.pointer.samples) {
    if (sample.t > now - REST_WINDOW_MS) travelled += sample.d;
  }
  return travelled <= REST_DISTANCE_PX;
}

function canHover(pointer: AutoHideState["pointer"]): boolean {
  return pointer.kind === "mouse" || (pointer.kind === "pen" && pointer.penHovered);
}

function startPresence(state: AutoHideState, zone: ZoneState, now: number): void {
  zone.presenceSince = now;
  zone.warm =
    state.hoverReveal === "standard" &&
    zone.leaveClosedAt != null &&
    now - zone.leaveClosedAt <= WARM_WINDOW_MS;
}

function resetPresence(zone: ZoneState): void {
  zone.presenceSince = null;
  zone.warm = false;
}

/** Ignore hover until the pointer has left the zone and REARM_MS has passed. */
function disarm(zone: ZoneState): void {
  zone.armed = false;
  resetPresence(zone);
}

/** The working copy of one step: its state and the effects it produced. */
class Step {
  readonly effects: AutoHideEffect[] = [];

  constructor(
    readonly state: AutoHideState,
    readonly now: number
  ) {}

  /** Hides the open panel. Every close disarms its zone (spec §2.5 re-arming). */
  close(reason: CloseReason, focus: CloseFocus): void {
    const open = this.state.open;
    if (!open) return;
    this.effects.push({ type: "hide", group: open.group, reason, focus });
    this.state.open = null;
    this.state.graceDeadline = null;
    this.state.dismiss = null;
    const zone = this.state.zones[open.group];
    // Only a close on pointer leave allows a warm re-entry.
    zone.leaveClosedAt = reason === "grace" ? this.now : null;
    disarm(zone);
  }
}

function isHeld(state: AutoHideState): boolean {
  const open = state.open;
  if (!open) return false;
  const { pointer, focus } = state;
  const h1 = pointer.inside === open.group && pointer.inDocument && canHover(pointer);
  const h2 = state.ownedLayers[open.group] > 0;
  const h3 = state.pressInside && pointer.buttons !== 0;
  const h4 =
    focus.inside === open.group &&
    (focus.editable || focus.movedPx < FOCUS_RELEASE_MOVE_PX);
  const h5 = open.awaitingEntry;
  return h1 || h2 || h3 || h4 || h5;
}

function isRevealBlocked(state: AutoHideState, group: PanelGroup, now: number): boolean {
  const { pointer, env } = state;
  const zone = state.zones[group];
  return (
    state.hoverReveal === "off" ||
    !canHover(pointer) ||
    pointer.buttons !== 0 ||
    !pointer.inDocument ||
    !zone.armed ||
    zone.enteredFromOutside ||
    now - state.lastWheelAt < WHEEL_VETO_MS ||
    now - state.lastKeyAt < KEY_VETO_MS ||
    !state.windowFocused ||
    !env.documentFocused ||
    env.layerOpen ||
    // Hover never evicts: the dwell completes once the other overlay is gone.
    state.open != null
  );
}

function tryReveal(step: Step, now: number): void {
  const { state } = step;
  const group = state.pointer.hot;
  if (!group || state.open?.group === group) return;
  const zone = state.zones[group];
  if (zone.presenceSince == null || isRevealBlocked(state, group, now)) return;

  const elapsed = now - zone.presenceSince;
  let reason: RevealReason | null = null;
  if (zone.warm) {
    if (elapsed >= WARM_DWELL_MS) reason = "warm";
  } else {
    const timing = dwellTiming(group, state.hoverReveal);
    if (elapsed >= timing.rest && isAtRest(state, now)) reason = "dwell";
    else if (elapsed >= timing.fallback) reason = "fallback";
  }
  if (!reason) return;

  resetPresence(zone);
  state.open = { group, source: "hover", awaitingEntry: false };
  state.graceDeadline = null;
  step.effects.push({ type: "reveal", group, quick: reason === "warm", reason });
}

/** Holds, grace and its expiry, re-arming, then a possible hover reveal. */
function evaluate(step: Step, now: number): void {
  const { state } = step;
  const open = state.open;
  if (open) {
    const paused = open.source === "sticky" || !state.windowFocused || state.recheckPending;
    if (paused || isHeld(state)) {
      state.graceDeadline = null;
    } else if (state.graceDeadline == null) {
      state.graceDeadline = now + HIDE_GRACE_MS;
    } else if (now >= state.graceDeadline) {
      step.close("grace", "handle");
    }
  } else {
    state.graceDeadline = null;
  }

  for (const group of GROUPS) {
    const zone = state.zones[group];
    if (
      !zone.armed &&
      zone.exitedAt != null &&
      state.pointer.hot !== group &&
      now - zone.exitedAt >= REARM_MS
    ) {
      zone.armed = true;
    }
  }

  tryReveal(step, now);
}

function nextWake(state: AutoHideState, now: number): number | null {
  const candidates: number[] = [];
  if (state.graceDeadline != null) candidates.push(state.graceDeadline);
  for (const group of GROUPS) {
    const zone = state.zones[group];
    if (!zone.armed && zone.exitedAt != null && state.pointer.hot !== group) {
      candidates.push(zone.exitedAt + REARM_MS);
    }
  }
  const hot = state.pointer.hot;
  const zone = hot ? state.zones[hot] : null;
  if (hot && zone?.presenceSince != null && state.open?.group !== hot) {
    const timing = dwellTiming(hot, state.hoverReveal);
    candidates.push(zone.presenceSince + timing.rest, zone.presenceSince + timing.fallback);
    if (zone.warm) candidates.push(zone.presenceSince + WARM_DWELL_MS);
    const lastSample = state.pointer.samples[state.pointer.samples.length - 1];
    if (lastSample) candidates.push(lastSample.t + REST_WINDOW_MS);
    candidates.push(state.lastWheelAt + WHEEL_VETO_MS, state.lastKeyAt + KEY_VETO_MS);
  }
  let earliest: number | null = null;
  for (const time of candidates) {
    if (time > now && (earliest == null || time < earliest)) earliest = time;
  }
  return earliest;
}

function applyPointerMove(
  state: AutoHideState,
  event: Extract<AutoHideEvent, { type: "pointerMove" }>
): void {
  const { pointer } = state;
  const { now } = event;
  const previous = pointer.last;
  const distance = previous ? Math.hypot(event.x - previous.x, event.y - previous.y) : 0;
  const moved = distance > 0;

  pointer.kind = event.kind;
  pointer.penHovered = event.kind === "pen" ? pointer.penHovered || event.buttons === 0 : false;
  pointer.buttons = event.buttons;
  pointer.last = { x: event.x, y: event.y };
  pointer.inDocument = true;
  pointer.samples = pointer.samples.filter((sample) => sample.t > now - REST_WINDOW_MS);
  pointer.samples.push({ t: now, d: distance });
  if (moved && state.focus.inside != null) state.focus.movedPx += distance;
  state.recheckPending = false;
  state.env = event.env;

  for (const group of GROUPS) {
    const zone = state.zones[group];
    const wasHot = pointer.hot === group;
    const isHot = event.hot === group;
    if (wasHot && !isHot) {
      resetPresence(zone);
      zone.enteredFromOutside = false;
      zone.exitedAt = moved ? now : null;
    } else if (!wasHot && isHot) {
      zone.exitedAt = null;
      startPresence(state, zone, now);
    } else if (isHot && zone.presenceSince == null && moved) {
      // A key press or a lost window focus reset the wait; movement restarts it.
      startPresence(state, zone, now);
    } else if (!isHot && moved && zone.exitedAt == null) {
      zone.exitedAt = now;
    }
  }

  pointer.hot = event.hot;
  pointer.inside = event.inside;
  pointer.inOverlay = event.inOverlay;

  const open = state.open;
  if (open?.awaitingEntry && event.inOverlay && event.inside === open.group) {
    open.awaitingEntry = false;
  }
}

function leaveHotZone(state: AutoHideState, now: number): void {
  const hot = state.pointer.hot;
  if (!hot) return;
  const zone = state.zones[hot];
  resetPresence(zone);
  zone.enteredFromOutside = false;
  zone.exitedAt = now;
  state.pointer.hot = null;
}

/** Advances the machine by one event. Pure: `state` is never mutated. */
export function stepAutoHide(previous: AutoHideState, event: AutoHideEvent): AutoHideStep {
  const state = cloneState(previous);
  const { now } = event;
  const step = new Step(state, now);

  switch (event.type) {
    case "configure":
      state.hoverReveal = event.hoverReveal;
      break;

    case "reset":
      state.zones = { left: createZone(), right: createZone(), top: createZone() };
      state.open = null;
      state.graceDeadline = null;
      state.dismiss = null;
      break;

    case "pointerMove":
      applyPointerMove(state, event);
      break;

    case "pointerEnterDocument":
      state.pointer.inDocument = true;
      state.recheckPending = false;
      if (event.hot) state.zones[event.hot].enteredFromOutside = true;
      break;

    case "pointerLeaveDocument":
      leaveHotZone(state, now);
      state.pointer.inDocument = false;
      state.pointer.inside = null;
      state.pointer.inOverlay = false;
      state.recheckPending = false;
      break;

    case "pointerDown": {
      const { pointer } = state;
      pointer.kind = event.kind;
      if (event.kind !== "pen") pointer.penHovered = false;
      pointer.buttons = Math.max(pointer.buttons, 1);
      state.recheckPending = false;
      const open = state.open;
      state.pressInside = open != null && event.inside === open.group;
      if (open && event.inside !== open.group) {
        state.dismiss = { pointerId: event.pointerId, swallowed: event.swallowable };
        if (event.swallowable) step.effects.push({ type: "swallow" });
      } else {
        state.dismiss = null;
      }
      break;
    }

    case "pointerUp": {
      state.pointer.buttons = 0;
      state.pressInside = false;
      state.recheckPending = false;
      const { dismiss, open } = state;
      state.dismiss = null;
      if (open && dismiss?.pointerId === event.pointerId && event.inside !== open.group) {
        step.close("dismiss", dismiss.swallowed ? "main" : "none");
      }
      break;
    }

    case "pointerCancel":
      state.pointer.buttons = 0;
      state.pressInside = false;
      state.dismiss = null;
      break;

    case "wheel":
      state.lastWheelAt = now;
      // A wheel over a band means reading, even when nothing could scroll.
      if (state.pointer.hot) disarm(state.zones[state.pointer.hot]);
      break;

    case "scroll":
      if (state.pointer.hot) disarm(state.zones[state.pointer.hot]);
      break;

    case "keydown": {
      state.lastKeyAt = now;
      // A parked pointer must move again before it counts.
      if (state.pointer.hot) resetPresence(state.zones[state.pointer.hot]);
      const open = state.open;
      if (
        event.navigation &&
        open?.source === "hover" &&
        state.focus.inside !== open.group
      ) {
        step.close("nav-key", "none");
      }
      break;
    }

    case "focusIn": {
      const { focus } = state;
      if (event.inside != null && event.inside !== focus.inside) focus.movedPx = 0;
      focus.inside = event.inside;
      focus.editable = event.editable;
      const open = state.open;
      if (!open) break;
      if (event.modal) {
        step.close("modal", "none");
        break;
      }
      if (event.inside === open.group) break;
      // A press outside is in progress: its up-event decides.
      if (state.dismiss) break;
      const pointerDriven =
        state.pointer.inside === open.group && now - state.lastKeyAt >= KEY_FOCUS_WINDOW_MS;
      if (!pointerDriven) step.close("focus-out", "none");
      break;
    }

    case "focusLost":
      // Its element was removed: not a close. The adapter refocuses the panel.
      break;

    case "holdChange":
      state.ownedLayers[event.group] = Math.max(0, event.count);
      break;

    case "esc": {
      const open = state.open;
      if (open) step.close("esc", open.source === "keyboard" ? "return" : "handle");
      break;
    }

    case "explicitOpen":
      state.open = {
        group: event.group,
        source: event.source,
        awaitingEntry: event.source === "click",
      };
      state.graceDeadline = null;
      state.dismiss = null;
      resetPresence(state.zones[event.group]);
      break;

    case "explicitClose":
      if (state.open?.group === event.group) {
        state.open = null;
        state.graceDeadline = null;
        state.dismiss = null;
      }
      state.zones[event.group].leaveClosedAt = null;
      disarm(state.zones[event.group]);
      break;

    case "modalOpen":
      step.close("modal", "none");
      break;

    case "blur":
      state.windowFocused = false;
      state.graceDeadline = null;
      for (const group of GROUPS) resetPresence(state.zones[group]);
      break;

    case "focus":
      state.windowFocused = true;
      state.recheckPending = true;
      break;

    case "tick":
      state.env = event.env;
      break;
  }

  evaluate(step, now);
  return { state, effects: step.effects, wakeAt: nextWake(state, now) };
}
