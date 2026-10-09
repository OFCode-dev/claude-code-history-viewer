import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpandKeyProvider } from "@/contexts/CaptureExpandContext";
import { useExpandRegistry } from "@/store/expandRegistryStore";
import { englishT } from "@/test/utils/englishTranslator";
import { MessageContentDisplay } from "./MessageContentDisplay";
import { MESSAGE_PREVIEW_CHARS } from "./messageCollapse";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: englishT }),
}));

const renderMessage = (content: string, messageType: "assistant" | "user" = "assistant") =>
  render(
    <ExpandKeyProvider value="msg-1">
      <MessageContentDisplay content={content} messageType={messageType} />
    </ExpandKeyProvider>,
  );

const paragraphs = (count: number) =>
  Array.from({ length: count }, (_, i) => `Paragraph ${i + 1} ${"lorem ipsum ".repeat(8)}`.trim()).join("\n\n");

describe("MessageContentDisplay", () => {
  beforeEach(() => useExpandRegistry.getState().clearAll());

  it.each(["assistant", "user"] as const)(
    "shows a %s message of up to 10,000 characters in full, without Show more",
    (type) => {
      const text = paragraphs(80);
      expect(text.length).toBeLessThanOrEqual(MESSAGE_PREVIEW_CHARS);
      renderMessage(text, type);
      expect(screen.getByText(/Paragraph 80/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Show more/ })).not.toBeInTheDocument();
    },
  );

  it.each(["assistant", "user"] as const)(
    "folds a longer %s message to its first 10,000 characters until expanded",
    (type) => {
      const text = paragraphs(200);
      expect(text.length).toBeGreaterThan(MESSAGE_PREVIEW_CHARS);
      renderMessage(text, type);

      expect(screen.getByText(/Paragraph 1 /)).toBeInTheDocument();
      expect(screen.queryByText(/Paragraph 200/)).not.toBeInTheDocument();

      const showMore = screen.getByRole("button", { name: /Show more/ });
      expect(showMore).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(showMore);
      expect(screen.getByText(/Paragraph 200/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Show less" }));
      expect(screen.queryByText(/Paragraph 200/)).not.toBeInTheDocument();
    },
  );

  it("renders every table row", () => {
    const rows = Array.from({ length: 12 }, (_, i) => `| row ${i + 1} | ${i + 1} |`).join("\n");
    renderMessage(`| name | value |\n| --- | --- |\n${rows}`);
    expect(screen.getAllByRole("row")).toHaveLength(13);
    expect(screen.queryByRole("button", { name: /more rows/ })).not.toBeInTheDocument();
  });

  it("justifies prose paragraphs and leaves code blocks alone", () => {
    const { container } = renderMessage("A paragraph of prose.\n\n```\nconst x = 1;\n```");
    const prose = container.querySelector("p")!.parentElement!;
    expect(prose.className).toContain("[&>p]:text-justify");
    expect(container.querySelector("pre")!.className).not.toContain("text-justify");
  });
});
