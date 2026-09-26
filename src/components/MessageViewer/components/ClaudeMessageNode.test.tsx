import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeMessage } from "@/types";
import type { MessageFilter } from "@/store/slices/filterSlice";
import { ClaudeMessageNode } from "./ClaudeMessageNode";

const { storeState, copyMock } = vi.hoisted(() => ({
  storeState: {} as Record<string, unknown>,
  copyMock: vi.fn<(text: string) => Promise<void>>(),
}));

vi.mock("@/utils/clipboard", () => ({
  copyTextToClipboard: (text: string) => copyMock(text),
}));

vi.mock("@/store/useAppStore", () => {
  const useAppStore = (selector?: (state: Record<string, unknown>) => unknown) =>
    selector ? selector(storeState) : storeState;
  useAppStore.getState = () => storeState;
  return { useAppStore };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: unknown) =>
      typeof options === "string" ? options : key,
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

const filter = (dialogue: boolean): MessageFilter => ({
  roles: { user: true, assistant: true },
  contentTypes: { text: true, thinking: true, toolCalls: true, commands: true, parallelTasks: true },
  dialogue,
});

const record = (type: string, content: unknown, extra: Record<string, unknown> = {}): ClaudeMessage =>
  ({
    uuid: `${type}-${Math.random().toString(36).slice(2)}`,
    sessionId: "s1",
    timestamp: "2026-09-24T10:00:00.000Z",
    type,
    role: type,
    content,
    ...extra,
  }) as unknown as ClaudeMessage;

const renderNode = (message: ClaudeMessage) =>
  render(<ClaudeMessageNode message={message} isCurrentMatch={false} isMatch={false} searchQuery="" />);

describe("ClaudeMessageNode user records", () => {
  beforeEach(() => {
    Object.assign(storeState, {
      messageFilter: filter(false),
      subagentSessions: [],
      navigateToSubagent: vi.fn(),
      toolUseToSubagentMap: new Map(),
      parentSessionStack: [],
      messages: [],
      pagination: { hasMore: false },
    });
  });

  it("renders a human prompt as a prompt card", () => {
    renderNode(record("user", "Why does the build fail on CI?"));
    const card = screen.getByRole("article");
    expect(card).toHaveTextContent("promptCard.you");
    expect(card).toHaveTextContent("Why does the build fail on CI?");
  });

  it("marks a prompt the person sent while Claude was working", () => {
    renderNode(record("user", "Also check the retry limit.", { queued: true }));
    const card = screen.getByRole("article");
    expect(card).toHaveTextContent("Also check the retry limit.");
    expect(card).toHaveTextContent("promptCard.queued");
  });

  it("renders nothing for an attachment row", () => {
    const { container } = renderNode(record("attachment", undefined));
    expect(container).toBeEmptyDOMElement();
  });

  it("attributes prompts inside a subagent transcript to the parent agent", () => {
    storeState.parentSessionStack = [{ session: {} }];
    renderNode(record("user", "Audit the billing retries.", { isSidechain: true }));
    expect(screen.getByRole("article")).toHaveTextContent("promptCard.parentAgent");
  });

  it("renders a task notification as a compact row, not a prompt", () => {
    const { container } = renderNode(
      record("user", "<task-notification>\n<task-id>b1</task-id>\n<summary>Build finished</summary>\n</task-notification>"),
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(container.querySelector("[data-system-record='taskNotification']")).not.toBeNull();
    expect(container).toHaveTextContent("Build finished");
  });

  it("renders an interrupt as a compact row", () => {
    const { container } = renderNode(record("user", "[Request interrupted by user]"));
    expect(container.querySelector("[data-system-record='interrupt']")).not.toBeNull();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("presents every text block of a multi-block prompt in the card, and copies all of it", async () => {
    const ideNote = "<ide_opened_file>The user opened src/app.ts in the IDE.</ide_opened_file>";
    const typed = "Why is the header misaligned?";
    renderNode(
      record("user", [
        { type: "text", text: ideNote },
        { type: "text", text: typed },
      ]),
    );
    const card = screen.getByRole("article");
    expect(card).toHaveTextContent(ideNote);
    expect(card).toHaveTextContent(typed);
    // Text is not rendered a second time as a separate content block.
    expect(screen.getAllByText(new RegExp(typed))).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "promptCard.copy" }));
    await waitFor(() => expect(copyMock).toHaveBeenCalledWith(`${ideNote}\n${typed}`));
  });

  it("renders attachments of a prompt below its text", () => {
    const { container } = renderNode(
      record("user", [
        { type: "text", text: "What is in this screenshot?" },
        { type: "image", source: { type: "url", url: "https://example.com/shot.png" } },
      ]),
    );
    const card = screen.getByRole("article");
    expect(card).toHaveTextContent("What is in this screenshot?");
    expect(card.querySelector("img")).not.toBeNull();
    expect(container.querySelectorAll("article")).toHaveLength(1);
  });

  it("keeps a document-only record on the default renderer instead of an empty row", () => {
    const { container } = renderNode(
      record("user", [
        { type: "document", source: { type: "text", media_type: "text/plain", data: "Quarterly report body" }, title: "report.txt" },
      ]),
    );
    expect(container.querySelector("[data-system-record='empty']")).toBeNull();
    expect(container).not.toHaveTextContent("systemRow.empty");
  });

  it("keeps slash commands on the command renderer", () => {
    const { container } = renderNode(
      record("user", "<command-message>model</command-message>\n<command-name>/model</command-name>"),
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(container.querySelector("[data-system-record]")).toBeNull();
    expect(container).toHaveTextContent("/model");
  });
});

describe("ClaudeMessageNode dialogue view", () => {
  const assistant = record("assistant", [
    { type: "thinking", thinking: "Hidden reasoning" },
    { type: "text", text: "The lockfile is stale." },
    { type: "tool_use", id: "t1", name: "Bash", input: { command: "pnpm install --frozen-lockfile" } },
  ]);

  it("shows only the prose of an assistant record", () => {
    Object.assign(storeState, { messageFilter: filter(true) });
    const { container } = renderNode(assistant);
    expect(container).toHaveTextContent("The lockfile is stale.");
    expect(container).not.toHaveTextContent("Hidden reasoning");
    expect(container).not.toHaveTextContent("pnpm install --frozen-lockfile");
  });

  it("shows tool calls again when the dialogue view is off", () => {
    Object.assign(storeState, { messageFilter: filter(false) });
    const { container } = renderNode(assistant);
    expect(container).toHaveTextContent("pnpm install --frozen-lockfile");
  });
});
