import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { englishT } from "@/test/utils/englishTranslator";
import { ExpandKeyProvider } from "@/contexts/CaptureExpandContext";
import { BashCard } from "./BashCard";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: englishT }),
}));

const { storeState } = vi.hoisted(() => ({
  storeState: {} as Record<string, unknown>,
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(storeState),
}));
vi.mock("../../../store/useAppStore", () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(storeState),
}));

const renderCard = (input: Record<string, unknown>) =>
  render(
    <ExpandKeyProvider value="test-message">
      <BashCard toolUse={{ id: "toolu_bash_1", name: "Bash", input }} toolResults={[]} />
    </ExpandKeyProvider>,
  );

describe("BashCard", () => {
  it("shows the description and the command in the collapsed header, and the description once when expanded", () => {
    renderCard({ command: "npm test", description: "Run the cart tests" });

    const description = screen.getByText("Run the cart tests");
    expect(description.parentElement?.parentElement).toHaveAttribute(
      "title",
      "Run the cart tests\nnpm test",
    );
    expect(screen.getByText("npm test")).toBeInTheDocument();
    expect(screen.queryByText("npm test", { selector: "pre" })).not.toBeInTheDocument();

    fireEvent.click(description);
    // The collapsed-only header preview gives way to the body, so the description is never shown twice.
    expect(screen.getByText("npm test", { selector: "pre" })).toBeInTheDocument();
    expect(screen.getAllByText("Run the cart tests")).toHaveLength(1);
  });

  it("shows the command in the collapsed header when there is no description", () => {
    renderCard({ command: "npm test" });

    expect(screen.getByText("npm test")).toBeInTheDocument();
  });
});
