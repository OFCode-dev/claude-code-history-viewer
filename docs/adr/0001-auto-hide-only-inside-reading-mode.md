# 0001 — Auto-hide exists only inside reading mode

- **Status**: accepted
- **Date**: 2026-10-10
- **Spec**: `specs/20261010-reading-mode-autohide/spec.md`

## Context

The side panels (explorer and sessions, the prompts navigator) and the
conversation toolbar take width and height from long transcripts. Focus mode
folded them to 48 px rails and restored a snapshot on exit. The owner asked for
panels that hide at the window edges and come back on demand. Reviews of the
first plan found that auto-hide as a separate per-panel option, next to rails
and pins in the normal layout, gave three overlapping modes, showed a pressed
pin beside a rail chevron, and lost pins made during focus mode when the
snapshot was restored.

## Decision

Auto-hide is not a property of the normal layout. It exists only inside
reading mode, which replaces focus mode and keeps its shortcut (Mod+Shift+F).
Reading mode applies a saved reading profile that marks each group (left,
right, top) as auto-hidden or pinned; pin toggles appear only in reading mode
and edit that profile. Reading mode never writes the normal layout; the only
thing it remembers, to undo it, is whether the recent-edits dock was open.

## Consequences

- One source of truth per layout: the normal layout (rails, sashes, widths) and
  the reading profile never interfere, and a pin made in reading mode is there
  the next time.
- Rail buttons render only in the normal layout, pin toggles only in reading
  mode, so the two never appear together.
- Below 768 px reading mode does not apply (the drawers stay), but its state is
  kept for wider windows.
- The old `focus-mode-restore` snapshot is migrated once: it becomes the normal
  layout again and the person continues in reading mode.
