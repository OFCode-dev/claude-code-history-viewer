import { Columns } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { TooltipButton } from "@/shared/TooltipButton";

interface SessionBoardButtonProps {
  onClick: () => void;
}

/**
 * Conversation toolbar button that opens the Session Board. It uses the same
 * board icon as the header's view switcher, so it no longer reads as "Back".
 */
export function SessionBoardButton({ onClick }: SessionBoardButtonProps) {
  const { t } = useTranslation();
  const label = t("session.board.title");

  return (
    <TooltipButton
      onClick={onClick}
      className={cn(
        "shrink-0 p-2 rounded-lg transition-all duration-200",
        "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground",
        "border border-border/60 hover:border-border"
      )}
      content={label}
      aria-label={label}
    >
      <Columns className="w-4 h-4" aria-hidden="true" />
    </TooltipButton>
  );
}
