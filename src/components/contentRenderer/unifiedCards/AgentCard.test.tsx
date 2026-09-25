import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubagentSession } from "@/types";
import { englishT } from "@/test/utils/englishTranslator";
import { ExpandKeyProvider } from "@/contexts/CaptureExpandContext";
import { AgentCard } from "./AgentCard";

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

const sub = (agent_id: string, overrides: Partial<SubagentSession> = {}): SubagentSession => ({
  agent_id,
  file_path: `/p/s/subagents/agent-${agent_id}.jsonl`,
  message_count: 7,
  file_size: 10,
  first_message_time: null,
  last_message_time: null,
  summary: null,
  tool_use_id: `toolu_${agent_id}`,
  workflow_run_id: null,
  ...overrides,
});

const agentToolUse = (id: string) => ({
  id,
  name: "Agent",
  input: { description: "Map the API error codes", prompt: "Find every error code", subagent_type: "Explore" },
});

const navigateToSubagent = vi.fn();

const renderCard = (toolUseId: string) =>
  render(
    <ExpandKeyProvider value="test-message">
      <AgentCard toolUse={agentToolUse(toolUseId)} toolResults={[]} />
    </ExpandKeyProvider>,
  );

function setSubagents(subagents: SubagentSession[], map: Record<string, string>) {
  Object.assign(storeState, {
    subagentSessions: subagents,
    toolUseToSubagentMap: new Map(Object.entries(map)),
    navigateToSubagent,
  });
}

describe("AgentCard — Open transcript", () => {
  beforeEach(() => navigateToSubagent.mockReset());

  it("offers the transcript of the subagent this call spawned, even while collapsed", () => {
    const mapped = sub("a", { description: "Map the API error codes" });
    const other = sub("b");
    setSubagents([mapped, other], { toolu_a: mapped.file_path, toolu_b: other.file_path });

    renderCard("toolu_a");

    const button = screen.getByRole("button", {
      name: "Open transcript: Map the API error codes",
    });
    expect(button).toHaveTextContent("Open transcript");
    expect(button).toHaveAttribute("title", "7 messages");
    // The card body (prompt, result) is collapsed; the action lives in the header.
    expect(screen.queryByText("Find every error code")).toBeNull();

    fireEvent.click(button);
    expect(navigateToSubagent).toHaveBeenCalledWith(mapped);
  });

  it("has no transcript action when the call maps to no subagent", () => {
    const a = sub("a");
    const b = sub("b");
    setSubagents([a, b], { toolu_a: a.file_path, toolu_b: b.file_path });

    renderCard("toolu_other");

    expect(screen.queryByRole("button", { name: /Open transcript/ })).toBeNull();
  });

  it("has no transcript action when the session has no subagents", () => {
    setSubagents([], {});
    renderCard("toolu_a");
    expect(screen.queryByRole("button", { name: /Open transcript/ })).toBeNull();
  });
});
