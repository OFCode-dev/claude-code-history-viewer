//! Messages a person sent while Claude was still working ("queued" prompts).
//!
//! Claude Code records such a message as a `type: "attachment"` record inside
//! the normal `parentUuid` chain (tool result → queued prompt → reminder →
//! assistant):
//!
//! ```json
//! {"type":"attachment","uuid":"…","parentUuid":"…","attachment":{
//!   "type":"queued_command","commandMode":"prompt","humanTurn":true,
//!   "prompt":"<what the person typed>"}}
//! ```
//!
//! Every attachment record is a viewer-visible row: the fast line classifier
//! counts it and the loaders return it. Only a person's queued prompt carries
//! something to show, so it is promoted to a `user` message with
//! `queued: Some(true)`. Every other attachment keeps its `attachment` type and
//! no content, which the frontend renders as nothing: task-notification queued
//! commands (Claude Code records those separately as user records), `isMeta`
//! queued commands (subagent hand-backs, peer messages), reminders, tool
//! listings, hook output and the rest. Promotion never adds or removes a row,
//! so counts, offsets and pagination windows stay identical across the full
//! loader, the window loader, the line counter and deep-link offsets.
//!
//! Some Claude Code versions also record the drained queue as a normal user
//! record (`promptSource: "queued"`). When such a record repeats a queued
//! prompt shortly after it, the attachment is hidden again so the message is
//! shown once, as the user record.

use crate::models::{ClaudeMessage, RawLogEntry};
use chrono::{DateTime, FixedOffset, Utc};
use serde_json::Value;
use uuid::Uuid;

/// How many following records may separate a queued prompt from the
/// drained-queue user record that repeats it.
const REPEAT_LOOKAHEAD_RECORDS: usize = 20;

/// How far apart (in seconds) a queued prompt and its repeat may be.
const REPEAT_MAX_DELAY_SECS: i64 = 5 * 60;

/// Takes the prompt of a person's queued message out of an attachment record.
///
/// `None` for every other record, including queued commands that were not
/// typed by a person (task notifications, `isMeta` hand-backs) and queued
/// prompts without content.
pub(super) fn take_human_queued_prompt(entry: &mut RawLogEntry) -> Option<Value> {
    if entry.message_type != "attachment" {
        return None;
    }
    let attachment = entry.attachment.as_mut()?;
    let typed_by_person = attachment.attachment_type.as_deref() == Some("queued_command")
        && attachment.command_mode.as_deref() == Some("prompt")
        && attachment.human_turn == Some(true)
        && attachment.is_meta != Some(true);
    if !typed_by_person || !has_content(attachment.prompt.as_ref()?) {
        return None;
    }
    attachment.prompt.take()
}

fn has_content(prompt: &Value) -> bool {
    match prompt {
        Value::String(text) => !text.trim().is_empty(),
        Value::Array(blocks) => !blocks.is_empty(),
        _ => false,
    }
}

/// The user message the viewer shows for a queued prompt: the prompt as-is
/// (string or content blocks) in the attachment record's place in the chain.
pub(super) fn to_message(entry: RawLogEntry, prompt: Value, line_num: usize) -> ClaudeMessage {
    ClaudeMessage {
        uuid: entry
            .uuid
            .unwrap_or_else(|| format!("{}-line-{}", Uuid::new_v4(), line_num + 1)),
        parent_uuid: entry.parent_uuid,
        session_id: entry
            .session_id
            .unwrap_or_else(|| "unknown-session".to_string()),
        timestamp: entry.timestamp.unwrap_or_else(|| Utc::now().to_rfc3339()),
        message_type: "user".to_string(),
        content: Some(prompt),
        project_name: None,
        tool_use: None,
        tool_use_result: None,
        is_sidechain: entry.is_sidechain,
        usage: None,
        role: Some("user".to_string()),
        model: None,
        stop_reason: None,
        cost_usd: None,
        duration_ms: None,
        message_id: None,
        snapshot: None,
        is_snapshot_update: None,
        data: None,
        tool_use_id: None,
        parent_tool_use_id: None,
        operation: None,
        subtype: None,
        level: None,
        hook_count: None,
        hook_infos: None,
        stop_reason_system: None,
        prevented_continuation: None,
        compact_metadata: None,
        microcompact_metadata: None,
        provider: None,
        queued: Some(true),
    }
}

/// Whether a drained-queue user record repeats this queued prompt within the
/// next few records. `following` yields the raw JSONL lines after the prompt's
/// own line, in file order. Always false for messages that are not queued
/// prompts.
pub(super) fn is_repeated_later<'a>(
    message: &ClaudeMessage,
    following: impl Iterator<Item = &'a [u8]>,
) -> bool {
    if message.queued != Some(true) {
        return false;
    }
    let Some(prompt) = message.content.as_ref() else {
        return false;
    };
    let queued_at = parse_timestamp(&message.timestamp);
    following
        .filter(|line| !line.iter().all(u8::is_ascii_whitespace))
        .take(REPEAT_LOOKAHEAD_RECORDS)
        // Cheap pre-filter: only lines that can hold `"promptSource":"queued"`.
        .filter(|line| memchr::memmem::find(line, b"\"queued\"").is_some())
        .filter_map(|line| serde_json::from_slice::<DrainedQueueRecord>(line).ok())
        .any(|record| record.repeats(prompt, queued_at))
}

/// Hides a promoted queued prompt again when a drained-queue user record
/// repeats it (see [`is_repeated_later`]): the row turns back into a
/// content-less attachment, so the count of rows does not change.
pub(super) fn hide_if_repeated<'a>(
    message: &mut ClaudeMessage,
    following: impl Iterator<Item = &'a [u8]>,
) {
    if is_repeated_later(message, following) {
        message.message_type = "attachment".to_string();
        message.role = None;
        message.content = None;
        message.queued = None;
    }
}

/// The few fields of a user record needed to recognise a drained queue.
#[derive(serde::Deserialize)]
struct DrainedQueueRecord {
    #[serde(rename = "type")]
    record_type: Option<String>,
    #[serde(rename = "promptSource")]
    prompt_source: Option<String>,
    #[serde(rename = "isMeta")]
    is_meta: Option<bool>,
    timestamp: Option<String>,
    message: Option<DrainedQueueMessage>,
}

#[derive(serde::Deserialize)]
struct DrainedQueueMessage {
    content: Option<Value>,
}

impl DrainedQueueRecord {
    fn repeats(&self, prompt: &Value, queued_at: Option<DateTime<FixedOffset>>) -> bool {
        // An `isMeta` record is hidden by the loaders, so it cannot stand in
        // for the queued prompt.
        if self.record_type.as_deref() != Some("user")
            || self.prompt_source.as_deref() != Some("queued")
            || self.is_meta == Some(true)
        {
            return false;
        }
        let in_time = match (
            queued_at,
            self.timestamp.as_deref().and_then(parse_timestamp),
        ) {
            (Some(queued), Some(repeated)) => {
                (repeated - queued).num_seconds().abs() <= REPEAT_MAX_DELAY_SECS
            }
            // Without usable timestamps the record window alone decides.
            _ => true,
        };
        in_time
            && self
                .message
                .as_ref()
                .and_then(|message| message.content.as_ref())
                .is_some_and(|content| same_prompt(prompt, content))
    }
}

fn parse_timestamp(timestamp: &str) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(timestamp).ok()
}

/// Same message: identical content, or the same (non-empty) text when one
/// side is a string and the other a list of content blocks.
fn same_prompt(queued: &Value, repeated: &Value) -> bool {
    if queued == repeated {
        return true;
    }
    let text = prompt_text(queued);
    !text.is_empty() && text == prompt_text(repeated)
}

fn prompt_text(content: &Value) -> String {
    match content {
        Value::String(text) => text.trim().to_string(),
        Value::Array(blocks) => blocks
            .iter()
            .filter(|block| block.get("type").and_then(Value::as_str) == Some("text"))
            .filter_map(|block| block.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn entry(line: &str) -> RawLogEntry {
        serde_json::from_str(line).expect("valid test record")
    }

    fn queued_attachment(attachment: &Value) -> String {
        json!({
            "type": "attachment",
            "uuid": "att-1",
            "parentUuid": "tool-result-1",
            "isSidechain": false,
            "timestamp": "2026-09-24T10:00:00.000Z",
            "sessionId": "session-1",
            "userType": "external",
            "entrypoint": "cli",
            "rendered": [{"content": "<system-reminder>\nThe user sent a new message while you were working:\n…"}],
            "attachment": attachment,
        })
        .to_string()
    }

    fn human_attachment(prompt: &Value) -> String {
        queued_attachment(&json!({
            "type": "queued_command",
            "commandMode": "prompt",
            "humanTurn": true,
            "prompt": prompt,
            "origin": {"kind": "human"},
            "source_uuid": "src-1",
            "timestamp": "2026-09-24T10:00:00.000Z",
        }))
    }

    fn drained_user_record(content: &Value, timestamp: &str) -> String {
        json!({
            "type": "user",
            "uuid": "user-queued-1",
            "parentUuid": "assistant-1",
            "timestamp": timestamp,
            "sessionId": "session-1",
            "promptSource": "queued",
            "origin": {"kind": "human"},
            "message": {"role": "user", "content": content},
        })
        .to_string()
    }

    fn filler(n: usize) -> Vec<String> {
        (0..n)
            .map(|i| {
                json!({
                    "type": "attachment",
                    "uuid": format!("filler-{i}"),
                    "timestamp": "2026-09-24T10:00:01.000Z",
                    "sessionId": "session-1",
                    "attachment": {"type": "total_tokens_reminder", "used": 1000 + i},
                })
                .to_string()
            })
            .collect()
    }

    fn promoted(prompt: &Value) -> ClaudeMessage {
        let mut raw = entry(&human_attachment(prompt));
        let taken = take_human_queued_prompt(&mut raw).expect("human queued prompt");
        to_message(raw, taken, 0)
    }

    fn lines(records: &[String]) -> impl Iterator<Item = &[u8]> {
        records.iter().map(String::as_bytes)
    }

    #[test]
    fn a_human_queued_prompt_becomes_a_queued_user_message() {
        let message = promoted(&json!("Also check the retry limit, please."));

        assert_eq!(message.message_type, "user");
        assert_eq!(message.role.as_deref(), Some("user"));
        assert_eq!(message.queued, Some(true));
        assert_eq!(
            message.content,
            Some(json!("Also check the retry limit, please."))
        );
        assert_eq!(message.uuid, "att-1");
        assert_eq!(message.parent_uuid.as_deref(), Some("tool-result-1"));
        assert_eq!(message.session_id, "session-1");
        assert_eq!(message.timestamp, "2026-09-24T10:00:00.000Z");
        assert_eq!(message.is_sidechain, Some(false));
    }

    #[test]
    fn a_content_block_prompt_is_kept_as_is() {
        let blocks = json!([
            {"type": "text", "text": "What about this screenshot?"},
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "AAAA"}},
        ]);
        assert_eq!(promoted(&blocks).content, Some(blocks));
    }

    #[test]
    fn queued_commands_not_typed_by_a_person_are_not_prompts() {
        let task_notification = json!({
            "type": "queued_command",
            "commandMode": "task-notification",
            "prompt": "<task-notification>\n<task-id>b1</task-id>\n</task-notification>",
        });
        let hand_back = json!({
            "type": "queued_command",
            "commandMode": "prompt",
            "isMeta": true,
            "prompt": "Subagent finished: audit complete.",
        });
        let meta_with_human_flag = json!({
            "type": "queued_command",
            "commandMode": "prompt",
            "humanTurn": true,
            "isMeta": true,
            "prompt": "peer message",
        });
        let without_human_flag = json!({
            "type": "queued_command",
            "commandMode": "prompt",
            "prompt": "unknown origin",
        });
        for attachment in [
            task_notification,
            hand_back,
            meta_with_human_flag,
            without_human_flag,
        ] {
            let mut raw = entry(&queued_attachment(&attachment));
            assert_eq!(take_human_queued_prompt(&mut raw), None, "{attachment}");
        }
    }

    #[test]
    fn other_attachments_and_other_records_are_not_prompts() {
        for attachment in [
            json!({"type": "total_tokens_reminder", "used": 1200, "total": 200_000}),
            json!({"type": "deferred_tools_record", "tools": ["WebFetch", "Monitor"]}),
            json!({"type": "hook_success", "hookName": "SessionStart", "content": "ok"}),
            json!({"type": "queued_command", "commandMode": "prompt", "humanTurn": true, "prompt": "  "}),
            json!({"type": "queued_command", "commandMode": "prompt", "humanTurn": true}),
        ] {
            let mut raw = entry(&queued_attachment(&attachment));
            assert_eq!(take_human_queued_prompt(&mut raw), None, "{attachment}");
        }

        // A user record never goes through the attachment path, whatever it carries.
        let mut user = entry(
            &json!({
                "type": "user",
                "uuid": "u1",
                "timestamp": "2026-09-24T10:00:00.000Z",
                "sessionId": "session-1",
                "message": {"role": "user", "content": "hello"},
                "attachment": {"type": "queued_command", "commandMode": "prompt", "humanTurn": true, "prompt": "x"},
            })
            .to_string(),
        );
        assert_eq!(take_human_queued_prompt(&mut user), None);
    }

    #[test]
    fn a_drained_queue_record_with_the_same_text_hides_the_attachment() {
        let text = "Also check the retry limit, please.";
        let mut message = promoted(&json!(text));
        let mut following = filler(3);
        following.push(drained_user_record(
            &json!(text),
            "2026-09-24T10:01:30.000Z",
        ));

        hide_if_repeated(&mut message, lines(&following));

        assert_eq!(message.message_type, "attachment");
        assert_eq!(message.content, None);
        assert_eq!(message.role, None);
        assert_eq!(message.queued, None);
        // Still a row in the same place: counts and offsets are unaffected.
        assert_eq!(message.uuid, "att-1");
    }

    #[test]
    fn text_blocks_and_strings_with_the_same_text_are_the_same_prompt() {
        let text = "Stop after the first failing test.";
        let message = promoted(&json!(text));
        let following = vec![drained_user_record(
            &json!([{"type": "text", "text": text}]),
            "2026-09-24T10:00:10.000Z",
        )];
        assert!(is_repeated_later(&message, lines(&following)));
    }

    #[test]
    fn a_queued_prompt_stays_visible_when_nothing_repeats_it() {
        let text = "Also check the retry limit, please.";
        let message = promoted(&json!(text));

        let other_text = vec![drained_user_record(
            &json!("Something else entirely"),
            "2026-09-24T10:00:30.000Z",
        )];
        assert!(!is_repeated_later(&message, lines(&other_text)));

        let too_late = vec![drained_user_record(
            &json!(text),
            "2026-09-24T10:05:01.000Z",
        )];
        assert!(!is_repeated_later(&message, lines(&too_late)));

        let mut too_far = filler(REPEAT_LOOKAHEAD_RECORDS);
        too_far.push(drained_user_record(
            &json!(text),
            "2026-09-24T10:00:30.000Z",
        ));
        assert!(!is_repeated_later(&message, lines(&too_far)));

        let typed_again = vec![json!({
            "type": "user",
            "uuid": "u2",
            "timestamp": "2026-09-24T10:00:30.000Z",
            "sessionId": "session-1",
            "promptSource": "typed",
            "message": {"role": "user", "content": text},
        })
        .to_string()];
        assert!(!is_repeated_later(&message, lines(&typed_again)));

        let meta_repeat = vec![json!({
            "type": "user",
            "uuid": "u3",
            "timestamp": "2026-09-24T10:00:30.000Z",
            "sessionId": "session-1",
            "promptSource": "queued",
            "isMeta": true,
            "message": {"role": "user", "content": text},
        })
        .to_string()];
        assert!(!is_repeated_later(&message, lines(&meta_repeat)));
    }

    #[test]
    fn blank_lines_do_not_count_toward_the_lookahead() {
        let text = "Also check the retry limit, please.";
        let message = promoted(&json!(text));
        let mut following: Vec<String> = vec![String::new(); REPEAT_LOOKAHEAD_RECORDS + 5];
        following.push(drained_user_record(
            &json!(text),
            "2026-09-24T10:00:30.000Z",
        ));
        assert!(is_repeated_later(&message, lines(&following)));
    }

    #[test]
    fn only_queued_prompts_are_ever_hidden() {
        let mut regular = promoted(&json!("text"));
        regular.queued = None;
        let following = vec![drained_user_record(
            &json!("text"),
            "2026-09-24T10:00:30.000Z",
        )];

        hide_if_repeated(&mut regular, lines(&following));

        assert_eq!(regular.message_type, "user");
        assert_eq!(regular.content, Some(json!("text")));
    }
}

/// One session read through every path that turns JSONL into viewer rows:
/// they must agree on which rows exist and on what the queued prompts show.
#[cfg(test)]
mod loader_tests {
    use crate::commands::session::{
        get_session_message_count, get_session_message_offset, load_session_messages,
        load_session_messages_paginated, search_messages,
    };
    use crate::models::ClaudeMessage;
    use serde_json::{json, Value};
    use std::path::{Path, PathBuf};
    use tempfile::TempDir;

    fn ts(second: u32) -> String {
        format!("2026-09-24T10:{:02}:{:02}.000Z", second / 60, second % 60)
    }

    fn record(kind: &str, uuid: &str, parent: Option<&str>, second: u32, extra: &Value) -> String {
        let mut value = json!({
            "type": kind,
            "uuid": uuid,
            "parentUuid": parent,
            "isSidechain": false,
            "timestamp": ts(second),
            "sessionId": "session-1",
            "userType": "external",
            "entrypoint": "cli",
        });
        let fields = value.as_object_mut().expect("object");
        for (key, field) in extra.as_object().expect("object") {
            fields.insert(key.clone(), field.clone());
        }
        value.to_string()
    }

    fn prompt(uuid: &str, parent: Option<&str>, second: u32, text: &str) -> String {
        let extra = json!({
            "promptSource": "typed",
            "origin": {"kind": "human"},
            "message": {"role": "user", "content": text},
        });
        record("user", uuid, parent, second, &extra)
    }

    fn tool_use(uuid: &str, parent: &str, second: u32) -> String {
        let extra = json!({"message": {
            "id": format!("msg-{uuid}"),
            "role": "assistant",
            "model": "claude-opus-5-5",
            "content": [{"type": "tool_use", "id": format!("toolu-{uuid}"), "name": "Bash", "input": {"command": "pnpm test"}}],
        }});
        record("assistant", uuid, Some(parent), second, &extra)
    }

    fn tool_result(uuid: &str, tool_use_uuid: &str, second: u32) -> String {
        let extra = json!({"message": {
            "role": "user",
            "content": [{"type": "tool_result", "tool_use_id": format!("toolu-{tool_use_uuid}"), "content": "PASS 12 tests"}],
        }});
        record("user", uuid, Some(tool_use_uuid), second, &extra)
    }

    fn reply(uuid: &str, parent: &str, second: u32, text: &str) -> String {
        let extra = json!({"message": {
            "id": format!("msg-{uuid}"),
            "role": "assistant",
            "model": "claude-opus-5-5",
            "content": [{"type": "text", "text": text}],
        }});
        record("assistant", uuid, Some(parent), second, &extra)
    }

    fn attachment(uuid: &str, parent: &str, second: u32, payload: &Value) -> String {
        let extra = json!({"attachment": payload});
        record("attachment", uuid, Some(parent), second, &extra)
    }

    fn human_queued(uuid: &str, parent: &str, second: u32, prompt: &Value) -> String {
        let extra = json!({
            "rendered": [{"content": "<system-reminder>\nThe user sent a new message while you were working:\n…"}],
            "attachment": {
                "type": "queued_command",
                "commandMode": "prompt",
                "humanTurn": true,
                "prompt": prompt,
                "origin": {"kind": "human"},
                "source_uuid": format!("source-{uuid}"),
                "timestamp": ts(second),
            },
        });
        record("attachment", uuid, Some(parent), second, &extra)
    }

    const TASK_NOTIFICATION: &str =
        "<task-notification>\n<task-id>b7</task-id>\n<status>completed</status>\n</task-notification>";

    /// A long turn with two queued prompts and every kind of hidden attachment.
    fn mixed_session() -> Vec<String> {
        let meta = json!({
            "isMeta": true,
            "message": {"role": "user", "content": "<skill-expansion>…</skill-expansion>"},
        });
        let notification = json!({
            "origin": {"kind": "task-notification"},
            "message": {"role": "user", "content": TASK_NOTIFICATION},
        });
        vec![
            json!({"type": "summary", "summary": "Billing retries", "leafUuid": "a3"}).to_string(),
            prompt("u1", None, 0, "Fix the billing retries."),
            record("user", "meta1", Some("u1"), 1, &meta),
            tool_use("a1", "u1", 5),
            tool_result("tr1", "a1", 10),
            human_queued("q1", "tr1", 12, &json!("Also check the retry limit.")),
            attachment(
                "r1",
                "q1",
                12,
                &json!({"type": "total_tokens_reminder", "used": 41_000, "total": 200_000}),
            ),
            tool_use("a2", "r1", 20),
            tool_result("tr2", "a2", 25),
            attachment(
                "tn1",
                "tr2",
                26,
                &json!({"type": "queued_command", "commandMode": "task-notification", "prompt": TASK_NOTIFICATION}),
            ),
            record("user", "un1", Some("tn1"), 26, &notification),
            attachment(
                "hb1",
                "un1",
                27,
                &json!({"type": "queued_command", "commandMode": "prompt", "isMeta": true, "prompt": "Subagent audit finished: 2 findings."}),
            ),
            attachment(
                "d1",
                "hb1",
                27,
                &json!({"type": "deferred_tools_record", "tools": ["WebFetch", "Monitor"]}),
            ),
            attachment(
                "h1",
                "d1",
                27,
                &json!({"type": "hook_success", "hookName": "PostToolUse", "content": "ok"}),
            ),
            human_queued(
                "q2",
                "h1",
                28,
                &json!([{"type": "text", "text": "Use the staging database for this."}]),
            ),
            reply("a3", "q2", 40, "Done: retries are capped at three."),
        ]
    }

    const MIXED_ROWS: [&str; 14] = [
        "u1", "a1", "tr1", "q1", "r1", "a2", "tr2", "tn1", "un1", "hb1", "d1", "h1", "q2", "a3",
    ];

    fn write_session(dir: &Path, name: &str, lines: &[String]) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, lines.join("\n") + "\n").expect("write session");
        path
    }

    fn uuids(messages: &[ClaudeMessage]) -> Vec<&str> {
        messages.iter().map(|m| m.uuid.as_str()).collect()
    }

    fn find<'a>(messages: &'a [ClaudeMessage], uuid: &str) -> &'a ClaudeMessage {
        messages
            .iter()
            .find(|m| m.uuid == uuid)
            .unwrap_or_else(|| panic!("{uuid} missing"))
    }

    /// Every page of `limit` rows, fetched newest page first like the viewer,
    /// flattened oldest → newest, plus the reported total.
    async fn all_pages(path: &str, limit: usize) -> (Vec<ClaudeMessage>, usize) {
        let mut pages = Vec::new();
        let mut offset = 0;
        let total = loop {
            let page = load_session_messages_paginated(path.to_string(), offset, limit, None)
                .await
                .expect("page");
            assert!(page.messages.len() <= limit);
            offset = page.next_offset;
            let total = page.total_count;
            pages.push(page.messages);
            if offset >= total {
                break total;
            }
        };
        pages.reverse();
        (pages.into_iter().flatten().collect(), total)
    }

    #[tokio::test]
    async fn human_queued_prompts_become_queued_user_messages_and_the_rest_stays_hidden() {
        let dir = TempDir::new().unwrap();
        let path = write_session(dir.path(), "mixed.jsonl", &mixed_session());
        let messages = load_session_messages(path.to_string_lossy().to_string())
            .await
            .unwrap();

        assert_eq!(uuids(&messages), MIXED_ROWS);

        let q1 = find(&messages, "q1");
        assert_eq!(q1.message_type, "user");
        assert_eq!(q1.role.as_deref(), Some("user"));
        assert_eq!(q1.queued, Some(true));
        assert_eq!(q1.content, Some(json!("Also check the retry limit.")));
        assert_eq!(q1.parent_uuid.as_deref(), Some("tr1"));

        let q2 = find(&messages, "q2");
        assert_eq!(q2.queued, Some(true));
        assert_eq!(
            q2.content,
            Some(json!([{"type": "text", "text": "Use the staging database for this."}]))
        );

        for hidden in ["r1", "tn1", "hb1", "d1", "h1"] {
            let row = find(&messages, hidden);
            assert_eq!(row.message_type, "attachment", "{hidden}");
            assert_eq!(row.content, None, "{hidden}");
            assert_eq!(row.queued, None, "{hidden}");
        }
        let notification = find(&messages, "un1");
        assert_eq!(notification.message_type, "user");
        assert_eq!(notification.queued, None);

        // The flag reaches the frontend only where it is set.
        let q1_json = serde_json::to_value(q1).unwrap();
        assert_eq!(q1_json["queued"], json!(true));
        assert_eq!(q1_json["type"], json!("user"));
        let u1_json = serde_json::to_value(find(&messages, "u1")).unwrap();
        assert!(u1_json.get("queued").is_none());
    }

    #[tokio::test]
    async fn counts_windows_and_offsets_agree_with_the_full_load() {
        let dir = TempDir::new().unwrap();
        let path = write_session(dir.path(), "mixed.jsonl", &mixed_session());
        let path = path.to_string_lossy().to_string();

        let full = load_session_messages(path.clone()).await.unwrap();
        let count = get_session_message_count(path.clone(), None).await.unwrap();
        assert_eq!(count, full.len());

        for limit in [1, 3, 4, 5, 14, 50] {
            let (paged, total) = all_pages(&path, limit).await;
            assert_eq!(total, full.len(), "limit {limit}");
            assert_eq!(uuids(&paged), uuids(&full), "limit {limit}");
            assert_eq!(find(&paged, "q1").queued, Some(true), "limit {limit}");
            assert_eq!(find(&paged, "q2").queued, Some(true), "limit {limit}");
        }

        // A deep link to a queued prompt lands inside the window it asks for.
        let offset = get_session_message_offset(path.clone(), "q1".to_string(), None)
            .unwrap()
            .expect("q1 is a visible row");
        assert_eq!(offset, full.len() - 1 - 3);
        let window = load_session_messages_paginated(path, 0, offset + 1, None)
            .await
            .unwrap();
        assert_eq!(window.messages.first().map(|m| m.uuid.as_str()), Some("q1"));
        assert_eq!(window.messages[0].queued, Some(true));
    }

    /// Older Claude Code versions also write the drained queue as a user
    /// record: the message is shown once, as that record, on every path.
    fn drained_queue_session() -> Vec<String> {
        let text = "Stop after the first failing test.";
        let drained = json!({
            "promptSource": "queued",
            "origin": {"kind": "human"},
            "message": {"role": "user", "content": text},
        });
        vec![
            prompt("u1", None, 0, "Run the whole suite."),
            tool_use("a1", "u1", 5),
            tool_result("tr1", "a1", 10),
            human_queued("q1", "tr1", 12, &json!(text)),
            attachment(
                "r1",
                "q1",
                12,
                &json!({"type": "total_tokens_reminder", "used": 9_000}),
            ),
            reply("a2", "r1", 30, "Stopping at the first failure."),
            record("user", "uq1", Some("a2"), 31, &drained),
            reply("a3", "uq1", 40, "The first failure is in billing_test.py."),
        ]
    }

    #[tokio::test]
    async fn a_drained_queue_user_record_is_shown_instead_of_the_attachment() {
        let dir = TempDir::new().unwrap();
        let path = write_session(dir.path(), "drained.jsonl", &drained_queue_session());
        let path = path.to_string_lossy().to_string();

        let full = load_session_messages(path.clone()).await.unwrap();
        assert_eq!(
            uuids(&full),
            ["u1", "a1", "tr1", "q1", "r1", "a2", "uq1", "a3"]
        );
        let q1 = find(&full, "q1");
        assert_eq!(q1.message_type, "attachment");
        assert_eq!(q1.content, None);
        assert_eq!(find(&full, "uq1").message_type, "user");
        assert_eq!(
            get_session_message_count(path.clone(), None).await.unwrap(),
            full.len()
        );

        // The page holding the attachment does not hold the repeat; the
        // attachment must stay hidden anyway.
        let older = load_session_messages_paginated(path.clone(), 3, 3, None)
            .await
            .unwrap();
        assert_eq!(uuids(&older.messages), ["tr1", "q1", "r1"]);
        assert_eq!(older.messages[1].message_type, "attachment");
        assert_eq!(older.messages[1].queued, None);

        let (paged, _) = all_pages(&path, 3).await;
        assert_eq!(uuids(&paged), uuids(&full));
    }

    #[tokio::test]
    async fn a_continued_session_shows_queued_prompts_of_the_earlier_file() {
        let dir = TempDir::new().unwrap();
        let mut older = mixed_session();
        older.remove(0); // no summary line
        write_session(dir.path(), "older.jsonl", &older);
        let boundary = json!({
            "type": "system",
            "subtype": "compact_boundary",
            "uuid": "boundary-1",
            "logicalParentUuid": "a3",
            "sessionId": "session-2",
            "timestamp": ts(100),
        });
        let newer = vec![
            boundary.to_string(),
            prompt("u2", Some("boundary-1"), 101, "Now add a test."),
            human_queued("q3", "u2", 102, &json!("Name it test_retry_cap.")),
            reply("a4", "q3", 110, "Added test_retry_cap."),
        ];
        let leaf = write_session(dir.path(), "newer.jsonl", &newer);
        let leaf = leaf.to_string_lossy().to_string();

        let full = load_session_messages(leaf.clone()).await.unwrap();
        assert_eq!(full.len(), MIXED_ROWS.len() + 4);
        assert_eq!(
            get_session_message_count(leaf.clone(), None).await.unwrap(),
            full.len()
        );
        for queued in ["q1", "q2", "q3"] {
            assert_eq!(find(&full, queued).queued, Some(true), "{queued}");
        }

        let (paged, total) = all_pages(&leaf, 4).await;
        assert_eq!(total, full.len());
        assert_eq!(uuids(&paged), uuids(&full));
    }

    fn claude_home_with(name: &str, lines: &[String]) -> TempDir {
        let home = TempDir::new().unwrap();
        let project = home.path().join("projects").join("-work-acme-api");
        std::fs::create_dir_all(&project).unwrap();
        write_session(&project, name, lines);
        home
    }

    async fn search(home: &TempDir, query: &str) -> Vec<ClaudeMessage> {
        search_messages(
            home.path().to_string_lossy().to_string(),
            query.to_string(),
            json!({}),
            None,
        )
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn search_finds_queued_prompts_but_not_hidden_attachments() {
        let home = claude_home_with("mixed.jsonl", &mixed_session());

        let hits = search(&home, "retry limit").await;
        assert_eq!(uuids(&hits), ["q1"]);
        assert_eq!(hits[0].message_type, "user");
        assert_eq!(hits[0].queued, Some(true));
        assert_eq!(hits[0].project_name.as_deref(), Some("-work-acme-api"));

        assert_eq!(uuids(&search(&home, "staging database").await), ["q2"]);
        // The hand-back is `isMeta`; the notification is found as its user record.
        assert!(search(&home, "Subagent audit finished").await.is_empty());
        assert_eq!(uuids(&search(&home, "<task-id>b7").await), ["un1"]);
    }

    #[tokio::test]
    async fn search_returns_a_drained_queue_message_once() {
        let home = claude_home_with("drained.jsonl", &drained_queue_session());
        let hits = search(&home, "first failing test").await;
        assert_eq!(uuids(&hits), ["uq1"]);
        assert_eq!(hits[0].queued, None);
    }
}
