# Spec: explorer-declutter

- Status: Active — implementation
- Created: 2026-09-27
- Branch: `feature/ui-refresh` (fork OFCode-dev; no pull requests, the work stays on the fork)
- Follows: `specs/20260925-dialogue-and-navigation` (W3 nested tree, W5 subagent navigation)

## Problem

The user reviewed the overnight refresh on real data (translated): "Subagents now show in two
places — above the conversation too. You never managed to get me out of this clutter. And the
Explorer tree is not usable at all." They produced a better mockup with one ChatGPT prompt and
expect us to do better than it.

Measured on the live instance, real data (62 provider projects; 30 of the working directories
sit under `~/projects`), 1440×900, explorer 256 px:

- **The tree starts with meaningless roots.** `~` (35) and `/` (1) are rows. `~/projects` is
  one more level. Every real project is 3–5 levels deep, so names truncate to
  `antlara-ai…` and `computer-m…`.
- **A folder that is also a project shows twice.** W3 renders the folder row, then the project
  as its first child with the same name: `projects › projects`, `sessions › sessions`.
- **Rows are two or three lines tall.** The provider badge is a full-name pill ("Claude Code",
  "Codex CLI 3") on its own line. The flat list truncates names to `o…`, `se…`, `cr…` because
  the pill takes the width.
- **Header chrome takes two rows:**
  - title with a pulsing dot;
  - three grouping-mode icons;
  - a count pill;
  - an "ALL 62" collapsible;
  - reset and collapse-all buttons.
- **Global Statistics sits inside the tree.** It is a two-line tree item.
- **Temporary locations bury real ones.** They are 27 of 62 provider projects, e.g.
  `/tmp/claude-1002/<encoded project>/<session>/scratchpad`, `/tmp/tmp.XXXX`, `/tmp`. In the
  flat list they have unhelpful names ("scratchpad", "tmp").
- **Subagents are listed twice.** They appear as the docked "Subagents" section of the sessions
  pane and as the `SubagentSessionsPanel` above the conversation.

The mockup's strengths, which we must match:
- one line per row;
- names readable;
- compact two-letter provider chips;
- right-aligned counts;
- top level = the user's projects (no `~ › projects` levels);
- temporary / unavailable buckets at the bottom;
- global stats outside the tree;
- a minimal header.

Its weaknesses, which we must beat:
- the filter hides the parents of nested matches;
- select needs a double click;
- a folder icon on every row adds nothing;
- guides are hard-coded to two levels;
- there is no keyboard support and no light theme;
- temp buckets show no useful names.

## Design — Explorer

### Layout (top to bottom)

```
┌──────────────────────────────────────────┐
│ «  EXPLORER                    ⇅   ⊟     │  header, 36 px
│ ▦  Global statistics                     │  one row, 28 px, outside the tree
│ ⌕  Filter projects…              ×  ⚲•   │  32 px input; ⚲ opens the filter menu
│ [Codex CLI ×] [Source: CLI ×]            │  only when a filter is active
├──────────────────────────────────────────┤
│ PROJECTS  ~/projects                     │  section label (detected workspace root)
│ ▸ atlas-ai-ecosystem          CC CX   8  │
│   Bakbi                          CC   1  │
│ ▾ lab-management                 CC   5  │
│ │   buzz-relay                   CC   1  │
│ │ ▸ sessions                     CC   2  │
│ │   …                                    │
│   telegram-hub                CC CX   7  │
│ ──────────────────────────────────────── │
│ ▾ Other locations                     9  │  group row, open by default
│     ~                            CC   2  │
│     .claude/automation        CC CX   5  │  dim ".claude/" prefix
│     .claude-mem/observer-sessions CC 30  │
│   ▸ work                                 │  pure folder: no chips, no count
│ ▸ Temporary                          12  │  group row, closed by default
│ ▸ Unavailable                         4  │  group row, closed by default, warning tint
└──────────────────────────────────────────┘
```

### Model — `src/utils/explorerModel.ts` (new, pure, unit-tested)

Replaces `src/utils/directoryTree.ts`. Delete that file and its test once nothing imports it.

1. **Locations.** Merge the visible projects by working directory:
   - Key: `getPathIdentity(actual_path || path)`, trailing separator dropped. Reuse the helpers
     from directoryTree.ts: path identity, Windows/UNC handling, home detection, collator.
   - A location holds:
     - `projects`: every provider project for that folder;
     - `primary`: most sessions; tie → latest `last_modified`;
     - `sessionCount`: the sum;
     - `lastActivity`: max `last_modified`;
     - `providers`: distinct provider ids, most sessions first.
2. **Buckets.** Checked in this order, before anything else:
   - **Unavailable:** `path_status === "unavailable"`.
   - **Temporary:** `isProjectTemporary`. Extend `TEMP_PATH_PATTERNS` with Claude Code
     background-job folders: `^/(?:home|Users)/[^/]+/\.claude/jobs/` and the Windows
     equivalent.
   - **No path:** empty, `unknown`, or not absolute, e.g. the `Antigravity CLI` project whose
     `actual_path` is `"unknown"`. These go to **Other locations** with `variant: "unknown"`
     and the project name as label.
3. **Workspace root.** Among the remaining locations `L`, consider directories strictly below
   home (depth ≥ 1).
   - `inside(D)` = the number of locations strictly inside `D`.
   - The root is the deepest `D` with `inside(D) ≥ 3` and `inside(D) ≥ 0.5 × |L|`.
   - No such `D` → no root. The section shows the home-relative tree (rule 5) and **Other
     locations** is empty.
   - Examples:
     - Real data: `~/projects` (≈ 28 of 35).
     - Fixture: `~/projects` (28 of 43). `~/projects/lab-management` holds 8, which is below
       half.
4. **Main section** = the tree of locations strictly inside the root, relative to the root.
   - **Compaction.** Same rules as W3:
     - A subtree holding one location is lifted to the nearest row. The skipped folders become
       a dim **prefix** (`tmp/` + `debate2`).
     - A chain of single-child folders without an own location collapses into one row
       (`tools/cli`). The dim prefix is `tools/`, the name `cli`.
   - **Folder-is-project (the W3 duplication fix).** A folder row whose path is itself a
     location *is* that location's row:
     - it carries the chips and the count;
     - clicking it selects the project;
     - its chevron toggles the children.
     - Never render the location again as a child.
   - **Pure folders.** A folder row without an own location has no chips and no count.
   - **Worktrees.** A location whose primary (or any) project has `git_info.worktree_type ===
     "linked"` and a `main_project_path` equal to another location's path is moved under that
     location as a child row. It gets `variant: "worktree"`, a `GitBranch` icon and the label
     `getWorktreeLabel(actual_path)`. It is removed from its directory position. This replaces
     the "Group by worktree" mode.
5. **Other locations** = every remaining location, as one tree relative to home:
   - the workspace root's own location (if any);
   - locations elsewhere under home;
   - locations outside home, relative to `/`, a drive or a UNC share, labelled from that base;
   - the no-path projects.
   - The same compaction and folder-is-project rules apply.
   - Home itself is a row labelled `~` with `variant: "home"` (a `House` icon), listed first.
   - No-path projects are listed last.
6. **Temporary** and **Unavailable** are flat lists (no nesting), sorted by `lastActivity`
   descending. Each row has a label plus a dim hint:
   - **Claude Code scratchpad:** `^/(?:private/)?tmp/claude-\d+/(<encoded>)/<uuid>/scratchpad(?:/(.*))?$`.
     - Label: `<owner> scratchpad` (+ `/<rest>` when present).
     - Hint: the first 6 characters of the session uuid.
     - `<owner>` is the leaf name of the non-temporary location whose Claude-encoded path
       (every character outside `[A-Za-z0-9]` replaced by `-`) equals `<encoded>`.
     - If no location matches, the owner is the last `-`-separated token of `<encoded>`.
   - **Background job:** `~/.claude/jobs/<id>/…`.
     - Label: `job <first 8 of id>`.
     - Hint: `~/.claude/jobs`.
   - **Anything else:**
     - Label: the path leaf (`/tmp` itself is labelled `/tmp`).
     - Hint: the compact parent path (`/tmp`, `~/projects/lab-management`).
7. **Sort.** `"name"` (default) or `"recent"`, applied at every level of the main section and
   Other locations.
   - Name: rows sorted by name with the numeric, case-insensitive collator; folders and
     projects are interleaved.
   - Recent: rows sorted by subtree `lastActivity`, descending.
   - Exceptions in Other locations: home first, no-path last.
   - Buckets are always recent-first.
8. **Filter.** `filterExplorerModel(model, query)`. Case-insensitive substring match against:
   - the row label;
   - the display path (home as `~`);
   - every provider project's `name`.

   Rules:
   - Keep a row when it or a descendant matches. Drop empty folders and empty groups.
   - Return `revealKeys`: every ancestor folder or group of a match. The UI opens them for the
     duration of the search only (reuse the existing search-expansion ref, so they are never
     persisted).
   - Return the matched ranges per row, used for highlighting.
9. **Keys.** Every row key is stable across rebuilds, sorts and filters:
   - Rows with children use `dir:<identity>`. They persist through the existing
     `projectTree.expandedGroups` storage, where `isGroupExpansionKey` accepts `dir:` and
     `group:`.
   - Leaf rows use `loc:<identity>`.
   - Groups use `group:other-locations`, `group:temporary-projects` and
     `group:unavailable-projects`; keep the existing bucket constants.
   - `group:other-locations` opens by default the first time it appears. Use the
     `expandDefaultRoots` seen-list mechanism.
10. **Lookup.** `locateInExplorer(model, path)` returns
    `{ key, ancestorKeys, match: "exact" | "descendant" | "ancestor" }` with the same
    semantics as W3's `locateInDirectoryTree`. `findRowForProject(model, projectPath)` returns
    the row whose location contains that provider project.

### Row anatomy

The row component is new (`ExplorerRow.tsx`). Every row is `<button role="treeitem">`, as
today.

- **Size and indent.** `h-7` (28 px), single line. Left padding `8 px + level × 14 px`. Right
  padding 8 px.
- **Indent guides.** For each ancestor level, a 1 px vertical line (`bg-border/60`),
  absolutely positioned, at every depth. Not only two levels.
- **Chevron.** 14 px `ChevronRight`, rotating 90° when open.
  - For leaves the slot stays, invisible, so names align.
  - Pointer: clicking the chevron toggles without selecting. Clicking elsewhere on a
    location row selects it and leaves its expansion alone. Clicking a pure folder row, or
    pressing Enter on it, toggles it.
  - Re-clicking the selected row:
    - with the sessions pane: does nothing. Today `handleProjectSelect` clears the selection,
      which wipes the sessions pane on an accidental double click. `ProjectTree` must not call
      `onProjectSelect` for the row that is already selected.
    - with inline sessions (below `lg`): toggles that row's inline session list instead.
- **Icon slot.** Only when it means something:
  - `House` for home;
  - `GitBranch` for worktrees;
  - `HelpCircle` / `CircleDashed` for no-path;
  - nothing for ordinary folders and projects.
- **Name.**
  - Style: `text-[12.5px]` in `text-sidebar-foreground/85`, truncated.
  - The dim prefix (`tools/`) precedes it in `text-muted-foreground/60`.
  - A dim hint follows it in `text-[11px] text-muted-foreground/55`.
  - The hint truncates first, then the prefix, and the name last. Use flex with
    `shrink-[3]` / `shrink-[2]` / `shrink`, each part `truncate`.
  - Filter matches are wrapped in `<mark class="bg-accent/25 text-inherit rounded-[2px]">`.
- **Provider chips.** New `ProviderChip` component, `src/components/ProjectTree/components/ProviderChip.tsx`.
  - Two-letter code, `text-[9.5px] font-semibold leading-none`, `h-4 px-1 rounded-[3px]`,
    colours from `PROVIDER_BADGE_STYLES`.
  - Add `PROVIDER_SHORT_CODES: Record<ProviderId, string>` to `src/utils/providers.ts`,
    unique uppercase codes:
    - claude CC, codex CX, copilot CP, antigravity AG, opencode OC, gemini GM;
    - cursor CU, cursor-agent CA, aider AD, amazonq AQ, cline CL, codebuddy CB, continue CN;
    - crush CR, forgecode FC, goose GS, grok GK, kimi KM, kiro KR, llm LL, ompi OM;
    - openhands OH, openinterpreter OI, pearai PA, pi PI, qwen QW, trae TR, vibe VB, zed ZD.
  - Chip `title` / `aria-label`: `"<Provider label> · <n> sessions"`.
  - Chips appear only when the existing `showProviderBadge` rule holds.
  - On a multi-provider row the chips are the provider switch (spans with `role="button"`,
    `tabIndex={-1}`, `stopPropagation`, as the current sibling chips):
    - clicking a chip selects that provider's project;
    - on the selected row, the chip of the selected provider is emphasised (`ring-1
      ring-current`), the others are at 60 % opacity.
- **Count.** `w-9 text-right text-[10.5px] tabular-nums text-muted-foreground`. It shows the
  location's total sessions. Pure folders show no count.
- **States:**
  - hover: `bg-muted/50`;
  - selected: `bg-accent/10`, a 2 px inset left bar in the accent colour (box-shadow, no
    layout shift), name `text-foreground font-medium`;
  - focus-visible: `ring-1 ring-inset ring-ring`.
- **Tooltip** (`title`) on location rows, one line per fact:
  - full path;
  - per-provider session counts;
  - "Last active <relative time>".
- **Unavailable rows.** Keep the `AlertCircle` warning icon and the
  `data-testid="project-path-unavailable"` hook.
- **Group rows.** "Other locations", "Temporary" and "Unavailable" use the same height:
  - chevron + label in `text-[12px] font-medium text-muted-foreground`;
  - the count on the right;
  - a divider above the first group;
  - Unavailable uses `text-warning`.
- **Section label.** `PROJECTS` in `text-[10px] font-semibold tracking-[0.08em] uppercase
  text-muted-foreground/80`, then the root display path (`~/projects`) in mono
  `text-muted-foreground/60`. It is not a treeitem.

### Header, filters, global stats

- **Header row** (36 px):
  - the existing collapse-sidebar button;
  - `EXPLORER` in `text-2xs font-semibold uppercase tracking-widest text-muted-foreground`;
  - right side: a sort button (`ArrowUpDown`, `DropdownMenu`, radio items "Name" and
    "Recent activity", persisted in `localStorage["projectTree.sort"]`, try/catch);
  - "Collapse all" (`ChevronsDownUp`, `collapseAllGroups`).
  - Remove:
    - the pulsing dot;
    - the project-count pill;
    - the three grouping-mode buttons;
    - the "ALL n" collapsible;
    - the reset button in the header.
- **Global statistics.** One 28 px row: a `BarChart3` or `Database` icon and "Global
  statistics". It is outside `role="tree"`, a plain button with `aria-pressed` for the
  active state. Keep `handleGlobalStatsClick`.
- **Filter input.**
  - 32 px, `Search` icon, a clear `×` when non-empty, placeholder "Filter projects…".
  - Escape clears the input, then blurs it.
  - A filter button (`ListFilter` icon) sits at the input's right end. It shows a dot when
    providers or source differ from the defaults, and opens a `DropdownMenu` with:
    - **Providers:** a `DropdownMenuCheckboxItem` per selectable provider, labelled with the
      provider name, its chip and its project count. Unavailable providers are disabled.
      Keep `handleProviderTabClick` / `applyProviderSelection` semantics.
    - **Source:** radio items (`ENTRYPOINT_FILTER_OPTIONS`).
    - "Find other providers" (`handleDiscoverProviders`).
    - "Reset filters".
- **Active-filter chips.** Shown only when not at the defaults, one line under the input:
  - one chip per selected provider when not all are selected;
  - one chip for the source when it is not "all".
  - Each chip has a `×` that removes that constraint.
- **Collapsed rail** (48 px). Keep, minus the decorative gradient. Contents: expand button,
  global stats icon, project count.

### Behaviour kept

- **Selection.**
  - Clicking a location row selects its `primary` project, or the already-selected provider
    project if the selection is in that location.
  - When the selection changes from elsewhere (search, deep link, breadcrumb, session pick),
    open the ancestors of its row once per selection and scroll it into view (`block:
    "nearest"`). This keeps the existing `appliedSelectionRef` / pending-scroll behaviour.
- **Inline sessions.** When `inlineSessions` is on (below `lg`), the selected location's
  sessions render under its row with the existing `SessionList`, indented one level.
- **Keyboard.** Keep the ARIA tree semantics and the existing handler:
  - roving tabindex;
  - arrows (Right opens a closed expandable row or moves to its first child; Left closes it
    or moves to the parent);
  - Home/End;
  - type-ahead;
  - `*`;
  - Enter/Space select (the button's click);
  - live-region announcements.
  - Groups keep `role="group"` + `aria-owns`.
  - `aria-expanded` is set only on expandable rows.
- **Context menu.** Right-click, the ContextMenu key and Shift+F10 on a location row open
  `ProjectContextMenu` for its primary project with the other provider projects as
  `providerSiblings`. Pure folders and groups have no menu.
- **Hidden projects** (`isProjectHidden(actual_path)`) are excluded before building the model.
- **Breadcrumb reveal** (`explorerRevealRequest`):
  - Locate the path in the model.
  - Clear the filter when it hides the row.
  - Open the ancestors (and the group).
  - Scroll the row into view and focus it.
  - No grouping-mode switching any more.
- **Accordion expansion of project rows** for inline sessions stays as today.

### Removed

- The grouping modes. Drop:
  - the explorer toggles;
  - the `groupingMode`, `worktreeGroups`, `directoryGroups`, `ungroupedProjects` and
    `onGroupingModeChange` props of `ProjectTree`.

  The `groupingMode` user setting may stay in the store and metadata types (harmless, keeps
  old metadata files valid), but the explorer no longer reads it.
- `GroupedProjectList`, `GroupHeader`, and the W3 parts of `ProjectItem` that only served
  the old modes, once unused. Keep `SessionList`.
- Keys and i18n strings that become unused (remove them from all five locales).

## Design — Subagents in exactly one place

- **When the sessions pane is visible and not collapsed**, subagents are listed only in its
  docked "Subagents" section.
  - `AppLayout` computes `isSubagentListDocked = showSessionsPane && !isSessionsPaneCollapsed`.
  - It passes `showSubagentPanel={!isSubagentListDocked}` to `MessageViewer`, which renders
    `SubagentSessionsPanel` only when the prop is true (default true for other callers).
- **Below `lg`, or with the pane collapsed**, the panel above the conversation remains the
  one place.
- **Docked section rows become one line** (`h-7`):
  - the label (description → summary → fallback), truncated;
  - the agent type in `text-[11px] text-muted-foreground/70`, truncated first;
  - the message count right-aligned in `tabular-nums`;
  - model and timestamps move to the `title`.
  - Keep the workflow-run subheaders, the active highlight and keyboard focus rings.
- **The context bar inside a subagent** (back, previous/next) is navigation, not a list. It
  stays.

## i18n

`en` is the source; every UI string in English. Add keys to all five locales (en, ko, ja,
zh-CN, zh-TW) in the right namespace (`session.json` for `project.*`), regenerate types, and
run `pnpm run i18n:validate`. Translations may be done by the implementer; keep them short.

## Tests (vitest)

- **`explorerModel.test.ts`.** Covers:
  - location merge across providers;
  - workspace-root detection: real-like layout, no root, a tie below half;
  - compaction and prefixes;
  - folder-is-project (no duplicate row);
  - worktree nesting;
  - buckets, including `~/.claude/jobs` and unknown paths;
  - scratchpad and job labels;
  - both sorts;
  - filter (ancestors kept, empty folders dropped, match ranges);
  - stable keys;
  - `locateInExplorer`.
- **Component tests.** Rewrite `ProjectTree.directory.test.tsx`, `TreeSemantics.test.tsx` and
  `GroupedProjectList.test.tsx` (delete the files of removed components) for the new tree:
  - one row per location;
  - folder-project click selects and leaves the expansion alone;
  - re-clicking the selected row does not deselect;
  - chevron toggles only;
  - chip switches provider;
  - filter highlights and opens ancestors;
  - keyboard navigation;
  - reveal;
  - hidden projects;
  - inline sessions below `lg`.
- **Subagents:** `MessageViewer` hides the panel when `showSubagentPanel` is false; compact
  `SubagentList` rows.
- **Gates:** `pnpm tsc --build .`, `pnpm exec vitest run`, `pnpm lint` and
  `pnpm run i18n:validate` all green. The Rust side is untouched.

## Visual verification

The frontend-only change is previewed without rebuilding Rust:

```
pnpm exec vite build --outDir /abs/tmp/dist-x
scratch/serve-fixture.sh start <port> /abs/tmp/dist-x
```

The fixture HOME (`scratch/fixtures/make_fixture_home.py`, extended 2026-09-27) mirrors the real
layout with synthetic names:
- a `~/projects` root with folder-projects;
- Claude + Codex folders;
- `/tmp/claude-60999/<encoded>/<uuid>/scratchpad`;
- `~/.claude/jobs/<id>/tmp`;
- unavailable paths.

Screenshots are taken with Playwright at 1440×900 and 1920×1080, dark and light, the explorer
at its default width:
- initial;
- a folder-project selected and open;
- filter "scratch";
- Temporary open;
- the filter menu open;
- a session with subagents selected.

Expected main section for the fixture, name sort:
- atlas-ai-ecosystem (CC CX) ▸ `tmp/`debate2 (CX)
- Bakbi, cc-yank, control-center
- crawl-atlas ▸:
  - `research` ▸ (2026-09-09-market-check, 2026-09-10-evidence-round) (CX);
  - `crawl/reports/`blog-classify (CX)
- gateway, Hermes-n8n
- lab-management ▸ buzz-relay, ducs, loop-eng, relay-vcn, sessions ▸ `scratch/`review (CX),
  skills-skills, uptimekuma
- market-language-review-20260906, meta-connector, odoo, pages, private-review-pilot, teams
- telegram-hub (CC CX)
- tmux

## File ownership (parallel work)

- **Explorer:**
  - `src/components/ProjectTree/**`;
  - `src/utils/explorerModel*`, `src/utils/directoryTree*` (delete);
  - `src/utils/pathUtils.ts` (temp patterns);
  - `src/utils/providers.ts` (short codes);
  - the `ProjectTree` props in `src/layouts/AppLayout.tsx` and `src/App.tsx`;
  - `project.*` i18n keys.
- **Subagents:**
  - `src/components/SessionsPane/SubagentsSection.tsx`;
  - `src/components/subagents/**`;
  - `src/components/MessageViewer/MessageViewer.tsx` (panel condition only);
  - the `MessageViewer` prop in `src/layouts/AppLayout.tsx`;
  - `subagent.*` i18n keys.
