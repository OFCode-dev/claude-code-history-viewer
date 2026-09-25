/**
 * Turns: a human prompt plus everything up to the next human prompt.
 *
 * Anchors are computed over whatever list is being rendered (the filtered,
 * flattened display list), so `messageIndex` always refers to that list.
 */
import type { ClaudeMessage } from "@/types";
import { isHumanPrompt } from "./userMessageKind";

export interface TurnAnchor {
  uuid: string;
  /** Index of the prompt in the list the anchors were built from. */
  messageIndex: number;
  /** 1-based position among the prompts of that list. */
  turnNumber: number;
  timestamp: string;
}

export function buildTurnAnchors(messages: readonly ClaudeMessage[]): TurnAnchor[] {
  const anchors: TurnAnchor[] = [];
  messages.forEach((message, messageIndex) => {
    if (isHumanPrompt(message)) {
      anchors.push({
        uuid: message.uuid,
        messageIndex,
        turnNumber: anchors.length + 1,
        timestamp: message.timestamp,
      });
    }
  });
  return anchors;
}

/** The turn containing `messageIndex`: the last anchor at or before it. */
export function findTurnForIndex(
  anchors: readonly TurnAnchor[],
  messageIndex: number
): TurnAnchor | null {
  let low = 0;
  let high = anchors.length - 1;
  let found: TurnAnchor | null = null;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const anchor = anchors[mid]!;
    if (anchor.messageIndex <= messageIndex) {
      found = anchor;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
