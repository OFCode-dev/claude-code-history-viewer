import type { PanelGroup } from "@/store/slices/layoutSlice";
import { isMacOS } from "@/utils/platform";

/** A shortcut as `aria-keyshortcuts` spells it and as people read it. */
export interface ShortcutLabel {
  aria: string;
  label: string;
}

/** Mod (Cmd on macOS, Ctrl elsewhere), optionally Shift, plus a letter. */
export function modShortcut(letter: string, shift: boolean): ShortcutLabel {
  const mac = isMacOS();
  const aria = `${mac ? "Meta" : "Control"}${shift ? "+Shift" : ""}+${letter}`;
  const label = mac ? `⌘${shift ? "⇧" : ""}${letter}` : `Ctrl+${shift ? "Shift+" : ""}${letter}`;
  return { aria, label };
}

/** Reading mode on and off. */
export const readingModeShortcut = (): ShortcutLabel => modShortcut("F", true);

/** The shortcut that opens each group's overlay (the top one focuses search). */
export function panelShortcut(group: PanelGroup): ShortcutLabel {
  switch (group) {
    case "left":
      return modShortcut("E", true);
    case "right":
      return modShortcut("M", true);
    case "top":
      return modShortcut("F", false);
  }
}
