// Why: launchd, systemd, and the browser's native-messaging host hand the daemon
// a minimal PATH, so tools the user installed (npx, gh, coding agents) are
// invisible to local commands until the login shell's PATH is merged in. Rust
// 2024 makes std::env::set_var unsafe, so the merged value lives here and every
// local resolution and spawn reads it instead of the process environment.
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

use super::HostPlatform;
use crate::mutex_lock::lock;

fn effective_path() -> &'static Mutex<String> {
    static EFFECTIVE_PATH: OnceLock<Mutex<String>> = OnceLock::new();
    EFFECTIVE_PATH.get_or_init(|| {
        Mutex::new(
            std::env::var("PATH")
                .or_else(|_| std::env::var("Path"))
                .unwrap_or_default(),
        )
    })
}

pub(crate) fn effective() -> String {
    lock(effective_path()).clone()
}

/// Merges login-shell segments ahead of the inherited PATH, so `which` resolves
/// commands exactly where the user's shell would, and reports the segments the
/// caller had not contributed before.
pub(crate) fn merge(segments: &[String], platform: HostPlatform) -> Vec<String> {
    if segments.is_empty() {
        return Vec::new();
    }
    let separator = separator(platform);
    let mut current = lock(effective_path());
    let current_segments: Vec<&str> = current
        .split(separator)
        .filter(|segment| !segment.is_empty())
        .collect();
    let shell_segments = ordered_unique(segments.iter().map(String::as_str));
    let shell_set: HashSet<&str> = shell_segments.iter().copied().collect();
    let existing: HashSet<&str> = current_segments.iter().copied().collect();
    let added = shell_segments
        .iter()
        .filter(|segment| !existing.contains(**segment))
        .map(|segment| (*segment).to_owned())
        .collect();
    let merged = shell_segments
        .iter()
        .copied()
        .chain(
            current_segments
                .iter()
                .copied()
                .filter(|segment| !shell_set.contains(segment)),
        )
        .collect::<Vec<_>>()
        .join(&separator.to_string());
    if merged != *current {
        *current = merged;
    }
    added
}

/// Appends Windows registry segments without reordering what the process
/// already inherited, comparing entries case-insensitively.
pub(crate) fn append(segments: &[String]) {
    let mut current = lock(effective_path());
    let mut existing: HashSet<String> = current
        .split(';')
        .map(|segment| segment.to_ascii_lowercase())
        .collect();
    let missing: Vec<&str> = segments
        .iter()
        .map(String::as_str)
        .filter(|segment| existing.insert(segment.to_ascii_lowercase()))
        .collect();
    if !missing.is_empty() {
        let mut values: Vec<&str> = current
            .split(';')
            .filter(|value| !value.is_empty())
            .collect();
        values.extend(missing);
        *current = values.join(";");
    }
}

fn ordered_unique<'a>(values: impl IntoIterator<Item = &'a str>) -> Vec<&'a str> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|value| seen.insert(*value))
        .collect()
}

fn separator(platform: HostPlatform) -> char {
    if platform == HostPlatform::Windows {
        ';'
    } else {
        ':'
    }
}
