//! Test utilities and helpers for the claude-code-history-viewer crate.
//!
//! This module provides common test fixtures, builders, and utilities
//! to make testing easier and more consistent across the codebase.

#![cfg(test)]

use std::path::{Path, PathBuf};
use tempfile::TempDir;

/// An absolute path on the host platform, written Unix-style.
///
/// `abs("tmp/session.jsonl")` is `/tmp/session.jsonl` on Unix and
/// `C:\tmp\session.jsonl` on Windows.
///
/// Fixtures used to spell these inline as `"/tmp/session.jsonl"`. On Windows
/// that string is *not* absolute — there is no drive — so code under test
/// rejected it with "path must be absolute" long before reaching the behaviour
/// the test was about, and the assertion failed for the wrong reason (#541).
pub fn abs(unix_relative: &str) -> String {
    let trimmed = unix_relative.trim_start_matches('/');
    if cfg!(windows) {
        format!(r"C:\{}", trimmed.replace('/', r"\"))
    } else {
        format!("/{trimmed}")
    }
}

/// A directory that really exists on the host, for fixtures that need a path
/// resolvable on disk rather than merely well-formed.
///
/// Unix fixtures reached for `/usr/lib`; Windows has no such directory, so the
/// canonical temp dir stands in on both.
pub fn existing_dir() -> PathBuf {
    std::fs::canonicalize(std::env::temp_dir()).expect("canonicalize temp dir")
}

/// Creates a nested directory tree under the canonical temp dir, encodes it
/// exactly the way Claude Code encodes a cwd on this platform, and returns the
/// encoded slug plus the root for cleanup.
///
/// Shared so fixtures needing a folder name that decodes to a real directory
/// stop reaching for `/usr/lib`, which does not exist on Windows (#541).
///
/// Original note: creates a nested directory tree under the
/// canonical temp dir, encodes it Claude-style, and returns the encoded
/// slug plus the root for cleanup. Canonicalization is required because
/// the decoder rejects symlinked path components (macOS `/var` →
/// `/private/var`).
pub fn make_encoded_path(root_name: &str, segments: &[&str]) -> (String, std::path::PathBuf) {
    let root = std::fs::canonicalize(std::env::temp_dir())
        .expect("canonicalize temp dir")
        .join(root_name);
    let mut deep = root.clone();
    for s in segments {
        deep = deep.join(s);
    }
    std::fs::create_dir_all(&deep).expect("create deep tmp dir");

    (encode_path_claude_style(&deep), root)
}

/// Encodes an absolute path the way Claude Code names a project folder.
///
/// Every separator becomes `-`. On Windows the drive colon goes too, so
/// `C:\Temp\x` is `C--Temp-x` - drive-lettered and, unlike Unix, with no
/// leading dash.
///
/// The Windows extended-length prefix is stripped first: `canonicalize` hands
/// back `\\?\C:\...`, which Claude Code never sees, and encoding it would
/// produce `--?-C--Users-...`, a shape that exists nowhere (#548).
pub fn encode_path_claude_style(path: &std::path::Path) -> String {
    strip_verbatim_prefix(path).replace(['/', '\\', ':'], "-")
}

/// The plain form of a path, without Windows' extended-length prefix.
///
/// `std::fs::canonicalize` returns `\\?\C:\...` on Windows. Almost nothing
/// else produces that shape, so a fixture that canonicalises and then compares
/// against a value built any other way will not match there (#541).
pub fn strip_verbatim_prefix(path: &std::path::Path) -> String {
    crate::utils::strip_windows_extended_prefix(path)
        .to_string_lossy()
        .into_owned()
}

/// A temporary home directory, exported to the process for the lifetime of the
/// value and restored on drop.
///
/// Sets both `HOME` and `CCHV_TEST_HOME`: the first is what `dirs::home_dir()`
/// reads on Unix, the second is what `crate::utils::home_dir()` reads under
/// `cfg(test)` and what works on Windows, where the known-folder API ignores
/// `HOME` entirely.
///
/// Two things this does that the per-module guards it replaces did not:
///
/// - the path is canonicalised, because on macOS the temp dir is handed back as
///   `/var/...` while anything resolving it sees `/private/var/...`
/// - the previous values are *restored*, not dropped. Leaving `CCHV_TEST_HOME`
///   set leaks the sandbox into every later test in the same process, which is
///   precisely what hid nine unsandboxed tests until CI ran them under nextest
///   with a process each (#544).
///
/// Both env vars are process-global, so tests holding one need `#[serial]`.
pub struct SandboxHome {
    dir: TempDir,
    canonical: PathBuf,
    previous_home: Option<std::ffi::OsString>,
    previous_test_home: Option<std::ffi::OsString>,
}

impl SandboxHome {
    pub fn new() -> Self {
        let dir = TempDir::new().expect("temp home");
        // Canonicalised so macOS `/var/...` resolves to `/private/var/...`, then
        // stripped of the Windows extended-length prefix that canonicalising
        // adds there. Leaving the `\\?\` form in place exports a home that
        // code comparing plain paths cannot match - the antigravity CLI root
        // went missing on Windows for exactly that reason.
        let canonical = PathBuf::from(strip_verbatim_prefix(
            &dir.path().canonicalize().expect("canonicalize temp home"),
        ));
        let previous_home = std::env::var_os("HOME");
        let previous_test_home = std::env::var_os("CCHV_TEST_HOME");
        std::env::set_var("HOME", &canonical);
        std::env::set_var("CCHV_TEST_HOME", &canonical);
        Self {
            dir,
            canonical,
            previous_home,
            previous_test_home,
        }
    }

    /// The sandbox root, canonicalised — compare fixtures against this, not
    /// against a `TempDir::path()` captured elsewhere.
    pub fn path(&self) -> &Path {
        &self.canonical
    }
}

impl Default for SandboxHome {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for SandboxHome {
    fn drop(&mut self) {
        let _ = &self.dir;
        for (key, previous) in [
            ("HOME", &self.previous_home),
            ("CCHV_TEST_HOME", &self.previous_test_home),
        ] {
            match previous {
                Some(v) => std::env::set_var(key, v),
                None => std::env::remove_var(key),
            }
        }
    }
}
