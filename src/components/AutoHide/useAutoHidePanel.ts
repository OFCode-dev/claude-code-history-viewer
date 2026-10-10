/**
 * The DOM adapter of the auto-hide reducer. One controller runs while
 * reading mode is active on a wide window: it listens once at the document
 * level, hit-tests the pointer against the gutters, handles and the open
 * overlay, reads focus, feeds the reducer and carries out what it decides.
 *
 * The store's `revealed` is what the regions render. The reducer and the
 * store are reconciled both ways: an explicit open through `panelActions`
 * reaches the reducer through a store subscription, and a hover reveal or
 * a hide from the reducer goes to the store through `panelActions`.
 */
import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { PANEL_GROUPS, type PanelGroup, type RevealedPanel } from "@/store/slices/layoutSlice";
import { isEditableTarget } from "@/utils/editableTarget";
import { focusMainContentIfLost } from "@/utils/focus";
import {
  createAutoHideState,
  stepAutoHide,
  type AutoHideEffect,
  type AutoHideEnv,
  type AutoHideEvent,
  type AutoHideState,
  type PointerKind,
} from "./autoHideMachine";
import { AUTOHIDE_OWNER_ATTR, getHoldCount, subscribeHolds } from "./autoHideHolds";
import {
  AUTOHIDE_COLD_ATTR,
  AUTOHIDE_DEBUG_KEY,
  DISMISS_SWALLOW_SELECTOR,
  HOVER_BAND_PX,
  HYSTERESIS_PX,
  TRANSCRIPT_AREA_ATTR,
} from "./constants";
import {
  concealPanel,
  focusInPanel,
  getHandle,
  getOverlay,
  panelDomIds,
  recordPointer,
  revealPanel,
} from "./panelActions";

/** Keys that hand control to the keyboard: they close an overlay hover opened. */
const NAVIGATION_KEYS = new Set([
  "Tab",
  "F6",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);
/** Pressing only a modifier is not keyboard use. */
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "Fn", "OS"]);
/** Layers that block hover reveal and, unowned, close every overlay when focused. */
const LAYER_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [aria-modal="true"]';
const MODAL_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';
/** A swallowed press also drops the click it produces, if it comes this soon. */
const SWALLOW_WINDOW_MS = 1000;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const contains = (rect: Rect, x: number, y: number) =>
  x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;

const expand = (rect: Rect, by: number): Rect => ({
  left: rect.left - by,
  top: rect.top - by,
  right: rect.right + by,
  bottom: rect.bottom + by,
});

const toPointerKind = (type: string): PointerKind =>
  type === "touch" ? "touch" : type === "pen" ? "pen" : "mouse";

const now = () => performance.now();

function isDebugLogging(): boolean {
  try {
    return localStorage.getItem(AUTOHIDE_DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

function ownerOf(element: Element | null): PanelGroup | null {
  const owned = element?.closest(`[${AUTOHIDE_OWNER_ATTR}]`);
  const value = owned?.getAttribute(AUTOHIDE_OWNER_ATTR);
  return value === "left" || value === "right" || value === "top" ? value : null;
}

/** The group whose region (gutter, handle, overlay) or owned layer holds `element`. */
function groupContaining(element: Element | null): PanelGroup | null {
  if (!element) return null;
  for (const group of PANEL_GROUPS) {
    if (document.getElementById(panelDomIds.region(group))?.contains(element)) return group;
  }
  return ownerOf(element);
}

function isForeignLayerOpen(): boolean {
  for (const layer of document.querySelectorAll(LAYER_SELECTOR)) {
    if (ownerOf(layer) == null && layer.closest("[inert]") == null) return true;
  }
  return false;
}

/** A transcript control a dismiss press must not activate. */
function isSwallowable(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  const area = target.closest(`[${TRANSCRIPT_AREA_ATTR}]`);
  if (!area) return null;
  const control = target.closest(DISMISS_SWALLOW_SELECTOR);
  return control && area.contains(control) && control !== area ? control : null;
}

/** Bounding boxes read at most once per frame while the pointer moves. */
class LayoutCache {
  private rects = new Map<Element, DOMRect>();
  private sizes = new Map<HTMLElement, { width: number; height: number }>();
  private frame: number | null = null;

  rect(element: Element): DOMRect {
    let rect = this.rects.get(element);
    if (!rect) {
      rect = element.getBoundingClientRect();
      this.rects.set(element, rect);
      this.scheduleClear();
    }
    return rect;
  }

  size(element: HTMLElement): { width: number; height: number } {
    let size = this.sizes.get(element);
    if (!size) {
      size = { width: element.offsetWidth, height: element.offsetHeight };
      this.sizes.set(element, size);
      this.scheduleClear();
    }
    return size;
  }

  dispose(): void {
    if (this.frame != null) cancelAnimationFrame(this.frame);
  }

  private scheduleClear(): void {
    if (this.frame != null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.rects.clear();
      this.sizes.clear();
    });
  }
}

interface HitTest {
  hot: PanelGroup | null;
  inside: PanelGroup | null;
  inOverlay: boolean;
}

export class AutoHideController {
  private state: AutoHideState;
  private timer: number | null = null;
  private readonly layout = new LayoutCache();
  private readonly cleanups: Array<() => void> = [];
  private lastPointer: { x: number; y: number } | null = null;
  private swallow: { target: Element; until: number } | null = null;
  private readonly debug = isDebugLogging();
  private opened: { group: PanelGroup; at: number; interacted: boolean } | null = null;
  /** After stop() nothing may dispatch: late timers and microtasks are dropped. */
  private stopped = false;
  /** One refocus attempt per lost focus; a second miss clears the focus hold. */
  private refocusTried = false;

  constructor() {
    this.state = createAutoHideState(useAppStore.getState().hoverReveal);
  }

  start(): void {
    for (const group of PANEL_GROUPS) {
      this.state.ownedLayers[group] = getHoldCount(group);
    }
    const options = { capture: true, passive: true } as const;
    this.listen(window, "pointermove", this.onPointerMove, options);
    this.listen(window, "pointerdown", this.onPointerDown, { capture: true });
    this.listen(window, "pointerup", this.onPointerUp, { capture: true });
    this.listen(window, "pointercancel", this.onPointerCancel, options);
    this.listen(document, "pointerover", this.onPointerOver, options);
    this.listen(document, "pointerout", this.onPointerOut, options);
    for (const type of ["mousedown", "mouseup", "click", "auxclick", "dblclick"]) {
      this.listen(window, type, this.onSwallowable, { capture: true });
    }
    this.listen(window, "wheel", this.onWheel, options);
    this.listen(document, "scroll", this.onScroll, options);
    this.listen(window, "keydown", this.onKeyCapture, { capture: true });
    this.listen(window, "keydown", this.onKeyBubble);
    this.listen(document, "focusin", this.onFocusIn);
    this.listen(document, "focusout", this.onFocusOut);
    this.listen(window, "blur", this.onWindowBlur);
    this.listen(window, "focus", this.onWindowFocus);
    this.listen(document, "visibilitychange", this.onVisibilityChange);

    this.cleanups.push(subscribeHolds(this.onHoldChange));
    this.cleanups.push(
      useAppStore.subscribe((state, previous) => {
        if (state.hoverReveal !== previous.hoverReveal) {
          this.dispatch({ type: "configure", now: now(), hoverReveal: state.hoverReveal });
        }
        if (state.revealed !== previous.revealed) this.reconcile(state.revealed);
      })
    );
    this.reconcile(useAppStore.getState().revealed);
  }

  stop(): void {
    this.stopped = true;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = null;
    this.layout.dispose();
    // Auto-hide ends (reading mode off, or the window below 768 px): no
    // overlay may stay open, or come back open, without it.
    const { revealed } = useAppStore.getState();
    if (!revealed) return;
    concealPanel(revealed.group, "main");
    // Below 768 px the panel itself may already be gone, focus with it.
    focusMainContentIfLost();
  }

  private listen(
    target: Window | Document,
    type: string,
    handler: (event: never) => void,
    options?: AddEventListenerOptions
  ): void {
    const listener = handler as unknown as EventListener;
    target.addEventListener(type, listener, options);
    this.cleanups.push(() => target.removeEventListener(type, listener, options));
  }

  // ---------------------------------------------------------------------------
  // Reducer plumbing
  // ---------------------------------------------------------------------------

  private dispatch(event: AutoHideEvent): AutoHideEffect[] {
    if (this.stopped) return [];
    const result = stepAutoHide(this.state, event);
    this.state = result.state;
    // Scheduled first: an effect can dispatch again, and its wake-up is newer.
    this.schedule(result.wakeAt);
    for (const effect of result.effects) this.apply(effect);
    return result.effects;
  }

  private schedule(wakeAt: number | null): void {
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = null;
    if (wakeAt == null || this.stopped) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.checkFocusAlive();
      this.dispatch({ type: "tick", now: now(), env: this.env() });
    }, Math.max(0, wakeAt - now()));
  }

  private apply(effect: AutoHideEffect): void {
    if (effect.type === "reveal") {
      this.log(`reveal ${effect.group} (hover, ${effect.reason})`);
      this.opened = { group: effect.group, at: now(), interacted: false };
      if (!revealPanel(effect.group, "hover", { quick: effect.quick })) {
        this.reconcile(useAppStore.getState().revealed);
      }
      return;
    }
    if (effect.type === "hide") {
      this.logClose(effect.group, effect.reason);
      concealPanel(effect.group, effect.focus);
    }
  }

  /** Brings the reducer in line with the store after an open or close it did not decide. */
  private reconcile(revealed: RevealedPanel | null): void {
    const open = this.state.open;
    if (revealed?.group === open?.group && revealed?.source === open?.source) return;
    if (revealed) {
      // Every open the reducer did not decide is a deliberate one.
      this.log(`open ${revealed.group} (${revealed.source})`);
      this.opened = { group: revealed.group, at: now(), interacted: true };
      this.dispatch({ type: "explicitOpen", now: now(), group: revealed.group, source: revealed.source });
    } else if (open) {
      this.logClose(open.group, "explicit");
      this.dispatch({ type: "explicitClose", now: now(), group: open.group });
    }
  }

  private env(): AutoHideEnv {
    // Only worth reading while a hover reveal could be decided.
    if (this.state.pointer.hot == null) return this.state.env;
    return { documentFocused: document.hasFocus(), layerOpen: isForeignLayerOpen() };
  }

  // ---------------------------------------------------------------------------
  // Hit testing
  // ---------------------------------------------------------------------------

  /** Where the overlay of `group` sits when fully shown, whatever its animation. */
  private overlayRect(group: PanelGroup): Rect | null {
    const region = document.getElementById(panelDomIds.region(group));
    const overlay = getOverlay(group);
    if (!region || !overlay) return null;
    const anchor = this.layout.rect(region);
    const { width, height } = this.layout.size(overlay);
    switch (group) {
      case "left":
        return { left: anchor.right, right: anchor.right + width, top: anchor.top, bottom: anchor.top + height };
      case "right":
        return { left: anchor.left - width, right: anchor.left, top: anchor.top, bottom: anchor.top + height };
      case "top":
        return { left: anchor.left, right: anchor.left + width, top: anchor.bottom, bottom: anchor.bottom + height };
    }
  }

  private hitTest(x: number, y: number, target: EventTarget | null): HitTest {
    let hot: PanelGroup | null = null;
    let inside: PanelGroup | null = null;
    let inOverlay = false;

    for (const group of PANEL_GROUPS) {
      const gutter = document.getElementById(panelDomIds.gutter(group));
      if (!gutter) continue;
      const rect = this.layout.rect(gutter);
      if (!contains(rect, x, y)) continue;
      inside = group;
      if (group === "top") {
        const handle = getHandle(group);
        if (handle && contains(this.layout.rect(handle), x, y)) hot = group;
      } else if (y < rect.top + HOVER_BAND_PX) {
        hot = group;
      }
    }

    const openGroup = this.state.open?.group;
    if (openGroup) {
      const rect = this.overlayRect(openGroup);
      if (rect && contains(rect, x, y)) {
        // The open overlay covers whatever lies beneath it.
        inside = openGroup;
        inOverlay = true;
        hot = null;
      } else if (rect && inside == null && contains(expand(rect, HYSTERESIS_PX), x, y)) {
        inside = openGroup;
      }
    }

    const element = target instanceof Element ? target : null;
    const owner = ownerOf(element);
    if (owner) {
      inside = owner;
      hot = null;
    }
    // Controls that act without the panel (the prompt seek buttons under the
    // handle): aiming at them is not a request to open it.
    if (hot != null && hot !== "top" && element?.closest(`[${AUTOHIDE_COLD_ATTR}]`)) hot = null;
    return { hot, inside, inOverlay };
  }

  // ---------------------------------------------------------------------------
  // Pointer
  // ---------------------------------------------------------------------------

  private onPointerMove = (event: PointerEvent) => {
    if (!event.isTrusted) return;
    const kind = toPointerKind(event.pointerType);
    recordPointer(kind, kind === "pen" && event.buttons === 0);
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.checkFocusAlive();
    const hit = this.hitTest(event.clientX, event.clientY, event.target);
    this.dispatch({
      type: "pointerMove",
      now: now(),
      x: event.clientX,
      y: event.clientY,
      kind,
      buttons: event.buttons,
      ...hit,
      env: hit.hot ? { documentFocused: document.hasFocus(), layerOpen: isForeignLayerOpen() } : this.state.env,
    });
  };

  private onPointerDown = (event: PointerEvent) => {
    // A new press is never covered by an earlier swallow.
    this.swallow = null;
    const kind = toPointerKind(event.pointerType);
    recordPointer(kind, this.state.pointer.penHovered);
    const hit = this.hitTest(event.clientX, event.clientY, event.target);
    if (this.state.open && hit.inside === this.state.open.group) this.noteInteraction();
    const control = isSwallowable(event.target);
    const effects = this.dispatch({
      type: "pointerDown",
      now: now(),
      pointerId: event.pointerId,
      kind,
      inside: hit.inside,
      swallowable: control != null,
    });
    if (control && effects.some((effect) => effect.type === "swallow")) {
      this.swallow = { target: control, until: now() + SWALLOW_WINDOW_MS };
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  private onPointerUp = (event: PointerEvent) => {
    const hit = this.hitTest(event.clientX, event.clientY, event.target);
    this.dispatch({ type: "pointerUp", now: now(), pointerId: event.pointerId, inside: hit.inside });
    if (this.isSwallowing(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  private onPointerCancel = () => {
    this.swallow = null;
    this.dispatch({ type: "pointerCancel", now: now() });
  };

  private isSwallowing(target: EventTarget | null): boolean {
    const swallow = this.swallow;
    if (!swallow) return false;
    if (now() > swallow.until) {
      this.swallow = null;
      return false;
    }
    return target instanceof Node && swallow.target.contains(target);
  }

  /** Drops the mouse events and the click a swallowed press produces. */
  private onSwallowable = (event: MouseEvent) => {
    if (!this.isSwallowing(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "click") this.swallow = null;
  };

  private onPointerOver = (event: PointerEvent) => {
    if (event.relatedTarget != null || event.pointerType === "touch") return;
    const { hot } = this.hitTest(event.clientX, event.clientY, event.target);
    this.dispatch({ type: "pointerEnterDocument", now: now(), hot });
  };

  private onPointerOut = (event: PointerEvent) => {
    if (event.relatedTarget != null || event.pointerType === "touch") return;
    this.dispatch({ type: "pointerLeaveDocument", now: now() });
  };

  private onWheel = () => {
    this.dispatch({ type: "wheel", now: now() });
  };

  private onScroll = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(`[${TRANSCRIPT_AREA_ATTR}]`)) return;
    this.dispatch({ type: "scroll", now: now() });
  };

  /** A released hold: look at where the pointer is now (Radix menus fire no leave events). */
  private onHoldChange = (group: PanelGroup, count: number) => {
    this.dispatch({ type: "holdChange", now: now(), group, count });
    const last = this.lastPointer;
    if (count > 0 || !last || !this.state.open) return;
    const target = document.elementFromPoint(last.x, last.y);
    this.dispatch({
      type: "pointerMove",
      now: now(),
      x: last.x,
      y: last.y,
      kind: this.state.pointer.kind,
      buttons: 0,
      ...this.hitTest(last.x, last.y, target),
      env: this.state.env,
    });
  };

  // ---------------------------------------------------------------------------
  // Keyboard and focus
  // ---------------------------------------------------------------------------

  private onKeyCapture = (event: KeyboardEvent) => {
    if (event.isComposing || MODIFIER_KEYS.has(event.key)) return;
    this.checkFocusAlive();
    const open = this.state.open;
    if (open && groupContaining(document.activeElement) === open.group) this.noteInteraction();
    const navigation =
      NAVIGATION_KEYS.has(event.key) &&
      !(event.key === " " && isEditableTarget(event.target));
    this.dispatch({ type: "keydown", now: now(), navigation });
  };

  /** Esc reaches the overlay last: only if no menu, dialog or field used it. */
  private onKeyBubble = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
    if (!this.state.open) return;
    event.preventDefault();
    this.dispatch({ type: "esc", now: now() });
  };

  private onFocusIn = (event: FocusEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const inside = groupContaining(target);
    const modal = inside == null && target?.closest(MODAL_SELECTOR) != null;
    if (this.state.open && inside === this.state.open.group) this.noteInteraction();
    this.dispatch({
      type: "focusIn",
      now: now(),
      inside,
      editable: isEditableTarget(target),
      modal,
    });
  };

  private onFocusOut = (event: FocusEvent) => {
    if (event.relatedTarget != null) return;
    const from = event.target instanceof Element ? event.target : null;
    const group = groupContaining(from);
    // Decided once the browser has settled where focus went.
    queueMicrotask(() => {
      if (this.stopped) return;
      if (document.activeElement !== document.body && document.activeElement != null) return;
      const open = this.state.open;
      if (from && !from.isConnected && open && group === open.group) {
        this.dispatch({ type: "focusLost", now: now() });
        focusInPanel(open.group, "primary");
        return;
      }
      this.dispatch({ type: "focusCleared", now: now() });
    });
  };

  /**
   * Fallback for engines that fire no focusout when the focused element is
   * removed (WebKit, Firefox): focus still counted inside a panel while it
   * actually sits on <body> refocuses the panel once, then stops holding.
   */
  private checkFocusAlive(): void {
    const inside = this.state.focus.inside;
    const active = document.activeElement;
    const lost = active == null || active === document.body || !active.isConnected;
    if (inside == null || !lost) {
      this.refocusTried = false;
      return;
    }
    const open = this.state.open;
    if (open?.group === inside && !this.refocusTried) {
      this.refocusTried = true;
      this.dispatch({ type: "focusLost", now: now() });
      focusInPanel(open.group, "primary");
      return;
    }
    this.dispatch({ type: "focusCleared", now: now() });
  }

  private onWindowBlur = () => {
    this.dispatch({ type: "blur", now: now() });
  };

  private onWindowFocus = () => {
    this.dispatch({ type: "focus", now: now() });
  };

  private onVisibilityChange = () => {
    this.dispatch({ type: document.hidden ? "blur" : "focus", now: now() });
  };

  // ---------------------------------------------------------------------------
  // Debug log (`localStorage["autohide-debug"] = "1"`), for the owner task check
  // ---------------------------------------------------------------------------

  private noteInteraction(): void {
    if (this.opened) this.opened.interacted = true;
  }

  private logClose(group: PanelGroup, reason: string): void {
    const opened = this.opened?.group === group ? this.opened : null;
    this.opened = null;
    if (!opened) {
      this.log(`close ${group} (${reason})`);
      return;
    }
    const shownMs = Math.round(now() - opened.at);
    const note = opened.interacted ? "used" : "no interaction";
    this.log(`close ${group} (${reason}) after ${shownMs} ms, ${note}`);
  }

  private log(message: string): void {
    if (!this.debug) return;
    console.info(`[autohide] ${(now() / 1000).toFixed(2)}s ${message}`);
  }
}

/**
 * Runs the auto-hide controller while `active` (reading mode on a window
 * of 768 px or more). Each activation starts with every zone disarmed.
 */
export function useAutoHidePanel(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const controller = new AutoHideController();
    controller.start();
    return () => controller.stop();
  }, [active]);
}
