import { describe, expect, it } from "vitest";
import type { ClaudeSession, SubagentNavFrame, SubagentSession } from "@/types";
import {
  getActiveSubagentFrame,
  getSubagentSiblingPosition,
  groupSubagentsForDisplay,
  orderSubagentsForDisplay,
  resolveSubagentForToolUse,
} from "./subagentNavigation";

const sub = (
  agent_id: string,
  overrides: Partial<SubagentSession> = {},
): SubagentSession => ({
  agent_id,
  file_path: `/p/s/subagents/agent-${agent_id}.jsonl`,
  message_count: 3,
  file_size: 10,
  first_message_time: null,
  last_message_time: null,
  summary: null,
  tool_use_id: null,
  workflow_run_id: null,
  ...overrides,
});

const session = (file_path: string): ClaudeSession => ({
  session_id: file_path,
  actual_session_id: file_path,
  file_path,
  project_name: "p",
  message_count: 1,
  first_message_time: "",
  last_message_time: "",
  last_modified: "",
  has_tool_use: false,
  has_errors: false,
});

describe("groupSubagentsForDisplay / orderSubagentsForDisplay", () => {
  it("keeps flat subagents ungrouped and groups workflow agents by run, in first-appearance order", () => {
    const a = sub("a");
    const w1 = sub("w1", { workflow_run_id: "wf_1" });
    const b = sub("b");
    const w2 = sub("w2", { workflow_run_id: "wf_1" });
    const x = sub("x", { workflow_run_id: "wf_2" });

    const groups = groupSubagentsForDisplay([a, w1, b, w2, x]);
    expect(groups.map((g) => [g.workflowRunId, g.subagents.map((s) => s.agent_id)])).toEqual([
      [null, ["a", "b"]],
      ["wf_1", ["w1", "w2"]],
      ["wf_2", ["x"]],
    ]);
    expect(orderSubagentsForDisplay([a, w1, b, w2, x]).map((s) => s.agent_id)).toEqual([
      "a",
      "b",
      "w1",
      "w2",
      "x",
    ]);
  });

  it("puts the flat group first even when a workflow agent started earlier", () => {
    const w = sub("w", { workflow_run_id: "wf_1" });
    const a = sub("a");
    expect(groupSubagentsForDisplay([w, a]).map((g) => g.workflowRunId)).toEqual([null, "wf_1"]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupSubagentsForDisplay([])).toEqual([]);
  });
});

describe("getActiveSubagentFrame", () => {
  const parent = session("/p/s.jsonl");
  const a = sub("a");
  const b = sub("b");
  const frame: SubagentNavFrame = { subagent: a, siblings: [a, b] };

  it("returns the top frame when stacks are aligned and it matches the selected session", () => {
    expect(
      getActiveSubagentFrame({
        subagentNavStack: [frame],
        parentSessionStack: [parent],
        selectedSession: session(a.file_path),
      }),
    ).toBe(frame);
  });

  it("returns null at top level", () => {
    expect(
      getActiveSubagentFrame({
        subagentNavStack: [],
        parentSessionStack: [],
        selectedSession: parent,
      }),
    ).toBeNull();
  });

  it("returns null when the stacks are out of sync (stale frames)", () => {
    expect(
      getActiveSubagentFrame({
        subagentNavStack: [frame],
        parentSessionStack: [],
        selectedSession: session(a.file_path),
      }),
    ).toBeNull();
  });

  it("returns null when the selected session is not the frame's subagent", () => {
    expect(
      getActiveSubagentFrame({
        subagentNavStack: [frame],
        parentSessionStack: [parent],
        selectedSession: session(b.file_path),
      }),
    ).toBeNull();
  });
});

describe("getSubagentSiblingPosition", () => {
  const a = sub("a");
  const b = sub("b");
  const w = sub("w", { workflow_run_id: "wf_1" });
  const c = sub("c");

  it("reports 1-based index, total and neighbours in display order", () => {
    // Display order: a, c (flat) then w (workflow).
    const pos = getSubagentSiblingPosition({ subagent: c, siblings: [a, w, c] });
    expect(pos).toEqual({ index: 2, total: 3, previous: a, next: w });
  });

  it("has no previous at the start and no next at the end", () => {
    expect(getSubagentSiblingPosition({ subagent: a, siblings: [a, b] })).toEqual({
      index: 1,
      total: 2,
      previous: null,
      next: b,
    });
    expect(getSubagentSiblingPosition({ subagent: b, siblings: [a, b] })).toEqual({
      index: 2,
      total: 2,
      previous: a,
      next: null,
    });
  });

  it("matches by file_path, not object identity", () => {
    const pos = getSubagentSiblingPosition({ subagent: { ...b }, siblings: [a, b] });
    expect(pos?.index).toBe(2);
  });

  it("returns null when the subagent is not among its siblings", () => {
    expect(getSubagentSiblingPosition({ subagent: c, siblings: [a, b] })).toBeNull();
  });
});

describe("resolveSubagentForToolUse", () => {
  const a = sub("a", { tool_use_id: "toolu_a" });
  const b = sub("b", { tool_use_id: "toolu_b" });

  it("resolves through the tool-use map", () => {
    const map = new Map([
      ["toolu_a", a.file_path],
      ["toolu_b", b.file_path],
    ]);
    expect(resolveSubagentForToolUse("toolu_b", map, [a, b])).toBe(b);
  });

  it("returns null for an unmapped tool use when several subagents exist", () => {
    const map = new Map([["toolu_a", a.file_path]]);
    expect(resolveSubagentForToolUse("toolu_x", map, [a, b])).toBeNull();
  });

  it("falls back to a single subagent only when it cannot be mapped at all", () => {
    const legacy = sub("legacy");
    expect(resolveSubagentForToolUse("toolu_x", new Map(), [legacy])).toBe(legacy);
    // A single subagent that belongs to another tool use must not be offered.
    expect(resolveSubagentForToolUse("toolu_x", new Map(), [a])).toBeNull();
    // Workflow agents are anchored to their Workflow card, not to Agent cards.
    const wf = sub("w", { workflow_run_id: "wf_1" });
    expect(resolveSubagentForToolUse("toolu_x", new Map(), [wf])).toBeNull();
  });

  it("returns null for an empty tool use id or no subagents", () => {
    expect(resolveSubagentForToolUse("", new Map([["", a.file_path]]), [a])).toBeNull();
    expect(resolveSubagentForToolUse("toolu_a", new Map(), [])).toBeNull();
  });

  it("returns null when the mapped file is no longer in the list", () => {
    const map = new Map([["toolu_a", "/gone.jsonl"]]);
    expect(resolveSubagentForToolUse("toolu_a", map, [a, b])).toBeNull();
  });
});
