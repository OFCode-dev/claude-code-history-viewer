import { useId, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AudioLines,
  Ear,
  Hourglass,
  Pause,
  RefreshCw,
  SkipForward,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipButton } from "@/shared/TooltipButton";
import { useAppStore } from "@/store/useAppStore";
import { useReadAloudSource } from "@/hooks/useReadAloud";
import {
  readAloudHandle,
  type EngineAvailability,
  type ReadAloudSnapshot,
  type ReadAloudSource,
} from "@/services/readAloud";

type UnavailableReason = "noApi" | "noLocalVoice" | "notClaude" | "noSession";

/** Why the mode cannot be turned on right now, or null when it can. */
function unavailableReason(
  availability: EngineAvailability,
  source: ReadAloudSource | null,
): UnavailableReason | null {
  if (availability === "noApi" || availability === "noLocalVoice") return availability;
  if (!source) return "noSession";
  if ((source.provider ?? "claude") !== "claude") return "notClaude";
  return null;
}

function statusKey(snapshot: ReadAloudSnapshot): string {
  if (snapshot.status === "idle") return `readAloud.status.idle.${snapshot.idleReason ?? "noSource"}`;
  return `readAloud.status.${snapshot.status}`;
}

/** A glyph per state (plus color), so state never rests on color alone when the text is hidden. */
const STATUS_ICON: Record<Exclude<ReadAloudSnapshot["status"], "off">, { icon: LucideIcon; className: string }> = {
  starting: { icon: Hourglass, className: "text-muted-foreground" },
  listening: { icon: Ear, className: "text-success" },
  speaking: { icon: AudioLines, className: "text-success" },
  reconnecting: { icon: RefreshCw, className: "text-warning" },
  idle: { icon: Pause, className: "text-muted-foreground" },
};

const iconButtonClass = cn(
  "inline-flex items-center justify-center rounded-md transition-colors pointer-coarse:size-11",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

/**
 * Read-aloud toggle plus, while the mode is on, a status pill.
 *
 * - The toggle is visible on every viewport. When the mode cannot start it
 *   stays focusable with `aria-disabled` and gives the reason (tooltip,
 *   description, and a toast on activation, since a touch tap never opens a
 *   tooltip). While on it is always the way to turn the mode off.
 * - Each state has its own glyph; on narrow screens the status text is
 *   screen-reader only except for "paused", whose reason stays visible.
 * - Enabling speaks a confirmation synchronously inside the click, which is
 *   what lets Chrome start speech at all; `aria-pressed` carries the state.
 * - Nothing here is a live region: spoken text is never mirrored to a screen
 *   reader, and status changes are announced by `useReadAloud` instead.
 */
export function ReadAloudControls() {
  const { t, i18n } = useTranslation();
  const snapshot = useSyncExternalStore(readAloudHandle.subscribe, readAloudHandle.getSnapshot);
  const availability = useAppStore((s) => s.readAloudAvailability);
  const baseRate = useAppStore((s) => s.readAloudBaseRate);
  const thresholdSec = useAppStore((s) => s.readAloudCatchUpThresholdSec);
  const source = useReadAloudSource();
  const reasonId = useId();
  const toggleId = useId();

  const isOn = snapshot.status !== "off";
  const reason = isOn ? null : unavailableReason(availability, source);
  const reasonText = reason ? t(`readAloud.unavailable.${reason}`) : null;

  const handleToggle = () => {
    if (isOn) {
      readAloudHandle.stop();
      return;
    }
    if (reason || !source) {
      if (reasonText) toast.info(reasonText, { id: "read-aloud-unavailable" });
      return;
    }
    // Must stay synchronous inside the gesture (Chrome's user-activation rule).
    readAloudHandle.prime(t("readAloud.cue.enabled"));
    readAloudHandle.start(source);
  };

  const rate = new Intl.NumberFormat(i18n?.language, { maximumFractionDigits: 2 }).format(
    snapshot.effectiveRate,
  );
  const catchUpHint =
    snapshot.effectiveRate > baseRate
      ? t("readAloud.pill.catchingUp", { seconds: snapshot.queuedSeconds, rate })
      : snapshot.queuedSeconds >= thresholdSec
        ? t("readAloud.pill.queued", { seconds: snapshot.queuedSeconds })
        : null;
  const status = t(statusKey(snapshot));
  const Icon = isOn ? Volume2 : VolumeX;
  const statusIcon = snapshot.status === "off" ? null : STATUS_ICON[snapshot.status];
  const StatusIcon = statusIcon?.icon;

  const handleSkip = () => {
    readAloudHandle.skipToLatest();
    // The button disappears once nothing newer is queued; keep keyboard focus in the header.
    if (readAloudHandle.getSnapshot().queuedReplies === 0) document.getElementById(toggleId)?.focus();
  };

  return (
    <div className="flex items-center gap-1 min-w-0">
      <TooltipButton
        id={toggleId}
        onClick={handleToggle}
        aria-pressed={isOn}
        aria-label={t("readAloud.label")}
        aria-disabled={reason ? true : undefined}
        // Set only with a reason: an explicit undefined would override the tooltip id Radix adds.
        {...(reason ? { "aria-describedby": reasonId } : {})}
        className={cn(
          iconButtonClass,
          "p-2",
          isOn
            ? "bg-accent/15 text-accent hover:bg-accent/25"
            : "text-muted-foreground hover:text-foreground hover:bg-muted",
          reason && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground",
        )}
        content={reasonText ?? (isOn ? t("readAloud.tooltip.disable") : t("readAloud.tooltip.enable"))}
      >
        <Icon className="w-4 h-4" aria-hidden="true" />
      </TooltipButton>
      {reasonText && (
        <span id={reasonId} className="sr-only">
          {reasonText}
        </span>
      )}

      {isOn && (
        <div
          role="group"
          aria-label={t("readAloud.pill.label")}
          className="flex items-center gap-1.5 min-w-0 h-7 px-2 rounded-full border border-border/60 bg-muted/60 text-xs text-muted-foreground"
        >
          {/* Static glyph: no animation, so nothing to reduce for reduced motion. */}
          {StatusIcon && (
            <StatusIcon
              aria-hidden="true"
              data-status-icon={snapshot.status}
              className={cn("size-3 shrink-0", statusIcon.className)}
            />
          )}
          {snapshot.sourceTitle && (
            <>
              <span
                className="hidden md:block max-w-40 truncate text-foreground"
                title={t("readAloud.pill.source", { title: snapshot.sourceTitle })}
              >
                {snapshot.sourceTitle}
              </span>
              <span className="sr-only md:hidden">{snapshot.sourceTitle}</span>
            </>
          )}
          {snapshot.status === "idle" ? (
            <span className="min-w-0 max-w-44 truncate sm:max-w-none">{status}</span>
          ) : (
            <>
              <span className="hidden sm:block whitespace-nowrap">{status}</span>
              <span className="sr-only sm:hidden">{status}</span>
            </>
          )}
          {catchUpHint && (
            <>
              <span className="hidden lg:block whitespace-nowrap">{catchUpHint}</span>
              <span className="sr-only lg:hidden">{catchUpHint}</span>
              {snapshot.effectiveRate > baseRate && (
                <span aria-hidden="true" className="lg:hidden whitespace-nowrap tabular-nums">
                  {t("readAloud.settings.rateValue", { rate })}
                </span>
              )}
            </>
          )}
          {snapshot.queuedReplies > 0 && (
            <TooltipButton
              onClick={handleSkip}
              aria-label={t("readAloud.skipToLatest")}
              // 24 px inside the 28 px pill; on touch the hit area grows to 44 px without growing the pill.
              className={cn(
                iconButtonClass,
                "relative size-6 -mr-1 rounded-full hover:text-foreground hover:bg-muted",
                "pointer-coarse:size-6 pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5",
              )}
              content={t("readAloud.skipToLatest")}
            >
              <SkipForward className="w-3.5 h-3.5" aria-hidden="true" />
            </TooltipButton>
          )}
        </div>
      )}
    </div>
  );
}
