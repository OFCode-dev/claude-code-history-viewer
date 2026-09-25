import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeMessage } from "@/types";
import type { MessageFilter } from "@/store/slices/filterSlice";
import { MAX_AUTO_LOAD_PAGES, useFilteredViewGuards } from "./useFilteredViewGuards";

const { storeState, toastMock } = vi.hoisted(() => ({
  storeState: {} as Record<string, unknown>,
  toastMock: vi.fn(),
}));

vi.mock("@/store/useAppStore", () => {
  const useAppStore = (selector?: (state: Record<string, unknown>) => unknown) =>
    selector ? selector(storeState) : storeState;
  useAppStore.getState = () => storeState;
  return { useAppStore };
});

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

const filter = (dialogue: boolean): MessageFilter => ({
  roles: { user: true, assistant: true },
  contentTypes: { text: true, thinking: true, toolCalls: true, commands: true, parallelTasks: true },
  dialogue,
});

const msg = (uuid: string) => ({ uuid, type: "user" }) as unknown as ClaudeMessage;

describe("useFilteredViewGuards", () => {
  beforeEach(() => {
    toastMock.mockReset();
    for (const key of Object.keys(storeState)) delete storeState[key];
    Object.assign(storeState, {
      refreshSessionSearch: vi.fn(),
      loadMoreMessages: vi.fn(),
      clearTargetMessage: vi.fn(),
      resetMessageFilter: vi.fn(),
      navigateToMessage: vi.fn(),
      targetMessageUuid: null,
      pagination: { hasMore: false, isLoadingMore: false },
    });
  });

  it("re-runs session search when the filter changes, not on mount", () => {
    const messages = [msg("a")];
    const { rerender } = renderHook((props) => useFilteredViewGuards(props), {
      initialProps: { sessionId: "s1", messageFilter: filter(false), messages, displayMessages: messages },
    });
    expect(storeState.refreshSessionSearch).not.toHaveBeenCalled();

    rerender({ sessionId: "s1", messageFilter: filter(true), messages, displayMessages: messages });
    expect(storeState.refreshSessionSearch).toHaveBeenCalledTimes(1);
  });

  it("clears a loaded deep-link target hidden by the filter and offers to show all", () => {
    storeState.targetMessageUuid = "hidden";
    const messages = [msg("visible"), msg("hidden")];
    renderHook(() =>
      useFilteredViewGuards({
        sessionId: "s1",
        messageFilter: filter(true),
        messages,
        displayMessages: [messages[0] as ClaudeMessage],
      }),
    );

    expect(storeState.clearTargetMessage).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith("filter.targetHidden", expect.anything());
    const { action } = toastMock.mock.calls[0]?.[1] as { action: { onClick: () => void } };
    action.onClick();
    expect(storeState.resetMessageFilter).toHaveBeenCalled();
    expect(storeState.navigateToMessage).toHaveBeenCalledWith("hidden", { history: "replace" });
  });

  it("leaves a visible or not-yet-loaded target alone", () => {
    storeState.targetMessageUuid = "later";
    const messages = [msg("a")];
    renderHook(() =>
      useFilteredViewGuards({ sessionId: "s1", messageFilter: filter(true), messages, displayMessages: messages }),
    );
    expect(storeState.clearTargetMessage).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("loads older pages while the filtered window is empty, up to a limit", () => {
    storeState.pagination = { hasMore: true, isLoadingMore: false };
    let messages = [msg("m0")];
    const { rerender } = renderHook((props) => useFilteredViewGuards(props), {
      initialProps: { sessionId: "s1", messageFilter: filter(true), messages, displayMessages: [] as ClaudeMessage[] },
    });
    expect(storeState.loadMoreMessages).toHaveBeenCalledTimes(1);

    for (let page = 1; page <= MAX_AUTO_LOAD_PAGES + 2; page++) {
      messages = [msg(`m${page}`), ...messages];
      rerender({ sessionId: "s1", messageFilter: filter(true), messages, displayMessages: [] });
    }
    expect(storeState.loadMoreMessages).toHaveBeenCalledTimes(MAX_AUTO_LOAD_PAGES);
  });

  it("does not auto-load when something is visible", () => {
    storeState.pagination = { hasMore: true, isLoadingMore: false };
    const messages = [msg("a")];
    renderHook(() =>
      useFilteredViewGuards({ sessionId: "s1", messageFilter: filter(true), messages, displayMessages: messages }),
    );
    expect(storeState.loadMoreMessages).not.toHaveBeenCalled();
  });
});
