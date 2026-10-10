/**
 * Explicit opening and closing of auto-hidden panels, with the focus rules
 * that go with them (spec §2.5, §4.2). Handles, chips, shortcuts, skip links
 * and the breadcrumb all come through here, so focus always leaves a panel
 * before it becomes `inert`, and a keyboard open lands focus inside it.
 *
 * The DOM contract is a set of ids (`panelDomIds`); the components render
 * them, nothing else needs a reference.
 */
import { useAppStore } from "@/store/useAppStore";
import type { HoverRevealSetting, PanelGroup, RevealSource } from "@/store/slices/layoutSlice";
import { canRestoreFocusTo, moveFocusOutOf } from "@/utils/focus";
import type { CloseFocus, PointerKind } from "./autoHideMachine";

export const panelDomIds = {
  region: (group: PanelGroup) => `autohide-region-${group}`,
  gutter: (group: PanelGroup) => `autohide-gutter-${group}`,
  handle: (group: PanelGroup) => `autohide-handle-${group}`,
  overlay: (group: PanelGroup) => `autohide-overlay-${group}`,
} as const;

/** Marks controls that a keyboard open or a chip focuses. */
export const PANEL_FOCUS_ATTR = "data-autohide-focus";

/**
 * Where focus lands when a panel opens from the keyboard or a chip:
 * - `primary`: the group's main item (left: selected tree row, right:
 *   current prompt row, top: first toolbar control);
 * - `search`, `dialogue`, `filters`: a control in the top overlay;
 * - `{ elementId }`: a skip-link target.
 */
export type PanelFocusTarget =
  | "primary"
  | "search"
  | "dialogue"
  | "filters"
  | { elementId: string };

export function getOverlay(group: PanelGroup): HTMLElement | null {
  return document.getElementById(panelDomIds.overlay(group));
}

export function getHandle(group: PanelGroup): HTMLElement | null {
  return document.getElementById(panelDomIds.handle(group));
}

/** Where focus was before each keyboard open, to return to on Esc. */
const returnTargets = new Map<PanelGroup, HTMLElement>();

function rememberReturnTarget(group: PanelGroup): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) {
    returnTargets.delete(group);
    return;
  }
  // A second keyboard open from inside the panel keeps the original target.
  if (getOverlay(group)?.contains(active)) return;
  returnTargets.set(group, active);
}

function closeFocusTarget(group: PanelGroup, rule: CloseFocus): HTMLElement | null {
  if (rule === "main") return document.getElementById("main-content");
  if (rule === "return") {
    const target = returnTargets.get(group);
    if (canRestoreFocusTo(target) && !getOverlay(group)?.contains(target)) return target;
  }
  return getHandle(group);
}

/** Moves focus out of the overlay (only if it is there) before it hides. */
export function releaseFocusBeforeHide(group: PanelGroup, rule: CloseFocus): void {
  moveFocusOutOf(getOverlay(group), closeFocusTarget(group, rule));
  returnTargets.delete(group);
}

const FIRST_FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function findPrimary(group: PanelGroup, container: HTMLElement): HTMLElement | null {
  const pick = (...selectors: string[]) => {
    for (const selector of selectors) {
      const found = container.querySelector<HTMLElement>(selector);
      if (found) return found;
    }
    return null;
  };
  switch (group) {
    case "left":
      return pick(
        '[role="treeitem"][aria-selected="true"]',
        '[role="treeitem"][tabindex="0"]',
        '[role="treeitem"]',
        "#project-explorer"
      );
    case "right":
      return pick('[role="listbox"] [tabindex="0"]', '[role="option"]', "#message-navigator");
    case "top":
      return pick(FIRST_FOCUSABLE);
  }
}

function findFocusTarget(
  group: PanelGroup,
  overlay: HTMLElement,
  target: PanelFocusTarget
): HTMLElement | null {
  if (typeof target === "object") return document.getElementById(target.elementId);
  if (target === "primary") return findPrimary(group, overlay);
  return overlay.querySelector<HTMLElement>(`[${PANEL_FOCUS_ATTR}="${target}"]:not(:disabled)`);
}

function focusElement(element: HTMLElement | null): void {
  if (!element) return;
  element.focus({ preventScroll: true });
  element.scrollIntoView?.({ block: "nearest" });
  if (element instanceof HTMLInputElement) element.select();
}

/** Focuses `target` inside an open overlay; the search field also gets its text selected. */
export function focusInPanel(group: PanelGroup, target: PanelFocusTarget): void {
  const overlay = getOverlay(group);
  if (!overlay) return;
  focusElement(findFocusTarget(group, overlay, target) ?? findPrimary(group, overlay));
}

/** Focuses the primary item of a group shown in flow (pinned or normal layout). */
export function focusGroupPrimary(group: PanelGroup): void {
  const region = document.getElementById(panelDomIds.region(group));
  if (region) focusElement(findPrimary(group, region));
}

/** The conversation search field, when a conversation is showing. */
export function getConversationSearchInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[${PANEL_FOCUS_ATTR}="search"]`);
}

/**
 * Opens `group` as an overlay. An explicit open first closes another open
 * overlay, moving focus out of it before it becomes inert: to the new
 * group's handle for a keyboard open (focus then moves on into the new
 * panel), otherwise to the closing group's handle. A hover never evicts.
 */
export function revealPanel(
  group: PanelGroup,
  source: RevealSource,
  options: { focus?: PanelFocusTarget; quick?: boolean } = {}
): boolean {
  const store = useAppStore.getState();
  const current = store.revealed;
  if (current && current.group !== group) {
    if (source === "hover") return false;
    moveFocusOutOf(
      getOverlay(current.group),
      source === "keyboard" ? getHandle(group) : getHandle(current.group)
    );
  }
  if (source === "keyboard") rememberReturnTarget(group);
  if (!store.revealPanel(group, source, options.quick ?? false)) return false;

  const focusTarget = options.focus ?? (source === "keyboard" ? "primary" : null);
  if (focusTarget) {
    // After React has committed the overlay without `inert`.
    requestAnimationFrame(() => focusInPanel(group, focusTarget));
  }
  return true;
}

/** Closes the overlay of `group`, focus first (see `CloseFocus`). */
export function concealPanel(group: PanelGroup, focus: CloseFocus = "handle"): void {
  const store = useAppStore.getState();
  if (store.revealed?.group !== group) return;
  releaseFocusBeforeHide(group, focus);
  store.concealPanel(group);
}

/**
 * Handle, gutter and shortcut toggle. A click on a panel that hover just
 * opened confirms it (it becomes a click open) instead of closing it under
 * the person who aimed for the handle; any other activation while open
 * closes it, with focus treated as for Esc.
 */
export function togglePanel(
  group: PanelGroup,
  source: RevealSource,
  options: { focus?: PanelFocusTarget } = {}
): void {
  const revealed = useAppStore.getState().revealed;
  if (revealed?.group !== group) {
    revealPanel(group, source, options);
    return;
  }
  if (revealed.source === "hover" && (source === "click" || source === "sticky")) {
    useAppStore.getState().revealPanel(group, source);
    return;
  }
  concealPanel(group, revealed.source === "keyboard" ? "return" : "handle");
}

/** Choosing a session closes a sticky left overlay, as it closes the mobile drawer. */
export function concealAfterSessionChosen(): void {
  const revealed = useAppStore.getState().revealed;
  if (revealed?.group === "left" && revealed.source === "sticky") {
    concealPanel("left", "handle");
  }
}

let lastPointer: { kind: PointerKind; penHovered: boolean } = { kind: "mouse", penHovered: false };

/** Kept by the adapter: the pointer behind the next click, for browsers whose click has no pointerType. */
export function recordPointer(kind: PointerKind, penHovered: boolean): void {
  lastPointer = { kind, penHovered };
}

/**
 * The open source of a click or key activation: keyboard (`detail === 0`),
 * sticky for touch, a pen tap without hover or hover reveal Off, else click.
 */
export function sourceFromActivation(
  event: { detail: number; nativeEvent?: Event },
  hoverReveal: HoverRevealSetting
): RevealSource {
  if (event.detail === 0) return "keyboard";
  const native = event.nativeEvent as PointerEvent | undefined;
  const kind = (native?.pointerType || lastPointer.kind) as PointerKind;
  if (kind === "touch") return "sticky";
  if (kind === "pen" && !lastPointer.penHovered) return "sticky";
  return hoverReveal === "off" ? "sticky" : "click";
}

/** Skip-link target ids per group. */
export function revealForSkipLink(group: PanelGroup, elementId: string): boolean {
  const { revealed } = useAppStore.getState();
  if (revealed?.group === group) {
    focusInPanel(group, { elementId });
    return true;
  }
  return revealPanel(group, "keyboard", { focus: { elementId } });
}
