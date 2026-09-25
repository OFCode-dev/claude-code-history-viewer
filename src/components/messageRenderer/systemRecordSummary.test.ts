import { describe, expect, it } from "vitest";
import type { ClaudeMessage } from "@/types";
import {
  getCommandOutputBody,
  getSystemRecordSummary,
  hasNonTextContent,
  isShellCommandText,
  toSystemRecordKind,
} from "./systemRecordSummary";

describe("getSystemRecordSummary", () => {
  it("summarises command output by its first output line", () => {
    expect(
      getSystemRecordSummary("commandOutput", "<local-command-stdout>Set model to Opus</local-command-stdout>"),
    ).toEqual({ preview: "Set model to Opus", expandable: false });
  });

  it("marks multi-line command output as expandable", () => {
    const summary = getSystemRecordSummary(
      "commandOutput",
      "<local-command-stdout>Total cost: $0.42\nTotal duration: 3m</local-command-stdout>",
    );
    expect(summary.preview).toBe("Total cost: $0.42");
    expect(summary.expandable).toBe(true);
  });

  it("uses the task notification summary", () => {
    const text =
      "<task-notification>\n<task-id>b1234</task-id>\n<status>completed</status>\n" +
      "<summary>Background command finished</summary>\n</task-notification>";
    expect(getSystemRecordSummary("taskNotification", text)).toEqual({
      preview: "Background command finished",
      expandable: true,
    });
  });

  it("falls back to the task status when there is no summary", () => {
    const text = "<task-notification><task-id>b1</task-id><status>failed</status></task-notification>";
    expect(getSystemRecordSummary("taskNotification", text).preview).toBe("failed");
  });

  it("keeps only the reason of an interrupt and never expands it", () => {
    expect(getSystemRecordSummary("interrupt", "[Request interrupted by user]")).toEqual({
      preview: "",
      expandable: false,
    });
    expect(getSystemRecordSummary("interrupt", "[Request interrupted by user for tool use]")).toEqual({
      preview: "for tool use",
      expandable: false,
    });
  });

  it("strips markdown heading marks from harness context", () => {
    const summary = getSystemRecordSummary(
      "systemContext",
      "# AGENTS.md instructions for /work/acme\n\n<INSTRUCTIONS>\nBe brief.\n</INSTRUCTIONS>",
    );
    expect(summary.preview).toBe("AGENTS.md instructions for /work/acme");
    expect(summary.expandable).toBe(true);
  });

  it("truncates long compaction summaries", () => {
    const text = `This session is being continued from a previous conversation. ${"Details. ".repeat(40)}`;
    const summary = getSystemRecordSummary("compactSummary", text);
    expect(summary.preview.length).toBeLessThanOrEqual(160);
    expect(summary.preview.endsWith("…")).toBe(true);
    expect(summary.expandable).toBe(true);
  });

  it("renders bash-mode input as a shell command", () => {
    expect(isShellCommandText("<bash-input>ls -la</bash-input>")).toBe(true);
    expect(isShellCommandText("<command-name>/model</command-name>")).toBe(false);
    expect(getSystemRecordSummary("shellCommand", "<bash-input>ls -la</bash-input>")).toEqual({
      preview: "$ ls -la",
      expandable: false,
    });
  });

  it("has nothing to show for empty records", () => {
    expect(getSystemRecordSummary("empty", "   ")).toEqual({ preview: "", expandable: false });
  });
});

describe("getCommandOutputBody", () => {
  it("drops the wrapper tags of command output", () => {
    expect(
      getCommandOutputBody("<bash-stdout>a.txt\nb.txt</bash-stdout><bash-stderr></bash-stderr>"),
    ).toBe("a.txt\nb.txt");
  });
});

describe("toSystemRecordKind", () => {
  it.each([
    ["commandOutput", "<local-command-stdout>x</local-command-stdout>", "commandOutput"],
    ["taskNotification", "<task-notification></task-notification>", "taskNotification"],
    ["systemContext", "<system-reminder>x</system-reminder>", "systemContext"],
    ["interrupt", "[Request interrupted by user]", "interrupt"],
    ["compactSummary", "This session is being continued", "compactSummary"],
    ["empty", "", "empty"],
    ["command", "<bash-input>ls</bash-input>", "shellCommand"],
    ["command", "<command-name>/model</command-name>", null],
    ["prompt", "Fix the header", null],
    ["toolResult", "", null],
    [null, "", null],
  ] as const)("maps %s (%s) to %s", (kind, text, expected) => {
    expect(toSystemRecordKind(kind, text)).toBe(expected);
  });

  it("leaves a text-less record with other content to the default renderer", () => {
    expect(toSystemRecordKind("empty", "", { hasOtherContent: true })).toBeNull();
    // Other kinds are decided by their text alone.
    expect(toSystemRecordKind("interrupt", "[Request interrupted by user]", { hasOtherContent: true })).toBe(
      "interrupt",
    );
  });
});

describe("hasNonTextContent", () => {
  const user = (extra: Record<string, unknown>) =>
    ({ uuid: "u", sessionId: "s", timestamp: "", type: "user", role: "user", ...extra }) as unknown as ClaudeMessage;

  it("detects attachments and legacy tool results", () => {
    expect(hasNonTextContent(user({ content: [{ type: "document", source: {} }] }))).toBe(true);
    expect(hasNonTextContent(user({ content: [], toolUseResult: { stdout: "ok" } }))).toBe(true);
  });

  it("is false for text-only records", () => {
    expect(hasNonTextContent(user({ content: "hello" }))).toBe(false);
    expect(hasNonTextContent(user({ content: [{ type: "text", text: "" }] }))).toBe(false);
    expect(hasNonTextContent(user({ content: [] }))).toBe(false);
  });
});
