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
});
