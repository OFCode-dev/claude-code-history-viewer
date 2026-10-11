import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "@/store/useAppStore";
import { ConversationTools, ConversationToolsToggle } from "./ConversationTools";
import {
  CONVERSATION_TOOLS_PANEL_ID,
  openConversationTool,
  TOOL_FOCUS_ATTR,
} from "./conversationToolsActions";
import { TopStripChips } from "./TopStripChips";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

/** The tools as MessageViewer wires them, with one search and one dialogue control. */
function Tools({ query = "needle", isDialogue = true }: { query?: string; isDialogue?: boolean }) {
  const collapsed = useAppStore((s) => s.isConversationToolsCollapsed);
  return (
    <TooltipProvider>
      <ConversationTools
        collapsed={collapsed}
        chips={
          <TopStripChips
            query={query}
            matchPosition={1}
            matchCount={3}
            onPrevMatch={vi.fn()}
            onNextMatch={vi.fn()}
            isDialogue={isDialogue}
            hiddenTypeCount={0}
            onActivate={openConversationTool}
          />
        }
      >
        <div role="search">
          <input aria-label="search" {...{ [TOOL_FOCUS_ATTR]: "search" }} defaultValue={query} />
          <ConversationToolsToggle expanded />
        </div>
        <button type="button" {...{ [TOOL_FOCUS_ATTR]: "dialogue" }}>
          Dialogue
        </button>
      </ConversationTools>
    </TooltipProvider>
  );
}

const expandButton = () => screen.getByRole("button", { name: "conversationTools.expand" });
const collapseButton = () => screen.getByRole("button", { name: "conversationTools.collapse" });

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ isConversationToolsCollapsed: true });
});

afterEach(() => {
  useAppStore.setState({ isConversationToolsCollapsed: false });
});

describe("ConversationTools collapsed", () => {
  it("shows the strip: chips and a named expand button that controls the hidden tools", () => {
    render(<Tools />);

    const expand = expandButton();
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(expand).toHaveAttribute("aria-controls", CONVERSATION_TOOLS_PANEL_ID);
    expect(document.getElementById(CONVERSATION_TOOLS_PANEL_ID)).not.toBeVisible();
    expect(screen.queryByRole("textbox", { name: "search" })).toBeNull();
    expect(screen.getByRole("button", { name: "conversationTools.chips.search" })).toBeVisible();
    expect(screen.getByRole("button", { name: "conversationTools.chips.dialogue" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "conversationTools.collapse" })).toBeNull();
  });

  it("expands in flow from the button; focus moves to the collapse toggle that replaced it", () => {
    render(<Tools />);
    const expand = expandButton();
    expand.focus();

    fireEvent.click(expand);

    expect(useAppStore.getState().isConversationToolsCollapsed).toBe(false);
    expect(document.getElementById(CONVERSATION_TOOLS_PANEL_ID)).toBeVisible();
    expect(collapseButton()).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(collapseButton());
    expect(screen.queryByRole("button", { name: "conversationTools.expand" })).toBeNull();
  });

  it("collapses from the toolbar toggle, and focus lands on the strip's expand button", () => {
    useAppStore.setState({ isConversationToolsCollapsed: false });
    render(<Tools />);
    collapseButton().focus();

    fireEvent.click(collapseButton());

    expect(useAppStore.getState().isConversationToolsCollapsed).toBe(true);
    expect(localStorage.getItem("conversation-tools-collapsed")).toBe("true");
    expect(document.activeElement).toBe(expandButton());
  });
});

describe("chip activation", () => {
  it("the search chip expands the tools and focuses the field with its text selected", () => {
    render(<Tools />);

    fireEvent.click(screen.getByRole("button", { name: "conversationTools.chips.search" }));

    const input = screen.getByLabelText("search") as HTMLInputElement;
    expect(useAppStore.getState().isConversationToolsCollapsed).toBe(false);
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 6]);
  });

  it("the Dialogue chip focuses the Dialogue toggle", () => {
    render(<Tools />);

    fireEvent.click(screen.getByRole("button", { name: "conversationTools.chips.dialogue" }));

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Dialogue" }));
  });

  it("match stepping from the strip expands nothing", () => {
    render(<Tools />);

    fireEvent.click(screen.getByRole("button", { name: "conversationTools.chips.nextMatch" }));

    expect(useAppStore.getState().isConversationToolsCollapsed).toBe(true);
  });
});
