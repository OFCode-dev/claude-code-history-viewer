import type { ReactNode } from "react";
import type { PanelGroup } from "@/store/slices/layoutSlice";
import { AutoHideOwnerContext, useAutoHideHold } from "./autoHideHolds";

/**
 * Marks a subtree as the content of an auto-hidden overlay, so the layers it
 * opens in portals hold the panel open (see `useAutoHideHold`).
 */
export function AutoHideOwnerProvider({
  group,
  children,
}: {
  /** null when the panel is in flow: its layers then belong to no overlay. */
  group: PanelGroup | null;
  children: ReactNode;
}) {
  return <AutoHideOwnerContext.Provider value={group}>{children}</AutoHideOwnerContext.Provider>;
}

/**
 * Rendered inside a menu, select, tooltip or dialog content, which Radix
 * mounts only while the layer is open: it holds the owning panel open for
 * exactly that long. Renders nothing.
 */
export function AutoHideLayerHold() {
  useAutoHideHold(true);
  return null;
}
