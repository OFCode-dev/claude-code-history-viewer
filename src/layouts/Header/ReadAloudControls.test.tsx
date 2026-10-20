import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ClaudeProject, ClaudeSession } from "@/types";
import type { ReadAloudSnapshot } from "@/services/readAloud";

const { fake } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const fake = {
    snapshot: { status: "off", queuedSeconds: 0, queuedReplies: 0, effectiveRate: 1, skippedCount: 0 } as ReadAloudSnapshot,
    listeners,
    handle: {
      start: vi.fn(),
      stop: vi.fn(),
      skipToLatest: vi.fn(),
      prime: vi.fn(),
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => fake.snapshot,
    },
  };
  return { fake };
});

vi.mock("@/services/readAloud", () => ({ readAloudHandle: fake.handle }));

const { toastInfo } = vi.hoisted(() => ({ toastInfo: vi.fn() }));
vi.mock("sonner", () => ({ toast: { info: toastInfo } }));

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t, i18n: { language: "en" } }),
}));

import { ReadAloudControls } from "./ReadAloudControls";
import { useAppStore } from "@/store/useAppStore";

const PROJECT_DIR = "/home/me/.claude/projects/-home-me-api";

const project: ClaudeProject = {
  name: "-home-me-api",
  path: PROJECT_DIR,
  actual_path: "/home/me/api",
  session_count: 1,
  message_count: 3,
  last_modified: "2026-10-20T10:00:00Z",
  provider: "claude",
};

const session: ClaudeSession = {
  session_id: `${PROJECT_DIR}/aaaa1111.jsonl`,
  actual_session_id: "aaaa1111",
  file_path: `${PROJECT_DIR}/aaaa1111.jsonl`,
  project_name: "api",
  message_count: 3,
  first_message_time: "2026-10-20T10:00:00Z",
  last_message_time: "2026-10-20T11:00:00Z",
  last_modified: "2026-10-20T11:00:00Z",
  has_tool_use: false,
  has_errors: false,
  summary: "Fix the login flow",
};

const OFF: ReadAloudSnapshot = { status: "off", queuedSeconds: 0, queuedReplies: 0, effectiveRate: 1, skippedCount: 0 };

function setSnapshot(next: Partial<ReadAloudSnapshot>) {
  fake.snapshot = { ...OFF, ...next };
  act(() => fake.listeners.forEach((listener) => listener()));
}

const toggle = () => screen.getByRole("button", { name: "readAloud.label" });

beforeEach(() => {
  vi.clearAllMocks();
  fake.snapshot = OFF;
  useAppStore.setState({
    selectedProject: project,
    selectedSession: session,
    parentSessionStack: [],
    sessions: [session],
    readAloudAvailability: "ok",
    readAloudBaseRate: 1,
    readAloudCatchUpThresholdSec: 20,
  });
});

afterEach(() => {
  cleanup();
  fake.listeners.clear();
});

describe("ReadAloudControls", () => {
  it("primes the engine inside the click, then starts on the open main session", () => {
    render(<ReadAloudControls />);

    expect(toggle()).toHaveAttribute("aria-pressed", "false");
    expect(toggle()).not.toHaveAttribute("aria-disabled");
    fireEvent.click(toggle());

    expect(fake.handle.prime).toHaveBeenCalledWith("readAloud.cue.enabled");
    expect(fake.handle.start).toHaveBeenCalledWith({
      path: session.file_path,
      title: "Fix the login flow",
      provider: "claude",
    });
    expect(fake.handle.prime.mock.invocationCallOrder[0]).toBeLessThan(
      fake.handle.start.mock.invocationCallOrder[0]!,
    );
  });

  it.each([
    ["noLocalVoice", () => useAppStore.setState({ readAloudAvailability: "noLocalVoice" })],
    ["noApi", () => useAppStore.setState({ readAloudAvailability: "noApi" })],
    ["notClaude", () => useAppStore.setState({ selectedSession: { ...session, provider: "codex" } })],
    ["noSession", () => useAppStore.setState({ selectedSession: null })],
  ])("stays focusable but aria-disabled with the %s reason", (reason, arrange) => {
    arrange();
    render(<ReadAloudControls />);

    const button = toggle();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    button.focus();
    expect(button).toHaveFocus();
    expect(button).toHaveAccessibleDescription(`readAloud.unavailable.${reason}`);

    fireEvent.click(button);
    expect(fake.handle.prime).not.toHaveBeenCalled();
    expect(fake.handle.start).not.toHaveBeenCalled();
    // A tap on a touch screen never opens the tooltip, so the click itself explains.
    expect(toastInfo).toHaveBeenCalledWith(`readAloud.unavailable.${reason}`, expect.anything());
  });

  it("leaves the tooltip description to Radix when nothing blocks the toggle", () => {
    render(<ReadAloudControls />);

    act(() => toggle().focus());
    expect(toggle()).toHaveAccessibleDescription("readAloud.tooltip.enable");
  });

  it("shows the pill while on and turns off from the pressed toggle", () => {
    render(<ReadAloudControls />);
    expect(screen.queryByRole("group", { name: "readAloud.pill.label" })).toBeNull();

    setSnapshot({ status: "listening", sourceTitle: "Fix the login flow" });

    expect(toggle()).toHaveAttribute("aria-pressed", "true");
    const pill = screen.getByRole("group", { name: "readAloud.pill.label" });
    expect(pill).toHaveTextContent("Fix the login flow");
    expect(pill).toHaveTextContent("readAloud.status.listening");

    fireEvent.click(toggle());
    expect(fake.handle.stop).toHaveBeenCalledTimes(1);
  });

  it("keeps Off available while idle on a non-Claude session", () => {
    useAppStore.setState({ selectedSession: { ...session, provider: "codex" } });
    render(<ReadAloudControls />);

    setSnapshot({ status: "idle", idleReason: "notClaude", sourceTitle: "Codex run" });

    expect(screen.getByRole("group", { name: "readAloud.pill.label" })).toHaveTextContent(
      "readAloud.status.idle.notClaude",
    );
    expect(toggle()).not.toHaveAttribute("aria-disabled");
    fireEvent.click(toggle());
    expect(fake.handle.stop).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the toggle when Skip to latest removes itself", () => {
    fake.handle.skipToLatest.mockImplementationOnce(() =>
      setSnapshot({ status: "speaking", queuedSeconds: 3, queuedReplies: 0 }),
    );
    render(<ReadAloudControls />);
    setSnapshot({ status: "speaking", queuedSeconds: 30, queuedReplies: 2 });

    const skip = screen.getByRole("button", { name: "readAloud.skipToLatest" });
    skip.focus();
    fireEvent.click(skip);

    expect(screen.queryByRole("button", { name: "readAloud.skipToLatest" })).toBeNull();
    expect(toggle()).toHaveFocus();
  });

  it("tells states apart without color and keeps the paused reason visible on narrow screens", () => {
    render(<ReadAloudControls />);
    const icon = () => document.querySelector("[data-status-icon]")?.getAttribute("data-status-icon");

    setSnapshot({ status: "listening" });
    const listening = icon();
    setSnapshot({ status: "speaking" });
    const speaking = icon();
    setSnapshot({ status: "reconnecting" });
    const reconnecting = icon();
    expect(new Set([listening, speaking, reconnecting]).size).toBe(3);

    setSnapshot({ status: "idle", idleReason: "notClaude" });
    const visible = screen
      .getAllByText("readAloud.status.idle.notClaude")
      .filter((el) => !el.className.includes("sr-only"));
    expect(visible).toHaveLength(1);
    expect(visible[0]!.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it("offers Skip to latest only when a newer reply is queued", () => {
    render(<ReadAloudControls />);

    setSnapshot({ status: "speaking", queuedSeconds: 4, queuedReplies: 0 });
    expect(screen.queryByRole("button", { name: "readAloud.skipToLatest" })).toBeNull();

    setSnapshot({ status: "speaking", queuedSeconds: 12, queuedReplies: 2 });
    fireEvent.click(screen.getByRole("button", { name: "readAloud.skipToLatest" }));
    expect(fake.handle.skipToLatest).toHaveBeenCalledTimes(1);
  });

  it("shows the queue and rate while catching up", () => {
    render(<ReadAloudControls />);

    setSnapshot({ status: "speaking", queuedSeconds: 45, queuedReplies: 3, effectiveRate: 1.35 });
    expect(screen.getByRole("group", { name: "readAloud.pill.label" })).toHaveTextContent(
      'readAloud.pill.catchingUp{"seconds":45,"rate":"1.35"}',
    );
    // Below lg the full hint is still there for screen readers, and the rate stays visible.
    const hints = screen.getAllByText('readAloud.pill.catchingUp{"seconds":45,"rate":"1.35"}');
    expect(hints.some((el) => el.className.includes("sr-only"))).toBe(true);
    expect(screen.getByText('readAloud.settings.rateValue{"rate":"1.35"}')).toHaveAttribute("aria-hidden", "true");

    setSnapshot({ status: "speaking", queuedSeconds: 25, queuedReplies: 1, effectiveRate: 1 });
    expect(screen.getByRole("group", { name: "readAloud.pill.label" })).toHaveTextContent(
      'readAloud.pill.queued{"seconds":25}',
    );

    setSnapshot({ status: "speaking", queuedSeconds: 5, queuedReplies: 1, effectiveRate: 1 });
    expect(screen.getByRole("group", { name: "readAloud.pill.label" })).not.toHaveTextContent("readAloud.pill");
  });

  it("puts nothing in a live region", () => {
    const { container } = render(<ReadAloudControls />);

    setSnapshot({ status: "speaking", sourceTitle: "Fix the login flow", queuedReplies: 1, queuedSeconds: 30 });

    expect(container.querySelectorAll("[aria-live], [role=status], [role=alert], [role=log]")).toHaveLength(0);
  });
});
