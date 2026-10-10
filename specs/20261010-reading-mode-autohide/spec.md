# Auto-hiding panels and reading mode: final design spec

Status: **approved by the owner on 2026-10-10** ("verify it is the best UX with an orchestra, then treat it as approved and build it"). Owner decisions resolved: (a) full width, no reading-width cap; (b) default hover reveal Standard. Four adversarial reviews fed into it: two from Claude, one from Gemini and one from Codex. Branch `feature/ui-refresh` at `9b15af24`. Every code fact in §1 was checked at that commit. Objection IDs such as S1 or C8 refer to the Objection log at the end.

---

## 1. Decision summary

**Kept from the draft plan**
- A hidden panel comes back as an overlay, so showing and hiding it never reflows the text.
- Reading mode replaces focus mode and keeps its shortcut, Mod+Shift+F. One action hides the panels, and leaving reading mode brings back the earlier layout.
- Hover reveal waits for the pointer to stop. Leaving the panel starts a grace period, and Esc closes it. Hidden content is `inert` and stays mounted.
- The owner's decisions stand:
  - The left edge reveals Explorer and Sessions together, as one group.
  - In reading mode, the conversation toolbar and the filter row auto-hide at the top of the conversation column.

**Changed after review**

| # | Change | Why (objections) |
|---|---|---|
| 1 | Auto-hide exists only inside reading mode. Reading mode applies a saved profile that marks each group (left, right, top) as auto-hide or pinned; by default all three auto-hide. Pin toggles appear only in reading mode and change that profile. Reading mode never writes to the normal layout. The one thing it remembers, so it can undo it, is whether the recent-edits dock was open | One source of truth. A pin made in reading mode is still there next time. The normal layout never shows a pressed pin beside the rail chevron (I5, C8) |
| 2 | The overlay opens next to its gutter, never on top of it. The handle stays visible, swaps its icon and works as the close control | The draft covered the handle even while it had focus (S1, S4) |
| 3 | Hover reveals a panel only from a handle band: the top 96 px of a side gutter, or the handle itself at the top. Clicking anywhere else on a gutter opens the panel | People park the cursor in empty gutter space (I2) |
| 4 | If the transcript scrolls while the pointer is in a zone, that zone stops reacting until the pointer leaves it | A 500 ms veto only delayed the accidental reveal (I2, C9) |
| 5 | Panels stay open based on what can be observed, not on a guess about the input device. Focus in a text field always holds the panel open. Any other focus holds it until the pointer has moved 24 px since focus arrived | A field focused by mouse closed while the person typed. Screen-reader activation could look like pointer input (I1, S2, C4) |
| 6 | How long a panel stays open is defined for each way of opening it: hover, mouse click, sticky (touch, or hover reveal Off) and keyboard | Click and touch lifetimes were unpredictable, and touch closed the panel after every tap (C7, S3) |
| 7 | Hover never closes an overlay that is already open. Explicit opens switch panels, and focus moves first | A stray hover could close a panel the person was typing in (C2) |
| 8 | A panel's boundary is the panel, its gutter and the menus or dialogs it opened in portals. The window losing focus does not count as focus leaving the panel | Moving focus into a menu or dialog opened from the panel closed the panel (C1, G3) |
| 9 | A click that dismisses an overlay never presses a control in the transcript. Clicks on text still place the caret and start selections | Dismiss clicks expanded tool results or followed links (I6, S4) |
| 10 | Search works while the toolbar is hidden. Mod+G and F3 step through matches. The chips are buttons, and the search chip has ↑/↓. Mod+F never closes the toolbar | The most-used toolbar task had no way in (I3, I4, C10) |
| 11 | A hover speed setting (Off, Standard, Slow) sits in the header settings menu beside Theme and Font. The first-use hint also offers "Turn off hover reveal" | People using magnifiers or gaze input could not reach the opt-out (S5) |
| 12 | Warm re-entry: going back to the same panel within 2 s of it closing on pointer leave opens it after 150 ms | Moving between sessions paid the full wait each time (I7) |
| 13 | On close, focus moves only if it sits in the part becoming inert. After Esc, the shortcut or the handle closes a panel opened from the keyboard, focus returns to where it was before. In every other case it goes to the group's handle | Sending focus to `#main-content` lost the person's place (S6, G2) |
| 14 | No hover reveal within 1 s of a key press. Navigation keys close an overlay that hover opened | A parked mouse could cover keyboard focus (S10, G6) |
| 15 | Accessibility fixes: inset focus rings; pin names per group; tooltip text that starts with the accessible name; focusable chips with full-text tooltips in a strip that sets a minimum height, not a fixed one; a labelled region for each hidden group; a first-use toast that replaces the announcement instead of repeating it; Esc layering that also covers the image lightbox and the hidden-blocks popover | S7–S11, I8, G5, C17 |
| 16 | §6 lists each design intent and the check that will confirm it. It claims no WCAG or ISO conformance. 2.4.12 and 3.2.3 are removed, 2.2.1 is marked not applicable, ISO 9241-171 is cited by principle only, and the existing 2.5.7 gap in the sashes is recorded | S12, G7, C3, C15 |

**Rejected** (reasons are in the Objection log):
- **Limiting reading mode to 1024 px and up.** Drawers exist only below 768 px, and today's focus mode already works from 768 px.
- **Putting the top handle inside the sticky prompt bar.** That bar is not always shown, so the handle would jump.
- **Dropping Mod+F.** The transcript is virtualized, so browser find misses messages that are not rendered. In the WebUI, pressing Mod+F again while the search field is focused and fully selected hands the key to browser find.
- **Gutters with `pointer-events: none` for wheel scrolling.** The gutter sits next to the scroller, not inside it.

**Code facts this plan relies on** (checked at `9b15af24`)
- **Breakpoints.**
  - Drawers appear only below 768 px (`useIsMobile` uses max-width 767).
  - From 768 px the Explorer is a pinned sidebar with sessions listed inside it. The Sessions pane starts at 1024 px (`useIsLgUp`).
  - Focus mode works from 768 px (`!isMobile`; the button is `hidden md:inline-flex`).
- **Rails.** A closed navigator is a 48 px rail (`isCollapsed={!isNavigatorOpen}`), so today's focus mode leaves three rails on screen.
- **Prompt bar.** `StickyPromptBar` is `absolute inset-x-0 top-0 z-20` and renders only inside a long turn.
- **Modifier key.** `isActionModifier()` in `src/utils/platform.ts` already means Cmd on macOS and Ctrl elsewhere. `usePlatform()` has no OS field.
- **Where settings live.** App preferences live in the header settings dropdown (`src/layouts/Header/SettingDropdown/*MenuGroup.tsx`). `SettingsManager` edits Claude Code's own settings files.
- **Tooltips** open with `delayDuration = 0` (`src/components/ui/tooltip.tsx`).
- **Position restore.** `usePositionRestore` already stops its 50/200/450 ms restore passes on wheel, touchstart and keydown.
- **Esc handling today.**
  - These listen for Esc on `document` and do not call `preventDefault`: `ImageRenderer.tsx:60`, `HiddenBlocksIndicator.tsx:100`, `ProjectContextMenu.tsx:48`, `SessionContextMenu.tsx:74` and `SessionSelectionBar.tsx:109`.
  - These already call it: `ScreenshotPreviewModal.tsx:70` and `useSessionEditing.ts:136`.
  - `ExplorerSearch` clears and blurs on every Esc. The conversation search clears on every Esc without `preventDefault`. The navigator filter ignores Esc.
- **Mobile behaviour.** Choosing a session closes the mobile drawer (`ProjectTree/index.tsx`, `handleSessionSelect`). The mobile navigator sheet stays open after a jump.

**Owner decisions (resolved 2026-10-10)**
- (a) **Line length in reading mode:** full width, no cap.
- (b) **Default hover reveal:** Standard.

**How this spec was produced:** four research agents (standards, timing and motor control, product precedents, codebase), one synthesis, four adversarial reviews (two Claude, Gemini 3.1 Pro via agy, Codex gpt-6.1-sol), one final judge (48 objections: 28 accepted, 14 partial, 6 rejected). An independent proposal from Claude Opus via agy agreed on the core design. Research reports live in the session's scratch folder, not in the repo.

---

## 2. Interaction model

### 2.1 Modes

| Layout | Each group | How you get there |
|---|---|---|
| **Normal** (default) | Exactly as today: pinned, with rails and sashes. No gutters, no pin toggles | It is the default; leaving reading mode returns here |
| **Reading mode** | Follows the reading profile. **Auto-hide**: a 24 px gutter or strip, with the overlay on demand. **Pinned**: in flow, expanded at its saved width, with its sash and without a rail button | Mod+Shift+F, or the header "Reading mode" button (`aria-pressed`) |

- **Groups**
  - **Left.** At 1024 px and up: the Explorer plus the Sessions pane. The pane appears only when a project is selected and the view is not Settings or Archive. From 768 to 1023 px: the Explorer with sessions listed inside it. The overlay always shows them expanded.
  - **Right.** The Prompts navigator. It exists only in the transcript view with a session open, which is where it renders today.
  - **Top.** The conversation toolbar plus `FilterToolbar`. It exists only while `MessageViewer` is showing a conversation.
- **Below 768 px** nothing changes. The drawers stay, the button is hidden and the shortcut does nothing. The reading-mode state is kept and applies again when the window is wider.
- **Reading profile.** `{left, right, top}`, each `autohide | pinned`. Defaults to all `autohide`. Saved as `reading-profile`.
- **Entering**
  1. Capture the transcript anchor, `{uuid, offset}`.
  2. If focus is in a group that becomes auto-hidden, move it to `#main-content` (`preventScroll`). The button and the shortcut share this path.
  3. Note whether the recent-edits dock is open, then close it.
  4. Apply the profile. Every zone starts disarmed (§2.5).
  5. Restore the anchor and announce (§2.7).
- **Exiting.** Only Mod+Shift+F or the button end reading mode. Esc, session changes and timers never do.
  1. Capture the anchor.
  2. If focus is in a group that will be a rail in the normal layout, move it to `#main-content`.
  3. The normal layout comes back unchanged. If the dock was open on entry and is still closed, reopen it. A dock the person opened during reading mode just stays open.
  4. Restore the anchor and announce.
- **Persistence.** `reading-mode` stores `{"on": boolean, "restoreDock": boolean}`, so reading mode survives a reload.
- **Layout switches** (enter, exit, pin, unpin) are deliberate, so one reflow is acceptable. For each switch:
  1. Capture the anchor.
  2. Switch instantly; never animate width.
  3. Restore the anchor with the existing pass pattern.
  4. Stop restoring on wheel, touchstart, keydown, a pointerdown on the scrollbar, or a new jump target.

### 2.2 What is visible while a group is hidden

- **Left gutter**
  - Size and look: 24 px wide, in flow, the full height of the content row. Opaque `bg-sidebar`, with a 1 px `border-border/50` on the transcript side.
  - The gutter paints above its own overlay, so the overlay slides out from under it.
  - **Handle**
    - A 24×48 `<button>` at the top of the gutter, 8 px below the top of the row, where the Explorer header appears.
    - Icon `PanelLeftOpen`, which becomes `PanelLeftClose` while open. Colour `text-muted-foreground`, with at least 3:1 contrast in both themes.
  - **Hover band**: the top 96 px of the gutter. Below the band, the gutter responds only to clicks.
  - The wheel over the gutter scrolls the transcript.
- **Right gutter**: the mirror image, at the window's right edge. The recent-edits dock is closed in reading mode, so nothing sits beyond it. Icons `PanelRightOpen` and `PanelRightClose`.
- **Top strip**
  - In flow at the top of the conversation column, above the transcript area and so above `StickyPromptBar`. Uses `min-height: 24px`.
  - **Handle**: a 48×24 `<button>`, centred, with icons `SlidersHorizontal` and `ChevronDown` (`ChevronUp` while open). Only the handle responds to hover.
  - **Status chips** sit on the left. They appear only when the state differs from the default, and they truncate before they reach the handle. There are three:
    - Search: `"<q>" 3/14`, with ↑ and ↓ match buttons.
    - `Dialogue`, while Dialogue is on.
    - `Filters: n`, while message types are hidden.
  - **Chip behaviour**
    - Each chip is a `<button>`. Its accessible name and tooltip carry the full text.
    - Activating a chip opens the top overlay and focuses that chip's control: the search input with its text selected, the Dialogue toggle, or the first filter control.
    - The ↑ and ↓ buttons step through matches without opening anything.
- **Handle tooltips**
  - **When they show**: always on keyboard focus; on pointer hover only while hover reveal is Off. With hover reveal on, the opening panel is the feedback. This app's 0 ms tooltip delay would also put a tooltip on top of the opening panel.
  - **Text**: `<accessible name> (<shortcut>)`, for example "Explorer and sessions (Ctrl+Shift+E)".
  - Placed on the transcript side. Closes when the overlay opens.
- **Coarse pointers** (`@media (pointer: coarse)`): gutters and the strip grow to 44 px, and handles to 44×44. One media condition drives both, so hybrid devices stay consistent.
- **Calm by design**: no pulsing, no badges, no colour change. Hover tints the handle; focus shows an inset ring.

### 2.3 Reveal triggers by input type

| Input | Left / right | Top |
|---|---|---|
| Mouse or pen hover, **Standard** | Pointer in the hover band and at rest for **300 ms**, or in the band for **700 ms** whether or not it is still | Pointer on the handle and at rest for **400 ms**, or on it for **700 ms** |
| Mouse or pen hover, **Slow** | **800 ms** at rest, or **1200 ms** in any case | Same |
| Hover **Off** | No hover reveal | Same |
| Warm re-entry (Standard only) | Within **2000 ms** after this group closed on pointer leave: **150 ms** in the band, no need to be at rest, **100 ms** slide | Same, on the handle |
| Trackpad | Same as mouse (`pointerType` is "mouse") | Same |
| Click on the handle, or anywhere on the gutter | Opens at once; the first frame within 100 ms. Clicking the handle again while open closes it | Only the handle and the chips respond; the rest of the strip ignores clicks |
| Touch tap, or a pen tap without hover | Opens **sticky** | Same |
| Keyboard | Handle (Enter or Space), Mod+Shift+E or Mod+Shift+M, skip links. Focus moves into the panel | Handle, Mod+F, chips. Focus moves into the panel |
| Screen reader | A labelled handle with `aria-expanded`, inside a labelled region. Skip links reveal the panel and focus it | Same |
| Programmatic | The breadcrumb's "reveal in explorer" calls `revealPanel("left", source)` and then focuses the row. The source is `click` when the breadcrumb was clicked (`detail > 0`) and `keyboard` otherwise | Chip activation and Mod+F follow the same rule |

**Hover reveal is blocked while any of these holds:**
- Hover reveal is Off.
- The pointer is touch (`pointerType === "touch"`), or a pen that has not hovered.
- A button is held down (`buttons !== 0`): a selection, a scrollbar drag or a sash drag.
- The zone is disarmed.
- A wheel event happened anywhere in the last 500 ms.
- A key was pressed in the last 1000 ms.
- The document does not have focus (`!document.hasFocus()`).
- A dialog, a menu or the global search is open.
- Another group's overlay is open or still in its grace period. The dwell finishes only after that overlay has closed.
- The pointer came into the document through this zone (no `relatedTarget`) and has not yet moved out into the document.

Focus alone never reveals a panel. Moving between prompts or matches needs no reveal at all: Alt+↑/↓ (existing) for prompts, and Mod+G, F3 or the chip buttons for matches.

### 2.4 Lifetime: what keeps a panel open

**Interaction boundary B** = the overlay ∪ its gutter or strip (handle, chips) ∪ its owned layers. Owned layers are portal content marked `data-autohide-owner="<group>"`: menus, selects, tooltips and dialogs opened from the panel.

**Holds** are checked continuously. While any hold is true, no hide timer runs.
- **H1** The mouse or pen pointer is inside B, allowing a 16 px margin around the overlay rectangle.
- **H2** An owned layer is open.
- **H3** A press or drag that started inside B is still down (`buttons !== 0`, or pointer capture).
- **H4** Focus is inside B, and either:
  - it is on an editable element (`isEditableTarget`), or
  - the pointer has moved less than 24 px in total (trusted events) since focus entered B.
- **H5** The panel was opened by a mouse or pen click and the pointer has not entered the overlay yet. This hold ends the first time the pointer leaves after entering.
- **H6** The open is sticky: a touch tap, a pen tap without hover, or any click or tap while hover reveal is Off. The pointer's position never hides a sticky panel.

| Opened by | Stays open while | Closes when the pointer leaves? |
|---|---|---|
| Hover | H1 to H4 | Yes, after the 500 ms grace |
| Mouse or pen click, with hover reveal on | H5 until the pointer first enters, then H1 to H4 | Yes, once the pointer has entered it |
| Touch tap, a pen tap without hover, or any open while hover reveal is Off | Until dismissed (§2.5) | Never |
| Keyboard or skip link | H4, plus H1 to H3 | Only after the pointer has moved 24 px |

**Choosing an item**
- Choosing a session in a sticky left overlay closes it, just as choosing a session closes the mobile drawer today. Choosing a session with the mouse or keyboard does not close the overlay by itself.
- Jumping to a prompt never closes the right overlay, just as the mobile navigator sheet stays open today.
- Starting capture mode from the top overlay closes it and moves focus to the first `CaptureModeToolbar` button.

### 2.5 Hide rules

Focus is moved only when it is inside the part that is about to become `inert`. It always moves before `inert` is applied, through the shared `moveFocusOutOf` helper.

| Trigger | Effect | Focus |
|---|---|---|
| No hold for **500 ms**; cancelled if a hold comes back. Never applies to sticky opens | Slides out | The group's handle |
| Esc, in the window bubble phase, only if `!e.defaultPrevented` | Closes at once; disarms the zone | Keyboard open: back to where focus was before the open, if that element is connected, focusable and not inert; otherwise the handle. Other opens: the handle |
| Focus moves to an element outside B (`focusin`). Exception: the pointer is inside B and no key was pressed in the last 500 ms | Closes at once | Already moved by the person |
| Focus inside B drops to `<body>` because its element was removed | Not a close | The panel's primary item, otherwise the handle |
| An overlay opened by hover, focus outside B, and one of these is pressed: Tab, Shift+Tab, F6, an arrow key, Page Up/Down, Home, End, Space, Alt+↑/↓ | Closes at once; the keyboard takes over | Unchanged |
| Light dismiss: pointerdown and pointerup outside B, by the same pointer | Closes on the up-event and disarms the zone. If the down target is interactive and inside the transcript area (`[data-transcript-area]`), its pointerdown, mousedown and click are swallowed. Otherwise the click goes through: caret, selection, header and pinned panels all work | If swallowed: `#main-content`. Otherwise wherever the click puts it |
| Mod+Shift+E or Mod+Shift+M pressed again, or the handle activated while open | Closes; disarms the zone | Same as for Esc |
| Another group opened explicitly | This group closes first | If the new group was opened from the keyboard: its primary item. Otherwise this group's handle |
| An unrelated modal opens (global search, Settings, any dialog not owned by the panel) | All overlays close | The modal takes focus. When it closes, `ModalProvider` skips inert targets and falls back to the handle, then `#main-content` |
| The viewport drops below 768 px | Closes; the mobile layout takes over | `#main-content` |

- Mod+F never closes the top overlay.
- **Window `blur`, or `visibilitychange` to hidden**: cancel all timers and close nothing. Check again on the next pointer event after the window gets focus back.
- **The pointer leaving the document** (`pointerout` with no `relatedTarget`) counts as outside.
- **Re-arming**
  - After any close, a zone re-arms 300 ms after a trusted `pointermove` with real movement has taken the pointer outside it.
  - Any transcript scroll (wheel, scrollbar drag, keys or programmatic) while the pointer is inside a zone disarms that zone and resets its wait.
  - Entering reading mode starts every zone disarmed.

### 2.6 Pin and unpin (reading mode only)

- **One pin toggle per group**
  - A 24×24 `<button aria-pressed>` with a stable name for each group: "Pin explorer and sessions", "Pin prompts" or "Pin conversation tools". Tooltip: "<name>: keep visible in reading mode".
  - Placement: left in the Explorer header, right in the navigator header, top at the end of the conversation toolbar.
  - It shows, not pressed, in the overlay, and pressed in a group pinned in reading mode. It never shows in the normal layout.
- **Pin** from the overlay:
  1. The profile entry becomes `pinned`.
  2. The layout reflows once, keeping the anchor.
  3. Focus stays on the same toggle, which is now inside the pinned panel.
  4. Announce "Explorer and sessions pinned".
- **Unpin** from a pinned group:
  1. The profile entry becomes `autohide`.
  2. The layout reflows once.
  3. Focus moves to the group's handle.
  4. Announce "Explorer and sessions hidden at the edge".
- Rail-collapse buttons are not rendered in reading mode. Rails belong to the normal layout, which keeps them.

### 2.7 Reading mode on and off

- Mod+Shift+F and the header `ReadingModeButton` both call one helper, `enterExitReadingMode()`, which runs the steps in §2.1.
- **Announcements** go to the existing `role="status"` region: "Reading mode on. Panels are hidden at the window edges." and "Reading mode off. Panels restored."
- On the very first entry, the toast (§2.8) replaces the announcement rather than repeating it.
- Using a panel never ends reading mode: choosing a session, jumping to a prompt or searching all keep it on. Changing session keeps it on too.

### 2.8 First-use discoverability

- **First entry only**: one Sonner toast with `duration: Infinity`, a close button and one action, "Turn off hover reveal". The action sets hover reveal to Off, which can be undone in the settings menu.
- **Text**, using the platform's modifier names: "Reading mode on. Point at a handle at the window edge, or use Ctrl+Shift+E for explorer and sessions, Ctrl+Shift+M for prompts, Ctrl+F for search. Ctrl+Shift+F leaves."
- Store `reading-mode-hint-seen`, inside try/catch.
- **After that**, the shortcuts stay discoverable through:
  - the header button's tooltip
  - the handle tooltips
  - `aria-keyshortcuts`
- No other coach marks. The app has no shortcut help dialog, and none is added.

---

## 3. Parameters

All values live in `src/components/AutoHide/constants.ts`.

| Parameter | Value | Acceptable range | Justification |
|---|---|---|---|
| Hover band, left/right | The top **96 px** of the gutter, which contains the 24×48 handle | 80–120 px | People park the cursor in empty gutter space. A visible handle band keeps hover intent, like Visual Studio's auto-hide tabs |
| Hover wait, left/right (Standard) | **300 ms**, pointer at rest | 250–400 | NN/g: 0.3–0.5 s. Baymard: 300–500. Win32 hover time: 400. Firefox's 200 ms proved too sensitive |
| Hover wait, top handle (Standard) | **400 ms**, pointer at rest | 350–500 | An inner edge just below the header, where pointer traffic to the header passes by |
| At-rest rule | Σ\|dx\|+\|dy\| ≤ **6 px** over the last **100 ms** | 5–8 px | Same sensitivity as jQuery hoverIntent. A pointer pinned at a screen edge sends no events, so it counts as at rest |
| Fallback without the rest rule (Standard) | **700 ms** continuously in the band or on the handle | 600–1000 | Tremor and jitter (Hwang 2005; Floating UI pairs `restMs` with a delay) |
| Slow preset | **800 ms** at rest, **1200 ms** fallback, every edge. No warm re-entry | 700–1000 / 1000–1500 | For magnifier, dwell-click and tremor users |
| Off preset | No hover reveal. Click, tap and keyboard opens are sticky | n/a | Avoids opening a panel just because a gaze or head pointer rested on it (the "Midas touch" problem) |
| Warm re-entry (Standard) | Within **2000 ms** of a pointer-leave close: **150 ms** of presence, no rest rule; **100 ms** slide | 1500–3000 / 100–200 | Radix `skipDelayDuration` and macOS menu tracking do the same. Helps when hopping between sessions |
| Click, tap or keyboard open | **0 ms**; first frame within 100 ms | n/a | NN/g 0.1 s limit. Panels stay mounted, so nothing has to render |
| Hide grace | **500 ms**; cancelled if a hold comes back | 400–700 | NN/g ">0.5 s outside". Touchpad users re-enter targets twice as often. One second or more feels sticky (Zen, Vivaldi) |
| Hysteresis | Overlay rectangle plus **16 px** | 12–24 | Stops flapping at the edge, and covers the ±4 px sash hit area |
| Pointer movement that releases focus hold | **24 px** of trusted movement in total since focus entered B | 16–40 | Tells a bumped mouse apart from a real switch to the mouse, without guessing the input device |
| Keyboard focus window | A focus change outside B closes the overlay if a key was pressed within the last **500 ms** | 300–700 | Separates keyboard-driven focus changes from ones driven by the pointer or by script |
| Re-arm | **300 ms** after the pointer has moved outside the zone | 250–400 | Prevents the Esc-then-reopen loop (KDE reactivation delay, Linear flapping) |
| Scroll in a zone | Disarms that zone until the pointer leaves it | n/a | Scrolling means the person is reading |
| Wheel veto | **500 ms** after any wheel event | 300–600 | Scroll momentum can carry the pointer into a band |
| Keyboard recency | No hover reveal within **1000 ms** of a key press | 700–1500 | A parked mouse must not cover keyboard focus |
| Left/right gutter | **24 px** in flow (44 under `pointer: coarse`), opaque `bg-sidebar`, from the app header to the bottom of the content row | 16–24 | Room for the handle without covering text. Outside the scroller (`--os-size: 10px`) and clear of the macOS traffic lights (`titleBarStyle: "Overlay"`) |
| Top strip | `min-height` **24 px** (44 when coarse), in flow above the transcript area | 20–28 | Never covers the prompt bar, and grows with text-only zoom |
| Handle | **24×48** left/right, **48×24** top; **44×44** when coarse | at least 24×24 | WCAG 2.5.8 minimum. The 44 px touch size is a usability improvement, not a claim to meet 2.5.5 |
| Handle placement | Left/right: top of the gutter, 8 px below the top of the row. Top: centred | n/a | Matches where the hidden panel's header appears |
| Chip buttons | The text button, plus ↑ and ↓ at **24×24** (44 when coarse). Chips truncate at half the strip width minus 32 px | n/a | 2.5.8, and keeps the chips clear of the handle |
| Left overlay width | The pinned widths of Explorer, sash and Sessions. Cap = available width − **360 px**. Floor = **420 px** at 1024 px and up, **200 px** at 768–1023. If the floor is larger than the cap, the floor wins | cap 320–400 | Available width = host row − this group's gutter − the in-flow width of the right group (its gutter or the pinned navigator) |
| Right overlay width | The navigator width (200–400), with the same cap and a floor of **200 px** | n/a | Same |
| Top overlay | Full column width; natural height, measured with `ResizeObserver` | n/a | The measured height feeds the transcript clearance (§4.5) |
| Overlay anchoring | `position: absolute`, placed against its own region at `left: 100%`, `right: 100%` or `top: 100%` of the gutter or strip. Host rows are `relative overflow-clip`. Hit-testing uses the final rectangle, even mid-animation | n/a | Gutter and panel touch, so hover can move between them (WCAG 1.4.13), and the handle is never covered |
| Stacking order | Each region is its own stacking context at **z-40**. The region whose overlay is open or closing rises to **z-[45]**. Inside a region, the gutter or strip paints above its overlay. Owned portals sit at **z-50**, skip links at z-[700]. Transcript layers stay at 30 or below (toolbar 10, prompt bar 20) | n/a | The open overlay paints above the other edge controls, and menus opened from it paint above it |
| Overlay surface | Solid `bg-sidebar` (left/right) or `bg-card` (top), a border on the transcript side, `shadow-xl`. No scrim, no `backdrop-filter`, no transform at rest | n/a | Reads as separate from the text without looking modal. `backdrop-filter` blurs text in WebKitGTK |
| Slide in | Left **200 ms**, right **180 ms**, top **150 ms**; `cubic-bezier(0,0,0.2,1)` | 150–250 | Material desktop guidance |
| Slide out | Left/right **150 ms**, top **120 ms**; `cubic-bezier(0.4,0,1,1)` | 100–200 | Exits are shorter than entries |
| What animates | `transform` and `opacity`, as CSS transitions | n/a | Never width. CSS transitions can reverse mid-way |
| Reduced motion | No sliding; opacity only, **100 ms** linear | 0–100 | WCAG 2.3.3 and technique C39 |
| Hidden state | `inert`, plus `visibility: hidden` once the transition ends, plus an off-screen transform | n/a | Removes hidden content from the tab order, the accessibility tree, find-in-page and selection |
| Host overflow | `overflow: clip` on host rows | n/a | Stops `focus()` and `scrollIntoView` from scrolling the host sideways |
| Focus ring | A 2 px inset ring on handles, chips and pin toggles | n/a | `overflow: clip` cannot cut an inset ring |
| Wheel forwarding | A wheel over the gutter or strip calls `scrollBy` on the transcript. Line mode counts 40 px per line; page mode counts the viewport height. The listener is `passive: false` on the gutter only | n/a | The gutter sits beside the scroller, not inside it |
| Light-dismiss swallow | Applies when the down target matches `a[href], button, summary, input, select, textarea, label, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=menuitem], [tabindex]:not([tabindex="-1"])` inside `[data-transcript-area]` | n/a | A dismiss click must not expand, copy or navigate |

---

## 4. Keyboard and accessibility contract

### 4.1 Shortcuts

| Keys | Reading mode, group auto-hidden | Group pinned in reading mode, or normal layout | Conflict check |
|---|---|---|---|
| **Mod+Shift+F** | Toggle reading mode | Same | No browser or OS default found. Existing binding. Ignored while typing |
| **Mod+Shift+E** | Toggle the left overlay. A keyboard open focuses the selected session row, otherwise the selected tree row, otherwise the first row | Focus that row. In the normal layout, first expand whichever rail holds it | Firefox uses it for the Network Monitor (WebUI in Firefox only). A Linux input method (IBus) may take it while a text field has focus; the handle and skip links still work |
| **Mod+Shift+M** | Toggle the right overlay and focus the current prompt row | Pinned in reading mode: focus the current prompt row. Normal layout: toggle the navigator rail, as today | Existing binding. Chrome's profile menu in the WebUI |
| **Mod+F** | Reveal the top overlay, then focus and select the search input | Focus and select the search input | Taken only while a conversation is showing. If the search input already has focus and its text is fully selected or empty, the key is not taken: browser find opens in the WebUI, and nothing happens in Tauri |
| **Mod+G / Shift+Mod+G**, **F3 / Shift+F3** | Next or previous match, without revealing anything | Same | Taken only while a conversation search is active. Otherwise the key goes to browser find-next |
| Alt+↑ / Alt+↓ | Existing prompt jumps | Same | Existing |
| Esc | Closes the innermost layer (§4.3) | Existing behaviour | n/a |

**Matching rules**
- Mod uses `isActionModifier(e)`, which already exists in `src/utils/platform.ts`. The other of Cmd and Ctrl must not be held, and neither may Alt, except for Alt+arrows.
- Letters match `e.key.toLowerCase()`. Fall back to `e.code` (`KeyE`, `KeyM`, `KeyF`, `KeyG`) only when `e.key` is not an ASCII letter.
- Ignore `e.repeat` for toggles. Ignore `e.isComposing` and `keyCode === 229`.
- Ignore panel shortcuts when the event target is inside a dialog or a menu (`role=dialog|alertdialog|menu|menubar`, or `aria-modal=true`).
- No digit shortcuts, no `\` and no hold-to-peek. Every chord works with Sticky Keys.
- Each shortcut appears in its handle's tooltip and in `aria-keyshortcuts` (`Control+Shift+E` or `Meta+Shift+E`).

### 4.2 Focus management

- **Hover open**: focus does not move.
- **Keyboard open**
  1. Remember `document.activeElement` as the return target. `<body>` counts as no target.
  2. Reveal the panel.
  3. On the next frame, focus the primary item:
     - Left: the selected session row, else the selected tree row, else the first row.
     - Right: the current prompt row, else the first row.
     - Top: the search input (from Mod+F or the search chip), the first toolbar control (from the handle), the Dialogue toggle or the first filter control (from those chips).
- **Click open**: focus stays where the browser puts it, which is the handle, or wherever it was before in WebKit. Tab from the handle goes into the overlay, which comes right after it in DOM order.
- **DOM order matches visual order**:
  - Left handle → left overlay → `main` → top handle → chips → top overlay → transcript → right handle → right overlay.
  - Shift+Tab from an overlay's first item reaches its handle. There is no focus trap.
- **Closing with focus inside**: the targets in §2.5, applied by `moveFocusOutOf(panel, target)` before `inert`.
- **`ModalProvider.restoreFocus`** skips candidates inside an `inert` subtree. It falls back to that group's handle, then to `#main-content`.

### 4.3 Esc precedence

Each press closes at most one layer:
1. A Radix menu, select or dialog. Radix calls `preventDefault`.
2. Custom layers that listen on `document`:
   - Image lightbox (`ImageRenderer`): **add** `preventDefault`.
   - Hidden-blocks popover (`HiddenBlocksIndicator`): **add** `preventDefault`.
   - Screenshot preview: already calls it.
   - `ProjectContextMenu` and `SessionContextMenu`: **add** `preventDefault`.
3. Inline rename (`useSessionEditing`): already calls it.
4. `SessionSelectionBar` selection mode: **add** `preventDefault`.
5. Text fields that hold a value:
   - The conversation search clears and keeps focus (**add** `preventDefault`). When empty, the press passes on.
   - `ExplorerSearch` in reading mode clears and keeps focus, with no blur. When empty, the press passes on. The normal layout keeps today's behaviour.
   - The navigator filter clears (new). When empty, the press passes on.
6. The open overlay: a window bubble listener that acts only if `!e.defaultPrevented`.
7. Nothing else. Esc never ends reading mode.

### 4.4 Inert, ARIA, landmarks and skip links

- **Regions.** Each auto-hidden group is wrapped in a `<section>` labelled "Explorer and sessions", "Prompts" or "Conversation tools", which makes it a region landmark. While hidden it contains only its handle (and the chips at the top). When revealed it also contains the panel's own landmarks.
- **Handle**: a native `<button type="button">` with:
  - a stable `aria-label` (the group name)
  - `aria-expanded` showing the actual visibility, including on a hover reveal
  - `aria-controls`
  - `aria-keyshortcuts`
  - an `aria-hidden` icon
- **Pin**: a `<button aria-pressed>` with that group's stable name.
- **Overlay wrapper**: no role, no `role="dialog"`, no `aria-modal` and no focus trap. It is `inert` while hidden. The panels keep their own `aside`, `nav` and `role="search"` landmarks. No Popover API.
- **Skip links**
  - "Skip to project explorer", "Skip to sessions" and "Skip to message navigator" reveal and focus their target when the group is auto-hidden, through `revealPanel(id, "keyboard")`.
  - The navigator link renders when the navigator is pinned open, or auto-hidden in reading mode.
  - `App.accessibility.test.tsx` is updated to match.
- **Announcements** use the existing `liveStatusMessage` region (around line 910 of `AppLayout.tsx`). Focus never moves just to announce something.

### 4.5 Focus not obscured (2.4.11)

- The overlay sits beside its gutter, so a focused handle is never covered. An `elementFromPoint` check confirms it.
- Keyboard focus leaving B closes the overlay. Navigation keys close overlays opened by hover. Hover reveal is blocked for 1 s after any key press.
- While the top overlay is open, the transcript's top clearance is `CONVERSATION_TOP_CLEARANCE_PX (44)` plus the measured overlay height. This applies to search next/previous, prompt jumps, `scrollRowIntoTopView` and `scroll-padding-top`.
- A prompt jump from the right overlay lines the target row up under the clearance at the column's left. The overlay covers only the right part of the column.
- Only 2.4.11 is targeted. Partial covering (2.4.12, AAA level) is not claimed.

---

## 5. Edge cases

| Case | Handling |
|---|---|
| Radix `DropdownMenu`, `Select` or `Tooltip` in portals | Wrapped with `useAutoHideHold(open)` through `AutoHideHoldContext`. The portal content gets `data-autohide-owner` and counts as inside B, for both pointer and focus. Radix modal menus set `body{pointer-events:none}`, so no leave event fires. While a panel is revealed, a document `pointermove` check runs whenever a hold is released and starts the grace period if the pointer is outside |
| Custom context menus | Same hold and owner attribute. `[data-menu-boundary]` stays on the explorer `<aside>` |
| Dialogs opened from panels (delete, multi-delete, rename, resume) | Owned by the panel: it stays open, and focus inside the dialog counts as inside B. On close, focus returns to the trigger while the panel is still open. If the trigger is gone (for example a deleted session), focus goes to the primary item, else the handle |
| Global search (Mod+K), Settings or another unrelated modal | All overlays close when it opens. Focus restore skips inert targets |
| Sash drag | Overlays cannot be resized. Pinned groups keep their sashes |
| Text selection | A held button blocks both reveal and hide. A selection drag in the transcript closes the overlay on release, and the selection survives: the target is text, so nothing is swallowed and nothing reflows |
| Scrollbar thumb drag near the right edge | The gutter is outside the scroller, and a held button blocks reveal. Scrolling with the pointer in a zone disarms it |
| Cursor parked in a gutter while reading | Below the band, nothing reacts. In the band: a wheel or scroll disarms the zone until the pointer leaves, keyboard use blocks reveal for 1 s, and Slow or Off are available |
| Window loses focus, or the tab is hidden | Timers are cancelled and nothing closes. State is checked again on the next pointer event |
| Pointer leaves through the window edge or onto another monitor | `pointerout` with no `relatedTarget` counts as outside, which starts the grace period for hover and click opens |
| Pointer enters the window through a zone | The zone does not arm until the pointer has moved into the document once |
| Touch tablet at 768 px or wider | Opens are sticky. A dismiss tap on a transcript control is swallowed. Choosing a session closes the left overlay; prompt jumps keep the right one open |
| Hybrid device (touch plus trackpad) | One `pointer: coarse` condition sizes gutters and handles. Each open follows the rules for the pointer type that made it |
| Browser zoom or text-only zoom | CSS px scale with zoom. At 200% a 1280 px window is 640 CSS px, so the mobile layout applies. The strip uses a minimum height; chips truncate and show the full text in tooltips |
| Narrow desktop (768–1023 px) | The left group is the Explorer. The gutters take 48 px in total. The cap and floor rule applies |
| Rapid toggling | Store actions are synchronous. Anchor restores carry a generation token and stop when the person scrolls. CSS transitions reverse from where they are. Timers are cleared on every state change |
| Session switch while a panel is revealed | Overlays follow their usual rules and reading mode stays on. The top overlay closes, because search resets for each session. The navigator updates in place |
| Breadcrumb "reveal in explorer" (`reveal()` in `HeaderBreadcrumb.tsx`) | If the left group is auto-hidden: `revealPanel("left", click or keyboard)` (§2.3), then focus the row. Otherwise unchanged (`setExplorerCollapsed(false)`) |
| Focused element removed inside an overlay | Focus goes to the panel's primary item, else the handle |
| Scroll position | Reveal and hide never reflow. Each layout switch does one anchor capture and restore, which stops when the person scrolls |
| Upgrade while focus mode is on | If `focus-mode-restore` exists: apply its snapshot to the normal layout, delete the key, then enter reading mode with `restoreDock` set to the dock's current state |
| No project, Settings, Archive or analytics | The left group wraps whatever is mounted. The top and right groups exist only in the transcript view |
| Capture mode | Starting it from the top overlay closes the overlay. `CaptureModeToolbar` stays in flow, and focus moves to its first button |
| Subagent list | `isSubagentListDocked = showSessionsPane && (readingModeActive \|\| !isSessionsPaneCollapsed)`. In auto-hide, the list is inside the left overlay |
| Malformed stored values | `reading-mode`, `reading-profile` and `panel-hover-reveal` are validated. If validation fails, the defaults are used |

---

## 6. Requirements traceability

This table lists each design intent and the check that will confirm it, for this feature only. It is not a conformance claim.

| Requirement | Design element | Check |
|---|---|---|
| WCAG 1.4.13 Dismissible | Esc closes from any pointer position; the zone stays disarmed until the pointer leaves | Browser test 4 |
| 1.4.13 Hoverable | The overlay touches its gutter. Hit-testing uses the final rectangle. 16 px margin | Browser: move from the band into the panel mid-animation; it stays open |
| 1.4.13 Persistent | Nothing hides while a hold is active. Owned layers hold the panel | Unit: a menu open for 10 s keeps the panel open |
| 2.1.1 Keyboard | Handles, shortcuts, skip links, chips | Unit tests, plus a keyboard-only run |
| 2.1.2 No keyboard trap | Non-modal: Tab and Shift+Tab leave the overlay | Browser test 6 |
| 2.1.4 Character key shortcuts | No single-character shortcuts. Every shortcut uses Mod, or is F3 | Unit: a bare e, f, m or g does nothing |
| 2.2.1 Timing adjustable | Not applicable: no time limit is introduced. The grace period runs only after the trigger is gone, and nothing hides for inactivity | Unit: 60 s with the pointer inside, still open |
| 2.2.2 Pause, stop, hide | No looping animation | Code review |
| 2.3.3 (AAA, aimed for) | Reduced motion uses opacity only | Browser test 12 |
| 2.4.3 Focus order | DOM order runs handle → overlay. Focus moves before `inert`. Return targets are defined | Unit and browser tests |
| 2.4.7 Focus visible | Inset rings | Screenshots in both themes at 100% and 200% |
| 2.4.11 Focus not obscured (minimum) | §4.5 | Browser: `elementFromPoint` on the focused handle; Tab out closes the overlay; a match stays visible below the top overlay |
| 2.5.1 Pointer gestures | Taps only, no swipes | Touch emulation |
| 2.5.2 Pointer cancellation | Handle, chips and pin act on click. Light dismiss acts on the up-event | Unit: a pointerdown alone does nothing |
| 2.5.3 Label in name | Tooltip text starts with the accessible name | Unit |
| 2.5.7 Dragging movements | Overlays cannot be resized, so the feature adds no dragging. The existing pinned sashes have no single-pointer alternative. That is a known gap, tracked in a follow-up issue and out of scope here | Open the issue |
| 2.5.8 Target size (minimum) | Handles 24×48 and 48×24; chip buttons and the pin 24×24 | Measure bounding boxes |
| 1.4.4 and 1.4.12 Resize text, text spacing | The strip uses a minimum height; chips truncate and show tooltips | Firefox text-only zoom at 200% |
| 1.4.11 Non-text contrast | Handle icon contrast at least 3:1 | Check the colour tokens |
| 3.2.1 On focus | Focus never reveals a panel; hover never moves focus | Unit |
| 4.1.2 Name, role, value | `aria-expanded` (kept in sync on hover), `aria-controls`, `aria-keyshortcuts`, `aria-pressed` with unique stable names | RTL attribute assertions |
| 4.1.3 Status messages | Live region for mode and pin changes. On first entry the toast replaces the message instead of repeating it | Unit |
| ISO 9241-110 suitability for the user's tasks | One action to be alone with the text. Panels on demand. Search works while the toolbar is hidden | Owner task check (§7.3) |
| ISO 9241-110 self-descriptiveness | Visible handles, state chips, tooltips, a one-time hint | Visual check, plus unit tests for chips |
| ISO 9241-110 conformity with user expectations | The same hover rule on every edge (band or handle). Esc layering works as today. Mod+F behaves as in chat clients. Normal layout unchanged | Review |
| ISO 9241-110 controllability | Pin per group in reading mode. Hover Off, Standard or Slow. Only the person ends reading mode | Unit (store) |
| ISO 9241-110 use error robustness | Intent rules, disarm on scroll and on Esc, swallowed dismiss clicks, anchor kept | Unit (state machine) and browser tests |
| ISO 9241-171 (principles) | Works from the keyboard, no keys held together, adjustable timing | Sticky Keys check; speed setting |
| ISO 9241-210 | The timings are hypotheses, tested in an owner task check with defined measures | §7.3 |
| Apple HIG: sidebars, full screen, keyboard | The normal layout is the default. Reading mode is opt-in and only the person ends it. No Cmd+Shift+3; Cmd only on macOS | Unit: platform modifier matrix |

---

## 7. Test plan

### 7.1 Unit tests (vitest, RTL, fake timers), written before the code

**`autoHideMachine.test.ts`** (the pure reducer, no DOM):
- **Dwell timings**
  - Band dwell of 300 ms with the rest rule passed; fallback at 700 ms.
  - A jittering pointer is not revealed at 300 ms but is at 700 ms.
  - Presence below the band never reveals.
  - The top handle reveals at 400 ms.
- **Presets**
  - Slow at 800 ms (rest) and 1200 ms (fallback). Off never reveals on hover.
  - Warm re-entry at 150 ms within 2000 ms, only after a pointer-leave close. Not after Esc, and not in Slow.
- **Blocks**: a held button, the 500 ms wheel veto, a key press within 1000 ms, a disarmed zone, `!hasFocus`, touch, a dialog open, an entry with no `relatedTarget`, and another group open. In that last case the dwell completes only after the other group closes.
- **Scroll in a zone** disarms it until the pointer leaves, and resets the wait.
- **Grace**: hides at 500 ms; a return at 499 ms cancels it.
- **Holds**
  - An owned layer holds.
  - Focus on an editable element holds after the pointer has gone.
  - Focus holds with under 24 px of pointer movement and releases at 24 px.
  - A drag holds.
  - A click latch: enter, then leave, then closed after 500 ms.
- **Sticky opens** (touch, hover Off)
  - Pointer leave never closes them; a tap outside does.
  - Choosing a session closes a sticky left overlay; a prompt jump keeps the right one open.
- **Esc** closes and disarms until the pointer leaves plus 300 ms.
- **Focus moving outside B**
  - A `focusin` outside B closes the overlay, except when the pointer is inside and no key was pressed within 500 ms.
  - Focus in an owned portal does not close it.
- **Keys and switching**
  - Navigation keys close hover opens but not keyboard opens.
  - Hover never evicts another overlay.
  - An explicit open evicts, and focus moves before `inert`.
- **Timers**
  - Window blur closes nothing and cancels timers.
  - No hide after 60 s of inactivity.

**`layoutSlice.test.ts`** (replaces the five focus-mode cases):
- **Normal layout untouched**: turning reading mode on and off leaves rails, `navigatorOpen` and widths unchanged.
- **Recent-edits dock**
  - Closed on entry, and reopened on exit if it was open and is still closed.
  - A dock opened during reading mode stays open.
- **Persistence**
  - `reading-mode`, `reading-profile` and `panel-hover-reveal` survive a reload.
  - Malformed values are rejected.
  - `focus-mode-restore` is migrated.
- **Pins**: pinning and unpinning edit the profile and survive exit and re-entry.
- **One overlay at a time**: `revealPanel` and `concealPanel` keep one overlay open at a time; a hover cannot replace an open one.

**`useAppKeyboard.test.tsx`:**
- **Modifier**: `isActionModifier` per platform; Ctrl does nothing on macOS.
- **Each shortcut in each layout**: Mod+Shift+E, Mod+Shift+M, Mod+Shift+F, Mod+F, Mod+G and F3, in auto-hide, pinned and normal layouts.
- **Mod+F repeats**: pressed twice, the overlay stays open; a third press with the text fully selected is not taken.
- **Key matching**: the `e.key` match with the `e.code` fallback.
- **Guards**
  - Key repeat and IME composition are ignored.
  - Shortcuts are ignored inside dialogs and menus.
  - The typing guard applies to Mod+Shift+F.
- **Mobile and shared path**: nothing happens below 768 px, and the shortcut and the button share the same focus handoff.

**`AutoHideRegion.test.tsx`:**
- **Hidden state and ARIA**
  - `inert` and `visibility` while hidden.
  - `aria-expanded` follows a hover reveal; `aria-controls` and `aria-keyshortcuts` are present.
  - The pin has `aria-pressed` and a unique stable name.
  - Tooltip text starts with the name.
- **Focus on close**
  - Focus moves out before `inert`.
  - Esc restores the return target; a pointer-leave close goes to the handle.
  - Focus that is outside the panel is never moved.
- **Landmark**: the region landmark has a label.

**Other tests:**
- **Esc precedence**
  - The lightbox, the hidden-blocks popover, the context menus, the selection bar and the search inputs call `preventDefault`.
  - The overlay ignores a prevented Esc.
  - One Esc closes only the lightbox.
- **`TopStripChips.test.tsx`**
  - Chips appear only when the state is not the default, and they are buttons with full-text names.
  - ↑ and ↓ step through matches without revealing.
  - Activating a chip opens the overlay and focuses the right control.
- **Updated existing tests**: `App.accessibility.test.tsx`, `HeaderControls.test.tsx` (`ReadingModeButton`), `SessionsPane.collapse.test.tsx` and `MessageViewer.subagentPanel.test.tsx`. The normal layout is unchanged, and the subagent list is docked in reading mode.
- **Live region**: announcements on entry and exit, with the toast instead on first entry.

### 7.2 Browser tests (Playwright against the WebUI with `--serve --no-auth`, on a long real transcript)

1. **Entering reading mode**: the same message uuid stays at the top of the viewport within ±4 px. Gutters and strip render. First entry shows the toast; the second entry announces.
2. **Hover reveal**: the pointer at rest in the band for 300 ms reveals the panel. A fast flick across the band does not. The pointer at mid-height of the gutter for 5 s does not.
3. **Owned menu**: move into the overlay, open the sort menu, choose an item, move out. The overlay hides after about 500 ms.
4. **Esc**: hover-reveal, then press Esc with the pointer inside; the overlay closes. Wait 2 s without moving; it stays closed. Move out and back; it reopens.
5. **Choosing a session in a hover-opened overlay**: the session loads. The overlay stays while the pointer is inside and closes after it leaves. Focus ends on the left handle, not on `<body>`.
6. **Keyboard only**
   1. Mod+Shift+E focuses the selected row.
   2. Enter on another session leaves the overlay open.
   3. Shift+Tab reaches the handle, and the handle is not covered (`elementFromPoint`).
   4. Tab out to the transcript closes the overlay.
   5. The Esc path returns focus.
7. **Search while hidden**
   1. Mod+F focuses the search. Type a query and press Enter; the match is fully visible below the overlay.
   2. Click the text: the overlay closes, and the chip shows the query and count.
   3. Mod+G goes to the next match without revealing. The chip's ↓ also goes to the next match.
   4. Mod+F reveals with the query selected.
   5. Esc clears the query; Esc again closes the overlay.
8. **Mouse-focused field holds**: click into the navigator filter, type, move the pointer onto the transcript and wait 2 s. The overlay is still open and the caret is intact.
9. **Selection drag**: drag a selection from the transcript toward the left edge. Nothing is revealed and the selection is intact.
10. **Scroll and parking**
    - A scrollbar thumb drag that ends in the right gutter reveals nothing.
    - With the pointer parked in the right band, wheel, pause 2 s and wheel again reveals nothing.
11. **Dismiss click is swallowed**: click-open the left overlay, then click a collapsed tool-result header. The overlay closes and the block stays collapsed.
12. **Reduced motion**: tests 2 to 4 with `reducedMotion: "reduce"` show no transform transition.
13. **Touch emulation**: tapping the handle opens the overlay. Tapping a project chevron and then another row keeps it open. Tapping a session loads it and closes the overlay. Tapping the text closes it without activating anything.
14. **Hover never evicts**: with the left overlay opened from the keyboard and someone typing in Explorer search, a pointer resting in the right band does not open the right overlay. Mod+Shift+M closes the left overlay and moves focus into the navigator.
15. **Warm re-entry**: after a pointer-leave close, returning to the band within 2 s opens the panel after about 150 ms.
16. **Narrow viewports**: at 1024 px and 800 px the cap and floor hold. At 768–1023 px the left group is the Explorer.
17. **Reload**: reloading in reading mode keeps it on. Exiting brings back an identical normal layout, with the dock back.
18. **Hover Off**: hovering does nothing. A click opens a sticky overlay; a click outside closes it.
19. **Lightbox layering**: with an overlay open, Esc closes only the image lightbox.
20. **Focus-ring screenshots**: handles and chips in both themes, at 100% and 200%.

### 7.3 Manual checks and the owner's task check

- **Platforms**
  - Tauri on Ubuntu, with the Dock on the left, window maximised and not.
  - The macOS traffic lights.
- **Screen readers**
  - Orca: the region and handle are announced with their state; skip links work; browse-mode activation inside an overlay does not close it.
  - NVDA with Chromium (WebUI on Windows) and VoiceOver (Tauri on macOS) when a machine is available. This is a confirmation, not a release gate, because no rule depends on guessing the input device.
- **Keyboard**
  - Sticky Keys (GNOME) with every chord.
  - IBus on Ubuntu with focus in a text field, to record the Mod+Shift+E caveat.
- **Contrast**: handle icons in both themes.
- **Owner task check (ISO 9241-210)**
  - **Setup**: 30 minutes on a long real transcript, with `localStorage["autohide-debug"]="1"`. This logs the reason for every reveal and close to the console, locally only.
  - **Tasks**
    1. Read for 10 minutes using mouse or trackpad.
    2. Switch sessions 5 times.
    3. Jump to 5 prompts.
    4. Search and step through 10 matches.
    5. Repeat tasks 2 to 4 using only the keyboard.
    6. Do one pass with Orca.
  - **Count**
    - Accidental reveals: a reveal that closes within 1 s with no interaction inside.
    - Failed opens: a handle click within 2 s after the pointer dwelt in the band without a reveal.
    - Unintended closes: a reopen within 2 s of a close.
    - The owner's notes on anything irritating.
  - **Target**: no accidental reveals during the reading block, and at most one failed open. If the target is missed, adjust within the ranges in §3, in this order: band height, then dwell, then grace. Then run the check again.

---

## 8. Implementation outline

### Phase 0: record

- Create `specs/2026-10-10-reading-mode-autohide/{spec,plan,context}.md` from this document with `/harness-kit:new-spec`.
- Record the ADR "Auto-hide exists only inside reading mode" with `/harness-kit:adr`.

### Phase 1: state and machine (tests first, no UI change)

- **`layoutSlice.ts` and `types.ts`**
  - Remove `focusModeSnapshot` and `toggleFocusMode`.
  - Add `isReadingMode`, `readingRestoreDock`, `readingProfile`, `hoverReveal` (`"off" | "standard" | "slow"`) and `revealed: {group, source} | null`. `revealed` is not persisted.
  - Actions: `toggleReadingMode`, `setReadingPin`, `revealPanel`, `concealPanel`, `setHoverReveal`.
  - Selector: `effectiveGroupMode(group, isMobile)`.
  - Migration from `focus-mode-restore`.
  - Storage keys `reading-mode`, `reading-profile`, `panel-hover-reveal` and `reading-mode-hint-seen`, all validated and wrapped in try/catch.
- **`src/components/AutoHide/constants.ts`**: every value from §3.
- **`src/components/AutoHide/autoHideMachine.ts`**: a pure reducer.
  - Events: `pointerMove` (sample, zone, inside), `pointerLeaveDocument`, `pointerDown` and `pointerUp` (target class), `wheel`, `scroll` (in zone), `keydown` (kind), `focusIn` (inside, key recent), `focusLost`, `holdChange`, `esc`, `explicitOpen` (source), `explicitClose`, `modalOpen`, `blur`, `focus`, `tick`.
  - Outputs: reveal and hide decisions, the focus target, the armed state and the swallow flag.
- **Focus helpers**: move `src/components/subagents/focusRestore.ts` to `src/utils/focus.ts`, and add `moveFocusOutOf` and `isInInertSubtree`.

### Phase 2: components

- **`AutoHideRegion.tsx`** (props: `edge`, `group`, `label`, `shortcut`)
  - Pinned: renders its children in flow, as today.
  - Auto-hide: a labelled `<section>` containing the gutter or strip with the handle (and the chip slot at the top), plus the always-mounted overlay.
- **`useAutoHidePanel.ts`**: the DOM adapter.
  - Pointer Events filtered by `pointerType`, with a 100 ms ring buffer of samples.
  - Wheel, scroll, blur and visibility listeners.
  - A document `pointermove` re-check while a panel is revealed.
  - Light dismiss and swallowing, on pointer-up.
  - The bubble-phase Esc listener.
  - Pointer-movement tracking since focus entered B.
- **`AutoHideHoldContext.tsx`**: `useAutoHideHold(open)` and the `data-autohide-owner` attribute.
- **`PinToggle.tsx`** and **`TopStripChips.tsx`**.
- **`src/layouts/Header/SettingDropdown/LayoutMenuGroup.tsx`**: a "Reveal panels on hover" submenu with radio items Off, Standard and Slow, styled like the Theme and Font submenus.

### Phase 3: wiring

- **`AppLayout.tsx`**
  - Wrap Explorer and Sessions in `edge="left"`, and the navigator in `edge="right"`.
  - Host rows become `relative overflow-clip`.
  - Skip-link handlers, and the new condition for the navigator link.
  - Dock behaviour in reading mode.
  - The new `isSubagentListDocked` rule.
  - Read reading-mode state from the store directly.
- **`MessageViewer.tsx`**
  - Wrap the toolbar and `FilterToolbar` in `edge="top"`, with chips. `FilterHiddenNotice`, `CaptureModeToolbar` and `SubagentContextBar` stay in flow.
  - Put `data-transcript-area` on the container that holds `StickyPromptBar` and the scroller.
  - Search Esc fix; dynamic top clearance; focus handling when capture mode starts.
  - Move the hard-coded "Previous match", "Next match" and "Clear search" labels into `t()`.
- **`useReadingPosition.ts`**
  - Export `captureAnchor()` and `restoreAnchor(token)`, reusing the cancel set from `usePositionRestore` and adding scrollbar pointerdown.
  - Add `getTopClearance()`.
- **`useAppKeyboard.ts`**
  - Use `isActionModifier`.
  - Add Mod+Shift+E, Mod+F (with pass-through), Mod+G and F3; make Mod+Shift+M aware of auto-hide.
  - Add the guards from §4.1.
  - Use the shared `enterExitReadingMode()`.
- **Header**
  - Rename `FocusModeButton.tsx` to `ReadingModeButton.tsx`, with `aria-pressed`, a new label and a tooltip that lists the shortcuts. Update the import in `Header.tsx`.
- **`HeaderBreadcrumb.tsx`**: call `revealPanel("left", source)` when the left group is auto-hidden.
- **Panel headers**
  - Add `PinToggle` to `ExplorerHeader.tsx`, `MessageNavigator.tsx` and the end of the conversation toolbar.
  - Do not render rail-collapse buttons in reading mode (`ExplorerHeader.tsx`, `SessionsPane.tsx`).
- **Esc and holds**
  - `preventDefault` in `ImageRenderer.tsx`, `HiddenBlocksIndicator.tsx`, `ProjectContextMenu.tsx`, `SessionContextMenu.tsx` and `SessionSelectionBar.tsx`.
  - The new Esc rule for `ExplorerSearch.tsx` in reading mode, and Esc support for the navigator filter.
  - Holds and owner attributes in `ui/dropdown-menu.tsx` (opt-in prop), the context menus, the session dialogs and the Export menu.
- **`ModalProvider.tsx`**: skip inert restore targets.
- **Hint toast**: Sonner, on first reading mode.
- **i18n** in `common.json` for all 5 locales (`en, ko, ja, zh-CN, zh-TW`)
  - Replace `header.focusMode.*` with `header.readingMode.label` and `header.readingMode.tooltip`.
  - Add the on and off announcements, the toast text and its action.
  - Add the three group names (used for regions and handles), the handle tooltip pattern, the three pin names and the pin tooltip, and the pin and unpin announcements.
  - Add the chip strings, including the match-button labels.
  - Add `common.settings.layout.*` for the hover setting (title, Off, Standard, Slow).
  - Then run `pnpm run generate:i18n-types` and `pnpm run i18n:validate`.

### Phase 4: verification and optional extras

- **Gate**: all of these must pass.
  - `pnpm tsc --build .`
  - `pnpm exec vitest run`
  - `pnpm lint`
  - `pnpm run i18n:validate`
  - The Playwright scenarios in §7.2
  - The owner task check in §7.3
- **Optional, only if approved**
  - F6 / Shift+F6 region cycling (Tauri).
  - A reading-width cap in reading mode (owner decision a).
  - The follow-up issue for a single-pointer alternative to the pinned sashes (WCAG 2.5.7, an existing gap).

**Changed files (absolute paths):**
- `src/store/slices/layoutSlice.ts`
- `src/store/slices/types.ts`
- `src/store/slices/layoutSlice.test.ts`
- `src/layouts/AppLayout.tsx`
- `src/components/MessageViewer/MessageViewer.tsx`
- `src/components/MessageViewer/hooks/useReadingPosition.ts`
- `src/components/MessageViewer/components/HiddenBlocksIndicator.tsx`
- `src/components/contentRenderer/ImageRenderer.tsx`
- `src/hooks/useAppKeyboard.ts`
- `src/hooks/useAppKeyboard.test.tsx`
- `src/layouts/Header/FocusModeButton.tsx` (renamed to `ReadingModeButton.tsx`)
- `src/layouts/Header/Header.tsx`
- `src/layouts/Header/HeaderControls.test.tsx`
- `src/layouts/Header/HeaderBreadcrumb.tsx`
- `src/layouts/Header/SettingDropdown/index.tsx`
- `src/components/ProjectTree/components/ExplorerHeader.tsx`
- `src/components/ProjectTree/components/ExplorerSearch.tsx`
- `src/components/SessionsPane/SessionsPane.tsx`
- `src/components/MessageNavigator/MessageNavigator.tsx`
- `src/components/ProjectContextMenu.tsx`
- `src/components/SessionItem/components/SessionContextMenu.tsx`
- `src/components/SessionItem/components/SessionSelectionBar.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/contexts/modal/ModalProvider.tsx`
- `src/components/subagents/focusRestore.ts` (moves to `src/utils/focus.ts`)
- `src/test/App.accessibility.test.tsx`
- `src/components/SessionsPane/SessionsPane.collapse.test.tsx`
- `src/components/MessageViewer/MessageViewer.subagentPanel.test.tsx`
- `src/i18n/locales/{en,ko,ja,zh-CN,zh-TW}/common.json`

**New files:**
- `src/components/AutoHide/` containing `constants.ts`, `autoHideMachine.ts`, `useAutoHidePanel.ts`, `AutoHideRegion.tsx`, `AutoHideHoldContext.tsx`, `PinToggle.tsx`, `TopStripChips.tsx` and their tests.
- `src/layouts/Header/SettingDropdown/LayoutMenuGroup.tsx`
- `src/utils/focus.ts`

---

## Appendix: Objection log

Key: **S** is the standards skeptic (Claude), **I** the irritation skeptic (Claude), **G** Gemini and **C** Codex. Numbers follow each review's order.

**Totals:** 28 ACCEPT, 14 PARTIAL, 6 REJECT.

| Reviewer | Severity | Topic | Decision | Reason |
|---|---|---|---|---|
| S1 | blocker | Overlay covers its own focused handle | ACCEPT | The draft placed the overlay over its gutter. It now starts at the gutter's inner edge, the handle stays visible as the close toggle, and an `elementFromPoint` test guards this |
| S2 | major | Screen-reader activation misread as pointer input | ACCEPT | H4 no longer uses "last input". Focus holds until the pointer has moved 24 px, which activation by assistive technology does not do |
| S3 | major | Touch closes the panel after every tap | ACCEPT | On touch, `pointerleave` follows every `pointerup`. Touch opens, and pen opens without hover, are now sticky until dismissed |
| S4 | major | No visible close control; dismiss clicks pass through | PARTIAL | The always-visible handle is the close control, so no extra button. Dismiss clicks on interactive transcript targets are swallowed for every pointer type, not only touch |
| S5 | major | Hover on by default, out of reach for magnifier and gaze users | PARTIAL | Hover is limited to the 96 px band, and Off, Standard and Slow sit in the always-visible header settings menu and on the first-use toast. No toggle in every overlay header. The default stays owner decision (b) |
| S6 | major | Pointer-leave close sends focus to `#main-content` | ACCEPT | Focus now goes to the group's handle, which is visible again. This matches the APG rule of returning to the invoker, and the Esc path |
| S7 | minor | Focus ring clipping | ACCEPT | Handles, chips and pins use an inset ring, so `overflow: clip` cannot cut it. A screenshot check is added |
| S8 | minor | Label in name; duplicate pin names | PARTIAL | Tooltip text now starts with the stable accessible name. The toggle is not renamed "Show …", because a disclosure keeps a stable name. Pin names are now per group |
| S9 | minor | Chip text only in `title`; fixed 24 px strip | ACCEPT | The strip uses a minimum height, not a fixed one. Chips are focusable buttons with full-text tooltips and names |
| S10 | minor | 2.4.12 claim; hover covering keyboard focus | ACCEPT | Only 2.4.11 is targeted. Navigation keys close hover-opened overlays, and hover is blocked for 1 s after a key press |
| S11 | minor | Landmarks disappear; announcements repeat | ACCEPT | Each hidden group is a labelled region that holds its handle. The first-use toast replaces the live-region message and stays until dismissed |
| S12 | minor | Unverified standards citations | ACCEPT | ISO 9241-171 is cited by principle. 2.2.1 is marked not applicable. §6 is reworded as intent plus check, with no conformance claim, as CLAUDE.md requires |
| I1 | blocker | Text fields focused by mouse do not hold the panel | ACCEPT | H4 now holds whenever focus is in an editable element, whatever the input device. Playwright case 8 is added |
| I2 | major | A parked cursor, or pauses while scrolling, reveal panels | ACCEPT | Hover works only in the 96 px band. A scroll with the pointer in a zone disarms it until the pointer leaves. The fallback applies only in the band. Parked-pointer and wheel-pause tests are added |
| I3 | major | Search has no path while the toolbar is hidden | PARTIAL | Added Mod+G and F3, plus chips as buttons with ↑/↓. Rejected an in-place Dialogue toggle and an always-visible Dialogue chip: a filter toggle in a 24 px strip invites accidental changes and adds a permanent control to the reading view |
| I4 | major | Mod+F as a toggle breaks find-bar habits | ACCEPT | Mod+F always reveals, focuses and selects. Only Esc, the handle or focus leaving closes the top overlay |
| I5 | major | Too many modes; a pin made in reading mode is discarded | ACCEPT | Auto-hide exists only as reading mode's saved profile, and pins edit that profile. The normal layout has no pin and reading mode has no rail button, so the two never appear together |
| I6 | major | Light dismiss presses transcript controls | ACCEPT | Interactive targets inside the transcript area are swallowed. Clicks on text still pass through for the caret and selection, and the header and pinned panels are unaffected |
| I7 | minor | Repeated session hops pay the full wait | ACCEPT | Warm re-entry opens in 150 ms within 2 s of a pointer-leave close. Standard only, and never after Esc |
| I8 | minor | Esc list misses document-level handlers | ACCEPT | Checked: `ImageRenderer.tsx:60` and `HiddenBlocksIndicator.tsx:100` lack `preventDefault`, which is now added. `ScreenshotPreviewModal.tsx:70` already has it |
| I9 | minor | Top strip costs a permanent row | REJECT | `StickyPromptBar` is `absolute … z-20` and returns null outside a long turn, so a handle merged into it would jump. A 0 px strip would put the handle over text |
| I10 | minor | Reading mode forces a right reveal surface | REJECT | Today's focus mode already leaves a 48 px navigator rail. The 24 px gutter is narrower, and band-only hover removes the trigger next to the scrollbar |
| G1 | blocker | Mod+F and Mod+Shift+M conflict with the browser | PARTIAL | Mod+F is taken only while a conversation is open, because browser find misses virtualized rows, the Linux and macOS webviews have no find UI, and Slack and Discord bind it the same way. A second press in the fully selected field passes through to browser find. Mod+Shift+M is an existing binding. The handles remain |
| G2 | blocker | Focus taken from the handle on pointer leave | PARTIAL | The rule only ever moved focus that was inside the panel. That is now stated explicitly, and the target is the handle instead of `#main-content` |
| G3 | major | Closing on focus-out is too eager | PARTIAL | Focus-out now means a `focusin` outside the boundary. Owned portals count as inside; window blur, the address bar and OS popups are excluded. Focus changes driven by the pointer while it is inside do not close; keyboard-driven ones still do |
| G4 | major | Fitts's law on the right gutter | REJECT | The dock is closed in reading mode, so the right gutter sits at the window edge. The target is a visible 24×96 band with a 700 ms fallback that needs no rest, and a click also works |
| G5 | major | Focus ring would be clipped | ACCEPT | Inset rings on every edge control |
| G6 | major | Hover reveal may cover transcript focus | PARTIAL | No rectangle-overlap test: mouse users always have incidental focus somewhere, so it would cause failed opens. Instead, hover is blocked for 1 s after a key press and navigation keys close hover-opened overlays |
| G7 | minor | Wrong WCAG 3.2.3 citation | ACCEPT | Removed. Handle placement is now justified by ISO 9241-110 conformity with user expectations |
| G8 | minor | Esc should return focus to the handle | REJECT | APG returns focus to the invoking context. After Mod+F that is wherever the person was. After a handle open, the return target already is the handle |
| G9 | minor | Forwarding wheel events from the gutter causes jank | REJECT | The gutter sits next to the scroller, so `pointer-events: none` would hand the wheel to the host row, not the transcript. Trackpad momentum arrives as wheel events, which forwarding keeps. Line and page delta units are normalized |
| C1 | blocker | Focus in owned portals closes the panel | ACCEPT | The boundary is now the panel, its gutter and its owned portals. Unrelated modals close all overlays, and `ModalProvider` skips inert targets |
| C2 | blocker | Hover can close a panel in active use | ACCEPT | Hover never evicts; it waits for the other overlay to close. Explicit switches move focus before `inert` |
| C3 | blocker | Known 2.5.7 gap deferred | PARTIAL | No app-wide AA claim. The feature adds no dragging, since overlays cannot be resized. The existing sash gap is recorded in a follow-up issue rather than fixed, because the owner asked for auto-hide, not resizing |
| C4 | major | Focus hold depends on guessing the input device | PARTIAL | The guessing is removed: editable focus always holds, and other focus holds until the pointer moves 24 px. "Focus always holds" is rejected, because a clicked session row would then keep the overlay over the text |
| C5 | major | 2.4.11 rationale overstated | PARTIAL | Keyboard focus leaving still closes the overlay, now justified as the auto-hide convention (Visual Studio slides tool windows back on focus loss) rather than a 2.4.11 requirement. Pointer-driven focus changes with the pointer inside no longer close it |
| C6 | major | 768–1023 px scope change | REJECT | Code: drawers exist only below 768 px (`useIsMobile` max-width 767). Focus mode already works from 768 px (`!isMobile`, `hidden md:inline-flex`). Limiting reading mode to 1024 px and up would remove a capability people have today |
| C7 | major | Click-open lifetime is unpredictable | PARTIAL | Lifetime is now a table per open source. A mouse click keeps the panel open until it has been visited, after which leaving closes it, as hover users expect. Touch and hover-Off opens are sticky. Choosing a session closes only sticky left overlays, as the drawer does |
| C8 | major | Pin preferences conflict with restoring the layout | ACCEPT | One source of truth: the reading profile. Reading mode never writes the normal layout; it remembers only whether the dock was open |
| C9 | major | Scroll veto still allows accidental reveals | ACCEPT | A scroll with the pointer in a zone disarms it until a fresh entry, and resets the wait. A Playwright wheel-pause case is added |
| C10 | major | Mod+F is not a generic toggle; test 7 contradicts itself | ACCEPT | Mod+F always opens. The query stays active after closing by click or Tab. Test 7 is rewritten to check the chip before Esc clears the query |
| C11 | major | Width and visibility guarantees incomplete | ACCEPT | The cap comes from the host's available width, counting gutters and pinned panels. The floor wins when the minimum widths do not fit. The focused element's rectangle is checked |
| C12 | major | Repeated anchor restores fight the reader | ACCEPT | Layout restores reuse the cancel set already in `usePositionRestore` (wheel, touchstart, keydown), plus scrollbar pointerdown and new jump targets |
| C13 | major | Shortcut and modal arbitration | PARTIAL | Added guards for dialogs and menus, IME composition, key repeat and editable fields. Rejected configurable bindings: the app has no keybinding system, and the handles and skip links already give a path without chords |
| C14 | major | Validation cannot support "best UX" | PARTIAL | Timings are labelled hypotheses, with an adjustable speed and an owner task check with defined measures and a local debug log. A study with several participants is out of proportion for a deployment whose main user is its owner |
| C15 | minor | Traceability misstates scope | ACCEPT | §6 is rewritten as intent plus an observable check. The 3.2.3 and constants-module rows are removed, 2.2.1 is not applicable, and 3.2.1 is described accurately |
| C16 | minor | Target-size claims; hybrid input | ACCEPT | The 44 px handles are described as an improvement, not conformance. One `pointer: coarse` condition sizes both gutter and handle |
| C17 | minor | Clipped focus; truncated status text | ACCEPT | Inset rings. Chips are focusable, with full-text tooltips |