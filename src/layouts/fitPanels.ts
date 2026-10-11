/**
 * Keeps the transcript readable: when the open side panels would leave the
 * conversation narrower than `MIN_TRANSCRIPT_WIDTH_PX`, some of them render
 * as rails, the prompts navigator first, then the sessions pane, then the
 * explorer. Derived at render time and never written to the persisted
 * flags, so a wider window brings the panels back by itself.
 */

/** The narrowest the conversation column may get while side panels are open. */
export const MIN_TRANSCRIPT_WIDTH_PX = 480;

export type SidePanel = "navigator" | "sessions" | "explorer";

/** The order in which panels fold for lack of room. */
export const FOLD_ORDER: readonly SidePanel[] = ["navigator", "sessions", "explorer"];

export interface PanelFitInput {
  /** On screen at all in this view (as a panel or as a rail). */
  shown: boolean;
  /** Its persisted flag says expanded. */
  open: boolean;
  /** Width when expanded. */
  width: number;
}

export interface FitInput {
  viewportWidth: number;
  /** Width of a panel folded to its rail. */
  railWidth: number;
  /** Other fixed columns beside the transcript (the recent-edits dock). */
  reservedWidth: number;
  panels: Record<SidePanel, PanelFitInput>;
}

/** Panels whose flag says expanded but which render as rails for lack of room. */
export function panelsFoldedForRoom(input: FitInput): Set<SidePanel> {
  const { viewportWidth, railWidth, reservedWidth, panels } = input;
  let used = reservedWidth;
  for (const panel of FOLD_ORDER) {
    const { shown, open, width } = panels[panel];
    if (shown) used += open ? width : railWidth;
  }
  const folded = new Set<SidePanel>();
  for (const panel of FOLD_ORDER) {
    if (viewportWidth - used >= MIN_TRANSCRIPT_WIDTH_PX) break;
    const { shown, open, width } = panels[panel];
    if (!shown || !open) continue;
    folded.add(panel);
    used -= width - railWidth;
  }
  return folded;
}

/**
 * The person expanded `opening`, which was folded only for lack of room:
 * the other open panels whose flags to collapse, in fold order, until
 * `opening` fits. Empty when nothing else can make room.
 */
export function panelsToCollapseForOpening(opening: SidePanel, input: FitInput): SidePanel[] {
  const panels = { ...input.panels, [opening]: { ...input.panels[opening], open: true } };
  const collapse: SidePanel[] = [];
  for (const panel of FOLD_ORDER) {
    if (!panelsFoldedForRoom({ ...input, panels }).has(opening)) return collapse;
    if (panel === opening || !panels[panel].shown || !panels[panel].open) continue;
    collapse.push(panel);
    panels[panel] = { ...panels[panel], open: false };
  }
  return panelsFoldedForRoom({ ...input, panels }).has(opening) ? [] : collapse;
}
