import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { TooltipButton } from "@/shared/TooltipButton";
import { useAppStore } from "@/store/useAppStore";
import { areAllCollapsed } from "@/store/slices/layoutSlice";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { modShortcut } from "@/utils/platform";

/**
 * Reading mode as a command (also Mod+Shift+F): folds explorer, sessions,
 * prompts and conversation tools to their thin bars, or opens all four when
 * all are folded. Pressed while all four are folded. Its tooltip is where
 * the panel shortcuts stay discoverable.
 */
export function ReadingModeButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const isAllCollapsed = useAppStore(areAllCollapsed);
  const collapseOrExpandAll = useCollapseAll();
  const shortcut = modShortcut("F", true);

  return (
    <TooltipButton
      onClick={collapseOrExpandAll}
      aria-pressed={isAllCollapsed}
      aria-label={t("header.readingMode.label")}
      aria-keyshortcuts={shortcut.aria}
      className={cn(
        "p-2 rounded-md transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isAllCollapsed
          ? "bg-accent/15 text-accent hover:bg-accent/25"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
        className
      )}
      content={t("header.readingMode.tooltip", {
        toggle: shortcut.label,
        left: modShortcut("E", true).label,
        right: modShortcut("M", true).label,
        search: modShortcut("F", false).label,
      })}
    >
      <BookOpen className="w-4 h-4" aria-hidden="true" />
    </TooltipButton>
  );
}
