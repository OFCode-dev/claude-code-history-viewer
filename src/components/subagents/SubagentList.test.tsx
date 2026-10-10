import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { SubagentSession } from "@/types";
import { englishT } from "@/test/utils/englishTranslator";
import { SubagentList } from "./SubagentList";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: englishT }),
}));

const sub = (agent_id: string, overrides: Partial<SubagentSession> = {}): SubagentSession => ({
  agent_id,
  file_path: `/p/s/subagents/agent-${agent_id}.jsonl`,
  message_count: 12,
  file_size: 10,
  first_message_time: "2026-09-20T10:00:00Z",
  last_message_time: "2026-09-20T10:05:00Z",
  summary: "first prompt line of the task",
  tool_use_id: `toolu_${agent_id}`,
  workflow_run_id: null,
  ...overrides,
});

const described = sub("a1", {
  description: "Map the API error codes",
  agent_type: "Explore",
  model: "sonnet",
});
const summaryOnly = sub("b2", { summary: "Audit   the\nwebhook retries", message_count: 3 });
const workflowAgent = sub("w3", {
  description: "Run release workflow",
  agent_type: "general-purpose",
  model: "opus",
  tool_use_id: null,
  workflow_run_id: "wf_24f7",
});

describe("SubagentList", () => {
  it("labels rows with the description, falling back to the summary", () => {
    render(<SubagentList subagents={[described, summaryOnly]} onSelect={vi.fn()} />);

    const rows = screen.getAllByRole("button");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Map the API error codes");
    expect(rows[0]).not.toHaveTextContent("first prompt line");
    expect(rows[1]).toHaveTextContent("Audit the webhook retries");
  });

  it("uses the singular form for a single message", () => {
    render(<SubagentList subagents={[sub("c4", { message_count: 1 })]} onSelect={vi.fn()} />);

    const row = screen.getByRole("button");
    expect(row).toHaveTextContent("1 message");
    expect(row).not.toHaveTextContent("1 messages");
  });

  it("marks the active subagent with aria-current", () => {
    render(
      <SubagentList
        subagents={[described, summaryOnly]}
        activeFilePath={summaryOnly.file_path}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Audit/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /Map the API/ })).not.toHaveAttribute("aria-current");
  });

  it("calls onSelect with the clicked subagent", () => {
    const onSelect = vi.fn();
    render(<SubagentList subagents={[described, summaryOnly]} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /Audit/ }));
    expect(onSelect).toHaveBeenCalledWith(summaryOnly);
  });

  it("groups workflow agents under their run after the flat subagents", () => {
    render(
      <SubagentList subagents={[workflowAgent, described, summaryOnly]} onSelect={vi.fn()} />,
    );

    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(2);
    expect(within(lists[0]!).getAllByRole("button").map((b) => b.textContent)).toEqual([
      expect.stringContaining("Map the API error codes"),
      expect.stringContaining("Audit the webhook retries"),
    ]);
    expect(screen.getByRole("list", { name: "Workflow wf_24f7" })).toBe(lists[1]);
    expect(within(lists[1]!).getByRole("button")).toHaveTextContent("Run release workflow");
  });

  it("moves focus with the arrow, Home and End keys across groups", () => {
    render(
      <SubagentList subagents={[described, summaryOnly, workflowAgent]} onSelect={vi.fn()} />,
    );
    const [first, second, third] = screen.getAllByRole("button");

    first!.focus();
    fireEvent.keyDown(first!, { key: "ArrowDown" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second!, { key: "ArrowDown" });
    expect(third).toHaveFocus();
    fireEvent.keyDown(third!, { key: "ArrowDown" });
    expect(third).toHaveFocus();
    fireEvent.keyDown(third!, { key: "Home" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first!, { key: "End" });
    expect(third).toHaveFocus();
    fireEvent.keyDown(third!, { key: "ArrowUp" });
    expect(second).toHaveFocus();
  });

  it("leaves modified arrows to app shortcuts (Alt+Up/Down prompt jump)", () => {
    render(<SubagentList subagents={[described, summaryOnly]} onSelect={vi.fn()} />);
    const [first] = screen.getAllByRole("button");

    first!.focus();
    for (const modifier of ["altKey", "ctrlKey", "metaKey"] as const) {
      // fireEvent returns false when a handler called preventDefault().
      expect(fireEvent.keyDown(first!, { key: "ArrowDown", [modifier]: true })).toBe(true);
      expect(first).toHaveFocus();
    }
  });

  describe("list layout (docked sessions-pane section)", () => {
    it("renders a single compact line: label and count, with type, model and time in the title", () => {
      render(<SubagentList subagents={[described, summaryOnly]} onSelect={vi.fn()} />);

      const row = screen.getByRole("button", { name: /Map the API error codes/ });
      expect(row.className).toMatch(/\bh-7\b/);
      expect(row).toHaveTextContent("Map the API error codes");
      // The count is a bare number on screen, spelled out for screen readers.
      expect(row).toHaveTextContent("12 messages");
      expect(within(row).getByText("12")).toHaveAttribute("aria-hidden", "true");
      // Type, model and last-activity time are dropped from the visible row...
      expect(row).not.toHaveTextContent("Explore");
      expect(row).not.toHaveTextContent("sonnet");
      // ...and carried in the title instead, alongside the label and type.
      expect(row.title).toContain("Map the API error codes");
      expect(row.title).toContain("Explore");
      expect(row.title).toContain("sonnet");
      expect(row.title).toContain("Last activity");

      // No agent_type/model on this one — no type text, but it still lists.
      const plain = screen.getByRole("button", { name: /Audit the webhook retries/ });
      expect(plain).toHaveTextContent("3 messages");
      expect(plain.title).toContain("Audit the webhook retries");
      expect(plain.title).toContain("Last activity");
      expect(plain.title).not.toContain("undefined");
    });

    it("formats the title's last-activity time in the app language, not the browser locale", async () => {
      await i18n.changeLanguage("ko");
      try {
        render(<SubagentList subagents={[described]} onSelect={vi.fn()} />);
        const row = screen.getByRole("button");
        expect(row.title).toMatch(/Last activity 2026년 9월 20일/);
      } finally {
        await i18n.changeLanguage("en");
      }
    });
  });
});
