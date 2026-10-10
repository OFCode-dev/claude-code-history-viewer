import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppStore } from "@/store/useAppStore";
import type { EffectiveGroupMode, PanelGroup } from "@/store/slices/layoutSlice";
import { getTranscriptViewport } from "@/components/MessageViewer/hooks/useReadingPosition";
import { AutoHideOwnerProvider } from "./AutoHideHoldContext";
import { SLIDE_OUT_MS, WHEEL_LINE_PX } from "./constants";
import { panelDomIds, sourceFromActivation, togglePanel } from "./panelActions";
import type { ShortcutLabel } from "./shortcuts";

interface AutoHideRegionProps {
  group: PanelGroup;
  /** `normal` and `pinned` render the children in flow, exactly as before. */
  mode: EffectiveGroupMode;
  /** Region and handle name, e.g. "Explorer and sessions". */
  label: string;
  shortcut: ShortcutLabel;
  /** Left and right overlays: their width (the panels inside are sized to fit). */
  overlayWidth?: number;
  /** Top strip only: the status chips. */
  chips?: ReactNode;
  /** Top overlay: its measured height while shown (0 when hidden). */
  onOverlayHeightChange?: (height: number) => void;
  children: ReactNode;
}

/**
 * One panel group in reading mode. Auto-hidden, it is a labelled region with
 * a narrow gutter (or the top strip) holding the handle, plus the panel as
 * an overlay that slides out next to it, never over it. The overlay stays
 * mounted: hidden it is `inert`, invisible and off-screen.
 *
 * The element structure is the same in every mode, so switching between
 * normal, pinned and auto-hidden never remounts the panels: their scroll,
 * filters and focus survive, and a pin toggle keeps focus while it pins.
 */
export function AutoHideRegion({
  group,
  mode,
  label,
  shortcut,
  overlayWidth,
  chips,
  onOverlayHeightChange,
  children,
}: AutoHideRegionProps) {
  const isAutoHide = mode === "autohide";
  const revealed = useAppStore((s) => s.revealed);
  const open = isAutoHide && revealed?.group === group;
  const quick = open && revealed?.quick === true;
  const closing = useClosing(open, SLIDE_OUT_MS[group]);
  const settled = useSettledAfterModeSwitch(mode);
  const overlayRef = useRef<HTMLDivElement>(null);

  useOverlayHeight(overlayRef, open, onOverlayHeightChange);

  return (
    <section
      id={panelDomIds.region(group)}
      aria-label={isAutoHide ? label : undefined}
      data-autohide-region={group}
      data-mode={mode}
      className={
        isAutoHide
          ? cn("autohide-region", `autohide-region-${group}`, (open || closing) && "autohide-raised")
          : "contents"
      }
    >
      {isAutoHide ? (
        <Gutter group={group} label={label} shortcut={shortcut} open={open} chips={chips} />
      ) : null}
      <div
        ref={overlayRef}
        id={panelDomIds.overlay(group)}
        className={isAutoHide ? cn("autohide-overlay", `autohide-overlay-${group}`) : "contents"}
        data-state={isAutoHide ? (open ? "open" : "closed") : undefined}
        data-quick={quick ? "" : undefined}
        data-settling={settled ? undefined : ""}
        inert={isAutoHide && !open}
        style={isAutoHide && overlayWidth != null ? { width: overlayWidth } : undefined}
      >
        <AutoHideOwnerProvider group={isAutoHide ? group : null}>{children}</AutoHideOwnerProvider>
      </div>
    </section>
  );
}

const HANDLE_ICONS: Record<PanelGroup, [typeof PanelLeftOpen, typeof PanelLeftOpen]> = {
  left: [PanelLeftOpen, PanelLeftClose],
  right: [PanelRightOpen, PanelRightClose],
  top: [SlidersHorizontal, SlidersHorizontal],
};

const TOOLTIP_SIDE = { left: "right", right: "left", top: "bottom" } as const;

function Gutter({
  group,
  label,
  shortcut,
  open,
  chips,
}: {
  group: PanelGroup;
  label: string;
  shortcut: ShortcutLabel;
  open: boolean;
  chips?: ReactNode;
}) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const hoverReveal = useAppStore((s) => s.hoverReveal);
  useWheelForwarding(gutterRef);

  return (
    // A click anywhere on a side gutter opens the panel; keyboard users have
    // the handle, which is a real button.
    <div
      id={panelDomIds.gutter(group)}
      ref={gutterRef}
      className={cn("autohide-gutter", `autohide-gutter-${group}`)}
      onClick={(event) => {
        // Opens only: closing is the handle's job (spec §2.3).
        if (open || group === "top" || (event.target as Element).closest("button")) return;
        togglePanel(group, sourceFromActivation(event, hoverReveal));
      }}
    >
      <AutoHideOwnerProvider group={group}>
        {group === "top" ? <div className="autohide-chips">{chips}</div> : null}
        <Handle group={group} label={label} shortcut={shortcut} open={open} />
      </AutoHideOwnerProvider>
    </div>
  );
}

function Handle({
  group,
  label,
  shortcut,
  open,
}: {
  group: PanelGroup;
  label: string;
  shortcut: ShortcutLabel;
  open: boolean;
}) {
  const { t } = useTranslation();
  const hoverReveal = useAppStore((s) => s.hoverReveal);
  // Shown on keyboard focus always, on pointer hover only with hover reveal
  // Off: otherwise the opening panel is the feedback, and this app's 0 ms
  // tooltip would land on top of it.
  const [tooltipWanted, setTooltipWanted] = useState(false);
  const [Closed, Opened] = HANDLE_ICONS[group];
  const Icon = open ? Opened : Closed;
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <Tooltip
      open={tooltipWanted && !open}
      onOpenChange={(next) => {
        if (!next) setTooltipWanted(false);
      }}
    >
      <TooltipTrigger asChild>
        <button
          type="button"
          id={panelDomIds.handle(group)}
          className={cn("autohide-handle", `autohide-handle-${group}`)}
          aria-label={label}
          aria-expanded={open}
          aria-controls={panelDomIds.overlay(group)}
          aria-keyshortcuts={shortcut.aria}
          onClick={(event) => togglePanel(group, sourceFromActivation(event, hoverReveal))}
          onFocus={(event) => {
            if (event.currentTarget.matches(":focus-visible")) setTooltipWanted(true);
          }}
          onBlur={() => setTooltipWanted(false)}
          onPointerEnter={() => {
            if (hoverReveal === "off") setTooltipWanted(true);
          }}
          onPointerLeave={(event) => {
            // A tooltip shown for keyboard focus stays while focus does.
            if (!event.currentTarget.matches(":focus-visible")) setTooltipWanted(false);
          }}
        >
          <Icon aria-hidden="true" />
          {group === "top" ? <Chevron aria-hidden="true" /> : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side={TOOLTIP_SIDE[group]}>
        {t("readingMode.handle.tooltip", { name: label, shortcut: shortcut.label })}
      </TooltipContent>
    </Tooltip>
  );
}

/** True for the slide-out after `open` turns false, so the region stays raised. */
function useClosing(open: boolean, durationMs: number): boolean {
  const [closing, setClosing] = useState(false);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current === open) return;
    wasOpen.current = open;
    if (open) {
      setClosing(false);
      return;
    }
    setClosing(true);
    const timer = window.setTimeout(() => setClosing(false), durationMs);
    return () => window.clearTimeout(timer);
  }, [open, durationMs]);
  return closing;
}

/**
 * False for the first frame after the mode changes: layout switches are
 * instant (spec §2.1), so the overlay must not animate into its hidden
 * position when reading mode starts.
 */
function useSettledAfterModeSwitch(mode: EffectiveGroupMode): boolean {
  const [settledMode, setSettledMode] = useState(mode);
  useEffect(() => {
    if (settledMode === mode) return;
    const frame = requestAnimationFrame(() => setSettledMode(mode));
    return () => cancelAnimationFrame(frame);
  }, [mode, settledMode]);
  return settledMode === mode;
}

function useOverlayHeight(
  overlayRef: React.RefObject<HTMLDivElement | null>,
  open: boolean,
  onChange: ((height: number) => void) | undefined
): void {
  useLayoutEffect(() => {
    if (!onChange) return;
    const overlay = overlayRef.current;
    if (!open || !overlay) {
      onChange(0);
      return;
    }
    const report = () => onChange(overlay.offsetHeight);
    report();
    const observer = "ResizeObserver" in window ? new ResizeObserver(report) : null;
    observer?.observe(overlay);
    return () => {
      observer?.disconnect();
      // Closing or unmounting while open must not leave the clearance inflated.
      onChange(0);
    };
  }, [overlayRef, open, onChange]);
}

/**
 * The gutter sits beside the transcript scroller, not inside it, so a wheel
 * over it would scroll nothing. Forward it, in pixels: 40 per line, a
 * viewport per page.
 */
function useWheelForwarding(gutterRef: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const gutter = gutterRef.current;
    if (!gutter) return;
    const onWheel = (event: WheelEvent) => {
      // Ctrl/Cmd + wheel and trackpad pinch (a ctrlKey wheel) keep zooming.
      if (event.ctrlKey || event.metaKey) return;
      const viewport = getTranscriptViewport();
      if (!viewport) return;
      event.preventDefault();
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? WHEEL_LINE_PX
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? viewport.clientHeight
            : 1;
      viewport.scrollBy({ top: event.deltaY * unit, left: event.deltaX * unit });
    };
    gutter.addEventListener("wheel", onWheel, { passive: false });
    return () => gutter.removeEventListener("wheel", onWheel);
  }, [gutterRef]);
}
