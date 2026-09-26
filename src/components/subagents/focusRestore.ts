import { SUBAGENT_PATH_ATTR } from "./subagentDom";

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

/** Put lost focus on the main content region (the skip-link target). */
export function focusMainContentIfLost(): void {
  if (!isFocusLost()) return;
  document.getElementById("main-content")?.focus({ preventScroll: true });
}

/**
 * After going back up from a subagent, the control that was pressed is often
 * gone and focus would drop to <body>. Land on the row of the subagent just
 * left when a list shows it, otherwise on the main content region.
 */
export function restoreFocusAfterBack(fromFilePath: string | undefined): void {
  if (!isFocusLost()) return;
  const row =
    fromFilePath != null
      ? document.querySelector<HTMLElement>(
          `[${SUBAGENT_PATH_ATTR}="${CSS.escape(fromFilePath)}"]`,
        )
      : null;
  (row ?? document.getElementById("main-content"))?.focus({ preventScroll: true });
}
