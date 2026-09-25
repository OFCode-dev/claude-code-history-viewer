# Spec: dialogue-and-navigation

- Status: Active — implementation
- Created: 2026-09-25
- Branch: `feature/ui-refresh` (fork OFCode-dev), based on upstream `develop`

## Problem / goal

Original ask (translated): "In this interface I want two things to be more fluid, wider and more
prominent: the user's back-and-forth messages in a session, and navigation while browsing
directories." Follow-up: "Sessions also need proper navigation for SubAgent sessions."
All UI text is English (i18n `en` is the source; other locales get translations).

Measured on the live instance (1440×900, explorer 372 px):

- Explorer 372 + sessions pane 312 + navigator 280 leave **476 px** for the conversation
  (956 px at 1920 wide). The user prompt bubble is `lg:max-w-lg` (512 px) at 12 px; assistant
  cards are `md:max-w-2xl` (672 px).
- 78 % of `type:"user"` records are tool results; of ~2,700 user records in 8 sessions only
  ~180 were typed by a person (the rest: task notifications, slash commands + output, interrupts,
  compaction summaries). `isMeta` records are already dropped by the backend.
- The navigator's "user messages only" mode therefore lists mostly noise (1 real prompt of 5
  entries in a live sample). Turning off "Tool Calls" hides tool_use blocks but **not** their
  tool results, so no filter combination yields a clean dialogue.
- The navigator has no scroll-spy; there is no next/previous-prompt navigation.
- "Group by directory" is a single level keyed by the immediate parent directory: parent and
  child projects land in separate sibling groups (e.g. `~/projects` and
  `~/projects/computer-management`). Group expansion is not persisted; no collapse-all.
- The header shows project/session as inert text. The conversation toolbar's chevron-left
  "Back" button always opens the Session Board. WebUI deep links (`?session=&msg=`) already push
  browser history entries.
- Subagent transcripts are listed as chips labelled with the first words of their prompt;
  `agent-<id>.meta.json` already holds `description`, `agentType`, `model`, `toolUseId`, but only
  `toolUseId` is read. There is no sibling navigation and no context bar inside a subagent.
- Session switching costs ~0.3 s (backend page load 25–135 ms even for a 41 MB file) but the
  reading position is lost on return.

## What "done" looks like

1. A **Dialogue** view (one click) shows only human prompts and assistant prose.
2. Human prompts render as prominent, wide **prompt cards**; system-injected user records render
   as compact muted rows.
3. The navigator defaults to a **Prompts** list with scroll-spy, previews that show the actual
   question, subagent spawn markers; a sticky "current prompt" bar and Alt+↑/↓ jump between
   prompts; returning to a session restores the reading position.
4. "Group by directory" is a **real nested tree** with compact folders, persisted expansion,
   collapse-all and reveal-on-request.
5. The header is a **clickable breadcrumb** (path → explorer reveal, parent session, subagent)
   with Back/Forward (WebUI); the Board button says what it does; the sessions pane can collapse
   and a **focus mode** reclaims width.
6. **Subagents** have proper names, a context bar with parent/prev/next navigation, an
   "Open transcript" action on spawning tool calls, and a list in the sessions pane.
7. All gates pass: `tsc --build .`, `vitest run`, `eslint`, `i18n:validate`, and for backend
   changes `cargo test -- --test-threads=1`, `cargo clippy --all-targets --all-features -D warnings`,
   `cargo fmt --check`.

## Shared foundation (already on the branch — use it, do not re-implement)

- `src/utils/userMessageKind.ts` — `getUserMessageKind(message)` →
  `"prompt" | "toolResult" | "command" | "commandOutput" | "taskNotification" | "systemContext" |
  "interrupt" | "compactSummary" | "empty"` (null for non-user records); `isHumanPrompt()`,
  `getUserMessageText()`, `getPromptPreview(text, maxLength)` → `{ text, fromTail }` (long
  prompts = pasted context + closing question → the question).
- `src/utils/turns.ts` — `buildTurnAnchors(list)` (prompts of a rendered list, 1-based
  `turnNumber`, `messageIndex` into that list) and `findTurnForIndex(anchors, index)`.
  Turn numbers are only absolute when the loaded window starts at the beginning of the session;
  when older pages are not loaded, **omit the number** rather than show a wrong one.
- `src/utils/subagentLabel.ts` — `getSubagentLabel(subagent)` (description → summary → id).
- `SubagentSession` TS type has optional `description`, `agent_type`, `model` (W5 fills them).
- Store: `explorerRevealRequest: { path, nonce } | null`, `requestExplorerReveal(path)`,
  `clearExplorerRevealRequest()` (navigation slice). W4 produces requests, W3 consumes them.

## Workstreams and ownership

Keep edits inside your area. Small, clearly separated hunks in shared hotspots are allowed where
listed; put new UI in **new component files** and mount them with a few lines.

### W1 — Conversation: dialogue view and prompt cards

Files: `src/components/messageRenderer/MessageContentDisplay.tsx` (+ new `PromptCard`),
`src/components/MessageViewer/helpers/messageDisplayFilter.ts`,
`src/components/MessageViewer/components/FilterToolbar.tsx`, `src/store/slices/filterSlice.ts`,
`ClaudeMessageNode.tsx` only as needed, renderers for the compact system rows.

- **Prompt card** for `getUserMessageKind === "prompt"`: left-aligned (no right-aligned bubble),
  same width as assistant cards; both use a shared width
  `max-w-[95%] md:max-w-2xl xl:max-w-3xl`. Accent left border (3 px), subtle accent tint
  background, normal foreground text at 13 px (`text-xs` in this theme). Header row: "You" ·
  time · "Turn N" (only when absolute) + copy and expand/collapse actions. Keep existing
  capture-mode/expand-state integration (`useCaptureExpandState`).
- **Show more**: collapse when a prompt has > 12 lines **or** > 1,200 characters. When collapsed
  and `getPromptPreview(...).fromTail` is true, show the first ~6 lines, an ellipsis row and the
  closing question, so the ask is always visible. Assistant cards keep their current behaviour.
- **Compact rows** for `commandOutput`, `taskNotification`, `systemContext`, `interrupt`,
  `compactSummary` (and `empty`): one muted line with an icon and a short label, expandable to
  the full content. Slash commands keep the existing command renderer but must not look like
  prompts.
- **Dialogue toggle** in the filter toolbar (English label "Dialogue", with tooltip): a separate
  persisted flag in the filter slice (do not mutate the individual toggles, so turning it off
  restores them). When on: show prompts and assistant text blocks only; hide tool calls, tool
  results, thinking, commands and their output, task notifications, system rows, progress and
  empty assistant messages. The individual toggles appear disabled while it is on.
- **Consistency fix**: with "Tool Calls" off (dialogue off), also hide `toolResult` user records.
- Tests: filter semantics (dialogue on/off, tool results follow Tool Calls), prompt card
  rendering (header, collapse with tail question), compact rows.

### W2 — Navigator, turn awareness, position restore

Files: `src/components/MessageNavigator/**`, `src/store/slices/navigatorSlice.ts`, new
`src/components/MessageViewer/components/StickyPromptBar.tsx`; small hunks in
`MessageViewer.tsx` (publish the first visible row; mount the bar), `useAppKeyboard.ts`
(Alt+↑/↓) and `messageSlice.ts` (position restore in `selectSession`).

- Navigator header gets a two-option segmented control **Prompts | All** (replaces the
  person-icon toggle; accessible names). Default **Prompts**; persist the choice (localStorage,
  try/catch).
- Prompts mode lists human prompts only, computed with `buildTurnAnchors` over the same list the
  navigator already uses. Item: "Turn N" (if absolute) · time, 1–2 line preview from
  `getPromptPreview` (leading "…" when `fromTail`), a meta line "N steps" (records until the next
  prompt) and, when the turn spawned subagents (assistant `tool_use` named `Agent`/`Task`), compact
  child rows with the tool input `description` that jump to that tool call.
- **Scroll-spy**: highlight the turn containing the first visible conversation row and keep it in
  view in the navigator list (do not fight the user while they scroll or hover the list). Publish
  the anchor from the virtualizer, throttled (≤ 10 updates/s) and only on change; subscribe
  narrowly so the conversation does not re-render on scroll.
- Collapsed rail shows the prompt count (tooltip "N prompts").
- **Sticky prompt bar** at the top of the conversation when the current turn's prompt is above the
  viewport: "You · time — preview", buttons "Previous prompt" / "Next prompt" / jump to this prompt.
  It must not collide with `FloatingDateOverlay` (offset the date pill or fold the date into the
  bar).
- **Keyboard**: Alt+↑ / Alt+↓ jump to previous / next prompt when focus is not in an editable
  field.
- **Position restore**: remember the last viewport anchor per session in memory (LRU, ~30
  sessions). On re-selecting a session with no explicit target (deep link, search), scroll to the
  anchor if it is inside the loaded window; do not load extra pages for it.
- Tests: prompts list excludes noise, scroll-spy mapping (pure part), keyboard jump, restore.

### W3 — Explorer: nested directory tree

Files: `src/utils/worktreeUtils.ts` and/or new `src/utils/directoryTree.ts`,
`src/components/ProjectTree/**` (not `components/SessionList.tsx`), tree keyboard helpers.

- "Group by directory" becomes a real hierarchy over `actual_path`: roots `~` (home) and `/`.
  A folder node exists only when its subtree holds ≥ 2 projects; a single project is lifted to
  the nearest folder with a relative-path subtitle. **Compact folders**: chains of single-child
  folders without their own project render as one node (`crawl/reports`). A folder that is itself
  a project shows that project as its first child row (a normal project row).
- "Temporary locations" and "Unavailable locations" stay special top-level buckets.
- Folder rows show the number of projects in their subtree.
- Expansion persisted (localStorage, try/catch); by default the roots and the ancestors of the
  selected project are expanded. Add a **Collapse all** button in the explorer header for the
  grouped modes.
- **Reveal**: consume `explorerRevealRequest` — switch to directory grouping if needed, expand the
  ancestors of the path (folder or project), scroll into view, focus the row, then call
  `clearExplorerRevealRequest()`.
- ARIA tree pattern with nested `role="group"`, correct `aria-level`/`aria-expanded`; keyboard:
  Up/Down/Home/End/typeahead over visible rows, Right expands or moves to the first child, Left
  collapses or moves to the parent. Keep flat and worktree modes, provider merging and existing
  tests working.
- Tests: pure tree builder (compaction, lifting, special buckets, counts), keyboard navigation,
  reveal consumption.

### W4 — Header breadcrumb, history, layout width

Files: `src/layouts/Header/**`, `src/layouts/AppLayout.tsx`,
`src/components/SessionsPane/SessionsPane.tsx` (header + collapse only); small hunks in
`useAppKeyboard.ts` (focus mode) and the `MessageViewer.tsx` toolbar (Board button).

- **Breadcrumb** replaces the inert project/session text: path segments of the selected project
  (home as `~`) → each calls `requestExplorerReveal(absoluteSegmentPath)`; then the session title
  (current page, `aria-current="page"`); when viewing a subagent (`parentSessionStack` non-empty):
  parent session (click returns to it) › subagent label (`getSubagentLabel`). Middle segments
  collapse to "…" when space is tight; full path in `title`; `<nav aria-label="Breadcrumb">`.
- **Back / Forward** icon buttons before the breadcrumb in WebUI mode (`history.back/forward`);
  hidden in the desktop build.
- The conversation toolbar's chevron-left button opens the Session Board: give it a board icon and
  the accessible name/tooltip "Session Board".
- **Sessions pane collapse** to a narrow rail (session count + expand button), persisted.
- **Focus mode**: header button + `Mod+Shift+F` (ignored in editable fields) collapses explorer,
  sessions pane and navigator to their rails and restores the previous state on second use.
- Tests: breadcrumb segments and reveal requests, subagent crumbs, focus-mode toggle/restore,
  sessions-pane collapse persistence.

### W5 — Subagent navigation

Files: `src-tauri/src/commands/session/load.rs` (`SubagentSession` + meta parsing, Rust tests),
new `src/components/MessageViewer/components/SubagentSessionsPanel.tsx` (extract it from
`MessageViewer.tsx`), new `SubagentContextBar.tsx`, subagent parts of `messageSlice.ts`, a
section below the header in `SessionsPane.tsx`, agent/Task tool cards.

- Backend: read `description`, `agentType`, `model` from `agent-<id>.meta.json` (already opened
  for `toolUseId`) into `SubagentSession.description / agent_type / model` (`Option<String>`,
  snake_case like the other fields). Tolerate missing or malformed meta. Rust unit tests.
- **Subagent list** (the "SubAgent Sessions" panel): rows with `getSubagentLabel`, agent type ·
  model badges, message count, relative time; keyboard accessible; keeps workflow grouping.
- **Context bar** inside a subagent transcript: "Subagent · label · type · model", "Back to
  <parent session title>", Previous / Next subagent with "i of n". Keep the parent's subagent list
  while inside a subagent (loading the child must not replace it).
- Spawning `Agent`/`Task` tool cards get an explicit "Open transcript" action when the tool use
  maps to a subagent (`toolUseToSubagentMap`).
- **Sessions pane**: when the selected session has subagents, a collapsible "Subagents (n)"
  section under the pane header lists them; the active one is highlighted.
- Tests: Rust meta parsing; label/badges; sibling navigation; context bar actions.

## Rules for every workstream

- English UI text through i18n. Add each new key to **all five** locales (`en`, `ko`, `ja`,
  `zh-CN`, `zh-TW`) — English text as a placeholder outside `en` is fine (translated later) —
  next to related keys, not at the end of the file. Then `pnpm run generate:i18n-types` and
  `pnpm run i18n:validate`. Namespaces: conversation/navigator → `message.json`
  (`dialogue.*`, `promptCard.*`, `navigator.*`), explorer/sessions/subagents → `session.json`
  (`project.*`, `session.*`, `subagent.*`), header → `common.json` (`header.*`).
- Follow the repo checklist in `CLAUDE.md` (a11y labels, `useId` for label/input pairs,
  `localStorage` in try/catch, `!= null`, no `console.error`-only error handling).
- Tests first for pure logic. Known pre-existing flaky test:
  `src/components/RecentEditsViewer/RecentEditsOptionsMenu.test.tsx` (timeouts).
- Commit on your own branch `ws/<name>` with English conventional commits; do not push.
- Use only synthetic fixture data for visual checks; never read real `~/.claude` sessions.

## Visual check tooling (nexus)

- Fixtures: `scratch/fixture-home` (regenerate: `python3 scratch/fixtures/make_fixture_home.py`).
- Server: `scratch/serve-fixture.sh start <port> <abs path to your dist>`; stop with
  `scratch/serve-fixture.sh stop <port>` (uses the installed `cchv-server --dist`, so frontend
  changes need only `corepack pnpm exec vite build`).
- Screenshots: `node scratch/ui-shot.cjs --port <port> --out <png> [--project <suffix>]
  [--session <n>] [--grouping directory] [--eval "<js>"]`.
- Ports: W1 3741, W2 3742, W4 3744, W5 3745 (W3 runs on bayrak without a server).
