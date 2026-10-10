import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { TooltipButton } from "@/shared/TooltipButton";
import { useAppStore } from "@/store/useAppStore";
import { panelShortcut, readingModeShortcut } from "@/components/AutoHide/shortcuts";
import { useReadingModeToggle } from "@/components/AutoHide/useLayoutSwitches";

/**
 * Header toggle for reading mode (also Mod+Shift+F): the panels hide at the
 * window edges and come back on demand. Its tooltip is where the panel
 * shortcuts stay discoverable after the first-use hint.
 */
export function ReadingModeButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const isReadingMode = useAppStore((s) => s.isReadingMode);
  const toggleReadingMode = useReadingModeToggle();
  const shortcut = readingModeShortcut();

  return (
    <TooltipButton
      onClick={toggleReadingMode}
      aria-pressed={isReadingMode}
      aria-label={t("header.readingMode.label")}
      aria-keyshortcuts={shortcut.aria}
      className={cn(
        "p-2 rounded-md transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isReadingMode
          ? "bg-accent/15 text-accent hover:bg-accent/25"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
        className
      )}
      content={t("header.readingMode.tooltip", {
        toggle: shortcut.label,
        left: panelShortcut("left").label,
        right: panelShortcut("right").label,
        search: panelShortcut("top").label,
      })}
    >
      <BookOpen className="w-4 h-4" aria-hidden="true" />
    </TooltipButton>
  );
}
