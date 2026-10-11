import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { layout } from "../../renderers";

interface CollapsibleSectionProps {
  icon: ReactNode;
  label: string;
  ariaLabel: string;
  /** Shown after the label while the section is collapsed. */
  summary?: ReactNode;
  /** Right-aligned header content, e.g. stats. */
  right?: ReactNode;
  /** Extra classes for the bordered box, e.g. a bottom margin. */
  className?: string;
  /** The body, rendered only while the section is open. */
  children: ReactNode;
}

/** A bordered box with a toggle header (chevron, icon, label) and a body shown when open. */
export function CollapsibleSection({
  icon,
  label,
  ariaLabel,
  summary,
  right,
  className,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const Chevron = isOpen ? ChevronDown : ChevronRight;

  return (
    <div className={cn("border", layout.rounded, "border-border overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors bg-muted/20"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
      >
        <Chevron className="w-3.5 h-3.5 text-muted-foreground" />
        {icon}
        <span className={cn(layout.smallText, "font-medium text-foreground/80")}>{label}</span>
        {!isOpen && summary}
        {right}
      </button>
      {isOpen && children}
    </div>
  );
}
