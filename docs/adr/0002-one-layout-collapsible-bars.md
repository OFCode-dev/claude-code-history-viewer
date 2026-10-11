# 0002 — One layout with thin collapsible bars; reading mode is "collapse all"

- **Status**: accepted
- **Date**: 2026-10-11
- **Supersedes**: [0001](0001-auto-hide-only-inside-reading-mode.md)

## Context

Reading mode (ADR 0001) gave the app two layouts: the normal one, with
48 px rails, and reading mode, where each panel group hid at the window edge
behind a hover-reveal overlay or stayed pinned. The owner found the two
modes contradictory and overlapping: a panel could be folded in one mode and
pinned in the other, the conversation toolbar could only hide in reading
mode, and an overlay state machine, hold plumbing in every portal component
and a reading profile existed only to keep the two apart. The owner asked
for efficiency: if every bar could collapse like an accordion and were as
thin as in reading mode, no separate mode would be needed.

## Decision

There is one layout with four collapsible areas, each with its own persisted
flag: explorer, sessions pane, prompts navigator, and the conversation tools
(search toolbar plus filter row, new key `conversation-tools-collapsed`).
Collapsed, an area is a thin bar in flow: a 24 px rail at the side (44 px on
coarse pointers) that keeps its expand button and accessories, or a 24 px
strip above the conversation that keeps the status chips. Nothing overlays
the transcript, and nothing reveals on hover.

"Reading mode" is a command, not a state: the header button and
Mod+Shift+F collapse all four areas while any is open, otherwise expand all
four. Nothing is snapshotted or restored, so the same press on the same
screen always does the same thing. Every collapse or expand keeps the reader
on the same message (one capture before, one restore after the synchronous
commit) and moves focus that was inside the changed area to that area's
toggle.

## Consequences

- One source of truth per area; the header button's pressed state is derived
  ("all four collapsed"), never stored.
- The auto-hide reducer, its DOM adapter, overlay widths, portal holds, pin
  toggles, the hover-reveal setting and the first-use hint are gone. The keys
  they wrote (`focus-mode-restore`, `reading-mode`, `reading-profile`,
  `panel-hover-reveal`, `reading-mode-hint-seen`) are removed from storage
  when the store is created.
- Showing or hiding a panel reflows the text; keeping the reader's place
  covers that.
- Below 768 px nothing changes: the drawers stay, and the conversation tools
  always show.
