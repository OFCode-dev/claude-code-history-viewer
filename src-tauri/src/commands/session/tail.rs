//! Incremental tail reader for read-aloud mode.
//!
//! The frontend keeps a byte cursor into an append-only Claude session file and
//! asks for whatever was appended since. Only finished assistant `text` and
//! non-blank `thinking` blocks come back; everything else in the file is noise
//! for speech. History is never returned: the first call (no cursor) only
//! establishes the baseline at the end of the file.

use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::Path;

/// One spoken unit, in file order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TailBlock {
    pub kind: TailBlockKind,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TailBlockKind {
    Text,
    Thinking,
}

/// Result of one tail read. `next_offset` always sits right after a `\n` (or
/// at 0), so it is a valid cursor for the next call.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTail {
    pub blocks: Vec<TailBlock>,
    pub next_offset: u64,
    pub file_len: u64,
    /// The cursor no longer fit the file (truncated or not on a line start);
    /// `next_offset` is a fresh baseline and nothing was returned.
    pub reset: bool,
}

/// Read the assistant blocks appended to `session_path` since `from_offset`.
///
/// `from_offset` absent → baseline at the end of the file, no blocks.
///
/// Only checks that need no feature flag live here; the `WebUI` handler adds
/// the history-root guard on top.
#[tauri::command]
pub async fn read_session_tail(
    session_path: String,
    from_offset: Option<u64>,
) -> Result<SessionTail, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_tail_at(Path::new(&session_path), from_offset)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

fn read_tail_at(path: &Path, from: Option<u64>) -> Result<SessionTail, String> {
    if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
        return Err("Only .jsonl session files can be read".to_string());
    }
    if crate::utils::is_symlink(path) {
        return Err("Session file cannot be a symlink".to_string());
    }
    let metadata = std::fs::metadata(path).map_err(|e| format!("Session file not found: {e}"))?;
    if !metadata.is_file() {
        return Err("Session target must be a regular .jsonl file".to_string());
    }

    // Nothing appended since the last call: answer from metadata alone, which
    // keeps the idle poll to one stat.
    let len = metadata.len();
    if from == Some(len) {
        return Ok(SessionTail::unchanged(len));
    }

    let mut file = File::open(path).map_err(|e| format!("Failed to open session file: {e}"))?;
    read_tail_from(&mut file, len, from).map_err(|e| format!("Failed to read session file: {e}"))
}

impl SessionTail {
    fn unchanged(len: u64) -> Self {
        Self {
            blocks: Vec::new(),
            next_offset: len,
            file_len: len,
            reset: false,
        }
    }
}

/// Core of [`read_session_tail`] over any seekable reader whose first `len`
/// bytes are the file. `len` may be stale (a stat taken before the open): a
/// file that shrank since is measured again, so it resets instead of failing.
pub(crate) fn read_tail_from<R: Read + Seek>(
    reader: &mut R,
    len: u64,
    from: Option<u64>,
) -> io::Result<SessionTail> {
    let len = current_len(reader, len)?;
    let Some(from) = from else {
        return baseline(reader, len, false);
    };
    if from == len {
        return Ok(SessionTail::unchanged(len));
    }
    if from > len {
        return baseline(reader, len, true);
    }

    // Start one byte early so the continuity check (the cursor must sit right
    // after a '\n') costs no extra seek.
    let start = from.saturating_sub(1);
    reader.seek(SeekFrom::Start(start))?;
    let mut buf = Vec::with_capacity(usize::try_from(len - start).unwrap_or(0));
    reader.by_ref().take(len - start).read_to_end(&mut buf)?;

    let appended = if from == 0 {
        &buf[..]
    } else {
        match buf.split_first() {
            Some((b'\n', rest)) => rest,
            _ => return baseline(reader, len, true),
        }
    };

    // Consume complete lines only; a half-written last line waits for its '\n'.
    let Some(last_nl) = memchr::memrchr(b'\n', appended) else {
        return Ok(SessionTail {
            blocks: Vec::new(),
            next_offset: from,
            file_len: len,
            reset: false,
        });
    };
    let blocks = appended[..last_nl]
        .split(|&b| b == b'\n')
        .flat_map(spoken_blocks)
        .collect();

    Ok(SessionTail {
        blocks,
        next_offset: from + last_nl as u64 + 1,
        file_len: len,
        reset: false,
    })
}

const BASELINE_CHUNK: u64 = 64 * 1024;

/// `len`, or less when the reader now ends earlier (truncated since the stat).
fn current_len<R: Seek>(reader: &mut R, len: u64) -> io::Result<u64> {
    Ok(len.min(reader.seek(SeekFrom::End(0))?))
}

/// A cursor at the end of the last complete line, found by scanning backwards
/// from EOF so a large session is never read whole.
fn baseline<R: Read + Seek>(reader: &mut R, len: u64, reset: bool) -> io::Result<SessionTail> {
    // Measured again: the incremental path can fall back here after a shrink.
    let len = current_len(reader, len)?;
    let mut chunk = vec![0u8; len.min(BASELINE_CHUNK) as usize];
    let mut end = len;
    let mut next_offset = 0;
    while end > 0 {
        let start = end.saturating_sub(BASELINE_CHUNK);
        let window = &mut chunk[..(end - start) as usize];
        reader.seek(SeekFrom::Start(start))?;
        reader.read_exact(window)?;
        if let Some(i) = memchr::memrchr(b'\n', window) {
            next_offset = start + i as u64 + 1;
            break;
        }
        end = start;
    }
    Ok(SessionTail {
        blocks: Vec::new(),
        next_offset,
        file_len: len,
        reset,
    })
}

/// The lean subset of a JSONL row that decides what is spoken.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TailLine {
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    is_sidechain: bool,
    #[serde(default)]
    is_meta: bool,
    #[serde(default)]
    is_api_error_message: bool,
    message: Option<TailMessage>,
}

#[derive(Deserialize)]
struct TailMessage {
    model: Option<String>,
    #[serde(default)]
    content: Vec<TailContent>,
}

/// Unknown block types fall into `Other` so they do not drop the whole line.
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum TailContent {
    Text {
        #[serde(default)]
        text: String,
    },
    Thinking {
        #[serde(default)]
        thinking: String,
    },
    #[serde(other)]
    Other,
}

/// Spoken blocks of one line: main-chain, non-synthetic, non-error assistant
/// rows only; blank text and signature-only thinking are dropped.
fn spoken_blocks(line: &[u8]) -> Vec<TailBlock> {
    // Most rows (tool results, progress, user turns) never mention the role;
    // skip them before paying for serde.
    if memchr::memmem::find(line, b"\"assistant\"").is_none() {
        return Vec::new();
    }
    let Ok(row) = serde_json::from_slice::<TailLine>(line) else {
        return Vec::new();
    };
    let Some(message) = row.message else {
        return Vec::new();
    };
    if row.kind != "assistant"
        || row.is_sidechain
        || row.is_meta
        || row.is_api_error_message
        || message.model.as_deref() == Some("<synthetic>")
    {
        return Vec::new();
    }
    message
        .content
        .into_iter()
        .filter_map(|item| match item {
            TailContent::Text { text } => Some((TailBlockKind::Text, text)),
            TailContent::Thinking { thinking } => Some((TailBlockKind::Thinking, thinking)),
            TailContent::Other => None,
        })
        .filter(|(_, text)| !text.trim().is_empty())
        .map(|(kind, text)| TailBlock { kind, text })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::{Cursor, Write};
    use tempfile::TempDir;

    fn line(v: &serde_json::Value) -> String {
        format!("{v}\n")
    }

    fn assistant(content: &serde_json::Value) -> String {
        line(&json!({
            "type": "assistant",
            "isSidechain": false,
            "message": { "role": "assistant", "model": "claude-opus-4-20250514", "content": content }
        }))
    }

    fn assistant_text(text: &str) -> String {
        assistant(&json!([{ "type": "text", "text": text }]))
    }

    fn user_text(text: &str) -> String {
        line(&json!({ "type": "user", "message": { "role": "user", "content": text } }))
    }

    fn text(t: &str) -> TailBlock {
        TailBlock {
            kind: TailBlockKind::Text,
            text: t.to_string(),
        }
    }

    fn thinking(t: &str) -> TailBlock {
        TailBlock {
            kind: TailBlockKind::Thinking,
            text: t.to_string(),
        }
    }

    fn read(bytes: &[u8], from: Option<u64>) -> SessionTail {
        read_tail_from(&mut Cursor::new(bytes), bytes.len() as u64, from).unwrap()
    }

    /// Counts bytes handed out, to prove which reads stay cheap.
    struct CountingReader<R> {
        inner: R,
        bytes_read: u64,
    }

    impl<R: Read> Read for CountingReader<R> {
        fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
            let n = self.inner.read(buf)?;
            self.bytes_read += n as u64;
            Ok(n)
        }
    }

    impl<R: Seek> Seek for CountingReader<R> {
        fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> {
            self.inner.seek(pos)
        }
    }

    fn session_file(dir: &TempDir, contents: &str) -> String {
        let path = dir.path().join("session.jsonl");
        std::fs::write(&path, contents).unwrap();
        path.to_string_lossy().to_string()
    }

    fn append(path: &str, contents: &str) {
        let mut f = std::fs::OpenOptions::new().append(true).open(path).unwrap();
        f.write_all(contents.as_bytes()).unwrap();
    }

    #[test]
    fn baseline_skips_all_existing_lines() {
        let data = format!("{}{}", assistant_text("old reply"), user_text("old ask"));
        let tail = read(data.as_bytes(), None);
        assert_eq!(tail.blocks, vec![]);
        assert_eq!(tail.next_offset, data.len() as u64);
        assert_eq!(tail.file_len, data.len() as u64);
        assert!(!tail.reset);
    }

    #[test]
    fn baseline_stops_before_partial_line() {
        let complete = assistant_text("done");
        let data = format!("{complete}{{\"type\":\"assist");
        let tail = read(data.as_bytes(), None);
        assert_eq!(tail.next_offset, complete.len() as u64);
        assert_eq!(tail.file_len, data.len() as u64);
    }

    #[test]
    fn baseline_without_newline_is_zero() {
        assert_eq!(read(b"{\"type\":\"user\"", None).next_offset, 0);
        assert_eq!(read(b"", None).next_offset, 0);
    }

    #[test]
    fn baseline_scans_backwards_in_bounded_chunks() {
        // A 1 MB file ending in a newline: the baseline must not read it all.
        let mut data = vec![b'x'; 1024 * 1024];
        data.push(b'\n');
        let len = data.len() as u64;
        let mut reader = CountingReader {
            inner: Cursor::new(&data),
            bytes_read: 0,
        };
        let tail = read_tail_from(&mut reader, len, None).unwrap();
        assert_eq!(tail.next_offset, len);
        assert!(reader.bytes_read <= 64 * 1024, "read {}", reader.bytes_read);
    }

    #[test]
    fn baseline_finds_newline_beyond_the_first_chunk() {
        // The last '\n' sits ~200 KB before EOF, inside a long partial line.
        let mut data = b"{}\n".to_vec();
        data.extend(vec![b'y'; 200 * 1024]);
        assert_eq!(read(&data, None).next_offset, 3);
    }

    #[test]
    fn never_consumes_partial_trailing_line() {
        let first = assistant_text("first");
        let second = assistant_text("second");
        let (head, rest) = second.split_at(10);

        let data = format!("{first}{head}");
        let tail = read(data.as_bytes(), Some(0));
        assert_eq!(tail.blocks, vec![text("first")]);
        assert_eq!(tail.next_offset, first.len() as u64);

        // Only the partial line is new: nothing consumed, cursor stays put.
        let again = read(data.as_bytes(), Some(tail.next_offset));
        assert_eq!(again.blocks, vec![]);
        assert_eq!(again.next_offset, tail.next_offset);

        // Once completed it comes back exactly once.
        let data = format!("{first}{head}{rest}");
        let done = read(data.as_bytes(), Some(again.next_offset));
        assert_eq!(done.blocks, vec![text("second")]);
        assert_eq!(done.next_offset, data.len() as u64);
        assert_eq!(read(data.as_bytes(), Some(done.next_offset)).blocks, vec![]);
    }

    #[test]
    fn eof_short_circuit_does_not_read() {
        let data = b"not json at all\n".to_vec();
        let len = data.len() as u64;
        let mut reader = CountingReader {
            inner: Cursor::new(&data),
            bytes_read: 0,
        };
        let tail = read_tail_from(&mut reader, len, Some(len)).unwrap();
        assert_eq!(tail.blocks, vec![]);
        assert_eq!(tail.next_offset, len);
        assert!(!tail.reset);
        assert_eq!(reader.bytes_read, 0);
    }

    #[test]
    fn truncation_resets_without_blocks() {
        let data = format!("{}{}", assistant_text("a"), assistant_text("b"));
        let tail = read(data.as_bytes(), Some(data.len() as u64 + 500));
        assert!(tail.reset);
        assert_eq!(tail.blocks, vec![]);
        assert_eq!(tail.next_offset, data.len() as u64);
    }

    #[test]
    fn file_shrunk_after_stat_resets_instead_of_failing() {
        // The stat saw 10 bytes; the file was truncated to 2 before the read.
        let tail = read_tail_from(&mut Cursor::new(b"a\n"), 10, None).unwrap();
        assert!(!tail.reset);
        assert_eq!((tail.next_offset, tail.file_len), (2, 2));

        let tail = read_tail_from(&mut Cursor::new(b"a\n"), 10, Some(5)).unwrap();
        assert!(tail.reset);
        assert_eq!(tail.blocks, vec![]);
        assert_eq!((tail.next_offset, tail.file_len), (2, 2));
    }

    #[test]
    fn cursor_not_after_newline_resets() {
        let first = assistant_text("a");
        let data = format!("{first}{}", assistant_text("b"));
        // Mid-line cursor (e.g. the file was rewritten under us).
        let tail = read(data.as_bytes(), Some(first.len() as u64 - 3));
        assert!(tail.reset);
        assert_eq!(tail.blocks, vec![]);
        assert_eq!(tail.next_offset, data.len() as u64);
    }

    #[test]
    fn cursor_zero_reads_from_the_start() {
        let data = assistant_text("hello");
        let tail = read(data.as_bytes(), Some(0));
        assert!(!tail.reset);
        assert_eq!(tail.blocks, vec![text("hello")]);
    }

    #[test]
    fn filters_main_chain_text_and_nonempty_thinking() {
        let rows = [
            user_text("ask"),
            assistant(
                &json!([{ "type": "tool_use", "id": "t1", "name": "Bash", "input": { "command": "ls" } }]),
            ),
            line(
                &json!({ "type": "user", "message": { "role": "user", "content": [
                { "type": "tool_result", "tool_use_id": "t1", "content": "assistant output" }
            ] } }),
            ),
            line(&json!({ "type": "attachment", "attachment": { "type": "assistant" } })),
            line(
                &json!({ "type": "queue-operation", "operation": "enqueue", "content": "assistant" }),
            ),
            line(&json!({ "type": "api-request", "role": "assistant" })),
            line(&json!({
                "type": "assistant", "isSidechain": true,
                "message": { "model": "claude-opus-4", "content": [{ "type": "text", "text": "sidechain" }] }
            })),
            line(&json!({
                "type": "assistant", "isMeta": true,
                "message": { "model": "claude-opus-4", "content": [{ "type": "text", "text": "meta" }] }
            })),
            assistant(
                &json!([{ "type": "thinking", "thinking": "", "signature": "EpUICkYIBRgCKkCB" }]),
            ),
            assistant(&json!([{ "type": "redacted_thinking", "data": "EmwKAhgB" }])),
            assistant(&json!([{ "type": "text", "text": "  \n\t " }])),
            line(&json!({
                "type": "assistant",
                "message": { "model": "<synthetic>", "content": [{ "type": "text", "text": "No response requested." }] }
            })),
            line(&json!({
                "type": "assistant", "isApiErrorMessage": true,
                "message": { "model": "claude-opus-4", "content": [{ "type": "text", "text": "API Error: 529" }] }
            })),
            assistant_text("the real reply"),
            assistant(
                &json!([{ "type": "thinking", "thinking": "a short summary", "signature": "sig" }]),
            ),
        ];
        let data = rows.concat();
        let tail = read(data.as_bytes(), Some(0));
        assert_eq!(
            tail.blocks,
            vec![text("the real reply"), thinking("a short summary")]
        );
        assert_eq!(tail.next_offset, data.len() as u64);
    }

    #[test]
    fn whole_message_written_at_once() {
        let data = assistant(&json!([
            { "type": "thinking", "thinking": "plan", "signature": "s" },
            { "type": "text", "text": "Let me look." },
            { "type": "tool_use", "id": "t1", "name": "Read", "input": { "file_path": "/a" } }
        ]));
        assert_eq!(
            read(data.as_bytes(), Some(0)).blocks,
            vec![thinking("plan"), text("Let me look.")]
        );
    }

    #[test]
    fn unknown_content_block_type_keeps_line() {
        let data = assistant(&json!([
            { "type": "some_future_block", "payload": { "nested": [1, 2] } },
            { "type": "text", "text": "still spoken" }
        ]));
        assert_eq!(
            read(data.as_bytes(), Some(0)).blocks,
            vec![text("still spoken")]
        );
    }

    #[test]
    fn invalid_json_line_is_skipped_not_fatal() {
        let data = format!(
            "{}{{\"type\":\"assistant\", broken\n{}",
            assistant_text("one"),
            assistant_text("two")
        );
        let tail = read(data.as_bytes(), Some(0));
        assert_eq!(tail.blocks, vec![text("one"), text("two")]);
        assert_eq!(tail.next_offset, data.len() as u64);
    }

    #[test]
    fn serializes_the_shared_camel_case_contract() {
        let tail = SessionTail {
            blocks: vec![text("a"), thinking("b")],
            next_offset: 7,
            file_len: 9,
            reset: false,
        };
        assert_eq!(
            serde_json::to_value(tail).unwrap(),
            json!({
                "blocks": [{ "kind": "text", "text": "a" }, { "kind": "thinking", "text": "b" }],
                "nextOffset": 7,
                "fileLen": 9,
                "reset": false
            })
        );
    }

    #[tokio::test]
    async fn command_baseline_then_appended_reply() {
        let dir = TempDir::new().unwrap();
        let path = session_file(&dir, &assistant_text("history"));

        let base = read_session_tail(path.clone(), None).await.unwrap();
        assert_eq!(base.blocks, vec![]);

        append(&path, &assistant_text("fresh"));
        let tail = read_session_tail(path.clone(), Some(base.next_offset))
            .await
            .unwrap();
        assert_eq!(tail.blocks, vec![text("fresh")]);
        assert_eq!(tail.next_offset, tail.file_len);
    }

    #[tokio::test]
    async fn command_eof_short_circuit_ignores_content() {
        let dir = TempDir::new().unwrap();
        let path = session_file(&dir, "garbage\n");
        let tail = read_session_tail(path, Some(8)).await.unwrap();
        assert_eq!(tail.blocks, vec![]);
        assert_eq!(tail.next_offset, 8);
    }

    #[tokio::test]
    async fn rejects_non_jsonl() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("notes.txt");
        std::fs::write(&path, assistant_text("x")).unwrap();
        let err = read_session_tail(path.to_string_lossy().to_string(), None)
            .await
            .unwrap_err();
        assert!(err.contains(".jsonl"), "{err}");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_symlink() {
        let dir = TempDir::new().unwrap();
        let target = session_file(&dir, &assistant_text("x"));
        let link = dir.path().join("link.jsonl");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        let err = read_session_tail(link.to_string_lossy().to_string(), None)
            .await
            .unwrap_err();
        assert!(err.contains("symlink"), "{err}");
    }

    #[tokio::test]
    async fn rejects_directory() {
        let dir = TempDir::new().unwrap();
        let fake = dir.path().join("dir.jsonl");
        std::fs::create_dir(&fake).unwrap();
        let err = read_session_tail(fake.to_string_lossy().to_string(), None)
            .await
            .unwrap_err();
        assert!(err.contains("regular"), "{err}");
    }
}
