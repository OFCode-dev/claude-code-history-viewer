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
