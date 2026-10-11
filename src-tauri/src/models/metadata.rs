//! User metadata models for storing custom data
//!
//! This module contains data structures for user-specific metadata
//! that is stored separately from Claude Code's original data.
//! Location: ~/.claude-history-viewer/user-data.json

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Current schema version for migration support
pub const METADATA_SCHEMA_VERSION: u32 = 1;

/// Root structure for all user metadata
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UserMetadata {
    /// Schema version for migration support
    #[serde(default = "default_version")]
    pub version: u32,

    /// Session-specific metadata, keyed by session ID
    #[serde(default)]
    pub sessions: HashMap<String, SessionMetadata>,

    /// Project-specific metadata, keyed by project path
    #[serde(default)]
    pub projects: HashMap<String, ProjectMetadata>,

    /// Global user settings
    #[serde(default)]
    pub settings: UserSettings,
}

fn default_version() -> u32 {
    METADATA_SCHEMA_VERSION
}

impl UserMetadata {
    /// Create a new `UserMetadata` with default values
    pub fn new() -> Self {
        Self {
            version: METADATA_SCHEMA_VERSION,
            sessions: HashMap::new(),
            projects: HashMap::new(),
            settings: UserSettings::default(),
        }
    }

    /// Get session metadata, returning None if not found
    pub fn get_session(&self, session_id: &str) -> Option<&SessionMetadata> {
        self.sessions.get(session_id)
    }

    /// Check if a project should be hidden based on settings
    pub fn is_project_hidden(&self, project_path: &str) -> bool {
        // Check explicit hidden flag
        if let Some(project) = self.projects.get(project_path) {
            if project.hidden.unwrap_or(false) {
                return true;
            }
        }

        // Check hidden patterns
        for pattern in &self.settings.hidden_patterns {
            if Self::matches_glob_pattern(project_path, pattern) {
                return true;
            }
        }

        false
    }

    /// Maximum pattern length to prevent `ReDoS` attacks
    const MAX_PATTERN_LENGTH: usize = 256;
    /// Maximum number of wildcards to prevent catastrophic backtracking
    const MAX_WILDCARDS: usize = 10;

    /// Simple glob pattern matching (supports * and ?)
    /// Returns false for patterns that exceed safety limits
    fn matches_glob_pattern(text: &str, pattern: &str) -> bool {
        // ReDoS protection: reject overly long patterns
        if pattern.len() > Self::MAX_PATTERN_LENGTH {
            return false;
        }

        // ReDoS protection: reject patterns with too many wildcards
        let wildcard_count = pattern.chars().filter(|&c| c == '*' || c == '?').count();
        if wildcard_count > Self::MAX_WILDCARDS {
            return false;
        }

        let pattern_chars: Vec<char> = pattern.chars().collect();
        let text_chars: Vec<char> = text.chars().collect();

        Self::glob_match_helper(&pattern_chars, &text_chars)
    }

    fn glob_match_helper(pattern: &[char], text: &[char]) -> bool {
        if pattern.is_empty() {
            return text.is_empty();
        }

        match pattern[0] {
            '*' => {
                // Try matching zero or more characters
                for i in 0..=text.len() {
                    if Self::glob_match_helper(&pattern[1..], &text[i..]) {
                        return true;
                    }
                }
                false
            }
            '?' => {
                // Match exactly one character
                !text.is_empty() && Self::glob_match_helper(&pattern[1..], &text[1..])
            }
            c => {
                // Match literal character
                !text.is_empty()
                    && text[0] == c
                    && Self::glob_match_helper(&pattern[1..], &text[1..])
            }
        }
    }
}

/// Metadata for individual sessions
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionMetadata {
    /// Custom name for the session (overrides auto-generated summary)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_name: Option<String>,

    /// Whether the session is starred/favorited
    #[serde(skip_serializing_if = "Option::is_none")]
    pub starred: Option<bool>,

    /// When the session was starred (ISO 8601); orders the favourites list
    #[serde(skip_serializing_if = "Option::is_none")]
    pub starred_at: Option<String>,

    /// Where the starred session lives, captured when it was starred
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favorite: Option<FavoriteSessionRef>,

    /// User-defined tags for organization
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,

    /// User notes about the session
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

impl SessionMetadata {
    /// Check if metadata has any values set
    pub fn is_empty(&self) -> bool {
        self.custom_name.is_none()
            && self.starred.is_none()
            && self.starred_at.is_none()
            && self.favorite.is_none()
            && self.tags.is_empty()
            && self.notes.is_none()
    }
}

/// Snapshot of a favourite session: enough to list it and to open it without
/// loading every project's sessions first.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteSessionRef {
    /// Path of the owning project (`ClaudeProject.path`). Defaults to empty so
    /// a malformed entry cannot make the whole file unreadable.
    #[serde(default)]
    pub project_path: String,

    /// Provider of the owning project (e.g. "claude", "codex")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,

    /// Session title when it was starred (custom name, else summary)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,

    /// Session id from the messages (`ClaudeSession.actual_session_id`)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_session_id: Option<String>,

    /// Time of the session's last message when it was last seen (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_message_time: Option<String>,
}

/// Metadata for individual projects
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMetadata {
    /// Whether the project is hidden from the sidebar
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hidden: Option<bool>,

    /// Custom alias/display name for the project
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,

    /// Parent project path for worktree grouping
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_project: Option<String>,
}

impl ProjectMetadata {
    /// Check if metadata has any values set
    pub fn is_empty(&self) -> bool {
        self.hidden.is_none() && self.alias.is_none() && self.parent_project.is_none()
    }
}

/// A user-registered custom Claude configuration directory
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CustomClaudePath {
    /// Absolute path to the Claude config directory (e.g., "~/.claude-personal")
    pub path: String,
    /// User-defined display label (e.g., "Personal")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// WSL (Windows Subsystem for Linux) integration settings
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WslSettings {
    /// Whether WSL scanning is enabled
    #[serde(default)]
    pub enabled: bool,
    /// List of WSL distro names to exclude from scanning
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub excluded_distros: Vec<String>,
}

/// Global user settings
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UserSettings {
    /// Glob patterns for projects to hide (e.g., "folders-dg-*")
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub hidden_patterns: Vec<String>,

    /// Whether to automatically group worktrees under their parent repos
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_grouping: Option<bool>,

    /// Whether user has explicitly set worktree grouping (prevents auto-override)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_grouping_user_set: Option<bool>,

    /// Project tree grouping mode: "none", "worktree", or "directory"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grouping_mode: Option<String>,

    /// Additional Claude configuration directories to scan
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub custom_claude_paths: Vec<CustomClaudePath>,

    /// WSL integration settings (Windows only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wsl: Option<WslSettings>,

    /// Providers explicitly discovered by the user and allowed to scan on startup
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub discovered_provider_ids: Vec<String>,

    /// Custom CLI arguments per provider for session resumption
    #[serde(default, skip_serializing_if = "std::collections::HashMap::is_empty")]
    pub resume_cli_args: std::collections::HashMap<String, String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_metadata() {
        let metadata = UserMetadata::new();
        assert_eq!(metadata.version, METADATA_SCHEMA_VERSION);
        assert!(metadata.sessions.is_empty());
        assert!(metadata.projects.is_empty());
    }

    #[test]
    fn test_is_project_hidden_explicit() {
        let mut metadata = UserMetadata::new();
        let project = metadata.projects.entry("my-project".into()).or_default();
        project.hidden = Some(true);

        assert!(metadata.is_project_hidden("my-project"));
        assert!(!metadata.is_project_hidden("other-project"));
    }

    #[test]
    fn test_is_project_hidden_pattern() {
        let mut metadata = UserMetadata::new();
        metadata
            .settings
            .hidden_patterns
            .push("folders-dg-*".to_string());

        assert!(metadata.is_project_hidden("folders-dg-abc123"));
        assert!(metadata.is_project_hidden("folders-dg-xyz"));
        assert!(!metadata.is_project_hidden("my-project"));
    }

    #[test]
    fn test_glob_pattern_matching() {
        assert!(UserMetadata::matches_glob_pattern("abc", "abc"));
        assert!(UserMetadata::matches_glob_pattern("abc", "a*"));
        assert!(UserMetadata::matches_glob_pattern("abc", "*c"));
        assert!(UserMetadata::matches_glob_pattern("abc", "a?c"));
        assert!(UserMetadata::matches_glob_pattern("abc", "*"));
        assert!(!UserMetadata::matches_glob_pattern("abc", "ab"));
        assert!(!UserMetadata::matches_glob_pattern("abc", "a?"));
    }

    #[test]
    fn test_session_metadata_is_empty() {
        let empty = SessionMetadata::default();
        assert!(empty.is_empty());

        let with_name = SessionMetadata {
            custom_name: Some("Test".to_string()),
            ..Default::default()
        };
        assert!(!with_name.is_empty());
    }

    #[test]
    fn test_serialization_roundtrip() {
        let mut metadata = UserMetadata::new();
        let session = metadata.sessions.entry("session-1".into()).or_default();
        session.custom_name = Some("My Session".to_string());
        session.starred = Some(true);
        session.tags = vec!["work".to_string(), "important".to_string()];

        let project = metadata.projects.entry("my-project".into()).or_default();
        project.alias = Some("Main Project".to_string());

        let json = serde_json::to_string_pretty(&metadata).unwrap();
        let deserialized: UserMetadata = serde_json::from_str(&json).unwrap();

        assert_eq!(metadata, deserialized);
    }

    fn starred_session() -> SessionMetadata {
        SessionMetadata {
            custom_name: Some("Login fix".to_string()),
            starred: Some(true),
            starred_at: Some("2026-09-27T10:00:00.000Z".to_string()),
            favorite: Some(FavoriteSessionRef {
                project_path: "/home/me/.claude/projects/-home-me-work-api".to_string(),
                provider: Some("claude".to_string()),
                title: Some("Login fix".to_string()),
                actual_session_id: Some("11111111-2222-3333-4444-555566667777".to_string()),
                last_message_time: Some("2026-09-26T08:30:00Z".to_string()),
            }),
            ..Default::default()
        }
    }

    #[test]
    fn test_favorite_fields_roundtrip() {
        let mut metadata = UserMetadata::new();
        metadata
            .sessions
            .insert("/tmp/session.jsonl".to_string(), starred_session());

        let json = serde_json::to_string(&metadata).unwrap();
        for key in [
            "\"starredAt\"",
            "\"favorite\"",
            "\"projectPath\"",
            "\"actualSessionId\"",
            "\"lastMessageTime\"",
        ] {
            assert!(json.contains(key), "{key} missing from {json}");
        }

        let deserialized: UserMetadata = serde_json::from_str(&json).unwrap();
        assert_eq!(metadata, deserialized);
    }

    #[test]
    fn test_session_without_favorite_fields_still_loads() {
        // A file written before favourites existed.
        let json = r#"{
            "version": 1,
            "sessions": { "s1": { "customName": "Old", "starred": true } },
            "projects": {},
            "settings": {}
        }"#;
        let metadata: UserMetadata = serde_json::from_str(json).unwrap();
        let session = metadata.get_session("s1").unwrap();
        assert_eq!(session.custom_name.as_deref(), Some("Old"));
        assert_eq!(session.starred, Some(true));
        assert!(session.starred_at.is_none());
        assert!(session.favorite.is_none());

        // Absent fields stay absent when the file is written back.
        let written = serde_json::to_string(&metadata).unwrap();
        assert!(!written.contains("starredAt"));
        assert!(!written.contains("favorite"));
    }

    #[test]
    fn test_favorite_ref_optional_fields_are_skipped() {
        let reference = FavoriteSessionRef {
            project_path: "codex:///home/me/work".to_string(),
            ..Default::default()
        };
        let json = serde_json::to_string(&reference).unwrap();
        assert_eq!(json, r#"{"projectPath":"codex:///home/me/work"}"#);
    }

    #[test]
    fn test_favorite_without_project_path_still_loads() {
        // A malformed or hand-edited entry must not make the whole file unreadable.
        let json = r#"{ "starred": true, "favorite": { "title": "Orphan" } }"#;
        let session: SessionMetadata = serde_json::from_str(json).unwrap();
        let favorite = session.favorite.unwrap();
        assert_eq!(favorite.project_path, "");
        assert_eq!(favorite.title.as_deref(), Some("Orphan"));
    }

    #[test]
    fn test_session_metadata_is_empty_counts_favorite_fields() {
        assert!(!starred_session().is_empty());

        let only_starred_at = SessionMetadata {
            starred_at: Some("2026-09-27T10:00:00.000Z".to_string()),
            ..Default::default()
        };
        assert!(!only_starred_at.is_empty());

        let only_favorite = SessionMetadata {
            favorite: Some(FavoriteSessionRef::default()),
            ..Default::default()
        };
        assert!(!only_favorite.is_empty());

        // Unstarring removes all three fields; nothing else set means empty.
        let unstarred = SessionMetadata {
            starred: None,
            starred_at: None,
            favorite: None,
            ..Default::default()
        };
        assert!(unstarred.is_empty());
    }

    #[test]
    fn test_wsl_settings_roundtrip() {
        let mut metadata = UserMetadata::new();
        metadata.settings.wsl = Some(WslSettings {
            enabled: true,
            excluded_distros: vec!["Debian".to_string()],
        });

        let json = serde_json::to_string(&metadata).unwrap();
        let deserialized: UserMetadata = serde_json::from_str(&json).unwrap();

        assert_eq!(metadata, deserialized);
        let wsl = deserialized.settings.wsl.unwrap();
        assert!(wsl.enabled);
        assert_eq!(wsl.excluded_distros, vec!["Debian"]);
    }

    #[test]
    fn test_wsl_settings_defaults_when_absent() {
        let json = r#"{"sessions":{},"projects":{},"settings":{}}"#;
        let metadata: UserMetadata = serde_json::from_str(json).unwrap();
        assert!(metadata.settings.wsl.is_none());
    }

    #[test]
    fn test_discovered_provider_ids_roundtrip() {
        let mut metadata = UserMetadata::new();
        metadata.settings.discovered_provider_ids = vec!["codex".to_string(), "gemini".to_string()];

        let json = serde_json::to_string(&metadata).unwrap();
        assert!(json.contains("discoveredProviderIds"));

        let deserialized: UserMetadata = serde_json::from_str(&json).unwrap();
        assert_eq!(
            deserialized.settings.discovered_provider_ids,
            vec!["codex", "gemini"]
        );
    }
}
