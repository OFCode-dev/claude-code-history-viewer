import { useCallback, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bot, ChevronDown, ChevronRight } from "lucide-react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { useAppStore } from "@/store/useAppStore";
import { SubagentList } from "@/components/subagents/SubagentList";
import { getActiveSubagentFrame } from "@/utils/subagentNavigation";
import type { SubagentSession } from "@/types";

const OPEN_STORAGE_KEY = "sessionsPane.subagentsOpen";

function readOpenPreference(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function writeOpenPreference(open: boolean): void {
  try {
    localStorage.setItem(OPEN_STORAGE_KEY, String(open));
  } catch {
    // Storage unavailable (private mode, quota) — the choice lasts this session only.
  }
}

/**
 * "Subagents (n)" docked at the bottom of the sessions pane, below the session
 * list, so its asynchronous arrival never moves the session rows. At top level
 * it lists the selected session's subagents; inside a subagent it keeps
 * listing the parent's subagents with the one on screen highlighted, so
 * siblings stay one click away. Hidden when there is nothing to list.
 */
export function SubagentsSection() {
  const { t } = useTranslation();
  const listId = useId();
  const [isOpen, setIsOpen] = useState(readOpenPreference);

  const subagentSessions = useAppStore((s) => s.subagentSessions);
  const parentSessionStack = useAppStore((s) => s.parentSessionStack);
  const subagentNavStack = useAppStore((s) => s.subagentNavStack);
  const selectedSession = useAppStore((s) => s.selectedSession);
  const navigateToSubagent = useAppStore((s) => s.navigateToSubagent);

  const subagents = useMemo(() => {
    const frame = getActiveSubagentFrame({ subagentNavStack, parentSessionStack, selectedSession });
    if (frame) return frame.siblings;
    return parentSessionStack.length === 0 ? subagentSessions : [];
  }, [subagentNavStack, parentSessionStack, selectedSession, subagentSessions]);

  const toggle = useCallback(() => {
    const next = !isOpen;
    setIsOpen(next);
    writeOpenPreference(next);
  }, [isOpen]);

  const handleSelect = useCallback(
    (subagent: SubagentSession) => {
      void navigateToSubagent(subagent);
    },
    [navigateToSubagent],
  );

  if (subagents.length === 0) return null;

  const ChevronIcon = isOpen ? ChevronDown : ChevronRight;

  return (
    <section
      aria-label={t("subagent.listAria")}
      className="shrink-0 flex flex-col min-h-0 max-h-[40%] border-t border-border/50"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        title={t("subagent.toggleList")}
        className="flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <ChevronIcon className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
        <Bot className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        <span className="text-2xs font-semibold tracking-wide uppercase text-muted-foreground">
          {t("subagent.listTitle")}
        </span>
        <span className="ml-auto text-2xs text-muted-foreground tabular-nums">{subagents.length}</span>
      </button>
      {isOpen && (
        <OverlayScrollbarsComponent
          id={listId}
          className="min-h-0 flex-1"
          options={{ scrollbars: { theme: "os-theme-custom", autoHide: "leave" } }}
        >
          <SubagentList
            subagents={subagents}
            activeFilePath={selectedSession?.file_path ?? null}
            onSelect={handleSelect}
            className="px-2 pb-2"
          />
        </OverlayScrollbarsComponent>
      )}
    </section>
  );
}
