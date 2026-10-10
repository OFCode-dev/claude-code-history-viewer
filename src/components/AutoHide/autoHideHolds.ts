/**
 * Menus, selects, tooltips and dialogs opened from an auto-hidden panel
 * render in portals outside it, yet they belong to it: while one is open the
 * panel must stay (hold H2), and pointer or focus inside one counts as inside
 * the panel. React context crosses portals, so a layer rendered anywhere
 * under a panel's overlay finds its owner without any prop.
 */
import { createContext, useContext, useEffect } from "react";
import type { PanelGroup } from "@/store/slices/layoutSlice";

/** Attribute on owned portal content; the adapter treats it as inside the panel. */
export const AUTOHIDE_OWNER_ATTR = "data-autohide-owner";

/** The auto-hidden group whose overlay contains the subtree, or null. */
export const AutoHideOwnerContext = createContext<PanelGroup | null>(null);

type HoldListener = (group: PanelGroup, count: number) => void;

const holdCounts: Record<PanelGroup, number> = { left: 0, right: 0, top: 0 };
const listeners = new Set<HoldListener>();

function notify(group: PanelGroup): void {
  for (const listener of listeners) listener(group, holdCounts[group]);
}

/** Registers one open layer of `group`; call the returned function when it closes. */
export function acquireHold(group: PanelGroup): () => void {
  holdCounts[group] += 1;
  notify(group);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holdCounts[group] = Math.max(0, holdCounts[group] - 1);
    notify(group);
  };
}

export function getHoldCount(group: PanelGroup): number {
  return holdCounts[group];
}

export function subscribeHolds(listener: HoldListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the caller renders inside an auto-hidden overlay (reading mode). */
export function useIsInAutoHideOverlay(): boolean {
  return useContext(AutoHideOwnerContext) != null;
}

export interface OwnerProps {
  [AUTOHIDE_OWNER_ATTR]?: PanelGroup;
}

/**
 * The attribute to spread on a portal layer's root, so pointer and focus in
 * it count as inside the owning panel. Empty outside an auto-hidden overlay.
 */
export function useAutoHideOwnerProps(): OwnerProps {
  const group = useContext(AutoHideOwnerContext);
  return group ? { [AUTOHIDE_OWNER_ATTR]: group } : {};
}

/**
 * For a layer that renders in a portal: holds the owning panel open while
 * `open` is true and returns the owner attribute for the layer's root.
 * Outside an auto-hidden overlay it does nothing and returns no attribute.
 * Call it where `open` is known; a Radix wrapper that stays mounted while
 * closed renders `AutoHideLayerHold` inside its content instead.
 */
export function useAutoHideHold(open: boolean): OwnerProps {
  const group = useContext(AutoHideOwnerContext);
  useEffect(() => {
    if (!group || !open) return;
    return acquireHold(group);
  }, [group, open]);
  return group ? { [AUTOHIDE_OWNER_ATTR]: group } : {};
}
