import { focusMainContent, isFocusLost } from "@/utils/focus";
import { SUBAGENT_PATH_ATTR } from "./subagentDom";

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
  if (row) row.focus({ preventScroll: true });
  else focusMainContent();
}
