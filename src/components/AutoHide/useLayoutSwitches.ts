/**
 * The deliberate layout switches of reading mode: turning it on or off, and
 * pinning or unpinning a group. Each one keeps the reader's place (one
 * anchor capture and restore around the reflow), keeps focus out of what
 * becomes hidden, and announces the result.
 */
import { useCallback } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { TFunction } from "i18next";
import { usePlatform } from "@/contexts/platform";
import { useAppStore } from "@/store/useAppStore";
import {
  hasSeenReadingHint,
  markReadingHintSeen,
  PANEL_GROUPS,
  type PanelGroup,
} from "@/store/slices/layoutSlice";
import {
  captureAnchor,
  restoreAnchor,
} from "@/components/MessageViewer/hooks/useReadingPosition";
import { focusMainContent } from "@/utils/focus";
import { getHandle, panelDomIds } from "./panelActions";
import { panelShortcut, readingModeShortcut } from "./shortcuts";

const GROUP_NAME_KEYS: Record<PanelGroup, string> = {
  left: "readingMode.group.left",
  right: "readingMode.group.right",
  top: "readingMode.group.top",
};

export function groupNameKey(group: PanelGroup): string {
  return GROUP_NAME_KEYS[group];
}

function focusIsInside(selector: string): boolean {
  const active = document.activeElement;
  return active instanceof Element && active.closest(selector) != null;
}

/**
 * Before the switch: focus inside a panel that is about to be hidden (or,
 * on the way out, folded to a rail) goes to the main content region.
 */
function handOffFocus(entering: boolean): void {
  const state = useAppStore.getState();
  const losing = entering
    ? PANEL_GROUPS.filter((group) => state.readingProfile[group] === "autohide").some((group) =>
        focusIsInside(`#${panelDomIds.region(group)}`)
      )
    : (state.isExplorerCollapsed && focusIsInside("#project-explorer")) ||
      (state.isSessionsPaneCollapsed && focusIsInside("#sessions-pane")) ||
      (!state.isNavigatorOpen && focusIsInside("#message-navigator"));
  if (losing) focusMainContent();
}

/** One Sonner toast on the very first entry; it replaces the announcement. */
function showFirstUseHint(t: TFunction): boolean {
  if (hasSeenReadingHint()) return false;
  markReadingHintSeen();
  toast(
    t("readingMode.hint.text", {
      left: panelShortcut("left").label,
      right: panelShortcut("right").label,
      search: panelShortcut("top").label,
      toggle: readingModeShortcut().label,
    }),
    {
      duration: Infinity,
      closeButton: true,
      action: {
        label: t("readingMode.hint.turnOffHover"),
        onClick: () => useAppStore.getState().setHoverReveal("off"),
      },
    }
  );
  return true;
}

/**
 * The one way in and out of reading mode, used by the header button and by
 * Mod+Shift+F. Below 768 px it does nothing: the drawers stay as they are.
 */
export function useReadingModeToggle(): () => void {
  const { t } = useTranslation();
  const { isMobile } = usePlatform();

  return useCallback(() => {
    if (isMobile) return;
    const entering = !useAppStore.getState().isReadingMode;
    const anchor = captureAnchor();
    handOffFocus(entering);
    useAppStore.getState().toggleReadingMode();
    restoreAnchor(anchor);
    if (entering && showFirstUseHint(t)) return;
    useAppStore
      .getState()
      .announceLayout(t(entering ? "readingMode.announce.on" : "readingMode.announce.off"));
  }, [isMobile, t]);
}

/**
 * Pins a group in reading mode or lets it hide at its edge. Pinning keeps
 * focus on the toggle, which stays mounted; unpinning moves it to the
 * group's handle, which only exists once the switch has rendered.
 */
export function useGroupPin(): (group: PanelGroup, pinned: boolean) => void {
  const { t } = useTranslation();

  return useCallback(
    (group, pinned) => {
      const store = useAppStore.getState();
      const anchor = captureAnchor();
      if (pinned) {
        store.setReadingPin(group, true);
      } else {
        const hadFocus = focusIsInside(`#${panelDomIds.region(group)}`);
        flushSync(() => store.setReadingPin(group, false));
        if (hadFocus) getHandle(group)?.focus({ preventScroll: true });
      }
      restoreAnchor(anchor);
      store.announceLayout(
        t(pinned ? "readingMode.pin.announcePinned" : "readingMode.pin.announceHidden", {
          group: t(groupNameKey(group)),
        })
      );
    },
    [t]
  );
}
