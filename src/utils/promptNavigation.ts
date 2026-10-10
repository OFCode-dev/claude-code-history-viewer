/**
 * Jumping between human prompts of the open conversation — shared by the
 * sticky prompt bar, the previous / next prompt buttons and the Alt+Up /
 * Alt+Down shortcuts.
 */
import i18n from "../i18n";
import { useAppStore } from "../store/useAppStore";
import {
  useViewportAnchorStore,
  type PromptJumpDirection,
  type PromptTrack,
} from "../store/viewportAnchorStore";
import type { TurnAnchor } from "./turns";
import { formatTimeShort } from "./time";
import { isMacOS } from "./platform";
import { getPromptPreview, getUserMessageText } from "./userMessageKind";

/** Marks the sticky prompt bar, whose buttons disappear when their jump lands. */
export const PROMPT_BAR_ATTRIBUTE = "data-sticky-prompt-bar";

/** Just after the viewer's last scroll pass (450 ms): the prompt row is mounted. */
export const FOCUS_AFTER_JUMP_MS = 500;

let pendingFocusTimer: ReturnType<typeof setTimeout> | null = null;

function isInPromptBar(element: Element | null): boolean {
  return element?.closest(`[${PROMPT_BAR_ATTRIBUTE}]`) != null;
}

/**
 * A jump started from the sticky bar lands on its prompt, which hides the bar
 * and takes the focused button with it. Move focus to the prompt card instead
 * of leaving it on <body>, so keyboard and screen-reader users keep their place.
 */
function focusPromptAfterJump(uuid: string): void {
  if (pendingFocusTimer != null) clearTimeout(pendingFocusTimer);
  pendingFocusTimer = setTimeout(() => {
    pendingFocusTimer = null;
    const active = document.activeElement;
    // The reader has moved focus somewhere else meanwhile: leave it there.
    if (active && active !== document.body && !isInPromptBar(active)) return;

    const row = document.querySelector<HTMLElement>(
      `[data-message-uuid="${CSS.escape(uuid)}"]`
    );
    const target = row?.querySelector<HTMLElement>("[data-prompt-card]") ?? row;
    if (!target) return;

    const addedTabIndex = !target.hasAttribute("tabindex");
    if (addedTabIndex) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    // The app hides the default focus outline; draw one while keyboard focus
    // sits on the card, and undo everything when it leaves.
    let isFocusVisible = true;
    try {
      isFocusVisible = target.matches(":focus-visible");
    } catch {
      // Engines without :focus-visible: keep the ring.
    }
    if (isFocusVisible) {
      target.style.outline = "2px solid var(--ring)";
      target.style.outlineOffset = "2px";
    }
    target.addEventListener(
      "blur",
      () => {
        target.style.outline = "";
        target.style.outlineOffset = "";
        if (addedTabIndex) target.removeAttribute("tabindex");
      },
      { once: true }
    );
  }, FOCUS_AFTER_JUMP_MS);
}

/**
 * Scroll the conversation to a prompt. The URL is replaced rather than pushed
 * so stepping through prompts does not flood the browser history. The jump is
 * recorded so a quick Alt+Up/Down afterwards continues from this prompt.
 */
export function jumpToPrompt(uuid: string): void {
  const fromPromptBar = isInPromptBar(document.activeElement);
  useViewportAnchorStore.getState().recordPromptJump(uuid);
  useAppStore.getState().navigateToMessage(uuid, { history: "replace" });
  if (fromPromptBar) focusPromptAfterJump(uuid);
}

/** What one previous / next prompt step did. */
export type PromptStepOutcome =
  /** Scrolled to the prompt before / after the current position. */
  | "moved"
  /** At the first loaded prompt of a partly loaded session: loading earlier messages. */
  | "loadingEarlier"
  /** Nowhere to go in that direction; the end was announced. */
  | "atEnd"
  /** No prompts in the conversation at all: nothing happened. */
  | "unavailable";

/** Announced prompt previews stay short: the status region is spoken in full. */
const ANNOUNCED_PREVIEW_LENGTH = 60;

/** "Prompt 4 of 12, 14:32: Deploy the api" for the prompt a step landed on. */
function describePromptPosition(track: PromptTrack, anchor: TurnAnchor): string {
  const { t } = i18n;
  const isWindowComplete = !useAppStore.getState().pagination.hasMore;
  const position = t(
    isWindowComplete ? "navigator.seek.position" : "navigator.seek.positionLoaded",
    { number: anchor.turnNumber, total: track.anchors.length }
  );
  const message = track.messages[anchor.messageIndex];
  const preview = message
    ? getPromptPreview(getUserMessageText(message), ANNOUNCED_PREVIEW_LENGTH).text
    : "";
  const time = formatPromptTime(anchor.timestamp);
  if (!preview) return time ? `${position}, ${time}` : position;
  return time
    ? t("navigator.seek.announce", { position, time, preview })
    : t("navigator.seek.announceNoTime", { position, preview });
}

function announce(text: string): void {
  useAppStore.getState().announceLayout(text);
}

/**
 * One step to the previous / next prompt, as Alt+Up / Alt+Down and the
 * previous / next prompt buttons take it. Inside a turn, "previous" first
 * returns to the start of the current prompt; rapid steps chain. Each step
 * is announced through the app's status region ("Prompt 4 of 12 …"), and so
 * is reaching either end. At the first loaded prompt of a partly loaded
 * session, "previous" loads the earlier messages instead.
 */
export function stepToAdjacentPrompt(direction: PromptJumpDirection): PromptStepOutcome {
  const anchorStore = useViewportAnchorStore.getState();
  const track = anchorStore.promptTrack;
  if (!track) return "unavailable";

  const uuid = anchorStore.takePromptJump(direction);
  const target = uuid != null ? track.anchors.find((anchor) => anchor.uuid === uuid) : undefined;
  if (uuid != null && target) {
    jumpToPrompt(uuid);
    announce(describePromptPosition(track, target));
    return "moved";
  }

  const app = useAppStore.getState();
  if (direction === "previous" && app.pagination.hasMore) {
    if (!app.pagination.isLoadingMore) void app.loadMoreMessages();
    announce(i18n.t("navigator.seek.loadingEarlier"));
    return "loadingEarlier";
  }
  if (track.anchors.length === 0) return "unavailable";
  announce(i18n.t(direction === "previous" ? "navigator.seek.first" : "navigator.seek.last"));
  return "atEnd";
}

/** Alt+Up / Alt+Down: true when the press was used (moved, loaded or announced an end). */
export function jumpToAdjacentPrompt(direction: PromptJumpDirection): boolean {
  return stepToAdjacentPrompt(direction) !== "unavailable";
}

/** Alt+Up / Alt+Down as `aria-keyshortcuts` spells them and as people read them. */
export function promptStepShortcut(direction: PromptJumpDirection): {
  aria: string;
  label: string;
} {
  const arrow = direction === "previous" ? "↑" : "↓";
  return {
    aria: direction === "previous" ? "Alt+ArrowUp" : "Alt+ArrowDown",
    label: isMacOS() ? `⌥${arrow}` : `Alt+${arrow}`,
  };
}

/** A prompt's time in the app language, or "" for a missing or invalid timestamp. */
export function formatPromptTime(timestamp: string | null | undefined): string {
  if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) return "";
  return formatTimeShort(timestamp);
}
