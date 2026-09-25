import { useCallback, useState } from "react";
import { useIsLgUp } from "@/hooks/useMediaQuery";

const STORAGE_KEY = "messageViewer.subagentPanelOpen";

function readStoredOpen(): boolean | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
  } catch {
    return null;
  }
}

function writeStoredOpen(open: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(open));
  } catch {
    // Storage unavailable (private mode, quota) — the choice lasts this session only.
  }
}

/**
 * Open state of the in-conversation subagent panel. The user's last choice is
 * remembered; until they make one the panel starts collapsed from `lg` up,
 * where the sessions pane already lists the same subagents, and open below
 * it, where the panel is the only list.
 */
export function useSubagentPanelOpen(): [isOpen: boolean, toggle: () => void] {
  const sessionsPaneListsSubagents = useIsLgUp();
  const [stored, setStored] = useState<boolean | null>(readStoredOpen);
  const isOpen = stored ?? !sessionsPaneListsSubagents;

  const toggle = useCallback(() => {
    const next = !isOpen;
    setStored(next);
    writeStoredOpen(next);
  }, [isOpen]);

  return [isOpen, toggle];
}
