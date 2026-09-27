//! Tauri commands for user metadata management
//!
//! This module provides commands for loading, saving, and updating
//! user metadata stored in ~/.claude-history-viewer/user-data.json

use crate::models::{ProjectMetadata, SessionMetadata, UserMetadata, UserSettings};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::State;

/// Validate a metadata project key.
///
/// Allowed formats:
/// - absolute filesystem paths (Claude projects)
/// - `codex://<cwd>` virtual project keys
/// - `opencode://<project_id>` virtual project keys
pub(crate) fn validate_project_metadata_key(project_path: &str) -> Result<(), String> {
    if let Some(cwd) = project_path.strip_prefix("codex://") {
        if !cwd.trim().is_empty() {
            return Ok(());
        }
        return Err("Codex project key must not be empty".to_string());
    }

    if let Some(project_id) = project_path.strip_prefix("opencode://") {
        if crate::utils::is_safe_storage_id(project_id) {
            return Ok(());
        }
        return Err(format!("Invalid OpenCode project key: {project_path}"));
    }

    let path = Path::new(project_path);
    if !path.is_absolute() {
        return Err(format!(
            "Project key must be absolute path or provider virtual path, got: {project_path}"
        ));
    }

    Ok(())
}

/// Application state for metadata management
pub struct MetadataState {
    /// Cached metadata with mutex for thread-safe access
    pub metadata: Mutex<Option<UserMetadata>>,
}

impl Default for MetadataState {
    fn default() -> Self {
        Self {
            metadata: Mutex::new(None),
        }
    }
}

/// Get the metadata folder path (~/.claude-history-viewer)
fn get_metadata_folder() -> Result<PathBuf, String> {
    let home = crate::utils::home_dir().ok_or("Could not find home directory")?;
    Ok(home.join(".claude-history-viewer"))
}

/// Get the user data file path (~/.claude-history-viewer/user-data.json)
pub(crate) fn get_user_data_path() -> Result<PathBuf, String> {
    Ok(get_metadata_folder()?.join("user-data.json"))
}

/// Ensure the metadata folder exists
fn ensure_metadata_folder() -> Result<PathBuf, String> {
    let folder = get_metadata_folder()?;
    if !folder.exists() {
        fs::create_dir_all(&folder)
            .map_err(|e| format!("Failed to create metadata folder: {e}"))?;
    }
    Ok(folder)
}

/// Get the metadata folder path
#[tauri::command]
pub async fn get_metadata_folder_path() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let path = get_metadata_folder()?;
        Ok(path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

/// Load user metadata from disk
/// Creates default metadata if file doesn't exist
#[tauri::command]
pub async fn load_user_metadata(state: State<'_, MetadataState>) -> Result<UserMetadata, String> {
    let path = get_user_data_path()?;

    // Perform blocking file I/O off the async runtime
    let metadata = tauri::async_runtime::spawn_blocking(move || {
        if path.exists() {
            let content = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read metadata file: {e}"))?;
            serde_json::from_str(&content).map_err(|e| format!("Failed to parse metadata: {e}"))
        } else {
            Ok(UserMetadata::new())
        }
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    // Cache the metadata (lock is quick, no need to spawn_blocking)
    let mut cached = state
        .metadata
        .lock()
        .map_err(|e| format!("Failed to lock metadata: {e}"))?;
    *cached = Some(metadata.clone());

    Ok(metadata)
}

/// Internal helper to save metadata to disk (blocking)
pub(crate) fn save_metadata_to_disk(metadata: &UserMetadata) -> Result<(), String> {
    ensure_metadata_folder()?;
    let path = get_user_data_path()?;

    // Write to temp file first (atomic write pattern)
    let temp_path = path.with_extension("json.tmp");
    let content = serde_json::to_string_pretty(metadata)
        .map_err(|e| format!("Failed to serialize metadata: {e}"))?;

    let mut file =
        fs::File::create(&temp_path).map_err(|e| format!("Failed to create temp file: {e}"))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write temp file: {e}"))?;
    file.sync_all()
        .map_err(|e| format!("Failed to sync temp file: {e}"))?;

    // Cross-platform atomic rename
    super::fs_utils::atomic_rename(&temp_path, &path)?;

    Ok(())
}

/// Order of metadata snapshots. Taken under the metadata lock where the
/// snapshot is cloned, so a higher number is a later snapshot that already
/// holds every earlier change.
static SNAPSHOT_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Serializes disk writes and remembers the newest snapshot on disk.
static LAST_SAVED_GENERATION: Mutex<u64> = Mutex::new(0);

/// Number the snapshot about to be saved. Call while holding the metadata lock.
pub(crate) fn next_snapshot_generation() -> u64 {
    SNAPSHOT_GENERATION.fetch_add(1, Ordering::SeqCst) + 1
}

/// Save a snapshot unless a newer one already reached the disk.
///
/// Updates clone the metadata under the lock but write it after releasing
/// it, so two quick updates (starring two sessions, a rename during a star)
/// could finish out of order and leave the older snapshot on disk, or write
/// the shared temp file at the same time.
pub(crate) fn save_metadata_snapshot(
    metadata: &UserMetadata,
    generation: u64,
) -> Result<(), String> {
    let mut last_saved = LAST_SAVED_GENERATION
        .lock()
        .map_err(|e| format!("Failed to lock metadata saves: {e}"))?;
    if generation <= *last_saved {
        return Ok(());
    }
    save_metadata_to_disk(metadata)?;
    *last_saved = generation;
    Ok(())
}

/// Save user metadata to disk with atomic write
#[tauri::command]
pub async fn save_user_metadata(
    metadata: UserMetadata,
    state: State<'_, MetadataState>,
) -> Result<(), String> {
    let generation = {
        let mut cached = state
            .metadata
            .lock()
            .map_err(|e| format!("Failed to lock metadata: {e}"))?;
        *cached = Some(metadata.clone());
        next_snapshot_generation()
    };

    // Perform blocking file I/O off the async runtime
    tauri::async_runtime::spawn_blocking(move || save_metadata_snapshot(&metadata, generation))
        .await
        .map_err(|e| format!("Task join error: {e}"))??;

    Ok(())
}

/// Update metadata for a specific session
#[tauri::command]
pub async fn update_session_metadata(
    session_id: String,
    update: SessionMetadata,
    state: State<'_, MetadataState>,
) -> Result<UserMetadata, String> {
    // Perform quick in-memory mutation while holding lock, then release
    let (metadata_to_save, generation) = {
        let mut cached = state
            .metadata
            .lock()
            .map_err(|e| format!("Failed to lock metadata: {e}"))?;

        let metadata = cached.get_or_insert_with(UserMetadata::new);

        // Update or insert session metadata
        if update.is_empty() {
            metadata.sessions.remove(&session_id);
        } else {
            metadata.sessions.insert(session_id, update);
        }

        (metadata.clone(), next_snapshot_generation())
    }; // Lock released here

    // Perform blocking file I/O off the async runtime
    let metadata_clone = metadata_to_save.clone();
    tauri::async_runtime::spawn_blocking(move || {
        save_metadata_snapshot(&metadata_clone, generation)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    Ok(metadata_to_save)
}

/// Update metadata for a specific project
#[tauri::command]
pub async fn update_project_metadata(
    project_path: String,
    update: ProjectMetadata,
    state: State<'_, MetadataState>,
) -> Result<UserMetadata, String> {
    // Validate that project path is absolute
    validate_project_metadata_key(&project_path)?;

    // Perform quick in-memory mutation while holding lock, then release
    let (metadata_to_save, generation) = {
        let mut cached = state
            .metadata
            .lock()
            .map_err(|e| format!("Failed to lock metadata: {e}"))?;

        let metadata = cached.get_or_insert_with(UserMetadata::new);

        // Update or insert project metadata
        if update.is_empty() {
            metadata.projects.remove(&project_path);
        } else {
            metadata.projects.insert(project_path, update);
        }

        (metadata.clone(), next_snapshot_generation())
    }; // Lock released here

    // Perform blocking file I/O off the async runtime
    let metadata_clone = metadata_to_save.clone();
    tauri::async_runtime::spawn_blocking(move || {
        save_metadata_snapshot(&metadata_clone, generation)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    Ok(metadata_to_save)
}

/// Update global user settings
#[tauri::command]
pub async fn update_user_settings(
    settings: UserSettings,
    state: State<'_, MetadataState>,
) -> Result<UserMetadata, String> {
    // Perform quick in-memory mutation while holding lock, then release
    let (metadata_to_save, generation) = {
        let mut cached = state
            .metadata
            .lock()
            .map_err(|e| format!("Failed to lock metadata: {e}"))?;

        let metadata = cached.get_or_insert_with(UserMetadata::new);
        metadata.settings = settings;

        (metadata.clone(), next_snapshot_generation())
    }; // Lock released here

    // Perform blocking file I/O off the async runtime
    let metadata_clone = metadata_to_save.clone();
    tauri::async_runtime::spawn_blocking(move || {
        save_metadata_snapshot(&metadata_clone, generation)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    Ok(metadata_to_save)
}

/// Check if a project should be hidden based on metadata
#[tauri::command]
pub async fn is_project_hidden(
    project_path: String,
    state: State<'_, MetadataState>,
) -> Result<bool, String> {
    // Validate that project path is absolute
    validate_project_metadata_key(&project_path)?;

    let cached = state
        .metadata
        .lock()
        .map_err(|e| format!("Failed to lock metadata: {e}"))?;

    let is_hidden = cached
        .as_ref()
        .map(|m| m.is_project_hidden(&project_path))
        .unwrap_or(false);

    Ok(is_hidden)
}

/// Get the display name for a session (custom name or fallback to summary)
#[tauri::command]
pub async fn get_session_display_name(
    session_id: String,
    fallback_summary: Option<String>,
    state: State<'_, MetadataState>,
) -> Result<Option<String>, String> {
    let cached = state
        .metadata
        .lock()
        .map_err(|e| format!("Failed to lock metadata: {e}"))?;

    let display_name = cached
        .as_ref()
        .and_then(|m| m.get_session(&session_id))
        .and_then(|s| s.custom_name.clone())
        .or(fallback_summary);

    Ok(display_name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::sync::{LazyLock, Mutex, MutexGuard};
    use tempfile::TempDir;

    /// Static mutex to serialize tests that modify the HOME environment variable.
    /// This prevents race conditions when multiple tests run in parallel.
    static TEST_ENV_MUTEX: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

    /// Sets up a test environment with a temporary HOME directory.
    /// Returns both the mutex guard (to hold the lock) and the `TempDir`.
    /// The guard must be kept alive for the duration of the test.
    fn setup_test_env() -> (MutexGuard<'static, ()>, TempDir) {
        let guard = TEST_ENV_MUTEX.lock().unwrap();
        let temp_dir = TempDir::new().unwrap();
        env::set_var("HOME", temp_dir.path());
        // `HOME` is inert on Windows; this is what `crate::utils::home_dir()`
        // reads under `cfg(test)` (#540).
        env::set_var("CCHV_TEST_HOME", temp_dir.path());
        (guard, temp_dir)
    }

    #[test]
    fn test_get_metadata_folder() {
        let (_guard, _temp) = setup_test_env();
        let folder = get_metadata_folder().unwrap();
        assert!(folder.to_string_lossy().contains(".claude-history-viewer"));
    }

    #[test]
    fn test_ensure_metadata_folder() {
        let (_guard, _temp) = setup_test_env();
        let folder = ensure_metadata_folder().unwrap();
        assert!(folder.exists());
    }

    #[test]
    fn test_atomic_write() {
        let (_guard, temp) = setup_test_env();

        // Manually create the metadata folder since HOME is mocked
        let metadata_folder = temp.path().join(".claude-history-viewer");
        fs::create_dir_all(&metadata_folder).unwrap();

        let metadata = UserMetadata::new();
        let path = metadata_folder.join("user-data.json");

        // Write metadata
        let content = serde_json::to_string_pretty(&metadata).unwrap();
        let temp_path = path.with_extension("json.tmp");

        let mut file = fs::File::create(&temp_path).unwrap();
        file.write_all(content.as_bytes()).unwrap();
        file.sync_all().unwrap();
        fs::rename(&temp_path, &path).unwrap();

        // Verify
        assert!(path.exists());
        assert!(!temp_path.exists());

        let loaded_content = fs::read_to_string(&path).unwrap();
        let loaded: UserMetadata = serde_json::from_str(&loaded_content).unwrap();
        assert_eq!(loaded.version, metadata.version);

        drop(temp);
    }

    #[test]
    fn test_older_snapshot_saved_late_does_not_overwrite_newer() {
        let (_guard, _temp) = setup_test_env();

        let mut older = UserMetadata::new();
        older.settings.hidden_patterns = vec!["older".to_string()];
        let older_generation = next_snapshot_generation();

        let mut newer = older.clone();
        newer.settings.hidden_patterns = vec!["newer".to_string()];
        let newer_generation = next_snapshot_generation();

        // The newer update reaches the disk first, the older one after it.
        save_metadata_snapshot(&newer, newer_generation).unwrap();
        save_metadata_snapshot(&older, older_generation).unwrap();

        let content = fs::read_to_string(get_user_data_path().unwrap()).unwrap();
        let on_disk: UserMetadata = serde_json::from_str(&content).unwrap();
        assert_eq!(on_disk.settings.hidden_patterns, vec!["newer".to_string()]);
    }

    #[test]
    fn test_validate_project_metadata_key_absolute_path() {
        assert!(validate_project_metadata_key(&crate::test_utils::abs("tmp/project")).is_ok());
    }

    #[test]
    fn test_validate_project_metadata_key_virtual_provider_paths() {
        assert!(validate_project_metadata_key("codex:///Users/test/workspace").is_ok());
        assert!(validate_project_metadata_key("opencode://project_123").is_ok());
    }

    #[test]
    fn test_validate_project_metadata_key_rejects_invalid_values() {
        assert!(validate_project_metadata_key("relative/path").is_err());
        assert!(validate_project_metadata_key("codex://").is_err());
        assert!(validate_project_metadata_key("opencode://../etc").is_err());
    }
}
