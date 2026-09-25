/**
 * Whether a key event target is somewhere the user types, so global shortcuts
 * must leave the keystroke alone: text inputs, textareas, selects and
 * contenteditable regions.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  // `closest` as well: jsdom does not implement `isContentEditable`.
  if (target.isContentEditable || target.closest('[contenteditable=""], [contenteditable="true"]')) {
    return true;
  }
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  // Buttons and toggles rendered as <input> take no text.
  return !["button", "checkbox", "radio", "range", "reset", "submit", "color", "file", "image"].includes(type);
}
