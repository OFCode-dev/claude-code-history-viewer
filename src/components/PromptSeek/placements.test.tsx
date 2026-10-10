/**
 * Where the previous / next prompt buttons sit: directly under (or beside)
 * whichever control opens the prompts navigator, one pair at a time.
 * The reading-mode gutter placement is covered with the auto-hide adapter.
 */
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MessageNavigator } from "@/components/MessageNavigator";
import { MobileNavigatorSheet } from "@/components/mobile/MobileNavigatorSheet";
import { useAppStore } from "@/store/useAppStore";
import { buildPromptTrack, useViewportAnchorStore } from "@/store/viewportAnchorStore";
import type { ClaudeMessage, ClaudeSession } from "@/types";

const SESSION = "/sessions/longform.jsonl";
const messages = [
  { uuid: "p1", type: "user", content: "First question", timestamp: "2026-09-25T10:00:00Z" },
  { uuid: "a1", type: "assistant", content: [{ type: "text", text: "a" }], timestamp: "2026-09-25T10:01:00Z" },
  { uuid: "p2", type: "user", content: "Second question", timestamp: "2026-09-25T10:02:00Z" },
] as unknown as ClaudeMessage[];

const original = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState({ selectedSession: { file_path: SESSION } as ClaudeSession });
  const anchors = useViewportAnchorStore.getState();
  anchors.reset();
  anchors.setPromptTrack(buildPromptTrack(SESSION, messages));
  anchors.publishAnchor(SESSION, "p1");
});

afterEach(() => {
  useAppStore.setState({ selectedSession: original.selectedSession });
  useViewportAnchorStore.getState().reset();
});

function renderNavigator(props: { isCollapsed: boolean; showPromptSeek?: boolean }) {
  return render(
    <TooltipProvider>
      <MessageNavigator
        messages={messages}
        width={280}
        isResizing={false}
        onToggleCollapse={vi.fn()}
        {...props}
      />
    </TooltipProvider>
  );
}

const seekGroups = () => screen.queryAllByRole("group", { name: "Previous and next prompt" });

const follows = (first: Element, second: Element) =>
  (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe("prompt seek placement", () => {
  it("collapsed navigator rail: directly under the expand button", () => {
    renderNavigator({ isCollapsed: true, showPromptSeek: true });
    const rail = screen.getByRole("complementary");
    const expand = within(rail).getByRole("button", { name: "Toggle message navigator" });
    const [group] = seekGroups();
    expect(seekGroups()).toHaveLength(1);
    expect(expand.nextElementSibling).toBe(group);
    expect(within(group!).getByRole("button", { name: "Previous prompt" })).toBeInTheDocument();
    expect(within(group!).getByRole("button", { name: "Next prompt" })).toBeInTheDocument();
  });

  it("open navigator: in the header, right before the close button", () => {
    renderNavigator({ isCollapsed: false, showPromptSeek: true });
    const close = screen.getByRole("button", { name: "Toggle message navigator" });
    const [group] = seekGroups();
    expect(seekGroups()).toHaveLength(1);
    expect(group!.nextElementSibling).toBe(close);
  });

  it("not in the navigator where another toggle carries them", () => {
    renderNavigator({ isCollapsed: false });
    expect(seekGroups()).toHaveLength(0);
    renderNavigator({ isCollapsed: true, showPromptSeek: false });
    expect(seekGroups()).toHaveLength(0);
  });

  it("phones: a compact pair just above the navigator button", () => {
    render(
      <TooltipProvider>
        <MobileNavigatorSheet messages={messages} />
      </TooltipProvider>
    );
    const open = screen.getByRole("button", { name: "Open navigator" });
    const [group] = seekGroups();
    expect(seekGroups()).toHaveLength(1);
    expect(group!.nextElementSibling).toBe(open);
    for (const button of within(group!).getAllByRole("button")) {
      expect(button.className).toMatch(/\bsize-11\b/);
    }
    expect(follows(group!, open)).toBe(true);
  });
});
