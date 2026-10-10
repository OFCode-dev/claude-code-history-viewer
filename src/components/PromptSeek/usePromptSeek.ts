import { useAppStore } from "@/store/useAppStore";
import {
  selectPromptJumpTarget,
  useViewportAnchorStore,
  type PromptJumpDirection,
} from "@/store/viewportAnchorStore";

export interface PromptSeekState {
  /** The open conversation has prompts to step through (or may, on earlier pages). */
  available: boolean;
  /** Nowhere to go in that direction: the button stays focusable but inert. */
  atEnd: Record<PromptJumpDirection, boolean>;
}

/**
 * Whether the previous / next prompt buttons apply, and which direction has
 * reached its end. Reads the same prompt track and the same jump rule as
 * Alt+Up / Alt+Down, so the buttons can never disagree with the shortcuts.
 * A partly loaded session has no "start": the previous button loads the
 * earlier messages there.
 */
export function usePromptSeek(): PromptSeekState {
  const selectedSessionPath = useAppStore((s) => s.selectedSession?.file_path ?? null);
  const hasMore = useAppStore((s) => s.pagination.hasMore);
  const promptTrack = useViewportAnchorStore((s) => s.promptTrack);
  const sessionPath = useViewportAnchorStore((s) => s.sessionPath);
  const anchorUuid = useViewportAnchorStore((s) => s.anchorUuid);
  const lastJump = useViewportAnchorStore((s) => s.lastJump);

  const track =
    promptTrack && promptTrack.sessionPath === selectedSessionPath ? promptTrack : null;
  const available = track != null && (track.anchors.length > 0 || hasMore);
  if (!available) return { available, atEnd: { previous: true, next: true } };

  const position = { promptTrack: track, sessionPath, anchorUuid, lastJump };
  return {
    available,
    atEnd: {
      previous: !hasMore && selectPromptJumpTarget(position, "previous") == null,
      next: selectPromptJumpTarget(position, "next") == null,
    },
  };
}
