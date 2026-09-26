import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpandKeyProvider } from "@/contexts/CaptureExpandContext";
import { useExpandRegistry } from "@/store/expandRegistryStore";
import { PromptCard } from "./PromptCard";

const { turnNumberMock, copyMock, toastMock } = vi.hoisted(() => ({
  turnNumberMock: vi.fn<(uuid: string) => number | null>(),
  copyMock: vi.fn<(text: string) => Promise<void>>(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("./promptTurnNumber", () => ({
  usePromptTurnNumber: (uuid: string) => turnNumberMock(uuid),
}));

vi.mock("@/utils/clipboard", () => ({
  copyTextToClipboard: (text: string) => copyMock(text),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}(${Object.values(options).join(",")})` : key,
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

const renderCard = (props: Partial<React.ComponentProps<typeof PromptCard>> & { text: string | null }) =>
  render(
    <ExpandKeyProvider value="prompt-1">
      <PromptCard uuid="prompt-1" timestamp="2026-09-24T10:00:00.000Z" {...props} />
    </ExpandKeyProvider>,
  );

const pastedLines = Array.from({ length: 30 }, (_, i) => `pasted log line ${i + 1}`).join("\n");
const question = "Which of these failures should I fix first?";
const longPrompt = `${pastedLines}\n\n${question}`;

describe("PromptCard", () => {
  beforeEach(() => {
    turnNumberMock.mockReset().mockReturnValue(null);
    copyMock.mockReset().mockResolvedValue(undefined);
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    useExpandRegistry.getState().clearAll();
  });

  it("shows who, when and the absolute turn number in its header", () => {
    turnNumberMock.mockReturnValue(3);
    renderCard({ text: "Why does the build fail on CI?" });

    const card = screen.getByRole("article", { name: "promptCard.ariaLabelWithTurn(3)" });
    expect(card).toHaveTextContent("promptCard.you");
    expect(card).toHaveTextContent("promptCard.turn(3)");
    expect(card.querySelector("time")).toHaveAttribute("datetime", "2026-09-24T10:00:00.000Z");
    expect(card).toHaveTextContent("Why does the build fail on CI?");
  });

  it("attributes a subagent's task prompt to the parent agent", () => {
    renderCard({ text: "Audit the billing webhook retries.", author: "parentAgent" });
    const card = screen.getByRole("article", { name: "promptCard.taskAriaLabel" });
    expect(card).toHaveTextContent("promptCard.parentAgent");
    expect(card).not.toHaveTextContent("promptCard.you");
  });

  it("omits the turn number when it is not known", () => {
    renderCard({ text: "Short prompt" });
    const card = screen.getByRole("article", { name: "promptCard.ariaLabel" });
    expect(card).not.toHaveTextContent("promptCard.turn");
  });

  it("does not offer collapsing for a short prompt", () => {
    renderCard({ text: "Short prompt" });
    expect(screen.queryByRole("button", { name: "promptCard.expand" })).not.toBeInTheDocument();
  });

  it("collapses a long pasted prompt but keeps its closing question visible", () => {
    renderCard({ text: longPrompt });
    const card = screen.getByRole("article");

    expect(card).toHaveTextContent("pasted log line 1");
    expect(card).toHaveTextContent("pasted log line 6");
    expect(card).not.toHaveTextContent("pasted log line 7");
    expect(card).toHaveTextContent(question);

    fireEvent.click(screen.getByRole("button", { name: "promptCard.hiddenLines(24)" }));
    expect(card).toHaveTextContent("pasted log line 30");
    // Header action and the trailing "collapse" row both collapse it again.
    expect(screen.getAllByRole("button", { name: "promptCard.collapse", expanded: true })).toHaveLength(2);

    fireEvent.click(screen.getByText("promptCard.collapse", { selector: "span" }));
    expect(card).not.toHaveTextContent("pasted log line 7");
  });

  it("toggles from the header action and exposes the expanded state", () => {
    renderCard({ text: longPrompt });
    const toggle = screen.getByRole("button", { name: "promptCard.expand" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    const collapseToggle = screen.getAllByRole("button", { name: "promptCard.collapse" })[0]!;
    expect(collapseToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("article")).toHaveTextContent("pasted log line 30");
  });

  it("keeps keyboard focus on the header toggle when the inline rows unmount", () => {
    renderCard({ text: longPrompt });
    const headerToggle = screen.getByRole("button", { name: "promptCard.expand" });

    const expander = screen.getByRole("button", { name: "promptCard.hiddenLines(24)" });
    expander.focus();
    fireEvent.click(expander); // keyboard activation: detail 0
    expect(expander).not.toBeInTheDocument();
    expect(headerToggle).toHaveFocus();
    expect(headerToggle).toHaveAttribute("aria-expanded", "true");

    const collapseRow = screen.getByText("promptCard.collapse", { selector: "span" }).closest("button")!;
    collapseRow.focus();
    fireEvent.click(collapseRow);
    expect(collapseRow).not.toBeInTheDocument();
    expect(headerToggle).toHaveFocus();
    expect(headerToggle).toHaveAttribute("aria-expanded", "false");
  });

  it("does not move focus for a pointer click on the inline expander", () => {
    renderCard({ text: longPrompt });
    fireEvent.click(screen.getByRole("button", { name: "promptCard.hiddenLines(24)" }), { detail: 1 });
    expect(screen.getByRole("article")).toHaveTextContent("pasted log line 30");
    expect(screen.getAllByRole("button", { name: "promptCard.collapse" })[0]).not.toHaveFocus();
  });

  it("shows the whole prompt while searching", () => {
    renderCard({ text: longPrompt, searchQuery: "line 17" });
    expect(screen.getByRole("article")).toHaveTextContent("pasted log line 17");
    expect(screen.queryByRole("button", { name: "promptCard.expand" })).not.toBeInTheDocument();
  });

  it("copies the prompt text and confirms it", async () => {
    renderCard({ text: "Copy me" });
    fireEvent.click(screen.getByRole("button", { name: "promptCard.copy" }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("promptCard.copied"));
    expect(copyMock).toHaveBeenCalledWith("Copy me");
  });

  it("reports a failed copy", async () => {
    copyMock.mockRejectedValue(new Error("denied"));
    renderCard({ text: "Copy me" });
    fireEvent.click(screen.getByRole("button", { name: "promptCard.copy" }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("promptCard.copyFailed"));
  });

  it("renders attachments of a prompt without text", () => {
    renderCard({ text: null, children: <img alt="screenshot" /> });
    expect(screen.getByRole("img", { name: "screenshot" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "promptCard.copy" })).not.toBeInTheDocument();
  });
});
