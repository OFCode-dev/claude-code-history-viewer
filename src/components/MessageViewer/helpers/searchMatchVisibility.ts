/**
 * Session-search matches under the message display filter.
 *
 * Session search runs over the complete session, but the list only renders
 * what the display filter keeps (see applyMessageDisplayFilter). A match in a
 * record the filter hides cannot be scrolled to or highlighted, so navigation
 * must skip it; the caller reports how many were skipped instead.
 */
import type { ClaudeMessage } from "../../../types";
import type { MessageFilter } from "../../../store/slices/filterSlice";
import type { SearchFilterType, SearchMatch } from "../../../store/slices/types";
import { linearSearchMessages } from "../../../utils/searchIndex";
import { applyMessageDisplayFilter } from "./messageDisplayFilter";

export interface FilteredSearchMatches {
  /** Matches in records the filter shows, in their original order. */
  visible: SearchMatch[];
  /** Number of matches in records (or parts of records) the filter hides. */
  hiddenCount: number;
}

/**
 * Split matches into the ones the display filter shows and a hidden count.
 *
 * A record the filter keeps but trims (the dialogue view reduces assistant
 * records to their prose; the content toggles drop hidden blocks such as
 * thinking or tool calls) is searched again as displayed, so its match
 * indices line up with the highlights actually rendered and matches in the
 * trimmed-away blocks count as hidden.
 */
export function filterSearchMatches(
  matches: SearchMatch[],
  messages: ClaudeMessage[],
  messageFilter: MessageFilter,
  query: string,
  filterType: SearchFilterType,
): FilteredSearchMatches {
  if (matches.length === 0) return { visible: matches, hiddenCount: 0 };

  const shown = applyMessageDisplayFilter(messages, messageFilter);
  if (shown === messages) return { visible: matches, hiddenCount: 0 };

  const shownByUuid = new Map(shown.map((message) => [message.uuid, message]));
  const matchCountByUuid = new Map<string, number>();
  for (const match of matches) {
    matchCountByUuid.set(match.messageUuid, (matchCountByUuid.get(match.messageUuid) ?? 0) + 1);
  }
  const visible: SearchMatch[] = [];
  const researched = new Set<string>();
  let hiddenCount = 0;

  for (const match of matches) {
    const displayed = shownByUuid.get(match.messageUuid);
    if (!displayed) {
      hiddenCount++;
      continue;
    }
    if (displayed === messages[match.messageIndex]) {
      visible.push(match);
      continue;
    }
    // Trimmed record: replace all of its matches once, with the ones in the
    // displayed content.
    if (researched.has(match.messageUuid)) continue;
    researched.add(match.messageUuid);
    const originalCount = matchCountByUuid.get(match.messageUuid) ?? 0;
    const displayedMatches = linearSearchMessages([displayed], query, filterType).map(
      (result) => ({
        messageUuid: match.messageUuid,
        messageIndex: match.messageIndex,
        matchIndex: result.matchIndex,
        matchCount: result.matchCount,
      }),
    );
    visible.push(...displayedMatches);
    hiddenCount += Math.max(originalCount - displayedMatches.length, 0);
  }

  return { visible, hiddenCount };
}
