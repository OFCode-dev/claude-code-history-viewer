import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterToolbar } from "@/components/MessageViewer/components/FilterToolbar";

const { toggleContentTypeMock, toggleDialogueMock, storeState, useAppStoreMock } = vi.hoisted(() => {
  const toggleContentType = vi.fn();
  const toggleDialogue = vi.fn();
  const state = {
    messageFilter: {
      roles: { user: true, assistant: true },
      contentTypes: {
        text: true,
        thinking: true,
        toolCalls: true,
        commands: true,
        parallelTasks: true,
      },
      dialogue: false,
    },
    toggleRole: vi.fn(),
    toggleContentType,
    toggleDialogue,
    resetMessageFilter: vi.fn(),
    isMessageFilterActive: () => false,
  };

  return {
    toggleContentTypeMock: toggleContentType,
    toggleDialogueMock: toggleDialogue,
    storeState: state,
    useAppStoreMock: () => state,
  };
});

vi.mock("@/store/useAppStore", () => ({
  useAppStore: useAppStoreMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("FilterToolbar", () => {
  it("only shows the Parallel Tasks filter for sessions containing that category", () => {
    const { rerender } = render(
      <FilterToolbar totalCount={2} filteredCount={2} hasParallelTasks={false} />,
    );

    expect(screen.queryByRole("button", {
      name: "filter.content.parallelTasks",
    })).not.toBeInTheDocument();

    rerender(
      <FilterToolbar totalCount={2} filteredCount={2} hasParallelTasks />,
    );
    const toggle = screen.getByRole("button", {
      name: "filter.content.parallelTasks",
    });
    fireEvent.click(toggle);
    expect(toggleContentTypeMock).toHaveBeenCalledWith("parallelTasks");
  });

  it("offers a Dialogue toggle with a tooltip", () => {
    storeState.messageFilter.dialogue = false;
    render(<FilterToolbar totalCount={2} filteredCount={2} hasParallelTasks={false} />);

    const toggle = screen.getByRole("button", { name: "dialogue.toggle" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveAttribute("title", "dialogue.tooltip");
    expect(screen.getByRole("button", { name: "filter.content.toolCalls" })).toBeEnabled();

    fireEvent.click(toggle);
    expect(toggleDialogueMock).toHaveBeenCalledTimes(1);
  });

  it("disables the individual toggles while the dialogue view is on", () => {
    storeState.messageFilter.dialogue = true;
    try {
      render(<FilterToolbar totalCount={2} filteredCount={1} hasParallelTasks />);

      expect(screen.getByRole("button", { name: "dialogue.toggle" })).toHaveAttribute("aria-pressed", "true");
      for (const name of [
        "filter.role.user",
        "filter.role.assistant",
        "filter.content.text",
        "filter.content.thinking",
        "filter.content.toolCalls",
        "filter.content.commands",
        "filter.content.parallelTasks",
      ]) {
        expect(screen.getByRole("button", { name })).toBeDisabled();
      }
    } finally {
      storeState.messageFilter.dialogue = false;
    }
  });

  it("draws a focus ring on its toggles for keyboard users", () => {
    render(<FilterToolbar totalCount={2} filteredCount={2} hasParallelTasks />);
    for (const button of screen.getAllByRole("button", { pressed: true })) {
      expect(button).toHaveClass("focus-visible:ring-2");
    }
    for (const button of screen.getAllByRole("button", { pressed: false })) {
      expect(button).toHaveClass("focus-visible:ring-2");
    }
  });
});
