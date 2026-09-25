/**
 * Jumping between human prompts of the open conversation — shared by the
 * sticky prompt bar and the Alt+Up / Alt+Down shortcuts.
 */
import { useAppStore } from "../store/useAppStore";
import {
  useViewportAnchorStore,
  type PromptJumpDirection,
} from "../store/viewportAnchorStore";

/**
 * Scroll the conversation to a prompt. The URL is replaced rather than pushed
 * so stepping through prompts does not flood the browser history.
 */
export function jumpToPrompt(uuid: string): void {
  useAppStore.getState().navigateToMessage(uuid, { history: "replace" });
}

/** Jump to the previous / next prompt; false when there is none. */
export function jumpToAdjacentPrompt(direction: PromptJumpDirection): boolean {
  const uuid = useViewportAnchorStore.getState().takePromptJump(direction);
  if (!uuid) return false;
  jumpToPrompt(uuid);
  return true;
}
