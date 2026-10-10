import { useEffect, useState } from "react";
import { OVERLAY_TRANSCRIPT_RESERVE_PX } from "./constants";

/**
 * Width of a side overlay (spec §3): its panels' pinned widths, capped so
 * at least 360 px of the reading column stays uncovered, but never below
 * `floor` (the floor wins when both cannot hold) nor wider than the panels.
 */
export function overlayWidth(natural: number, available: number, floor: number): number {
  const cap = available - OVERLAY_TRANSCRIPT_RESERVE_PX;
  return Math.round(Math.min(natural, Math.max(cap, floor)));
}

/**
 * Shares a capped left overlay between the explorer and the sessions pane
 * in proportion to their pinned widths.
 */
export function splitLeftOverlay(
  total: number,
  explorer: number,
  sessions: number | null
): { explorer: number; sessions: number | null } {
  if (sessions == null) return { explorer: total, sessions: null };
  const natural = explorer + sessions;
  if (total >= natural) return { explorer, sessions };
  const explorerWidth = Math.round((total * explorer) / natural);
  return { explorer: explorerWidth, sessions: total - explorerWidth };
}

/** Marks the column the overlays must leave room in (the transcript's). */
export const READING_COLUMN_ATTR = "data-reading-column";

/**
 * Width of the reading column: the transcript column when one is shown,
 * otherwise the main content area. Measured only while `active`; `layoutKey`
 * changes when the column may have mounted or unmounted.
 */
export function useReadingColumnWidth(active: boolean, layoutKey: string): number {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerWidth
  );

  useEffect(() => {
    if (!active) return;
    const main = document.getElementById("main-content");
    const column = document.querySelector<HTMLElement>(`[${READING_COLUMN_ATTR}]`);
    const measured = column ?? main;
    if (!measured) return;
    const measure = () => setWidth(Math.round(measured.getBoundingClientRect().width));
    measure();
    if (!("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(measure);
    observer.observe(measured);
    return () => observer.disconnect();
  }, [active, layoutKey]);

  return width;
}
