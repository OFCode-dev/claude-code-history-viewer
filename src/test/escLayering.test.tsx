/**
 * Esc closes one layer per press (spec §4.3): every custom layer that acts
 * on Esc claims the press with preventDefault and leaves a claimed press
 * alone, and fields that hold a value clear first, letting an empty field's
 * press reach the reading-mode overlay behind it.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectContextMenu } from "@/components/ProjectContextMenu";
import { ExplorerSearch } from "@/components/ProjectTree/components/ExplorerSearch";
import type { ExplorerFilters } from "@/components/ProjectTree/hooks/useExplorerFilters";
import { AutoHideOwnerProvider } from "@/components/AutoHide/AutoHideHoldContext";
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

  it("leaves a press another layer already claimed", () => {
    const onClose = vi.fn();
    render(<Menu onClose={onClose} />);
    escape(document.body, true);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("explorer filter field", () => {
  const filters = {} as unknown as ExplorerFilters;

  function Field({ value, onChange, inOverlay }: { value: string; onChange: (v: string) => void; inOverlay: boolean }) {
    return (
      <AutoHideOwnerProvider group={inOverlay ? "left" : null}>
        <ExplorerSearch value={value} onChange={onChange} filters={filters} />
      </AutoHideOwnerProvider>
    );
  }

  it("in a reading-mode overlay: clears and keeps focus, then lets an empty press through", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Field value="abc" onChange={onChange} inOverlay />);
    const input = screen.getByRole("textbox");
    input.focus();

    const first = fireEvent.keyDown(input, { key: "Escape" });
    expect(onChange).toHaveBeenCalledWith("");
    expect(first).toBe(false); // default prevented
    expect(document.activeElement).toBe(input);

    rerender(<Field value="" onChange={onChange} inOverlay />);
    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(true);
  });

  it("in the normal layout: clears and leaves the field, as before", () => {
    const onChange = vi.fn();
    render(<Field value="abc" onChange={onChange} inOverlay={false} />);
    const input = screen.getByRole("textbox");
    input.focus();
    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(false);
    expect(onChange).toHaveBeenCalledWith("");
    expect(document.activeElement).not.toBe(input);
  });
});
