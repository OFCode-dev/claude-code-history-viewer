/**
 * The conversation tools (search toolbar and filter row) as one collapsible
 * area. Collapsed, they leave a 24 px strip in flow: the status chips on the
 * left, the expand chevron on the right, where the collapse chevron sits in
 * the toolbar row, so the toggle does not move between the two forms.
 */
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { TooltipButton } from "@/shared/TooltipButton";
import { AREA_TOGGLE_ATTR } from "@/layouts/areaToggleAttr";
import {
  CONVERSATION_TOOLS_ID,
  CONVERSATION_TOOLS_PANEL_ID,
  setConversationToolsCollapsed,
} from "./conversationToolsActions";

export function ConversationToolsToggle({ expanded }: { expanded: boolean }) {
  const { t } = useTranslation();
  const label = t(expanded ? "conversationTools.collapse" : "conversationTools.expand");
  const Icon = expanded ? ChevronUp : ChevronDown;
  return (
    <TooltipButton
      {...{ [AREA_TOGGLE_ATTR]: "" }}
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={CONVERSATION_TOOLS_PANEL_ID}
      content={label}
      onClick={() => setConversationToolsCollapsed(expanded)}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        expanded ? "size-7 pointer-coarse:size-11" : "size-6 pointer-coarse:size-11"
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </TooltipButton>
  );
}

interface ConversationToolsProps {
  collapsed: boolean;
  /** Status chips for the collapsed strip (search, Dialogue, hidden types). */
  chips: ReactNode;
  /** The toolbar row (holding the collapse toggle) and the filter row. */
  children: ReactNode;
}

export function ConversationTools({ collapsed, chips, children }: ConversationToolsProps) {
  return (
    <div id={CONVERSATION_TOOLS_ID} className="shrink-0">
      {collapsed && (
        <div className="flex min-h-6 items-center gap-1 border-b border-border/60 bg-card pr-1 pl-1 pointer-coarse:min-h-11">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">{chips}</div>
          <ConversationToolsToggle expanded={false} />
        </div>
      )}
      {/* Kept mounted while collapsed: `aria-controls` stays valid, and
          `hidden` keeps every control in it out of the tab order. */}
      <div id={CONVERSATION_TOOLS_PANEL_ID} hidden={collapsed}>
        {children}
      </div>
    </div>
  );
}
