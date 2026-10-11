import { isMacOS } from "../../../utils/platform";

/** Keys shown wherever the prompt-jump shortcut is described. */
export function getPromptJumpKeysLabel(): string {
  return isMacOS() ? "⌥↑ / ⌥↓" : "Alt+↑ / Alt+↓";
}
