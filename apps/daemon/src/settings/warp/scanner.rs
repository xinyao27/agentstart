use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde_json::{Value, json};

use super::discovery;

const MAX_DIRECTORIES: usize = 80;
const MAX_ENTRIES: usize = 500;
const MAX_FILES: usize = 200;
const MAX_DEPTH: usize = 3;

pub(super) struct ThemeFile {
    pub(super) label: String,
    pub(super) path: PathBuf,
    pub(super) source_label: String,
}

struct PendingDirectory {
    depth: usize,
    path: PathBuf,
    relative: PathBuf,
}

enum Pending {
    Directory(PendingDirectory),
    Entry {
        depth: usize,
        kind: std::fs::FileType,
        path: PathBuf,
        relative: PathBuf,
    },
}

pub(super) async fn scan(started: Instant) -> (Vec<ThemeFile>, Vec<Value>) {
    let mut files = Vec::new();
    let mut skipped = Vec::new();
    let mut seen = HashSet::new();
    for root in discovery::directories().await {
        if expired(started) {
            skipped.push(json!({ "label": "Warp themes", "reason": "Preview budget expired before local Warp theme folders could be scanned." }));
            break;
        }
        if !tokio::fs::metadata(&root.path)
            .await
            .is_ok_and(|metadata| metadata.is_dir())
        {
            continue;
        }
        if scan_root(root, started, &mut seen, &mut files, &mut skipped).await {
            skipped.push(json!({ "label": "Warp themes", "reason": "Only the first 200 theme files were scanned." }));
            break;
        }
    }
    (files, skipped)
}

async fn scan_root(
    root: discovery::ThemeDirectory,
    started: Instant,
    seen: &mut HashSet<PathBuf>,
    files: &mut Vec<ThemeFile>,
    skipped: &mut Vec<Value>,
) -> bool {
    let mut pending = vec![Pending::Directory(PendingDirectory {
        depth: 0,
        path: root.path,
        relative: PathBuf::new(),
    })];
    let mut directories = 0;
    let mut directory_limit_reported = false;
    let mut entry_limit_reported = false;
    while let Some(item) = pending.pop() {
        if expired(started) {
            skipped.push(json!({ "label": root.source_label, "reason": "Preview budget expired before all theme files were scanned." }));
            return false;
        }
        let directory = match item {
            Pending::Entry {
                depth,
                kind,
                path,
                relative,
            } => {
                if kind.is_dir() {
                    if depth >= MAX_DEPTH {
                        skipped.push(json!({ "label": relative.to_string_lossy(), "reason": "Nested folder depth limit reached." }));
                    } else {
                        pending.push(Pending::Directory(PendingDirectory {
                            depth: depth + 1,
                            path,
                            relative,
                        }));
                    }
                } else if is_yaml(&path) {
                    let key = tokio::fs::canonicalize(&path)
                        .await
                        .unwrap_or_else(|_| path.clone());
                    if !seen.insert(key) {
                        continue;
                    }
                    if files.len() >= MAX_FILES {
                        return true;
                    }
                    files.push(ThemeFile {
                        label: relative.to_string_lossy().into_owned(),
                        path,
                        source_label: root.source_label.clone(),
                    });
                }
                continue;
            }
            Pending::Directory(directory) => directory,
        };
        if directories >= MAX_DIRECTORIES {
            if !directory_limit_reported {
                skipped.push(json!({ "label": root.source_label, "reason": "Only the first 80 folders were scanned." }));
                directory_limit_reported = true;
            }
            continue;
        }
        directories += 1;
        let Ok(mut reader) = tokio::fs::read_dir(&directory.path).await else {
            skipped.push(json!({ "label": display_label(&directory.relative, &root.source_label), "reason": "Could not read folder." }));
            continue;
        };
        let mut entries = Vec::new();
        let mut entry_limit_hit = false;
        loop {
            if expired(started) {
                skipped.push(json!({ "label": root.source_label, "reason": "Preview budget expired before all theme files were scanned." }));
                return false;
            }
            match reader.next_entry().await {
                Ok(Some(entry)) if entries.len() < MAX_ENTRIES => entries.push(entry),
                Ok(Some(_)) => {
                    entry_limit_hit = true;
                    break;
                }
                _ => break,
            }
        }
        if entry_limit_hit && !entry_limit_reported {
            skipped.push(json!({ "label": display_label(&directory.relative, &root.source_label), "reason": "Only the first 500 folder entries were scanned." }));
            entry_limit_reported = true;
        }
        entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_lowercase());
        for entry in entries.into_iter().rev() {
            let name = entry.file_name();
            let relative = directory.relative.join(&name);
            let path = entry.path();
            let Ok(kind) = entry.file_type().await else {
                continue;
            };
            pending.push(Pending::Entry {
                depth: directory.depth,
                kind,
                path,
                relative,
            });
        }
    }
    false
}

fn display_label(relative: &Path, fallback: &str) -> String {
    if relative.as_os_str().is_empty() {
        fallback.to_owned()
    } else {
        relative.to_string_lossy().into_owned()
    }
}

fn is_yaml(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| matches!(value.to_ascii_lowercase().as_str(), "yaml" | "yml"))
}

fn expired(started: Instant) -> bool {
    started.elapsed() >= Duration::from_secs(5)
}
