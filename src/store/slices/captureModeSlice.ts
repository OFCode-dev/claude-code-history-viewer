/**
 * Capture Mode Slice
 *
 * Handles capture mode state for hiding message blocks during screenshot capture.
 * Uses explorer-style multi-selection with Shift (range) and Cmd/Ctrl (toggle).
 */

import type { StateCreator } from "zustand";
import type { FullAppStore } from "./types";
import { getRange } from "../../utils/selection";

// ============================================================================
// State Interface
// ============================================================================

export interface CaptureModeSliceState {
  /** Whether capture mode is currently active */
  isCaptureMode: boolean;
  /** List of hidden message UUIDs (persisted across mode toggles) */
  hiddenMessageIds: string[];
  /** Selected message UUIDs (ordered by selection) */
  selectedMessageIds: string[];
  /** UUID of the selection anchor (for Shift range selection) */
  selectionAnchor: string | null;
  /** True during image generation (loading state) */
  isCapturing: boolean;
}

export interface CaptureModeSliceActions {
  /** Enter capture mode - hidden messages become invisible */
  enterCaptureMode: () => void;
  /** Exit capture mode - hidden messages become visible again (list preserved) */
  exitCaptureMode: () => void;
  /** Add a message to the hidden list */
  hideMessage: (uuid: string) => void;
  /** Remove a message from the hidden list */
  showMessage: (uuid: string) => void;
  /** Restore multiple messages by their UUIDs */
  restoreMessages: (uuids: string[]) => void;
  /** Clear all hidden messages */
  restoreAllMessages: () => void;
  /** Handle a selection click with modifier keys */
  handleSelectionClick: (
    uuid: string,
    orderedUuids: string[],
    modifiers: { shift: boolean; cmdOrCtrl: boolean },
  ) => void;
  /** Clear current selection */
  clearSelection: () => void;
  /** Set capturing loading state */
  setIsCapturing: (v: boolean) => void;
}

export type CaptureModeSlice = CaptureModeSliceState & CaptureModeSliceActions;

// ============================================================================
// Initial State
// ============================================================================

const initialCaptureModeState: CaptureModeSliceState = {
  isCaptureMode: false,
  hiddenMessageIds: [],
  selectedMessageIds: [],
  selectionAnchor: null,
  isCapturing: false,
};

// ============================================================================
// Slice Creator
// ============================================================================

export const createCaptureModeSlice: StateCreator<
  FullAppStore,
  [],
  [],
  CaptureModeSlice
> = (set, get) => ({
  ...initialCaptureModeState,

  enterCaptureMode: () => {
    set({ isCaptureMode: true });
  },

  exitCaptureMode: () => {
    set({
      isCaptureMode: false,
      selectedMessageIds: [],
      selectionAnchor: null,
      isCapturing: false,
    });
  },

  hideMessage: (uuid: string) => {
    const { hiddenMessageIds } = get();
    if (!hiddenMessageIds.includes(uuid)) {
      set({ hiddenMessageIds: [...hiddenMessageIds, uuid] });
    }
  },

  showMessage: (uuid: string) => {
    const { hiddenMessageIds } = get();
    set({
      hiddenMessageIds: hiddenMessageIds.filter((id) => id !== uuid),
    });
  },

  restoreMessages: (uuids: string[]) => {
    const { hiddenMessageIds } = get();
    const uuidSet = new Set(uuids);
    set({
      hiddenMessageIds: hiddenMessageIds.filter((id) => !uuidSet.has(id)),
    });
  },

  restoreAllMessages: () => {
    set({ hiddenMessageIds: [] });
  },

  handleSelectionClick: (
    uuid: string,
    orderedUuids: string[],
    { shift, cmdOrCtrl },
  ) => {
    const { selectedMessageIds, selectionAnchor } = get();

    if (!shift && !cmdOrCtrl) {
      // Plain click: select only this message, set anchor
      set({ selectedMessageIds: [uuid], selectionAnchor: uuid });
      return;
    }

    if (cmdOrCtrl && !shift) {
      // Cmd/Ctrl click: toggle individual, set anchor
      const existing = new Set(selectedMessageIds);
      if (existing.has(uuid)) {
        existing.delete(uuid);
      } else {
        existing.add(uuid);
      }
      set({ selectedMessageIds: [...existing], selectionAnchor: uuid });
      return;
    }

    if (shift && !cmdOrCtrl) {
      // Shift click: replace selection with range from anchor to clicked
      const anchor = selectionAnchor ?? uuid;
      const range = getRange(orderedUuids, anchor, uuid);
      set({ selectedMessageIds: range });
      // Anchor stays
      return;
    }

    // Shift + Cmd/Ctrl: add range to existing selection
    const anchor = selectionAnchor ?? uuid;
    const range = getRange(orderedUuids, anchor, uuid);
    const merged = new Set(selectedMessageIds);
    for (const id of range) {
      merged.add(id);
    }
    set({ selectedMessageIds: [...merged] });
    // Anchor stays
  },

  clearSelection: () => {
    set({ selectedMessageIds: [], selectionAnchor: null });
  },

  setIsCapturing: (v: boolean) => {
    set({ isCapturing: v });
  },
});
