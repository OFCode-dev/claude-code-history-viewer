# 0003 — Read-aloud reads a byte-cursor tail, follows the main session, local voices only

- **Status**: accepted
- **Date**: 2026-10-20
- **Spec**: `specs/20261020-read-aloud-mode/spec.md`

## Context

The owner wants new Claude replies spoken as they reach disk, with speech
starting well under a second after the line is written. The transcript view
learns about appends through the message store: a backend debounce, a
frontend debounce, a refresh throttle of at least 1.5 s and a deferral while
the reader is scrolled up, followed by a reload that re-classifies the whole
session file. That path takes about 2.1 s at best, 5–7 s while Claude writes,
and forever when scrolled up. Its throttles exist to protect the UI on large
files (#367), so they cannot simply be removed. Session files are append-only
JSONL, one finished content block per line, and the main file gets a whole
assistant message when that message finishes. Session text is private: the
data gate forbids sending it to an online service.

## Decision

1. **A separate byte-cursor tail path, not the store.** A new command,
   `read_session_tail(sessionPath, fromOffset)` (Tauri command plus a WebUI
   route behind `require_history_path`), returns only the finished assistant
   `text` and non-blank `thinking` blocks appended since a byte offset. With no
   offset it returns a baseline at the end of the last complete line, found
   by scanning backwards in 64 KB chunks. At `from == len` it answers from
   file metadata alone. It consumes complete lines only, and resets when the
   offset is past the end or not right after a `\n`. A pure TypeScript
   controller polls it every 300 ms while the mode is on, fetches at once when
   the tab becomes visible, and on the WebUI is poked by the existing SSE file
   event. It never reads the `messages` store or `watcherSlice`.

2. **Exactly-once ingestion, not exactly-once audio.** While the source stays
   the same, every appended block reaches the speech queue exactly once (the
   backlog policy may still drop it later, with a spoken "skipped" cue),
   because: the cursor advances only from a response whose request token and
   epoch are both current; the epoch is bumped on start, stop and source
   change; there is at most one request in flight, and ticks during it collapse
   into one rerun; a request older than 4 s is aborted and its late result
   ignored. Activation is a successful baseline, so anything written before it
   counts as history and is never spoken. Audio is best effort: one utterance
   in flight, an utterance with no `onstart` within 3 s is retried once and then
   skipped, and one that never ends is cut after twice its estimated length
   plus 5 s. A skipped utterance is not replayed.

3. **The source follows the open main session.** The source is the selected
   session's main file. A subagent view maps to its parent file and keeps
   reading it. A different main path cancels speech, clears the queue, bumps
   the epoch and re-baselines at the end of the new file, so its history is
   never spoken. The same path with a new session object changes nothing. A
   non-Claude session idles with reason `notClaude`, and the mode stays on.

4. **Local voices only.** Speech uses the Web Speech API with voices whose
   `localService` is true. The voice is resolved again before every utterance,
   and `utterance.voice` and `utterance.lang` are always set to a local voice,
   including for the enabling confirmation, so the browser default (possibly
   an online voice) is never used. If no local voice exists, the mode is
   unavailable rather than falling back. Native Rust TTS, Piper and cloud TTS
   are out.

## Consequences

- Speech latency no longer depends on the store's throttles, scroll position
  or file size: the scripted run measured append → speech start at p50 164 ms
  and p90 286 ms on loopback (excluding real voice start-up and the network
  round trip). The transcript view behaves exactly as before.
- The poll is the only detection path on desktop (`start_file_watcher` has no
  caller in `src/`) and the recovery path for lost SSE events. It costs about
  3.3 requests per second while the mode is on, each a single `stat` when
  nothing changed. A hidden desktop window can lag up to about a minute.
- The tail command duplicates a small part of the session parser's filter (a
  lean `TailLine`: main chain, not meta, not an API error, not `<synthetic>`).
  A new rule for what counts as an assistant reply has to be added in both
  places.
- A wedged or interrupted utterance is lost rather than repeated. The chosen
  trade-off is that nothing is ever spoken twice.
- Following the selection means browsing to another main session moves the
  source and drops anything still queued for the old one. When a conversation
  continues in a new session file, read-aloud follows only once that session
  is opened.
- Speech quality depends on which local voices the OS provides. Turkish needs
  a local tr voice such as Yelda on macOS, and a WebKitGTK desktop with no
  voices shows the mode as unavailable.
- A future option to use online voices would need its own ADR and an
  explicit opt-in, because it would send session text off the device.
