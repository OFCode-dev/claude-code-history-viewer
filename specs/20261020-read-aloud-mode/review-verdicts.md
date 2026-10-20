# Cross-family review verdicts (Codex gpt-6.1-sol + agy gemini-4-argon-high), judged by Claude
Precedence: decisions.md > this file > plan.md. Where plan.md says "locked source", "no language detection", "60 s drop budget", "fileMtimeMs/serverNowMs", "microtask after cancel" — those are SUPERSEDED.

## Accepted (must implement)
1. Source follows the open MAIN session (decisions B). Subagent view of the same session keeps the parent file. Non-Claude → idle with reason `notClaude`, mode stays on, Off always available. Replace locked-source tests.
2. Backlog policies speedUp(default)/skipToLatest/readAll + maxRate + threshold, persisted. Queued seconds Q = queuedChars / (15 * baseRate). speedUp: effectiveRate = baseRate + clamp((Q-T)/(2T),0,1) * (max(baseRate,maxRate)-baseRate), hard cap 2.0. Rate is computed per utterance right before speak(); never mutate a submitted utterance. speedUp drops oldest whole queued blocks only when Q at maxRate > 180 s; readAll never drops/truncates; skipToLatest = the plan's 60 s drop-oldest budget.
3. Voice "auto" (default) + explicit local voice. Language guess: tokenize /\p{L}+/gu, toLocaleLowerCase('tr'); tr if any of [çÇğĞıİöÖşŞüÜ] AND (any of [ğĞıİşŞ] or ≥1 stopword) — or ≥2 stopword hits; whole-word stopwords only. Classify text before cue prefixes; cue-only chunks (code/table/skipped) reuse the voice of the surrounding block. Menu lists ALL local voices grouped by language.
4. api(): optional `signal?: AbortSignal` (backward compatible), and a typed auth error (e.g. `AuthRequiredError`) thrown on terminal 401; controller aborts timed-out requests (4 s) and calls stop() on AuthRequiredError.
5. Visible "starting" state; activation = successful baseline; appends during baseline acquisition are history (documented).
6. Continuity check: cursor must sit right after a '\n' (backend verifies byte at cursor-1 == '\n'); otherwise reset + re-baseline. Also reset when from > len.
7. Guarantee is "exactly-once ingestion/enqueue", not "exactly-once audio". Watchdog: an utterance that never fires onstart within 3 s → retry once, then skip; started but no end → watchdog (est*2+5 s) cancels and moves on. Document.
8. Voices: check getVoices() immediately; if empty listen to voiceschanged AND poll every 100 ms up to 2 s; keep the voiceschanged listener for later recovery; re-resolve the voice object from a fresh getVoices() before each speak; always set utterance.voice + utterance.lang to a LOCAL voice (prime() too) — never fall back to the browser default voice. If speechSynthesis.paused before speak → resume().
9. After cancel(), schedule the next speak() with setTimeout(50) (not a microtask).
10. Backend: baseline (from=None or reset) scans backwards from EOF in 64 KB chunks for the last '\n' — never reads the whole file; from==len short-circuits on metadata before opening; new bytes without '\n' keep next_offset = from; fast-skip lines lacking `"assistant"` before serde; content blocks use #[serde(tag="type")] with #[serde(other)] Other so unknown block types don't drop the line.
11. Controller: every post-await/finally path checks request token AND epoch.
12. poke(path): match exact path OR same trailing `<projectDir>/<file>.jsonl`.
13. speechText: thinking cue only on the first chunk of a block; recurse lists/blockquotes; split long sentences at last whitespace ≤200 chars.
14. Remove fileMtimeMs/serverNowMs from the API; latency acceptance via controlled fixture appends.
15. One utterance in flight at a time; no native pre-queueing.

## Rejected
- agy 3.5(3) "desktop already receives pokes": false — nothing in src/ calls start_file_watcher (grep), useFileWatcher only listens.
- agy adaptive 2 s idle polling: rejected — adds up to 2 s to the first block after idle; user priority is latency. 300 ms visible poll stays; the from==len metadata short-circuit makes idle ticks cheap.
- agy "skip Phase 0": partially — Phase 0 browser checks move to the user's manual macOS Safari+Chrome checklist at the end (cannot run on the Linux VM).
