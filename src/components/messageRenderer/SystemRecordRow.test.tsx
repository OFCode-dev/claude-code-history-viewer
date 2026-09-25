import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpandKeyProvider } from "@/contexts/CaptureExpandContext";
import { useExpandRegistry } from "@/store/expandRegistryStore";
import { SystemRecordRow } from "./SystemRecordRow";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

const TIMESTAMP = "2026-09-24T10:00:00.000Z";

const renderRow = (props: Omit<React.ComponentProps<typeof SystemRecordRow>, "timestamp">) =>
  render(
    <ExpandKeyProvider value="record-1">
      <SystemRecordRow timestamp={TIMESTAMP} {...props} />
    </ExpandKeyProvider>,
  );

describe("SystemRecordRow", () => {
  beforeEach(() => useExpandRegistry.getState().clearAll());

  it("shows a task notification as one line that expands to the full notification", () => {
    const text =
      "<task-notification>\n<task-id>b1234</task-id>\n<status>completed</status>\n" +
      "<summary>Background command finished</summary>\n</task-notification>";
    const { container } = renderRow({ kind: "taskNotification", text });

    const toggle = screen.getByRole("button", { expanded: false });
    expect(toggle).toHaveTextContent("systemRow.taskNotification");
    expect(toggle).toHaveTextContent("Background command finished");
    expect(container.querySelector("time")).toHaveAttribute("datetime", TIMESTAMP);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const details = document.getElementById(toggle.getAttribute("aria-controls")!);
    expect(details).not.toBeNull();
    expect(details).toHaveTextContent("b1234");
  });

  it("shows single-line command output without an expand control", () => {
    renderRow({
      kind: "commandOutput",
      text: "<local-command-stdout>Set model to Opus</local-command-stdout>",
    });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("systemRow.commandOutput")).toBeInTheDocument();
    expect(screen.getByText("Set model to Opus")).toBeInTheDocument();
  });

  it("expands multi-line command output without its wrapper tags", () => {
    renderRow({
      kind: "commandOutput",
      text: "<local-command-stdout>Total cost: $0.42\nTotal duration: 3m</local-command-stdout>",
    });
    fireEvent.click(screen.getByRole("button"));
    const details = document.getElementById(screen.getByRole("button").getAttribute("aria-controls")!);
    expect(details).toHaveTextContent("Total duration: 3m");
    expect(details?.textContent).not.toContain("local-command-stdout");
  });

  it("renders an interrupt as a muted, non-interactive line", () => {
    const { container } = renderRow({ kind: "interrupt", text: "[Request interrupted by user]" });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container).toHaveTextContent("systemRow.interrupt");
    expect(container.querySelector("[data-system-record='interrupt']")).not.toBeNull();
  });

  it("opens when a search hit is inside the hidden content", () => {
    renderRow({
      kind: "systemContext",
      text: "<system-reminder>\nRemember the plan.\nNever touch the live service.\n</system-reminder>",
      searchQuery: "live service",
    });
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector("mark, [data-search-highlight]")).not.toBeNull();
  });

  const reminder = "<system-reminder>\nRemember the plan.\nNever touch the live service.\n</system-reminder>";
  const renderWithQuery = (searchQuery: string, extra: Partial<React.ComponentProps<typeof SystemRecordRow>> = {}) => (
    <ExpandKeyProvider value="record-1">
      <SystemRecordRow timestamp={TIMESTAMP} kind="systemContext" text={reminder} searchQuery={searchQuery} {...extra} />
    </ExpandKeyProvider>
  );

  it("closes again when the search is cleared, without persisting the reveal", () => {
    const { rerender } = render(renderWithQuery("live service"));
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");

    rerender(renderWithQuery(""));
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
    expect(Object.values(useExpandRegistry.getState().states)).not.toContain(true);
  });

  it("can be collapsed by hand while the search that revealed it is active", () => {
    render(renderWithQuery("live service"));
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("does not reveal on a tool-id search", () => {
    render(renderWithQuery("live service", { filterType: "toolId" }));
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("in capture mode, keeps the row selectable and toggles only from the chevron", () => {
    const { container } = render(renderWithQuery("", { selectable: true }));
    const toggle = screen.getByRole("button", { name: "systemRow.systemContext: systemRow.expand" });
    // The summary text is not inside a button, so clicking it selects the message.
    expect(screen.getByText("systemRow.systemContext").closest("button")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(container).toHaveTextContent("Never touch the live service.");
  });
});
