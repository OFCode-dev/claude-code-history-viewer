/**
 * Where the reader is in the open conversation.
 *
 * The message viewer publishes the first visible message row (the "anchor")
 * and the prompts of the list it renders; the navigator's scroll-spy, the
 * sticky prompt bar and the Alt+Up/Down shortcuts read from here.
 *
 * Kept out of the main app store on purpose: the anchor changes while the
 * user scrolls, and many components subscribe to the whole app store, so
 * publishing there would re-render them on scroll. Subscribers here select
 * one field each.
 */
import { create } from "zustand";
import type { ClaudeMessage } from "../types";
import { buildTurnAnchors, findTurnForIndex, type TurnAnchor } from "../utils/turns";

/** The prompts of the rendered list, and an index to place any row among them. */
export interface PromptTrack {
  sessionPath: string;
  /**
   * The list the conversation renders (after display filters). Views that
   * navigate into the conversation, such as the navigator's Prompts list,
   * build from it so every row they offer has a row to scroll to.
   */
  messages: ClaudeMessage[];
  anchors: TurnAnchor[];
  indexByUuid: Map<string, number>;
}

export type PromptJumpDirection = "previous" | "next";

/** Rapid repeated jumps continue from the last target, not the stale viewport. */
const JUMP_CHAIN_WINDOW_MS = 1200;

export interface ViewportAnchorState {
  sessionPath: string | null;
  /** First visible message row of the conversation. */
  anchorUuid: string | null;
  /** Prompt of the turn containing the anchor. */
  activePromptUuid: string | null;
  promptTrack: PromptTrack | null;
  lastJump: { sessionPath: string; uuid: string; at: number } | null;

  publishAnchor: (sessionPath: string, uuid: string | null) => void;
  setPromptTrack: (track: PromptTrack | null) => void;
  /**
   * The prompt to jump to from the current position, or null at either end.
   * Records the jump so a quick second press continues from it.
   */
  takePromptJump: (direction: PromptJumpDirection, now?: number) => string | null;
  /**
   * Note a jump to a prompt made some other way (the sticky bar's buttons),
   * so a quick Alt+Up/Down afterwards continues from it.
   */
  recordPromptJump: (uuid: string, now?: number) => void;
  reset: () => void;
}

export function buildPromptTrack(
  sessionPath: string,
  messages: ClaudeMessage[]
): PromptTrack {
  const indexByUuid = new Map<string, number>();
  messages.forEach((message, index) => indexByUuid.set(message.uuid, index));
  return { sessionPath, messages, anchors: buildTurnAnchors(messages), indexByUuid };
}

/** The prompt of the turn containing `anchorUuid`, when both belong to `track`. */
export function resolveActivePrompt(
  track: PromptTrack | null,
  sessionPath: string | null,
  anchorUuid: string | null
): TurnAnchor | null {
  if (!track || !anchorUuid || track.sessionPath !== sessionPath) return null;
  const index = track.indexByUuid.get(anchorUuid);
  if (index === undefined) return null;
  return findTurnForIndex(track.anchors, index);
}

/**
 * The prompt strictly before / after list position `fromIndex`. With no
 * position, "next" starts at the first prompt and "previous" has nowhere to go.
 */
export function resolvePromptJump(
  anchors: readonly TurnAnchor[],
  fromIndex: number | null,
  direction: PromptJumpDirection
): TurnAnchor | null {
  if (fromIndex === null) {
    return direction === "next" ? (anchors[0] ?? null) : null;
  }
  if (direction === "next") {
    return anchors.find((anchor) => anchor.messageIndex > fromIndex) ?? null;
  }
  for (let i = anchors.length - 1; i >= 0; i--) {
    if (anchors[i]!.messageIndex < fromIndex) return anchors[i]!;
  }
  return null;
}

/**
 * Where a previous / next prompt jump would land from the current position,
 * without taking it: the same rule as `takePromptJump`, so controls can show
 * that a direction has nowhere to go. A recent jump is the position, so rapid
 * presses chain; otherwise the first visible row is.
 */
export function selectPromptJumpTarget(
  state: Pick<ViewportAnchorState, "promptTrack" | "sessionPath" | "anchorUuid" | "lastJump">,
  direction: PromptJumpDirection,
  now: number = Date.now()
): TurnAnchor | null {
  const { promptTrack: track, sessionPath, anchorUuid, lastJump } = state;
  if (!track || track.anchors.length === 0) return null;

  const chained =
    lastJump !== null &&
    lastJump.sessionPath === track.sessionPath &&
    now - lastJump.at < JUMP_CHAIN_WINDOW_MS
      ? lastJump.uuid
      : null;
  const fromUuid = chained ?? (sessionPath === track.sessionPath ? anchorUuid : null);
  const fromIndex = fromUuid !== null ? (track.indexByUuid.get(fromUuid) ?? null) : null;
  return resolvePromptJump(track.anchors, fromIndex, direction);
}

/**
 * The sticky prompt bar shows while the current turn's prompt has scrolled
 * above the viewport, i.e. the first visible row is not the prompt itself.
 */
export function selectIsPromptBarVisible(state: ViewportAnchorState): boolean {
  return (
    state.activePromptUuid !== null &&
    state.anchorUuid !== null &&
    state.activePromptUuid !== state.anchorUuid
  );
}

const initialState = {
  sessionPath: null,
  anchorUuid: null,
  activePromptUuid: null,
  promptTrack: null,
  lastJump: null,
} satisfies Partial<ViewportAnchorState>;

export const useViewportAnchorStore = create<ViewportAnchorState>((set, get) => ({
  ...initialState,

  publishAnchor: (sessionPath, uuid) => {
    const state = get();
    if (state.sessionPath === sessionPath && state.anchorUuid === uuid) return;
    const active = resolveActivePrompt(state.promptTrack, sessionPath, uuid);
    set({
      sessionPath,
      anchorUuid: uuid,
      activePromptUuid: active?.uuid ?? null,
    });
  },

  setPromptTrack: (track) => {
    const state = get();
    const active = resolveActivePrompt(track, state.sessionPath, state.anchorUuid);
    set({ promptTrack: track, activePromptUuid: active?.uuid ?? null });
  },

  takePromptJump: (direction, now = Date.now()) => {
    const state = get();
    const target = selectPromptJumpTarget(state, direction, now);
    if (!target || !state.promptTrack) return null;
    set({ lastJump: { sessionPath: state.promptTrack.sessionPath, uuid: target.uuid, at: now } });
    return target.uuid;
  },

  recordPromptJump: (uuid, now = Date.now()) => {
    const track = get().promptTrack;
    if (!track || !track.indexByUuid.has(uuid)) return;
    set({ lastJump: { sessionPath: track.sessionPath, uuid, at: now } });
  },

  reset: () => set(initialState),
}));
