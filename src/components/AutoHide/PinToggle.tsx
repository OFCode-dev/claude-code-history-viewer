import { Pin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { TooltipButton } from "@/shared/TooltipButton";
import { useAppStore } from "@/store/useAppStore";
import type { PanelGroup } from "@/store/slices/layoutSlice";
import { useGroupPin } from "./useLayoutSwitches";

const PIN_NAME_KEYS: Record<PanelGroup, string> = {
  left: "readingMode.pin.left",
  right: "readingMode.pin.right",
  top: "readingMode.pin.top",
};

/**
 * Reading mode only: keeps a group visible in flow (pressed) or lets it hide
 * at its edge. The name is stable per group; the pressed state carries the
 * value, as a toggle button should.
 */
export function PinToggle({ group, className }: { group: PanelGroup; className?: string }) {
  const { t } = useTranslation();
  const pinned = useAppStore((s) => s.readingProfile[group] === "pinned");
  const setPinned = useGroupPin();
  const name = t(PIN_NAME_KEYS[group]);

  return (
    <TooltipButton
      aria-pressed={pinned}
      aria-label={name}
      data-pin-toggle={group}
      onClick={() => setPinned(group, !pinned)}
      className={cn(
        "autohide-pin inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        pinned
          ? "bg-accent/15 text-accent hover:bg-accent/25"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        className
      )}
      content={t("readingMode.pin.tooltip", { name })}
    >
      <Pin className={cn("size-3.5", pinned && "fill-current")} aria-hidden="true" />
    </TooltipButton>
  );
}
