import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { moveSessionFocus } from "./sessionRowFocus";

function List({ onTreeKey = () => {} }: { onTreeKey?: () => void }) {
  return (
    <div onKeyDown={onTreeKey}>
      <div data-session-list="">
        {["one", "two", "three"].map((name, index) => (
          <button
            key={name}
            type="button"
            data-session-open=""
            tabIndex={index === 1 ? 0 : -1}
            onKeyDown={moveSessionFocus}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

describe("session rows: one tab stop, arrow keys between rows", () => {
  it("moves with ↑/↓, Home and End without leaking the key to an enclosing tree", () => {
    const onTreeKey = vi.fn();
    render(<List onTreeKey={onTreeKey} />);
    const [one, two, three] = ["one", "two", "three"].map((name) => screen.getByRole("button", { name }));
    two!.focus();

    fireEvent.keyDown(two!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(three);
    fireEvent.keyDown(three!, { key: "Home" });
    expect(document.activeElement).toBe(one);
    fireEvent.keyDown(one!, { key: "End" });
    expect(document.activeElement).toBe(three);
    fireEvent.keyDown(three!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(two);
    expect(onTreeKey).not.toHaveBeenCalled();
  });

  it("leaves Alt+Arrow to the prompt-jump shortcut and other keys alone", () => {
    render(<List />);
    const two = screen.getByRole("button", { name: "two" });
    two.focus();
    fireEvent.keyDown(two, { key: "ArrowDown", altKey: true });
    fireEvent.keyDown(two, { key: "x" });
    expect(document.activeElement).toBe(two);
  });
});
