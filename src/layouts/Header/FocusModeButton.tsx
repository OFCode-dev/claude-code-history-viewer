import { Maximize2, Minimize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { TooltipButton } from "@/shared/TooltipButton";
import { useAppStore } from "@/store/useAppStore";
import { isMacOS } from "@/utils/platform";

const FOCUS_SHORTCUT_LABEL = isMacOS() ? "⌘⇧F" : "Ctrl+Shift+F";

/**
 * Header toggle for focus mode: folds explorer, sessions pane and navigator to
 * their rails, and restores them on the second press (also Mod+Shift+F).
 */
export function FocusModeButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const isFocusMode = useAppStore((s) => s.focusModeSnapshot != null);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const Icon = isFocusMode ? Minimize2 : Maximize2;

  return (
    <TooltipButton
      onClick={toggleFocusMode}
      aria-pressed={isFocusMode}
      aria-label={t("header.focusMode.label")}
      aria-keyshortcuts={isMacOS() ? "Meta+Shift+F" : "Control+Shift+F"}
      className={cn(
        "p-2 rounded-md transition-colors",
        isFocusMode
          ? "bg-accent/15 text-accent hover:bg-accent/25"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
        className
      )}
      content={t("header.focusMode.shortcut", { shortcut: FOCUS_SHORTCUT_LABEL })}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
    </TooltipButton>
  );
}
