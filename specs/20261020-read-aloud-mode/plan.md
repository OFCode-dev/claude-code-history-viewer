# Read-aloud mode: final implementation plan

Base design: the robustness-first plan, with the user-first UX layer and the latency-first Phase-0 spike plus `prime()` added. Every valid review issue is applied. Review points that were rejected, or fixed in a different place than suggested, are listed at the end with the reason.

No files were edited. Line references were re-checked against the branch `merge/upstream-v1.32` in this pass unless they are marked "(report)".

---

## 1) Scope decision: is "response + thinking" enough?

**Yes. It is enough, and it is the right scope.** The two sources are not equally useful.

| Source | Measured reality | Decision |
|---|---|---|
| Assistant `text` blocks | This is where the content is: 2,622 blocks across 30 sessions, p50 199, p90 1,672, max 13,411 chars. About 7% of the characters are code fences or tables. | **Always on.** |
| Assistant `thinking` blocks | 86% are empty, holding only a signature (4,829 of 5,624). Non-empty ones are short summaries (p50 231, max 501 chars) and appear only on Opus. They add about 11.7% to the spoken load. There were 0 `redacted_thinking` blocks. | **Separate toggle, ON by default.** Spoken with a "Thinking:" cue (from `t()`). The label says "often empty". Empty, signature-only and redacted blocks are skipped silently. |
| Synthetic assistant rows (`message.model == "<synthetic>"`): "No response requested.", session-limit, `API Error: 529`, "Prompt is too long" | 123 history files contain them. A 300-row sample: 127 session-limit, 49 "No response requested.", 11 × 529, 6 "Prompt is too long", and others. All are `type:"assistant"` with a text block. | **Never spoken.** They are not Claude's reply. |
| tool_use, tool results, user, attachment, queue-operation, api-request, progress, isMeta, sidechain rows | Noise: paths and JSON. tool_use outnumbers text 663 to 250 in the 122 MB session. | **Never spoken.** |
| "Claude finished" cue (`system`/`turn_duration`) | 142 turn_duration rows match the 142 end_turn texts (report). | Not in v1. Open question 5. |

**What "real-time" (anlık) can mean.** There are two hard limits that no logic in the viewer can remove:
1. **No token streaming.** Claude Code writes each content block as one complete JSONL line. All 15,307 of 15,307 lines checked hold exactly one block, and no line was ever rewritten.
2. **Main session files get the whole assistant message when that message finishes.** In d0f5b56e, a thinking line stamped 12:21:17.5 already carried the final `output_tokens` and `stop_reason`, while its tool_use line was stamped 12:21:24.7. So text that comes before a large tool call reaches disk only after the tool input has also been generated. The floor is **one finished assistant message**, not one word or one block.
   - The help text says: "Reads each finished reply segment shortly after Claude writes it. Only content that arrives after you turn this on."

The app controls only what happens after the line is on disk. Today that takes 2.1 s at best, 5–7 s while Claude writes steadily, and forever if you are scrolled up. The target is 0.3–0.8 s while the tab is visible.

---

## 2) Architecture and data flow

Read-aloud gets its **own detection path**. It never reads the `messages` store and never touches `watcherSlice`, so the #367 throttles stay as they are (`src/store/slices/watcherSlice.ts:153-170`, report).

**The source is locked when the mode is turned on.** The controller captures the selected session's `file_path` and title at that moment. Browsing to another session or opening a subagent does **not** change what is being read, so you lose neither progress nor content. The pill shows the source's name. To read a different session, turn the mode off and on again there.

```
Claude Code appends to ~/.claude/projects/<p>/<session>.jsonl   (append-only)
        │
        │ (A) chained 300 ms poll, runs whenever the mode is on (browser may throttle it when hidden)
        │ (B) immediate fetch on visibilitychange → visible
        │ (C) WebUI only: SSE 'session-file-changed' → useFileWatcher (100 ms debounce)
        │       → handleSessionChanged → readAloudHandle.poke(sessionPath)   (one added line,
        │         src/hooks/useAppInitialization.ts:29-34; only fires while watcherEnabled)
        ▼
ReadAloudController  (src/services/readAloud/controller.ts — pure TS, no React or zustand)
   state: epoch, source{path,title}, cursor(u64), request{token,startedAt}|null, rerun,
          queue, utteranceToken, status snapshot
   single-flight per epoch; a request older than 4 s is abandoned (token bump), counted as a failure
        │ fetchTail(path, cursor)
        ▼
src/services/readAloud/tailApi.ts → api('read_session_tail', {...})      (api.ts unchanged)
        │ desktop: invoke()       WebUI: POST /api/read_session_tail (bearer + CSRF)
        ▼
Rust read_session_tail   (src-tauri/src/commands/session/tail.rs)
   command: path ends .jsonl, regular file, not a symlink (crate::utils::is_symlink, utils.rs:587)
   HTTP handler additionally: require_history_path (server/handlers.rs:24-26)
   from_offset None   → baseline: next_offset = byte after the last '\n', no blocks
   from_offset == len → return at once
   from_offset > len  → reset=true + fresh baseline
   else seek; read to EOF; keep only up to the last '\n'; parse lean TailLine per line
   keep: type=="assistant" && !isMeta && !isSidechain && model != "<synthetic>" && !isApiErrorMessage
         content[i] text (non-blank) → "text"; thinking (non-blank) → "thinking"
   returns { blocks:[{kind,text}], nextOffset, fileLen, reset, fileMtimeMs, serverNowMs }
        ▼
controller: drop the result if its token or epoch is stale → advance cursor → filter thinking by pref
          → toSpeechChunks(markdown, kind, cues) (speechText.ts, pure)
          → enqueueBlock(queue, chunks, budget)  (backlog.ts, pure)
          → engine.speak(chunk, token); the completion is used only if the token is still current
        ▼
WebSpeechEngine (engine.ts) → window.speechSynthesis, LOCAL voices only
        │ subscribe / getSnapshot
        ▼
ReadAloudControls (header): useSyncExternalStore(handle.subscribe, handle.getSnapshot)
useReadAloud() (headless, mounted in src/App.tsx next to useAppKeyboard() at :92):
   availability probe, pushes persisted prefs into the controller, visibilitychange listener
```

**Key choices and why**

- **Byte cursor, not diffing the store.** The file is append-only, so a monotonic cursor plus epoch plus single-flight gives exactly-once delivery by construction. The work is proportional to the bytes appended, not to the whole file. Today's reload re-classifies the entire 122 MB file (`load.rs:2420-2586`, report).
- **The path boundary stays where the repo puts it.**
  - `is_safe_history_file_path` exists only under `#[cfg(feature = "webui-server")]` (`src-tauri/src/commands/session/mod.rs:97-98`), and default features are empty (`src-tauri/Cargo.toml:17-18`). Its doc says desktop builds do not need this guard (`mod.rs:95-96`).
  - So the root check lives only in the Axum handler. The command itself does only checks that need no feature flag.
- **`api()` stays unchanged.**
  - Timeouts are handled in the controller: `Promise.race` with a 4 s timer plus a request token. Desktop `invoke()` cannot be aborted either, so this one mechanism covers both runtimes. A late result whose token is stale is dropped.
  - On a 401, `api()` already clears the token and calls `window.location.replace(...)` (`src/services/api.ts:67-91`). The page reloads and the mode ends, because `enabled` is never persisted. Every other call in the app would do the same.
- **Detection: one poll loop plus two accelerators.** The poll is the only path that works on desktop, because `start_file_watcher` has no caller in `src/` (grep: no hits). It is also the recovery path for SSE events that get lost:
  - the server drops `Lagged` broadcast errors (`src-tauri/src/server/mod.rs:645-647`);
  - `useFileWatcher` never retries once the stream is CLOSED (`src/hooks/useFileWatcher.ts:184-190`).
  The poke depends on `watcherEnabled` (`useAppInitialization.ts:36-40`) and is documented as such.
- **Claude only in v1.** If the selected session's provider is something other than `claude` (or unset), the toggle is `aria-disabled` and its tooltip gives the reason.

---

## 3) Latency budget

The clock starts when Claude Code appends the line. Stage 0 happens before that and is fixed.

| # | Stage | Current (store path) | Read-aloud path | How |
|---|---|---|---|---|
| 0 | Claude finishes the assistant message | short ≈0 s; text before a big tool_use: seconds; 3,000+ chars: p50 ≈10 s, p90 ≈32 s (report) | same (not controllable) | Honest help text |
| 1 | Line appended | 50–170 ms (report) | same | — |
| 2 | Backend debounce | 500–1000 ms (`lib.rs:929-930`, report) | 0 via the poll; 500–1000 ms via the poke | Shared debouncer untouched |
| 3 | Frontend debounce | 100 ms (`useAppInitialization.ts:40`) | 0 via the poll; 100 ms via the poke | — |
| 4 | Refresh throttle | max(1500, 5000 − elapsed) ms (`watcherSlice.ts:153-158`, report) | 0 | Not on the path |
| 5 | Scrolled-up deferral | unbounded (`watcherSlice.ts:137-141`, report) | none | Not on the path |
| 6 | Detection | — | visible: 0–300 ms; hidden: see below | Poll + poke |
| 7 | Backend read | full-file re-classify | <5 ms (stat + appended KB); ~10–30 ms for a multi-MB tool-result line | Seek to cursor |
| 8 | Transport | invoke ≈0; WebUI 1 RTT | same (≈20–100 ms, **unmeasured**) | Phase 0 |
| 9 | Client processing | full re-render | <5 ms | Pure functions |
| 10 | speak() → audio | — | ~50–300 ms local voice (**unmeasured**); `prime()` removes the cold start | Warm-up on enable |
| **Σ visible** | | ≈2.1 s best, 5–7 s steady | **≈0.3–0.8 s** | |
| **Σ hidden WebUI** | | | **≈0.7–1.3 s** via the poke while SSE is live; otherwise the throttled poll (≥1 s; about 60 s after 5 min hidden) | |
| **Σ hidden desktop** | | | ≥1 s for the first 5 min hidden, then **up to ≈60 s** (no poke on desktop) | Stated in the help text |
| Q | Queue wait | unbounded | ≤ ≈2 min worst case (§5) | Backlog budget |

**Hidden-tab policy.**
- Assume the platform throttles the hidden tab. Web Speech audio comes from the OS TTS, outside the tab's media pipeline, so the page is probably not counted as audible and is not exempt from Chrome's intensive throttling. Phase 0 checks this.
- The poll keeps running while hidden; the browser clamps it.
- `visibilitychange` → visible fetches immediately.
- The poke is the fast path for a hidden WebUI tab.

**Measuring without clock skew.** Each response carries `fileMtimeMs` and `serverNowMs`.
- Server-side lag = `serverNowMs − fileMtimeMs`.
- Client-side lag = `onstart − fetchResolvedAt`, both from `performance.now()`.
- Reported latency is the sum. Text before a tool_use and end_turn text are reported separately.

---

## 4) TTS engine strategy per runtime

v1 uses the **Web Speech API with local voices only**, behind a small `SpeechEngine` interface: `isAvailable()`, `voices()`, `prime()`, `speak(chunk, token)`, `cancel()`. No new dependencies. Online voices (Google…, "Microsoft … Online") are never used in v1, because session text would leave the machine.

| Runtime | Handling |
|---|---|
| **WebUI in Chrome/Edge (primary)** | Only voices with `voice.localService === true`. Voices load via `voiceschanged` with a 2 s timeout. Keep strong references to utterances. Chunks are ≤200 chars. |
| WebUI in Firefox/Safari | OS voices. Start the next utterance in a microtask after `cancel()`. Verify manually. |
| Tauri macOS / Windows | Same engine. Verify manually. |
| Tauri Linux (WebKitGTK) | May expose `speechSynthesis` with 0 voices (Spiel/speech-dispatcher). Probe for the API plus ≥1 local voice within 2 s. If it fails, the button stays focusable but `aria-disabled`, with the reason in its tooltip. |

**Voice.**
- One voice, chosen by the user and persisted.
- Default: the first local voice matching `navigator.language`, else `languageLocaleMap[i18n.language]` (`src/i18n/index.ts:93-101`), else the first local voice.
- No language detection and no switching voices inside a reply.
- If the content language and the voice differ, the user picks another voice; this is open question 3.

**Sequencing and robustness.**
- Every `speak()` gets a new, increasing `utteranceToken`. The token is bumped on skip, stop, epoch change and watchdog expiry. Any `end`, `error` or watchdog event whose token is not current is ignored. This stops a cancel from advancing the queue twice.
- `interrupted`/`canceled` events that follow our own `cancel()` are normal, not errors.
- Watchdog: estimated duration × 2 + 5 s. On expiry it calls `speechSynthesis.cancel()`, bumps the token, then speaks the next chunk in a microtask. This recovers a wedged synth where `speaking` stays true with no audio.
- Gaps between chunks: v1 speaks the next chunk from the previous completion. Chunks end at sentence boundaries, where a short pause is natural. If Phase 0 measures gaps over 250 ms, pre-queue one chunk (speak N+1 on N's `onstart`); the controller's queue stays the source of truth.

**Activation.**
- `engine.prime()` runs synchronously inside the toggle's click or keydown handler. It speaks the translated confirmation, which satisfies Chrome's user-activation rule and warms the engine.
- `enabled` is never persisted.

**Rejected for v1:**
- native Rust `tts` (in the WebUI it would play on the VM);
- Piper (GPL-3 fork, about 60 MB model);
- cloud TTS (data gate).

---

## 5) Exactly-once delivery and backlog policy

**Exactly-once** comes from the cursor, the epoch and single-flight. There is no key set.
1. **Baseline** (`fromOffset=None`) on enable and on `reset`. History is never spoken.
2. **The cursor advances only from a response whose epoch and request token are both current.** A failed, timed-out or stale fetch returns nothing that gets used, so retrying the same offset cannot repeat speech. The cursor never moves backwards except on reset.
3. **The epoch** is bumped on stop and on reset. Stale results are dropped.
4. **Single-flight.** At most one live request. A tick or poke during a request sets `rerun`, and the request re-runs once when it finishes. After 4 s the request is abandoned (token bump) so the next one can start.
5. **Half-written lines** are never consumed: the read stops at the last `\n` (`find_line_ranges` at `src-tauri/src/utils.rs:82` would return the partial line).
6. **Truncation** (`from_offset > len`): reset and a silent re-baseline.
7. **Errors.** Back off 1 → 2 → 5 → 10 → 30 s and keep retrying; the mode never auto-disables. The pill shows "Reconnecting…", and polling resumes from the cursor. A 401 ends the mode through `api()`'s own reload.

**Backlog** (pure reducer in `backlog.ts`, budget = 900 chars × rate, about 60 s):
- (a) The **remainder of the block currently playing is protected**. "Skip to latest" is the override.
- (b) When a new block arrives and the queued blocks (excluding the current one) exceed the budget, the oldest whole queued blocks are dropped until the queue fits. The newest block is never dropped.
- (c) If the newest block alone is over budget, it is cut at the last sentence boundary within budget, followed by one "rest skipped" cue.
- (d) There is **one pending skip cue** whose count goes up with each drop ("3 replies skipped"). It is spoken once, before the next kept block.
- Worst-case wait: the current remainder (≤ budget, because it was itself truncated) plus the budget, about 2 min at 1×.
- **Skip to latest:** `cancel()`, bump the token, keep only the newest block.
- **Off:** `cancel()`, clear the queue, bump the epoch. Turning it on again re-baselines at EOF.

---

## 6) UX and controls

All labels are shown in English here. Keys go into all 5 existing locales: en, ko, ja, zh-CN, zh-TW. There is no `tr` locale (`src/i18n/locales/`), so the UI will show English unless open question 10 adds one. Every spoken cue comes from `t()` in the UI locale.

- **Name:** "Read aloud", with i18n prefix `readAloud.*`. "Reading mode" already means collapse-all (`src/layouts/Header/ReadingModeButton.tsx`).
- **Toggle:**
  - A `TooltipButton` with a Volume2/VolumeX icon, `aria-pressed` and `aria-label`.
  - It goes in `src/layouts/Header/Header.tsx` next to `<ReadingModeButton className="hidden md:inline-flex" />` (`:279`), and is **visible on every viewport**.
  - Touch targets are 44 px on coarse pointers (`TopStripChips.tsx:27-31` pattern, report).
  - When unavailable (no API, no local voice, not a Claude session), it stays focusable, uses `aria-disabled`, and the tooltip gives the reason.
- **Pill** (only while the mode is on):
  - the source session title, truncated;
  - a static speaking dot (no animation under `prefers-reduced-motion`);
  - a "Reconnecting…" state;
  - one **"Skip to latest"** button with an accessible name.
  - On narrow widths the title is hidden first.
- **Settings:** a `ReadAloudMenuGroup` submenu built from `DropdownMenuSub`, `DropdownMenuCheckboxItem` and `DropdownMenuRadioGroup` (`src/components/ui/dropdown-menu.tsx`, report). It holds:
  - ☑ "Also read thinking (often empty)";
  - a voice radio list showing only **local** voices whose language matches `navigator.languages` or the UI language, plus the selected voice;
  - speed: 1 / 1.25 / 1.5.
- **Help text** (tooltip or menu hint):
  - per finished reply segment, only new content;
  - a hidden desktop window can lag up to about a minute;
  - closing the tab stops speech (whether muting the tab does is checked in Phase 0);
  - speech can overlap a screen reader.
- **Shortcut:** none in v1 (open question 6).
  - Mod+Shift+F/E/M/G are taken (`src/hooks/useAppKeyboard.ts:129-146`).
  - No Esc binding: Escape clears search when the field has text (`src/components/MessageViewer/MessageViewer.tsx:774-777`) and closes dialogs and menus.
- **Screen readers:**
  - The enable click speaks the confirmation, and `aria-pressed` carries the state, so there is no extra announcement.
  - `announceLayout` (`layoutSlice.ts:140-146`, report) is used only for unspoken changes: unavailable, reconnecting, recovered.
  - Spoken text never goes into an aria-live region.
- **Errors:** a real engine error shows one translated sonner toast per episode. Tail failures show the pill state, not a stream of toasts.

---

## 7) Files to change

| Path | Change |
|---|---|
| `src-tauri/src/commands/session/tail.rs` **(new)** | `#[tauri::command] pub async fn read_session_tail(session_path: String, from_offset: Option<u64>) -> Result<SessionTail, String>`.<br>Checks that need no feature flag: `.jsonl` extension, `metadata().is_file()`, `!crate::utils::is_symlink`.<br>IO runs in `tauri::async_runtime::spawn_blocking` (pattern at `archive.rs:484`, report).<br>Pure inner `read_tail_from(reader: &mut (impl Read+Seek), len, from) -> SessionTail`.<br>Lean serde `TailLine {type, isSidechain, isMeta, isApiErrorMessage, message:{model, content}}`; invalid lines are skipped. `memchr::memrchr` finds the last `\n`.<br>camelCase output `{blocks:[{kind,text}], nextOffset, fileLen, reset, fileMtimeMs, serverNowMs}`.<br>Tests in the same file. |
| `src-tauri/src/commands/session/mod.rs` | `mod tail; pub use tail::*;` beside the existing re-exports. |
| `src-tauri/src/lib.rs` | Import and register `read_session_tail` next to `load_session_messages_paginated` (`:67` import, `:197` handler). The watcher stays untouched. |
| `src-tauri/src/server/handlers.rs` | `ReadSessionTailParams {session_path, from_offset}` (camelCase). `handler_json!(read_session_tail, …)` calls `require_history_path(&p.session_path)?` (`:24-26`) before delegating. |
| `src-tauri/src/server/mod.rs` | Add `.route("/read_session_tail", post(h::read_session_tail))` next to `/load_session_messages_paginated` (`:216-217`). Insert `"/read_session_tail"` between `"/read_restore_target"` and `"/read_text_file"` in `READ_ONLY_ALLOWED_API_PATHS` (`:98-99`). The existing classification test enforces it. |
| `src/services/readAloud/tailApi.ts` **(new)** | `fetchSessionTail(path, fromOffset?)` calls `api<SessionTail>('read_session_tail', { sessionPath, fromOffset })`. `api.ts` is unchanged. |
| `src/services/readAloud/speechText.ts` **(new)** + test | Pure `toSpeechChunks(markdown, { kind, cues }) → string[]` built on the `marked` lexer (import pattern at `src/services/export/htmlExporter.ts:7`, report).<br>Rules: fence → `cues.code`; table → `cues.table`; link → its label; bare URL → its host; path → its basename; inline code ≤30 chars kept, longer → cue; XML-like tags and markdown symbols stripped.<br>`Intl.Segmenter` with a regex fallback; small sentences merged; hard split at 200 chars. Thinking chunks are prefixed with `cues.thinking`. `cues` comes from `t()`. |
| `src/services/readAloud/backlog.ts` **(new)** + test | Pure `enqueueBlock`, `dequeue`, `catchUp`, following §5 (a)–(d). |
| `src/services/readAloud/engine.ts` **(new)** + test | `WebSpeechEngine`: probe, `voiceschanged` with a 2 s timeout, local-only filter, default voice choice, `prime()`, `speak(chunk, token)`, watchdog with cancel, and `interrupted`/`canceled` treated as normal after our own cancel. |
| `src/services/readAloud/controller.ts` **(new)** + test | `ReadAloudController({fetchTail, engine, toChunks, setTimer, clearTimer, now})`: `start(source)`, `stop()`, `skipToLatest()`, `poke(path)` (ignored unless it matches the source), `onVisible()`, `setPrefs()`, `subscribe(listener)`, `getSnapshot()`. `getSnapshot()` returns a frozen snapshot replaced only on change. Also holds epoch, cursor, request token, 4 s timeout, rerun, utterance token and capped backoff. Exported as the module-scoped `readAloudHandle`. |
| `src/store/persist.ts` | Add `readStr(key, fallback)` with try/catch, mirroring `readBool` (report). |
| `src/store/slices/readAloudSlice.ts` **(new)** + test | Persisted preferences only: `readAloudIncludeThinking` (default true), `readAloudRate`, `readAloudVoiceURI`, plus `readAloudAvailability` (`'unknown'`, `'ok'` or a reason). Runtime state lives in the controller snapshot. |
| `src/store/useAppStore.ts` | Add the slice to `AppStore` and to `create()`. |
| `src/hooks/useReadAloud.ts` **(new)** + test | Headless. Runs the availability probe once, pushes preferences to the controller with scalar selectors, adds the `visibilitychange` listener, and calls `stop()` on unmount. It does **not** subscribe to `messages` or `selectedSession`. |
| `src/App.tsx` | Call `useReadAloud()` next to `useAppKeyboard()` (`:92`). |
| `src/hooks/useAppInitialization.ts` | In `handleSessionChanged` (`:29-34`), add `readAloudHandle.poke(event.sessionPath)`. |
| `src/layouts/Header/ReadAloudControls.tsx` **(new)** + test | Toggle plus pill. The click runs `engine.prime()` synchronously, then `start({path: selectedSession.file_path, title})`. Live state comes from `useSyncExternalStore(handle.subscribe, handle.getSnapshot)`. |
| `src/layouts/Header/Header.tsx` | Render it beside `ReadingModeButton` (`:279`), without `hidden md:`. |
| `src/layouts/Header/SettingDropdown/ReadAloudMenuGroup.tsx` **(new)** + `index.tsx` | The submenu from §6. |
| `src/i18n/locales/{en,ko,ja,zh-CN,zh-TW}/common.json` | `readAloud.*`: label, tooltip, help, skipToLatest, reconnecting, settings labels and hints, unavailable reasons (noApi, noLocalVoice, notClaude), engine error, and spoken cues (enabled, code, table, thinking, skipped_one/_other, restSkipped). Then run `pnpm run generate:i18n-types`. |
| `specs/<date>-read-aloud/` + `docs/adr/NNNN-read-aloud-tail-cursor.md` | Required by the repo workflow. The ADR records three decisions: the byte-cursor path separate from the store, exactly-once from cursor + epoch + single-flight, and the source locked at enable. |

---

## 8) Phased tasks

**Phase 0: browser spike, no repo code (about 30 min), on the real :3727 browser.**
- `speechSynthesis.getVoices().map(v=>[v.name,v.lang,v.localService])`: is there a local tr-TR voice and a local en voice?
- Timings: cold and warm `speak()`→`onstart`, and the gap between chunks.
- Tab hidden for more than 5 min while speaking:
  - does the tab show the audible/speaker icon?
  - how often does a chained 300 ms `setTimeout` fire?
  - does muting the tab silence speech?
- RTT of one `fetch('/api/…')` to the VM.
- **Go/no-go:**
  - Web Speech: go only if a usable local voice exists.
  - Hidden-tab path: if the poll is throttled to about once a minute *and* poke latency is not acceptable, plan the Phase 7 long-poll.

Then run `/harness-kit:new-spec read-aloud` and `/harness-kit:adr`.

**Phase 1: Rust tail command, test-first (§9).**
- Gate: `cd src-tauri && cargo test -- --test-threads=1 && cargo test --features webui-server -- --test-threads=1 && cargo clippy --all-targets -- -D warnings && cargo clippy --all-targets --all-features -- -D warnings && cargo fmt --all -- --check`

**Phase 2: pure pipeline** (`persist.readStr`, `speechText.ts`, `backlog.ts`).
- Gate: `pnpm exec vitest run src/services/readAloud src/store`

**Phase 3: engine and controller** (fake `speechSynthesis` in jsdom, `vi.useFakeTimers()`).
- Gate: `pnpm exec vitest run src/services/readAloud`

**Phase 4: slice, hook, App mount, poke line.**
- Gate: `pnpm tsc --build . && pnpm exec vitest run`

**Phase 5: UI and i18n.**
- Gate: `pnpm tsc --build . && pnpm lint && pnpm exec vitest run && pnpm run i18n:validate`

**Phase 6: end-to-end.**
1. Playwright against `--serve --no-auth` on a **scratch port** with a temporary history directory (never the live :3727), plus an init-script `speechSynthesis` recorder.
2. A live latency run (§9).
3. The `ui-verify` and `change-verifier` agents.
4. You deploy with `deploy-live.sh`.

**Optional Phase 7, only on your yes:**
- a turn-end cue;
- long-poll for hidden tabs, with a server wait cap of 5 s or less and abortable fetch;
- follow-the-selection mode;
- a "final answers only" filter;
- a keyboard shortcut;
- a `tr` UI locale.

---

## 9) Test plan

**Rust (`tail.rs`, `tempfile`, default features unless marked):**
- `baseline_skips_all_existing_lines`; `baseline_stops_before_partial_line`; a file with no `\n` gives 0.
- `never_consumes_partial_trailing_line`: once the line is completed, the next read returns it exactly once.
- `eof_short_circuit_does_not_read`: unparsable content at `from == len` gives no error.
- `truncation_resets_without_blocks`.
- `filters_main_chain_text_and_nonempty_thinking`. Fixtures: user, tool_use, tool_result, attachment, queue-operation, api-request, isSidechain, isMeta, empty thinking with a signature, redacted_thinking, whitespace-only text, `<synthetic>` "No response requested.", `isApiErrorMessage` 529, valid text, non-empty thinking. Only the last two come back, in file order.
- `whole_message_written_at_once`: thinking + text + tool_use in one append gives 2 blocks, in order.
- `invalid_json_line_is_skipped_not_fatal`; `rejects_non_jsonl`; `rejects_symlink`; `rejects_directory`.
- `#[cfg(feature = "webui-server")]` handler-level test: a path outside the roots is rejected via `require_history_path`. The existing allowlist classification test passes with the new route.

**vitest:**
- **speechText:**
  - a fence becomes one cue and code is never spoken; a table becomes a cue;
  - a link becomes its label; a bare URL becomes its host;
  - inline code ≤30 chars is kept, longer becomes a cue;
  - an XML-like wrapper tag (for example a `system-reminder` block) is dropped;
  - a 600-char paragraph becomes chunks of ≤200 chars on sentence boundaries;
  - a thinking block gets the `cues.thinking` prefix;
  - `""` gives `[]`.
- **backlog:**
  - order is kept within budget;
  - over budget, the oldest queued blocks are dropped and the newest is kept;
  - the current remainder is protected;
  - a 13k-char block is truncated with one "rest skipped" cue;
  - ten consecutive drop events give one pending cue with count 10;
  - `catchUp` leaves only the newest block.
- **engine:**
  - no API means unavailable;
  - voices arriving via `voiceschanged` within 2 s count;
  - only remote voices gives `noLocalVoice`;
  - the default voice follows `navigator.language`;
  - `prime()` speaks;
  - the watchdog fires `cancel()`, and the next chunk still gets `onstart` while `speaking` stays true;
  - `interrupted` after our own cancel is not an error.
- **controller (fake timers):**
  - `start` is a baseline and history is never enqueued;
  - a poke during an in-flight request gives exactly one rerun;
  - a `fetchTail` that never resolves is abandoned after 4 s, the next tick runs, and a late result is ignored;
  - a result after `stop()` is dropped;
  - the cursor is monotonic except on reset;
  - when the fake engine resolves a cancelled utterance asynchronously *after* `skipToLatest()` or a watchdog expiry, there is no double advance and no second utterance;
  - failures back off 1/2/5/10/30 s, show `reconnecting`, never disable, and recover;
  - a poke for another path is ignored;
  - `getSnapshot()` returns the same reference while nothing changes.
- **readAloudSlice:** preferences persist and a throwing `localStorage` is tolerated.
- **useReadAloud:**
  - replacing `selectedSession` with a new object for the same `file_path` causes no controller call;
  - selecting another session or entering a subagent does not change the source;
  - mutating `messages` causes no controller calls;
  - `visibilitychange` → visible calls `onVisible()`.
- **ReadAloudControls:**
  - `aria-pressed` reflects the state;
  - when unavailable: `aria-disabled`, a reason tooltip, and the button stays focusable;
  - "Skip to latest" has a name;
  - a non-Claude session shows the disabled reason;
  - no spoken text in any aria-live region.

**Playwright E2E (scratch server, recorder, script-appended JSONL):**
- Enable on a session with existing lines: only the confirmation is spoken.
- Append text, tool_use, empty thinking and a `<synthetic>` row: exactly the text chunks are spoken.
- Scroll up and append: still spoken.
- Switch the selected session and append to the source: still spoken.
- Append 5,000 chars quickly: one skip cue and a bounded queue.
- Keyboard reachability, axe clean on the header, and the toggle visible on a mobile viewport.

**Live (WebUI):**
- About 30 blocks each with the tab visible, the tab hidden for more than 5 min, and the transcript scrolled up.
- Report p50 and p90 of `(serverNowMs − fileMtimeMs) + (onstart − fetchResolvedAt)`, with text before tool_use and end_turn text reported separately.
- Acceptance for an idle queue and a local voice: visible p50 < 500 ms, p90 < 1 s.

---

## 10) Risks and open questions

**Risks**
1. **Most of the perceived lateness comes from Claude.** Main files get the whole message at completion. Re-verify on 2–3 more interactive sessions in Phase 6.
2. **Hidden tab:**
   - assume throttling, so the WebUI relies on the poke;
   - the poke needs `watcherEnabled` and a live SSE stream; the poll covers lost events;
   - a hidden desktop window can lag up to about 60 s.
3. **No local Turkish voice** on your OS would make the feature poor for Turkish replies. Phase 0 checks this first.
4. **WebKitGTK** may expose no voices. The probe shows a visible disabled state.
5. **Chain continuation** into a new session file leaves the locked source on the old file. The pill shows the source title, so this is visible.
6. **Thinking may look broken**, because 86% of blocks are empty. The label says so.
7. **About 3.3 POST/s** while the mode is on, each one a stat when nothing changed. Polling stops when the mode is off.
8. **Pre-existing, out of scope:** the desktop watcher is never started from `src/`.

**Open questions for you**
1. Thinking is ON by default, as you asked. Do you want it off?
2. Backlog: cap at about 60 s, dropping older replies with a "N replies skipped" cue, or read everything even if it falls minutes behind?
3. Voice: v1 uses one local voice of your choice. Do you want automatic Turkish/English voice switching later? Which OS and browser open :3727, and do they have a local tr-TR voice?
4. Announce code as "code block", or skip it silently? Read the short narration between tool calls, or add a "final answers only" filter later?
5. Add the turn-end cue ("Claude finished") in Phase 7?
6. Keyboard shortcut: is one wanted, and which chord? It works only while the tab is focused, so it does not help when the tab is hidden.
7. Source: locked to the session selected when you turned it on (this plan), or follow the selection or subagent?
8. Is the WebUI in a desktop browser the only v1 target, or must Tauri desktop (especially Linux) work too?
9. How does the browser reach :3727 (SSH tunnel, Tailscale, LAN)?
10. Add a Turkish (`tr`) UI locale, so labels and spoken cues can be in Turkish? It would be a 6th locale for `i18n:validate`.

---

## Rejected review points

| Review point | Status | Reason |
|---|---|---|
| Per-block tr/en classification with a score; `navigator.language` only for CJK and Hangul | Superseded | v1 drops language detection entirely: one user-chosen local voice (§4). Classifying per block would only bring it back. |
| Fold `_retried` into an options object in `api()` | Moot | `api.ts` is not changed. The `authRedirect` option was dropped, and the timeout lives in the controller. |
| Add `AbortController`/`timeoutMs` to `api()` | Fixed elsewhere | The hung-request problem is solved in the controller (`Promise.race` with 4 s plus a request token). Desktop `invoke()` cannot be aborted either, so one mechanism covers both runtimes and `api()` keeps its signature (`src/services/api.ts:33-37`). |
| Remote voices: 140-char cap or pause/resume keepalive | Moot | Online voices are removed from v1 (local only). |
| Fetch on EventSource `onopen`/reconnect | Not adopted | The poll keeps running and picks up any missed event within one tick, so `useFileWatcher` does not need changing. The real gaps (Lagged drop at `server/mod.rs:645-647`, no retry after CLOSED at `useFileWatcher.ts:184-190`) are documented. |
| Pre-queue chunk N+1 in the native queue | Made conditional | The gaps fall on sentence boundaries, and pre-queueing complicates the cancel/token logic. It is adopted only if Phase 0 measures gaps over 250 ms. |
| Add a keyboard shortcut now, to silence a hidden tab | Deferred (open question 6) | A key chord does not reach a hidden or unfocused tab, so it does not solve the stated problem. F/E/M/G are taken (`useAppKeyboard.ts:129-146`), and a free chord should be picked deliberately. The help text covers stopping speech (close the tab; muting is checked in Phase 0). |
| `selectedSession` replaced on each write (`projectSlice.ts:743-744`) causing re-baselines | Resolved by design | The source is captured once at enable. The hook never feeds `selectedSession` changes to the controller. A regression test is kept. |
| Subagent view loses the parent's final answer | Resolved by design | Locking the source removes subagent following, so the parent file keeps being read. Following is open question 7. |
| Duplicate entries (three copies of the `is_safe_history_file_path` blocker, two of the Turkish-labels issue) | Merged | Each was applied once (§2, §6, §7). |