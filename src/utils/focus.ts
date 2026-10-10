/**
 * Focus helpers shared by panels that unmount, fold or hide what holds focus.
 */

const MAIN_CONTENT_ID = "main-content";

/** Whether keyboard focus was dropped (its element unmounted or disabled). */
export function isFocusLost(): boolean {
  const active = document.activeElement;
  return (
    active == null ||
    active === document.body ||
    !active.isConnected ||
    (active instanceof HTMLButtonElement && active.disabled)
  );
}

/** Focus the main content region (the skip-link target) without scrolling. */
export function focusMainContent(): boolean {
  const main = document.getElementById(MAIN_CONTENT_ID);
  if (!main) return false;
  main.focus({ preventScroll: true });
  return document.activeElement === main;
}

/** Put lost focus on the main content region. */
export function focusMainContentIfLost(): void {
  if (!isFocusLost()) return;
  focusMainContent();
}

/** Whether `element` sits in an `inert` subtree (hidden from focus and AT). */
export function isInInertSubtree(element: Element): boolean {
  return element.closest("[inert]") != null;
}

/**
 * Whether focus can be put back on `element`: still in the document, not
 * disabled, not hidden by `inert`, and focusable by script.
 */
export function canRestoreFocusTo(element: Element | null | undefined): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  if (element === document.body || isInInertSubtree(element)) return false;
  if ((element as HTMLButtonElement).disabled) return false;
  return element.tabIndex >= 0 || element.hasAttribute("tabindex") || element.isContentEditable;
}

/**
 * Moves focus out of `container` before it is hidden (made `inert` or
 * unmounted), but only when focus is actually inside it: focus somewhere
 * else is never taken away. Falls back to the main content region when
 * `target` cannot take focus. Returns whether focus was moved.
 */
export function moveFocusOutOf(container: Element | null, target: HTMLElement | null): boolean {
  const active = document.activeElement;
  if (!container || !(active instanceof HTMLElement) || !container.contains(active)) {
    return false;
  }
  if (target && !container.contains(target)) {
    target.focus({ preventScroll: true });
    if (document.activeElement === target) return true;
  }
  if (focusMainContent() && !container.contains(document.activeElement)) return true;
  active.blur();
  return true;
}
