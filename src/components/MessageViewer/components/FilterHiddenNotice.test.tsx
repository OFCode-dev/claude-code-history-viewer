import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilterHiddenNotice } from "./FilterHiddenNotice";

const { storeState } = vi.hoisted(() => ({ storeState: {} as Record<string, unknown> }));

vi.mock("@/store/useAppStore", () => {
  const useAppStore = (selector?: (state: Record<string, unknown>) => unknown) =>
    selector ? selector(storeState) : storeState;
  useAppStore.getState = () => storeState;
  return { useAppStore };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}(${Object.values(options).join(",")})` : key,
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

describe("FilterHiddenNotice", () => {
  beforeEach(() => {
    Object.assign(storeState, {
      messageFilter: { dialogue: true },
      resetMessageFilter: vi.fn(),
    });
  });

  it("reports hidden search matches and shows everything on request", () => {
    render(<FilterHiddenNotice variant="searchMatches" hiddenCount={3} />);
    expect(screen.getByRole("status")).toHaveTextContent("filter.hiddenMatches(3)");
    fireEvent.click(screen.getByRole("button", { name: "filter.showAll" }));
    expect(storeState.resetMessageFilter).toHaveBeenCalledTimes(1);
  });

  it("explains an empty window in the dialogue view", () => {
    render(<FilterHiddenNotice variant="emptyWindow" />);
    expect(screen.getByRole("status")).toHaveTextContent("dialogue.emptyWindow");
  });

  it("explains an empty window under the individual filters", () => {
    storeState.messageFilter = { dialogue: false };
    render(<FilterHiddenNotice variant="emptyWindow" />);
    expect(screen.getByRole("status")).toHaveTextContent("filter.emptyWindow");
  });
});
