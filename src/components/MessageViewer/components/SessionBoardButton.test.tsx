import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionBoardButton } from "./SessionBoardButton";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "session.board.title" ? "Session Board" : key),
  }),
}));

describe("SessionBoardButton", () => {
  it("is named for what it opens and calls back on click", () => {
    const onClick = vi.fn();
    render(
      <TooltipProvider>
        <SessionBoardButton onClick={onClick} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Session Board" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
