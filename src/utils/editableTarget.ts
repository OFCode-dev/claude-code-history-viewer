/**
 * Whether a keyboard event target is a place where the user types — global
 * shortcuts that reuse plain keys (arrows, letters) must leave these alone.
 */
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "radio",
  "range",
  "reset",
  "submit",
  "color",
  "file",
  "image",
]);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  // `closest` as well: jsdom does not implement `isContentEditable`.
  if (
    target.isContentEditable ||
    target.closest('[contenteditable=""], [contenteditable="true"]')
  ) {
    return true;
  }
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  return !NON_TEXT_INPUT_TYPES.has((target as HTMLInputElement).type);
}

/**
 * Widgets that use the arrow keys themselves (or hold focus above the page,
 * like a dialog). A global Alt+Arrow shortcut must not act behind them.
 */
const ARROW_KEY_WIDGET_SELECTOR = [
  "[role=dialog]",
  "[role=alertdialog]",
  "[aria-modal=true]",
  "[role=menu]",
  "[role=menubar]",
  "[role=listbox]",
  "[role=combobox]",
  "[role=tree]",
  "[role=treegrid]",
  "[role=grid]",
  "[role=tablist]",
  "[role=radiogroup]",
  "[role=slider]",
].join(",");

/** Opt-out marker for a widget that passes Alt+Arrow on to the global shortcut. */
export const PROMPT_JUMP_PASSTHROUGH_ATTRIBUTE = "data-prompt-jump-passthrough";

/**
 * Whether the target sits in a widget that handles arrow keys itself. The
 * nearest such widget decides; one marked with
 * `PROMPT_JUMP_PASSTHROUGH_ATTRIBUTE` lets the shortcut through.
 */
export function isInArrowKeyWidget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const widget = target.closest(ARROW_KEY_WIDGET_SELECTOR);
  return widget !== null && !widget.hasAttribute(PROMPT_JUMP_PASSTHROUGH_ATTRIBUTE);
}
