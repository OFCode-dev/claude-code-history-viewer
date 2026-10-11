/**
 * Esc closes one layer per press: every custom layer that acts on Esc claims
 * the press with preventDefault and leaves a claimed press alone.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectContextMenu } from "@/components/ProjectContextMenu";
import { ExplorerSearch } from "@/components/ProjectTree/components/ExplorerSearch";
import type { ExplorerFilters } from "@/components/ProjectTree/hooks/useExplorerFilters";
import type { ClaudeProject } from "@/types";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ProjectTree/components/ExplorerFilterMenu", () => ({
  ExplorerFilterMenu: () => null,
}));

const project = {
  name: "demo",
  path: "/tmp/demo",
  actual_path: "/tmp/demo",
  provider: "claude",
} as unknown as ClaudeProject;

const escape = (target: EventTarget, prevented = false) => {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  if (prevented) event.preventDefault();
  target.dispatchEvent(event);
  return event;
};

describe("custom layers claim Esc", () => {
  function Menu({ onClose }: { onClose: () => void }) {
    return (
      <ProjectContextMenu
        project={project}
        position={{ x: 10, y: 10 }}
        onClose={onClose}
        onHide={vi.fn()}
        onUnhide={vi.fn()}
        isHidden={false}
      />
    );
  }

  it("the project context menu closes and claims the press", () => {
    const onClose = vi.fn();
    render(<Menu onClose={onClose} />);
    const event = escape(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("answers before selection mode even when it opened later", () => {
    // Selection mode registered first, in the bubble phase.
    const exitSelection = vi.fn();
    const selection = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      exitSelection();
    };
    document.addEventListener("keydown", selection);
    const onClose = vi.fn();
    render(<Menu onClose={onClose} />);
    escape(document.body);
    document.removeEventListener("keydown", selection);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(exitSelection).not.toHaveBeenCalled();
  });

  it("is a named menu for assistive technology", () => {
    render(<Menu onClose={vi.fn()} />);
    const menu = screen.getByRole("menu", { name: "demo" });
    expect(menu.querySelectorAll('[role="menuitem"]').length).toBeGreaterThan(0);
  });

  it("leaves a press another layer already claimed", () => {
    const onClose = vi.fn();
    render(<Menu onClose={onClose} />);
    escape(document.body, true);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("explorer filter field", () => {
  const filters = {} as unknown as ExplorerFilters;

  it("clears on Esc, claims the press and leaves the field", () => {
    const onChange = vi.fn();
    render(<ExplorerSearch value="abc" onChange={onChange} filters={filters} />);
    const input = screen.getByRole("textbox");
    input.focus();
    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(false);
    expect(onChange).toHaveBeenCalledWith("");
    expect(document.activeElement).not.toBe(input);
  });
});
