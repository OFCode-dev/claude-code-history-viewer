import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ClaudeProject, ClaudeSession } from "@/types";
import type { EngineSnapshot, ReadAloudSnapshot } from "@/services/readAloud";

const { fake, toastError } = vi.hoisted(() => {
  const snapshotListeners = new Set<() => void>();
  const availabilityListeners = new Set<() => void>();
  const fake = {
    snapshot: { status: "off", queuedSeconds: 0, queuedReplies: 0, effectiveRate: 1, skippedCount: 0 } as ReadAloudSnapshot,
    engine: { availability: "unknown", voices: [] } as EngineSnapshot,
    snapshotListeners,
    availabilityListeners,
    handle: {
      start: vi.fn(),
      stop: vi.fn(),
      setSource: vi.fn(),
      skipToLatest: vi.fn(),
      poke: vi.fn(),
      onVisible: vi.fn(),
      setPrefs: vi.fn(),
      prime: vi.fn(),
      probe: vi.fn(),
      subscribe: (listener: () => void) => {
        snapshotListeners.add(listener);
        return () => snapshotListeners.delete(listener);
      },
      getSnapshot: () => fake.snapshot,
      getAvailability: () => fake.engine,
      subscribeAvailability: (listener: () => void) => {
        availabilityListeners.add(listener);
        return () => availabilityListeners.delete(listener);
      },
    },
  };
  return { fake, toastError: vi.fn() };
});

vi.mock("@/services/readAloud", () => ({ readAloudHandle: fake.handle }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));
const t = (key: string, options?: Record<string, unknown>) =>
  options && "count" in options ? `${key}:${String(options.count)}` : key;

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t, i18n: { language: "en" } }),
}));

import { mainSessionPath, selectReadAloudSource, useReadAloud } from "./useReadAloud";
import { useAppStore } from "@/store/useAppStore";

const PROJECT_DIR = "/home/me/.claude/projects/-home-me-api";

const project: ClaudeProject = {
  name: "-home-me-api",
  path: PROJECT_DIR,
  actual_path: "/home/me/api",
  session_count: 2,
  message_count: 10,
  last_modified: "2026-10-20T10:00:00Z",
  provider: "claude",
};

function session(id: string, overrides: Partial<ClaudeSession> = {}): ClaudeSession {
  return {
    session_id: `${PROJECT_DIR}/${id}.jsonl`,
    actual_session_id: id,
    file_path: `${PROJECT_DIR}/${id}.jsonl`,
    project_name: "api",
    message_count: 3,
    first_message_time: "2026-10-20T10:00:00Z",
    last_message_time: "2026-10-20T11:00:00Z",
    last_modified: "2026-10-20T11:00:00Z",
    has_tool_use: false,
    has_errors: false,
    summary: `Summary ${id}`,
    ...overrides,
  };
}

const main = session("aaaa1111");
const other = session("bbbb2222");
const subagent = session("agent-x", {
  session_id: `${PROJECT_DIR}/aaaa1111/subagents/agent-x.jsonl`,
  file_path: `${PROJECT_DIR}/aaaa1111/subagents/agent-x.jsonl`,
  summary: "Explore the repo",
});

const untitled = (id: string) => `Session ${id}`;

function emitSnapshot(next: Partial<ReadAloudSnapshot>) {
  fake.snapshot = { ...fake.snapshot, ...next };
  act(() => fake.snapshotListeners.forEach((listener) => listener()));
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  fake.snapshot = { status: "off", queuedSeconds: 0, queuedReplies: 0, effectiveRate: 1, skippedCount: 0 };
  fake.engine = { availability: "unknown", voices: [] };
  useAppStore.setState({
    selectedProject: project,
    selectedSession: main,
    parentSessionStack: [],
    sessions: [main, other],
    messages: [],
    readAloudAvailability: "unknown",
    layoutAnnouncement: null,
  });
});

afterEach(() => {
  fake.snapshotListeners.clear();
  fake.availabilityListeners.clear();
});

describe("mainSessionPath", () => {
  it("maps a subagent transcript to its main session file", () => {
    expect(mainSessionPath(`${PROJECT_DIR}/aaaa1111/subagents/agent-x.jsonl`)).toBe(`${PROJECT_DIR}/aaaa1111.jsonl`);
    expect(mainSessionPath(`${PROJECT_DIR}/aaaa1111/subagents/workflows/wf_1/agent-y.jsonl`)).toBe(
      `${PROJECT_DIR}/aaaa1111.jsonl`,
    );
    expect(mainSessionPath("C:\\Users\\me\\.claude\\projects\\p\\s1\\subagents\\agent-x.jsonl")).toBe(
      "C:\\Users\\me\\.claude\\projects\\p\\s1.jsonl",
    );
  });

  it("leaves a main session path unchanged", () => {
    expect(mainSessionPath(main.file_path)).toBe(main.file_path);
  });

  it("ignores a `subagents` directory higher up the path", () => {
    const underSubagentsDir = "/srv/subagents/.claude/projects/p/s.jsonl";
    expect(mainSessionPath(underSubagentsDir)).toBe(underSubagentsDir);
    expect(mainSessionPath("/srv/subagents/.claude/projects/p/s1/subagents/agent-x.jsonl")).toBe(
      "/srv/subagents/.claude/projects/p/s1.jsonl",
    );
  });
});

describe("selectReadAloudSource", () => {
  const base = {
    selectedProject: project,
    selectedSession: main,
    parentSessionStack: [] as ClaudeSession[],
    sessions: [main, other],
    userMetadata: { sessions: {} },
  };

  it("is null without a selected session", () => {
    expect(selectReadAloudSource({ ...base, selectedSession: null }, untitled)).toBeNull();
  });

  it("uses the open main session with its rename over its summary", () => {
    const state = { ...base, userMetadata: { sessions: { [main.session_id]: { customName: "Login fix" } } } };

    expect(selectReadAloudSource(state, untitled)).toEqual({
      path: main.file_path,
      title: "Login fix",
      provider: "claude",
    });
  });

  it("keeps the parent main session inside a subagent view", () => {
    const state = { ...base, selectedSession: subagent, parentSessionStack: [main] };

    expect(selectReadAloudSource(state, untitled)).toEqual({
      path: main.file_path,
      title: "Summary aaaa1111",
      provider: "claude",
    });
  });

  it("resolves the parent from the subagent path while the stack is momentarily empty", () => {
    const state = { ...base, selectedSession: subagent, parentSessionStack: [] };

    expect(selectReadAloudSource(state, untitled)?.path).toBe(main.file_path);
    expect(selectReadAloudSource(state, untitled)?.title).toBe("Summary aaaa1111");
  });

  it("prefers the session's provider and falls back to the project's", () => {
    const codex = session("cccc3333", { provider: "codex" });
    expect(selectReadAloudSource({ ...base, selectedSession: codex }, untitled)?.provider).toBe("codex");
    expect(
      selectReadAloudSource({ ...base, selectedProject: { ...project, provider: "opencode" } }, untitled)?.provider,
    ).toBe("opencode");
  });
});

describe("useReadAloud", () => {
  it("probes the engine and mirrors availability into the store", () => {
    fake.engine = { availability: "ok", voices: [] };
    renderHook(() => useReadAloud());

    expect(fake.handle.probe).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().readAloudAvailability).toBe("ok");

    fake.engine = { availability: "noLocalVoice", voices: [] };
    act(() => fake.availabilityListeners.forEach((listener) => listener()));
    expect(useAppStore.getState().readAloudAvailability).toBe("noLocalVoice");
  });

  it("pushes the persisted preferences and translated cues", () => {
    renderHook(() => useReadAloud());

    const prefs = fake.handle.setPrefs.mock.lastCall?.[0];
    expect(prefs).toMatchObject({
      includeThinking: true,
      baseRate: 1,
      voiceURI: "auto",
      policy: "speedUp",
      maxRate: 1.6,
      catchUpThresholdSec: 20,
    });
    expect(prefs.cues.code).toBe("readAloud.cue.code");
    expect(prefs.cues.thinking).toBe("readAloud.cue.thinking");
    expect(prefs.cues.restSkipped).toBe("readAloud.cue.restSkipped");
    expect(prefs.cues.skipped(3)).toBe("readAloud.cue.skipped:3");

    act(() => useAppStore.getState().setReadAloudPolicy("readAll"));
    expect(fake.handle.setPrefs.mock.lastCall?.[0]).toMatchObject({ policy: "readAll" });
  });

  it("does not call the controller for a new object with the same file_path or for message updates", () => {
    renderHook(() => useReadAloud());
    const calls = fake.handle.setSource.mock.calls.length;
    const prefsCalls = fake.handle.setPrefs.mock.calls.length;

    act(() => useAppStore.setState({ selectedSession: { ...main, message_count: 99 } }));
    act(() => useAppStore.setState({ messages: [] }));

    expect(fake.handle.setSource.mock.calls.length).toBe(calls);
    expect(fake.handle.setPrefs.mock.calls.length).toBe(prefsCalls);
    expect(fake.handle.start).not.toHaveBeenCalled();
  });

  it("follows a different main session", () => {
    renderHook(() => useReadAloud());

    act(() => useAppStore.setState({ selectedSession: other }));

    expect(fake.handle.setSource).toHaveBeenLastCalledWith({
      path: other.file_path,
      title: "Summary bbbb2222",
      provider: "claude",
    });
  });

  it("keeps the source when a subagent of the same session opens and closes", () => {
    renderHook(() => useReadAloud());
    const calls = fake.handle.setSource.mock.calls.length;

    act(() => useAppStore.setState({ parentSessionStack: [main] }));
    act(() => useAppStore.setState({ selectedSession: subagent }));
    // navigateBackToParent pops the stack before it re-selects the parent.
    act(() => useAppStore.setState({ parentSessionStack: [] }));
    act(() => useAppStore.setState({ selectedSession: main }));

    expect(fake.handle.setSource.mock.calls.length).toBe(calls);
  });

  it("tells the controller when no session is open", () => {
    renderHook(() => useReadAloud());

    act(() => useAppStore.setState({ selectedSession: null }));

    expect(fake.handle.setSource).toHaveBeenLastCalledWith(null);
  });

  it("fetches at once when the tab becomes visible", () => {
    renderHook(() => useReadAloud());
    const visibility = vi.spyOn(document, "visibilityState", "get");

    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fake.handle.onVisible).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fake.handle.onVisible).toHaveBeenCalledTimes(1);

    visibility.mockRestore();
  });

  it("stops the mode on unmount", () => {
    const { unmount } = renderHook(() => useReadAloud());

    unmount();

    expect(fake.handle.stop).toHaveBeenCalledTimes(1);
  });

  it("shows one toast per engine error episode", () => {
    renderHook(() => useReadAloud());

    emitSnapshot({ status: "speaking", engineError: "synthesis-failed" });
    emitSnapshot({ status: "speaking", engineError: "audio-busy" });
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith("readAloud.engineError");

    emitSnapshot({ status: "listening", engineError: undefined });
    emitSnapshot({ status: "speaking", engineError: "synthesis-failed" });
    expect(toastError).toHaveBeenCalledTimes(2);
  });

  it("announces unspoken state changes (reconnecting, recovered, paused) but never spoken text", () => {
    renderHook(() => useReadAloud());
    const announced = () => useAppStore.getState().layoutAnnouncement?.text;

    emitSnapshot({ status: "listening" });
    expect(announced()).toBeUndefined();

    emitSnapshot({ status: "reconnecting" });
    expect(announced()).toBe("readAloud.status.reconnecting");

    emitSnapshot({ status: "listening" });
    expect(announced()).toBe("readAloud.announce.recovered");

    emitSnapshot({ status: "idle", idleReason: "notClaude" });
    expect(announced()).toBe("readAloud.status.idle.notClaude");
  });
});
