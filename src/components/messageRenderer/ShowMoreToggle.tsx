import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ShowMoreToggleProps {
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
}

/** "Show more" / "Show less" under a message folded to its preview. */
export function ShowMoreToggle({ isExpanded, onToggle, className }: ShowMoreToggleProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      className={cn(
        "flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors",
        "rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <ChevronDown aria-hidden="true" className={cn("w-3 h-3 transition-transform", isExpanded && "rotate-180")} />
      <span>
        {isExpanded
          ? t("messageContentDisplay.showLess", { defaultValue: "Show less" })
          : t("messageContentDisplay.showMore", { defaultValue: "Show more..." })}
      </span>
    </button>
  );
}
