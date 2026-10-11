import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpandKeyProvider } from "@/contexts/CaptureExpandContext";
import { useExpandRegistry } from "@/store/expandRegistryStore";
import { ThinkingRenderer } from "./ThinkingRenderer";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

const THINKING = "The cause is the referrer policy.\nThe browser then sends Origin: null.";

const renderThinking = () =>
  render(
    <ExpandKeyProvider value="message-1">
      <ThinkingRenderer thinking={THINKING} />
    </ExpandKeyProvider>,
  );

describe("ThinkingRenderer", () => {
  beforeEach(() => useExpandRegistry.getState().clearAll());

  it("opens with the full thoughts shown", () => {
    renderThinking();

    const toggle = screen.getByRole("button", { name: /thinkingRenderer\.title/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/The browser then sends Origin: null\./)).toBeInTheDocument();
  });

  it("collapses to the first line and reopens", () => {
    renderThinking();
    const toggle = screen.getByRole("button", { name: /thinkingRenderer\.title/ });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/The browser then sends Origin: null\./)).not.toBeInTheDocument();
    expect(toggle).toHaveTextContent("The cause is the referrer policy.");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
