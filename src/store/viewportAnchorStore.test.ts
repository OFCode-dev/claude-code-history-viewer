import { beforeEach, describe, expect, it } from "vitest";
import type { ClaudeMessage } from "../types";
import {
  buildPromptTrack,
  resolveActivePrompt,
  resolvePromptJump,
  selectIsPromptBarVisible,
  useViewportAnchorStore,
} from "./viewportAnchorStore";

const msg = (uuid: string, type: "user" | "assistant", content: unknown): ClaudeMessage =>
  ({ uuid, type, content, timestamp: "2026-09-25T10:00:00Z" }) as unknown as ClaudeMessage;

// p1 a1 r1 p2 a2 p3 a3
const messages = [
  msg("p1", "user", "First question"),
  msg("a1", "assistant", [{ type: "text", text: "answer" }]),
  msg("r1", "user", [{ type: "tool_result", tool_use_id: "x", content: "ok" }]),
  msg("p2", "user", "Second question"),
  msg("a2", "assistant", [{ type: "text", text: "answer" }]),
  msg("p3", "user", "Third question"),
  msg("a3", "assistant", [{ type: "text", text: "answer" }]),
];
const SESSION = "/sessions/one.jsonl";

describe("scroll-spy mapping", () => {
  const track = buildPromptTrack(SESSION, messages);

  it("maps the first visible row to the prompt of its turn", () => {
    expect(resolveActivePrompt(track, SESSION, "p1")?.uuid).toBe("p1");
    expect(resolveActivePrompt(track, SESSION, "r1")?.uuid).toBe("p1");
    expect(resolveActivePrompt(track, SESSION, "a2")?.uuid).toBe("p2");
    expect(resolveActivePrompt(track, SESSION, "a3")?.uuid).toBe("p3");
  });

  it("returns null for rows outside the list or another session", () => {
    expect(resolveActivePrompt(track, SESSION, "missing")).toBeNull();
    expect(resolveActivePrompt(track, "/sessions/other.jsonl", "a2")).toBeNull();
    expect(resolveActivePrompt(null, SESSION, "a2")).toBeNull();
  });

  it("returns null before the first prompt", () => {
    const withPreamble = buildPromptTrack(SESSION, [
      msg("s0", "assistant", [{ type: "text", text: "hello" }]),
      ...messages,
    ]);
    expect(resolveActivePrompt(withPreamble, SESSION, "s0")).toBeNull();
  });
});

describe("resolvePromptJump", () => {
  const { anchors } = buildPromptTrack(SESSION, messages);

  it("goes to the prompt strictly after / before a position", () => {
    expect(resolvePromptJump(anchors, 1, "next")?.uuid).toBe("p2");
    expect(resolvePromptJump(anchors, 3, "next")?.uuid).toBe("p3");
    expect(resolvePromptJump(anchors, 4, "previous")?.uuid).toBe("p2");
    expect(resolvePromptJump(anchors, 3, "previous")?.uuid).toBe("p1");
  });

  it("stops at either end", () => {
    expect(resolvePromptJump(anchors, 5, "next")).toBeNull();
    expect(resolvePromptJump(anchors, 0, "previous")).toBeNull();
  });

  it("starts from the first prompt without a position", () => {
    expect(resolvePromptJump(anchors, null, "next")?.uuid).toBe("p1");
    expect(resolvePromptJump(anchors, null, "previous")).toBeNull();
  });
});

describe("useViewportAnchorStore", () => {
  beforeEach(() => {
    useViewportAnchorStore.getState().reset();
    useViewportAnchorStore.getState().setPromptTrack(buildPromptTrack(SESSION, messages));
  });

  it("derives the active prompt and the prompt bar from the anchor", () => {
    const store = useViewportAnchorStore;

    store.getState().publishAnchor(SESSION, "p2");
    expect(store.getState().activePromptUuid).toBe("p2");
    expect(selectIsPromptBarVisible(store.getState())).toBe(false);

    store.getState().publishAnchor(SESSION, "a2");
    expect(store.getState().activePromptUuid).toBe("p2");
    expect(selectIsPromptBarVisible(store.getState())).toBe(true);
  });

  it("does not notify subscribers when the anchor is unchanged", () => {
    const store = useViewportAnchorStore;
    store.getState().publishAnchor(SESSION, "a1");
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications++;
    });

    store.getState().publishAnchor(SESSION, "a1");
    store.getState().publishAnchor(SESSION, "a1");
    unsubscribe();

    expect(notifications).toBe(0);
  });

  it("jumps from the viewport and chains quick repeated jumps", () => {
    const store = useViewportAnchorStore;
    store.getState().publishAnchor(SESSION, "a1");

    expect(store.getState().takePromptJump("next", 1000)).toBe("p2");
    // The viewport has not caught up yet; the second press continues from p2.
    expect(store.getState().takePromptJump("next", 1300)).toBe("p3");
    expect(store.getState().takePromptJump("next", 1500)).toBeNull();
    // Long after, the viewport position counts again.
    expect(store.getState().takePromptJump("previous", 10_000)).toBe("p1");
  });

  it("does nothing without prompts", () => {
    const store = useViewportAnchorStore;
    store.getState().setPromptTrack(null);
    expect(store.getState().takePromptJump("next")).toBeNull();
  });
});
