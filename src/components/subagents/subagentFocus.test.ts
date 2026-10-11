import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubagentSession } from "@/types";
import { isFocusLost } from "@/utils/focus";
import {
  openSubagentKeepingFocus,
  restoreFocusAfterEnteringSubagent,
} from "./subagentFocus";

const sub = { agent_id: "a1", file_path: "/p/s/subagents/agent-a1.jsonl" } as SubagentSession;

function button(attrs: Record<string, string> = {}): HTMLButtonElement {
  const el = document.createElement("button");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

describe("subagentFocus", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("detects focus that fell to <body> or sits on a disabled button", () => {
    const el = button();
    el.focus();
    expect(isFocusLost()).toBe(false);
    el.disabled = true;
    expect(isFocusLost()).toBe(true);
    el.remove();
    expect(isFocusLost()).toBe(true);
  });

  it("lands on the Back button after the opening control unmounts", async () => {
    const opener = button();
    opener.focus();
    const back = button({ "data-subagent-back": "" });
    const navigate = vi.fn(async () => {
      opener.remove();
    });

    await openSubagentKeepingFocus(navigate, sub);

    expect(navigate).toHaveBeenCalledWith(sub);
    expect(back).toHaveFocus();
  });

  it("falls back to the main content region when no context bar is shown", () => {
    const main = document.createElement("main");
    main.id = "main-content";
    main.tabIndex = -1;
    document.body.appendChild(main);

    restoreFocusAfterEnteringSubagent();

    expect(main).toHaveFocus();
  });

  it("leaves focus alone when it was not lost", async () => {
    const opener = button();
    opener.focus();
    button({ "data-subagent-back": "" });

    await openSubagentKeepingFocus(vi.fn(async () => {}), sub);

    expect(opener).toHaveFocus();
  });
});
