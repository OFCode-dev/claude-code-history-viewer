// src/components/ProjectTree/components/ExplorerIconButton.tsx
import React from "react";
import { cn } from "@/lib/utils";

interface ExplorerIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name and tooltip: every explorer icon button has one. */
  label: string;
}

/** 24px icon-only button used in the explorer's header, filter bar and rail. */
export const ExplorerIconButton = React.forwardRef<HTMLButtonElement, ExplorerIconButtonProps>(
  ({ label, className, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex size-6 shrink-0 items-center justify-center rounded-md",
        "text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-40",
        "data-[state=open]:bg-muted/70 data-[state=open]:text-foreground",
        "[&_svg]:size-3.5 [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);
ExplorerIconButton.displayName = "ExplorerIconButton";
