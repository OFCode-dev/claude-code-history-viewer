# Read-aloud mode: final design spec

> Decision record: [ADR 0003](../../docs/adr/0003-read-aloud-tail-cursor.md) (byte-cursor tail path, exactly-once ingestion, main-session follow, local voices only).

Status: **built on `feat/read-aloud-mode`** (uncommitted working tree on top of `66cc19b3`), all gates green and the scripted end-to-end run passed on 2026-10-20. The owner's decisions A–F are in `decisions.md`; the accepted cross-family review fixes (Codex gpt-6.1-sol, Gemini via agy, judged by Claude) are in `review-verdicts.md`; the full plan with its measurements is `plan.md`. Precedence is **decisions.md > review-verdicts.md > plan.md**, and this spec follows it: where `plan.md` says "locked source", "no language detection", "60 s drop budget", "fileMtimeMs/serverNowMs" or "microtask after cancel", those parts are superseded. Every code fact below was checked in the working tree. What remains open is a manual check on real macOS browsers (§7.3).

---

## 1. Goal

While Claude Code works in a session, the person can turn on **Read aloud** in the viewer and hear each new reply as soon as it reaches disk, without watching the screen. Only content that arrives after the mode is turned on is spoken; history never is. Speech must start within a second of the line being written while the tab is visible, keep up when Claude writes faster than a voice can speak, and never send session text off the device.

## 2. Decision summary

**Owner decisions (binding, `decisions.md`)**

| # | Decision | Built as |
|---|---|---|
| A | Backlog: **speed up to catch up** by default. Rate ramps linearly from the base rate at `catchUpThresholdSec` (default 20 s of queued speech) to `maxRate` (default 1.6×) at 3× the threshold. Only if the queue still exceeds about 3 min at max rate are the oldest whole queued replies dropped, with one "N replies skipped" cue. Policy, max rate and threshold are user settings | `backlog.ts`: `effectiveRate`, `enqueueBlock` (`SPEED_UP_DROP_SEC = 180`, `RATE_CAP = 2`). Policies `speedUp` / `skipToLatest` (60 s budget) / `readAll`. Max rate ∈ {1.25, 1.5, 1.6, 2}, threshold ∈ {10, 20, 40} s, base speed ∈ {1, 1.25, 1.5}, persisted in `readAloudSlice.ts` |
| B | Source: **the currently open session**. It follows the selected **main** session; a change cancels speech, clears the queue, bumps the epoch and re-baselines at the end of the new file. A subagent view of the same session keeps the parent file. Same path with a new object is a no-op. A non-Claude session idles with reason `notClaude` while the mode stays on | `selectReadAloudSource` / `mainSessionPath` in `useReadAloud.ts`, `setSource` in `controller.ts` |
| C | Voice: `"auto"` (default) or one chosen local voice. Auto guesses the language per chunk (Hangul → ko, Kana → ja, Han → zh, Latin → tr or en) and picks the best local voice for it. No library | `langGuess.ts`: `guessLang`, `pickVoice` |
| D | **Local voices only** (`localService === true`). No `tr` UI locale; keys in all 5 locales | `engine.ts`, `langGuess.ts`; 48 `readAloud.*` keys per locale |
| E | No keyboard shortcut, no turn-end cue, no long-poll in v1. Target: the WebUI in macOS Safari and Chrome (Yelda tr-TR). Tauri desktop uses the same engine with no extra work | Nothing added for these |
| F | Thinking is read by default; code is announced with a short "code" cue; short narration between tool calls is read | `readAloudIncludeThinking` defaults to true; `cues.code`; every non-blank text block is spoken |

**Accepted review fixes** (`review-verdicts.md`, numbered as there): 1 follow the main session; 2 the three backlog policies with the exact rate formula, rate computed per utterance and never changed after submit; 3 auto voice with whole-word Turkish stopwords and cue-only chunks reusing the block's voice, menu lists all local voices grouped by language; 4 `api()` gains an optional `signal` and a typed `AuthRequiredError`; 5 a visible "starting" state, activation = a successful baseline; 6 the cursor must sit right after a `\n`, else reset; 7 the guarantee is exactly-once **ingestion**, with a start/end watchdog; 8 voice loading by `voiceschanged` plus a 100 ms poll for 2 s, voice re-resolved before every speak, never the browser default voice; 9 a 50 ms gap after `cancel()`; 10 backward 64 KB baseline scan, metadata-only short-circuit at EOF, `"assistant"` pre-filter before serde, unknown content types tolerated; 11 every async path checks request token and epoch; 12 pokes match by exact path or `<projectDir>/<file>.jsonl`; 13 speech-text fixes; 14 no `fileMtimeMs`/`serverNowMs`; 15 one utterance in flight, no native pre-queueing.

**Rejected review points** (reasons in `review-verdicts.md`): "desktop already receives pokes" (false: nothing in `src/` calls `start_file_watcher`); adaptive 2 s idle polling (adds up to 2 s to the first reply after idle); skipping the browser spike (moved to the manual checklist, §7.3).

## 3. Scope

**In scope**
- Claude Code main sessions, in the WebUI and the Tauri desktop app.
- Spoken: assistant `text` blocks and non-blank `thinking` blocks (thinking with a "Thinking:" cue on its first chunk, switchable).
- A header toggle on every viewport, a status pill while the mode is on, a "Skip to latest reply" button, and a **Read aloud** submenu in the header settings menu.

**Never spoken**
- tool_use, tool results, user rows, attachments, queue operations, progress rows.
- Rows with `isSidechain`, `isMeta` or `isApiErrorMessage`, and `<synthetic>` assistant rows ("No response requested.", session limits, `API Error: 529`, "Prompt is too long").
- Empty or signature-only thinking, `redacted_thinking`, whitespace-only text.
- Anything written before the mode's baseline, including lines appended while the baseline request is in flight.

**Non-goals (v1)**
- Token streaming: impossible, Claude Code writes each content block as one finished line (§5).
- Other providers (Codex, OpenCode, Copilot): the controller idles with `notClaude`.
- Online or cloud voices, native Rust TTS, Piper.
- Keyboard shortcut, "Claude finished" cue, long-poll for hidden tabs, a "final answers only" filter, a `tr` UI locale. All are optional follow-ups, only on the owner's yes.
- Exactly-once **audio**: a wedged or interrupted utterance is skipped, not replayed (ADR 0003).
- Persisting the on/off state: speech needs a user gesture on each load.

## 4. Architecture

Read-aloud has its **own detection path**. It never reads the `messages` store and never touches `watcherSlice`, so the store's refresh throttles and scrolled-up deferral stay as they are and do not delay speech.

```
Claude Code appends to ~/.claude/projects/<p>/<session>.jsonl   (append-only)
        │ (A) chained 300 ms poll while the mode is on (the browser may clamp it when hidden)
        │ (B) immediate fetch on visibilitychange → visible
        │ (C) WebUI only: SSE session-file-changed → useFileWatcher → readAloudHandle.poke(path)
        ▼        (only while watcherEnabled; desktop has no poke because start_file_watcher has no caller)
ReadAloudController  (src/services/readAloud/controller.ts, pure TS)
   epoch · byte cursor · single request {token, AbortController, 4 s timer} · rerun flag
   backlog · utterance token · frozen snapshot for useSyncExternalStore
        │ fetchSessionTail(path, cursor, signal)          (tailApi.ts → api())
        ▼        desktop: invoke()        WebUI: POST /api/read_session_tail (bearer + CSRF)
Rust read_session_tail   (src-tauri/src/commands/session/tail.rs)
   checks: .jsonl, not a symlink, regular file; WebUI handler adds require_history_path
   from == len   → answered from metadata, no open
   from absent   → baseline: scan back from EOF in 64 KB chunks to the last '\n'
   from > len, or byte at from-1 != '\n' → reset + fresh baseline
   else read [from, len), consume complete lines only, lean serde per line
   → { blocks:[{kind:"text"|"thinking", text}], nextOffset, fileLen, reset }
        ▼
controller.ingest: drop if token or epoch is stale → advance cursor → thinking pref
   → toSpeechChunks (speechText.ts) → per-chunk guessLang → enqueueBlock (backlog.ts) → pump()
        ▼
WebSpeechEngine (engine.ts): one utterance in flight, LOCAL voice re-resolved per speak,
   rate = effectiveRate(...) computed right before speak, start/end watchdog
```

**Files**

| Path | Role |
|---|---|
| `src-tauri/src/commands/session/tail.rs` (new) | `read_session_tail` command, pure `read_tail_from`, backward baseline, `TailLine` filter, 21 unit tests |
| `src-tauri/src/commands/session/mod.rs`, `src-tauri/src/lib.rs` | Module re-export and command registration |
| `src-tauri/src/server/handlers.rs`, `src-tauri/src/server/mod.rs` | `ReadSessionTailParams`, handler with `require_history_path`, route, entry in `READ_ONLY_ALLOWED_API_PATHS`, out-of-root test |
| `src/services/api.ts` | Optional `{ signal }` (desktop `invoke()` is raced against it), `AuthRequiredError` on a terminal 401. Existing callers unchanged |
| `src/services/readAloud/` (new) | `types`, `tailApi`, `speechText` (marked lexer → ≤200-char chunks), `langGuess`, `backlog`, `engine`, `controller` (exports `readAloudHandle`), `index` |
| `src/store/slices/readAloudSlice.ts` (new), `src/store/persist.ts`, `src/store/useAppStore.ts` | Persisted preferences (`read-aloud-*` keys, every access in try/catch via `readStr`/`readBool`/`writeStr`) and engine availability |
| `src/hooks/useReadAloud.ts` (new), `src/App.tsx` | Headless glue: probe, prefs and translated cues, source following by path, visibility, toast and announcements |
| `src/hooks/useAppInitialization.ts` | One line: `readAloudHandle.poke(event.sessionPath)` |
| `src/layouts/Header/ReadAloudControls.tsx` (new), `Header.tsx` | Toggle and status pill, next to the reading-mode button |
| `src/layouts/Header/SettingDropdown/ReadAloudMenuGroup.tsx` (new), `index.tsx` | Settings submenu |
| `src/layouts/Header/breadcrumbModel.ts` | `sessionLabel` exported, so the pill title matches the breadcrumb |
| `src/i18n/locales/*/common.json`, `types.generated.ts` | 48 `readAloud.*` keys in en, ko, ja, zh-CN, zh-TW |

**Controller states** (`ReadAloudSnapshot.status`): `off`; `starting` (on, baseline not yet back); `listening`; `speaking`; `reconnecting` (failures back off 1 → 2 → 5 → 10 → 30 s, never auto-disable); `idle` with a reason (`notClaude`, `noSource`, `noApi`, `noLocalVoice`). A terminal 401 (`AuthRequiredError`) stops the mode. The mode never turns itself off for any other reason.

**UX contract**
- **Toggle**: an icon button with `aria-pressed` and `aria-label` "Read aloud", visible on every viewport, 44 px on coarse pointers. When it cannot be turned on (no speech API, no local voice, no session, not a Claude session) it stays focusable with `aria-disabled`, and the reason is in its tooltip and `aria-describedby`.
- **Activation**: the click or Enter handler calls `prime()` synchronously, speaking "Read aloud on." with a local voice. That satisfies Chrome's user-activation rule and warms the engine. `aria-pressed` carries the state, so there is no extra announcement.
- **Pill** (only while on): source session title (hidden first on narrow widths), a status glyph plus text (never colour alone), queued seconds and the catch-up rate while speeding up, and "Skip to latest reply".
- **Settings submenu**: "Also read thinking (often empty)"; voice (Auto, then all local voices grouped by language; a chosen voice that disappeared stays listed as "not installed, using Auto"); speed; "When replies pile up" policy; max catch-up speed and threshold (marked as used only by "Speed up"); a privacy line, "Local voices only; text stays on this device."
- **Screen readers**: spoken text never goes into a live region. `announceLayout` is used only for changes nobody hears: reconnecting, recovered, paused with a reason. A real engine error shows one toast per episode.

## 5. Latency facts

**Limits the viewer cannot remove** (measured for `plan.md` §1)
- **No token streaming.** Claude Code writes each content block as one complete JSONL line: 15,307 of 15,307 lines checked held exactly one block, and no line was ever rewritten.
- **Main session files get the whole assistant message when it finishes.** Text written before a large tool call reaches disk only after the tool input has been generated too. The floor is one finished assistant message, which is what the tooltip says ("Read new replies aloud as Claude writes them. Only content that arrives after you turn this on is read.").

**What the viewer controls**

| Stage | Store path (before) | Read-aloud path |
|---|---|---|
| Detection after the line lands | ≈2.1 s best, 5–7 s while Claude writes, unbounded when scrolled up | 0–300 ms poll while visible; SSE poke on the WebUI |
| Backend read | Re-classifies the whole file | One `stat` when nothing changed; the appended bytes otherwise; baseline reads at most the 64 KB windows back to the last `\n` |
| Client processing | Full re-render | Pure functions, no React work on the speech path |
| Queue wait | n/a | Bounded by the policy (speedUp: drop only beyond 180 s at max rate) |

**Measured** (scripted E2E, loopback, 20 single appends on an idle queue, fake voice with a 15 ms start delay): append → `onstart` **p50 164 ms, p90 286 ms** (min 71, max 313; an earlier run p50 179, p90 312). This covers poll or poke + fetch + processing only. **Not included, still unmeasured**: real voice start-up on macOS (estimated 50–300 ms, cut by `prime()` warming the engine) and the network round trip to the VM.

**Hidden tab** (estimates, part of the manual check)
- WebUI: the SSE poke (backend debounce about 0.5–1 s, then 100 ms) while `watcherEnabled` is on and the stream is live; otherwise the browser-clamped poll (≥1 s, about 60 s after 5 min hidden). Lost SSE events are picked up by the next poll.
- Desktop: no poke, so ≥1 s for the first 5 min hidden and then up to about 60 s.
- Showing the tab again fetches at once.

**Cost while on**: about 3.3 POST/s, each a single `stat` when nothing changed. Polling stops when the mode is off or idles for lack of a Claude source (`noSource`, `notClaude`).

## 6. Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| 1 | Turning the mode on in a session with history speaks only the confirmation | Met (E2E a) |
| 2 | Of a mixed append (text, tool_use, tool_result, empty thinking, non-empty thinking, `<synthetic>`, sidechain, API error, redacted thinking), exactly the text and the non-empty thinking are spoken, in file order, thinking with its cue | Met (E2E b1) |
| 3 | Visible tab, idle queue, local voice: append → speech start p50 < 500 ms, p90 < 1 s | Met for the pipeline: p50 164 ms, p90 286 ms (E2E b2). Real-voice start and VM RTT: manual check |
| 4 | Auto voice: a Turkish paragraph uses a local tr voice, an English one a local en voice; a remote voice is never used | Met (E2E c) |
| 5 | Scrolling the transcript does not delay or stop speech | Met (E2E d) |
| 6 | Switching to another main session cancels speech at once, never speaks the new session's history, and then reads only the new session; a subagent view of the same session keeps the parent | Met (E2E e; subagent mapping covered by `useReadAloud` unit tests) |
| 7 | One long reply (about 6,000 chars) is spoken in full, faster while the queue is long and back to 1× as it drains, with no skip cue | Met (E2E f: 42 utterances, rates 1.60 → 1.00, 84/84 sentences) |
| 8 | When several queued replies exceed 180 s at max rate, the oldest whole replies are dropped with one "N replies skipped" cue and the newest is kept | Met (E2E f2: 1 reply skipped, newest kept). A single reply is never dropped; the same amount split across replies can be, by design |
| 9 | Off stops speech at once and nothing is spoken afterwards | Met (E2E g: `cancel()` 78 ms after the click) |
| 10 | The toggle is reachable by keyboard, shows focus, exposes `aria-pressed`, and is visible on a 390 px viewport | Met (E2E h). 44 px on coarse pointers comes from the existing `pointer-coarse` class, not tested |
| 11 | WebUI refuses a path outside the history roots; the route is classified read-only | Met (`read_session_tail_rejects_file_outside_history_roots`, allowlist classification test, curl probe) |
| 12 | A half-written line is never consumed; a truncated or rewritten file resets without speaking | Met (`tail::tests`) |
| 13 | All UI strings through `t()` in 5 locales | Met (`i18n:validate`, 48 keys each) |

## 7. Verification

### 7.1 Gates (2026-10-20, `feat/read-aloud-mode` working tree)

| Command | Result |
|---|---|
| `pnpm tsc --build .` | Exit 0 |
| `pnpm exec vitest run` | Exit 0: 199 files, 2,147 tests. The 13 read-aloud test files pass 170/170 on their own |
| `pnpm lint` | Exit 0 |
| `pnpm run i18n:validate` | Exit 0 |
| `cargo test -- --test-threads=1` | Exit 0 on an unloaded rerun (lib 1,155 passed, 1 ignored; all 21 `tail::tests`). The first run, concurrent with a release build, hit the timing test `blocking_offload_test::search_messages_leaves_the_runtime_free`, which this branch does not touch |
| `cargo test --features webui-server -- --test-threads=1` | Exit 0: lib 1,238 passed, 1 ignored |
| `cargo clippy --all-targets --all-features -- -D warnings`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --all -- --check` | All exit 0 |

### 7.2 Scripted end-to-end run

Release build with `--features webui-server`, served with `--serve --no-auth` on a scratch port (3791) with a synthetic `HOME` holding two Claude sessions; never the live server on :3727. Playwright replaces `speechSynthesis` with a recorder exposing local voices Samantha (en-US, default) and Yelda (tr-TR) plus one remote voice; rows are appended from Node. Results per scenario are in §6. Harness and logs: `scratch/e2e-read-aloud/` (gitignored).

### 7.3 Manual checks still open (owner, macOS Safari and Chrome against the WebUI)

- `speechSynthesis.getVoices()` lists a local tr-TR voice (Yelda) and a local en voice.
- Cold and warm `speak()` → `onstart`, and the gap between chunks. Gaps over 250 ms would reopen the pre-queueing question (verdict 15 keeps one utterance in flight).
- Tab hidden for more than 5 min while speaking: does speech keep going, how often does the poll fire, does muting the tab silence it.
- End-to-end latency including the round trip to the VM.

## 8. Risks

1. Most perceived lateness comes from Claude writing whole messages (§5), not from the viewer.
2. A hidden desktop window can lag up to about a minute; a hidden WebUI tab depends on the SSE poke.
3. Speech can overlap a screen reader; the two are not coordinated.
4. A Linux WebKitGTK desktop may expose no voices; the toggle then shows `noLocalVoice`.
5. When a conversation continues in a new session file, read-aloud follows only once that session is opened (decision B).
6. Audio is best effort: an utterance with no `onstart` within 3 s is retried once and then skipped; one that starts but never ends is cut after twice its estimated length plus 5 s.
