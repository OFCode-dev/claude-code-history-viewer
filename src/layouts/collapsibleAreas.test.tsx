import { afterEach, describe, expect, it } from "vitest";
import { AREA_TOGGLE_ATTR } from "./areaToggleAttr";
import { changeLayout } from "./collapsibleAreas";

function mount(html: string) {
  document.body.innerHTML = `<main id="main-content" tabindex="-1"></main>${html}`;
}

/** Swaps an area to its other form, as React does when its flag flips. */
function swapArea(id: string, html: string) {
  const area = document.getElementById(id)!;
  area.innerHTML = html;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("changeLayout", () => {
  it("moves focus from a folded area's control to its toggle on the bar", () => {
    mount(`<aside id="project-explorer"><div role="treeitem" tabindex="0">row</div></aside>`);
    (document.querySelector('[role="treeitem"]') as HTMLElement).focus();

    changeLayout(() =>
      swapArea("project-explorer", `<button type="button" ${AREA_TOGGLE_ATTR}>Expand</button>`)
    );

    expect(document.activeElement).toHaveTextContent("Expand");
  });

  it("moves focus out of tools that are now hidden", () => {
    mount(`<div id="conversation-tools">
      <button type="button" ${AREA_TOGGLE_ATTR} hidden>Show tools</button>
      <div id="panel"><input aria-label="search" /></div>
    </div>`);
    (document.querySelector("input") as HTMLElement).focus();

    changeLayout(() => {
      document.getElementById("panel")!.hidden = true;
      document.querySelector("button")!.hidden = false;
    });

    expect(document.activeElement).toHaveTextContent("Show tools");
  });

  it("leaves focus that is outside every area alone", () => {
    mount(`<button type="button" id="header-button">Reading mode</button>
      <aside id="message-navigator"><button type="button">row</button></aside>`);
    const button = document.getElementById("header-button")!;
    button.focus();

    changeLayout(() => swapArea("message-navigator", ""));

    expect(document.activeElement).toBe(button);
  });

  it("falls back to the main content when the new form has no toggle", () => {
    mount(`<aside id="sessions-pane"><button type="button">row</button></aside>`);
    (document.querySelector("#sessions-pane button") as HTMLElement).focus();

    changeLayout(() => swapArea("sessions-pane", ""));

    expect(document.activeElement?.id).toBe("main-content");
  });
});
