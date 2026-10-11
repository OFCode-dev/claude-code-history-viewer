/**
 * A side area folded to its rail: a 24 px strip of the window edge (44 px
 * where the pointer is coarse), in flow, holding the expand button and the
 * area's own accessories. Shared by the explorer, sessions pane and prompts
 * navigator so the three rails look and size alike.
 */
export const railClass =
  "flex h-full w-6 shrink-0 flex-col items-center gap-1 bg-sidebar pt-2 pointer-coarse:w-11";

/** A count under a rail's buttons: digits only, its words for screen readers. */
export const railCountClass = "text-2xs tabular-nums text-muted-foreground";

/**
 * A control on a rail: 24 x 24 (44 x 44 on touch). The focus ring is inset
 * so the rail's narrow box cannot clip it.
 */
export const railButtonClass =
  "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring pointer-coarse:size-11";
