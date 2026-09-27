// src/components/ProjectTree/components/GlobalStatsRow.tsx
import React from "react";
import { BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface GlobalStatsRowProps {
  isActive: boolean;
  onClick: () => void;
}

/** One 28px row above the filter: a view toggle, not part of the tree. */
export const GlobalStatsRow: React.FC<GlobalStatsRowProps> = ({ isActive, onClick }) => {
  const { t } = useTranslation();
  return (
    <div className="shrink-0 px-1 pb-1.5">
      <button
        type="button"
        aria-pressed={isActive}
        onClick={onClick}
        className={cn(
          "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-px12-5 outline-none transition-colors",
          "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
          isActive
            ? "bg-accent/10 font-medium text-foreground shadow-[inset_2px_0_0_var(--accent)]"
            : "text-sidebar-foreground/85 hover:bg-muted/50"
        )}
      >
        <BarChart3
          className={cn("size-3.5 shrink-0", isActive ? "text-accent" : "text-muted-foreground")}
          aria-hidden="true"
        />
        <span className="min-w-0 truncate">{t("project.globalStats")}</span>
      </button>
    </div>
  );
};
