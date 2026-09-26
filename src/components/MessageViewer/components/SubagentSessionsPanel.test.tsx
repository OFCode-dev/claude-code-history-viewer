import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SubagentSession } from "@/types";
import { englishT } from "@/test/utils/englishTranslator";
import { SubagentSessionsPanel } from "./SubagentSessionsPanel";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: englishT }),
}));

const sub: SubagentSession = {
  agent_id: "a1",
  file_path: "/p/s/subagents/agent-a1.jsonl",
  message_count: 4,
  file_size: 10,
  first_message_time: null,
  last_message_time: null,
  summary: null,
  tool_use_id: null,
  workflow_run_id: null,
  description: "Map the API error codes",
};

/**
 * Mirrors MessageViewer: the panel shows only at top level, and inside a
 * subagent the context bar (with its Back button) takes its place.
 */
function Harness({ navigate }: { navigate: (s: SubagentSession) => Promise<void> }) {
  const [inside, setInside] = useState(false);
  if (inside) {
    return (
      <button type="button" data-subagent-back="">
        Back
      </button>
    );
  }
  return (
    <SubagentSessionsPanel
      subagentSessions={[sub]}
      navigateToSubagent={async (s) => {
        setInside(true);
        await navigate(s);
      }}
      isOpen
      onToggle={() => {}}
    />
  );
}

describe("SubagentSessionsPanel", () => {
  it("moves focus to the context bar's Back button after opening a subagent", async () => {
    const navigate = vi.fn(async () => {});
    render(<Harness navigate={navigate} />);

    const row = screen.getByRole("button", { name: /Map the API error codes/ });
    row.focus();
    await act(async () => {
      fireEvent.click(row);
    });

    expect(navigate).toHaveBeenCalledWith(sub);
    await waitFor(() => expect(screen.getByRole("button", { name: "Back" })).toHaveFocus());
  });
});
