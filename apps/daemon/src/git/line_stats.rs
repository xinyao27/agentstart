use std::collections::HashMap;
use std::time::{Duration, Instant};

use futures_util::future::join_all;
use serde_json::Value;

use crate::hosts::{HostFileKind, HostFilesystem};

use super::scope::{GitAuthority, GitScope, StatusStatsCacheEntry, lock};

const CACHE_MAX_AGE: Duration = Duration::from_secs(120);
const CACHE_MAX_ENTRIES: usize = 128;
const UNTRACKED_MAX_BYTES: usize = 2 * 1_024 * 1_024;

pub(super) async fn attach(
    authority: &GitAuthority,
    scope: &GitScope,
    head: Option<&str>,
    entries: &mut [Value],
    reuse: bool,
) {
    if entries.is_empty() {
        return;
    }
    let identity = identity(head, entries);
    let key = (scope.host_id.clone(), scope.runner.cwd.clone());
    if reuse && apply_cached(authority, &key, &identity, entries) {
        return;
    }
    let staged = numstat_for_area(scope, entries, "staged", true);
    let unstaged = numstat_for_area(scope, entries, "unstaged", false);
    let untracked = read_untracked(scope, entries);
    let (staged, unstaged, untracked) = tokio::join!(staged, unstaged, untracked);
    for entry in entries.iter_mut() {
        let Some(object) = entry.as_object_mut() else {
            continue;
        };
        let Some(path) = object.get("path").and_then(Value::as_str) else {
            continue;
        };
        let stats = match object.get("area").and_then(Value::as_str) {
            Some("staged") => staged.as_ref().and_then(|values| values.get(path)),
            Some("unstaged") => unstaged.as_ref().and_then(|values| values.get(path)),
            Some("untracked") => untracked.get(path),
            _ => None,
        };
        let Some((added, removed)) = stats else {
            continue;
        };
        if let Some(added) = added {
            object.insert("added".to_owned(), Value::from(*added));
        }
        if let Some(removed) = removed {
            object.insert("removed".to_owned(), Value::from(*removed));
        }
    }
    if staged.is_some() && unstaged.is_some() {
        remember(authority, key, identity, entries);
    }
}

fn apply_cached(
    authority: &GitAuthority,
    key: &(String, String),
    identity: &str,
    entries: &mut [Value],
) -> bool {
    let cache = lock(&authority.status_stats);
    let Some(cached) = cache.get(key) else {
        return false;
    };
    if cached.stored_at.elapsed() >= CACHE_MAX_AGE
        || cached.identity != identity
        || cached.stats.len() != entries.len()
    {
        return false;
    }
    for (entry, (added, removed)) in entries.iter_mut().zip(&cached.stats) {
        let Some(entry) = entry.as_object_mut() else {
            continue;
        };
        if let Some(added) = added {
            entry.insert("added".to_owned(), Value::from(*added));
        }
        if let Some(removed) = removed {
            entry.insert("removed".to_owned(), Value::from(*removed));
        }
    }
    true
}

fn remember(authority: &GitAuthority, key: (String, String), identity: String, entries: &[Value]) {
    let stats = entries
        .iter()
        .map(|entry| {
            (
                entry.get("added").and_then(Value::as_u64),
                entry.get("removed").and_then(Value::as_u64),
            )
        })
        .collect();
    let mut cache = lock(&authority.status_stats);
    cache.insert(
        key,
        StatusStatsCacheEntry {
            identity,
            stats,
            stored_at: Instant::now(),
        },
    );
    if cache.len() > CACHE_MAX_ENTRIES
        && let Some(oldest) = cache
            .iter()
            .min_by_key(|(_, value)| value.stored_at)
            .map(|(key, _)| key.clone())
    {
        cache.remove(&oldest);
    }
}

async fn numstat_for_area(
    scope: &GitScope,
    entries: &[Value],
    area: &str,
    staged: bool,
) -> Option<HashMap<String, (Option<u64>, Option<u64>)>> {
    if !has_area(entries, area) {
        return Some(HashMap::new());
    }
    let mut args = vec![
        "-c".to_owned(),
        "core.quotePath=false".to_owned(),
        "diff".to_owned(),
        "-z".to_owned(),
    ];
    if staged {
        args.push("--cached".to_owned());
    }
    args.extend(["--numstat".to_owned(), "-M".to_owned()]);
    scope
        .runner
        .read(args)
        .await
        .ok()
        .map(|output| parse_numstat(&output))
}

fn parse_numstat(output: &str) -> HashMap<String, (Option<u64>, Option<u64>)> {
    let records = output.split('\0').collect::<Vec<_>>();
    let mut stats = HashMap::new();
    let mut index = 0;
    while index < records.len() {
        let record = records[index];
        index += 1;
        if record.is_empty() {
            continue;
        }
        let parts = record.split('\t').collect::<Vec<_>>();
        let mut path = parts.get(2..).unwrap_or_default().join("\t");
        if path.is_empty() && index + 1 < records.len() {
            index += 1;
            path = records[index].to_owned();
            index += 1;
        }
        if path.is_empty() {
            continue;
        }
        stats.insert(
            path,
            (
                parts.first().and_then(|value| value.parse().ok()),
                parts.get(1).and_then(|value| value.parse().ok()),
            ),
        );
    }
    stats
}

async fn read_untracked(
    scope: &GitScope,
    entries: &[Value],
) -> HashMap<String, (Option<u64>, Option<u64>)> {
    let paths = entries
        .iter()
        .filter(|entry| entry.get("area").and_then(Value::as_str) == Some("untracked"))
        .filter_map(|entry| entry.get("path").and_then(Value::as_str))
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let mut output = HashMap::new();
    for chunk in paths.chunks(8) {
        let results = join_all(chunk.iter().map(|path| count_untracked(scope, path))).await;
        for (path, stats) in chunk.iter().zip(results) {
            output.insert(path.clone(), stats);
        }
    }
    output
}

async fn count_untracked(scope: &GitScope, path: &str) -> (Option<u64>, Option<u64>) {
    let filesystem = HostFilesystem::new(scope.host.clone());
    let absolute = filesystem.paths().resolve(&scope.runner.cwd, &[path]);
    let Ok(Some(stat)) = filesystem.stat(&absolute).await else {
        return (None, None);
    };
    if stat.kind == HostFileKind::Symlink {
        return (Some(1), None);
    }
    if stat.kind != HostFileKind::File || stat.size_bytes > UNTRACKED_MAX_BYTES as u64 {
        return (None, None);
    }
    let Ok(Some(bytes)) = filesystem.read(&absolute, UNTRACKED_MAX_BYTES).await else {
        return (None, None);
    };
    if bytes.iter().take(8_000).any(|byte| *byte == 0) {
        return (None, None);
    }
    let newlines = bytes.iter().filter(|byte| **byte == b'\n').count() as u64;
    let added = if bytes.last() == Some(&b'\n') {
        newlines
    } else if bytes.is_empty() {
        0
    } else {
        newlines.saturating_add(1)
    };
    (Some(added), None)
}

fn has_area(entries: &[Value], area: &str) -> bool {
    entries
        .iter()
        .any(|entry| entry.get("area").and_then(Value::as_str) == Some(area))
}

fn identity(head: Option<&str>, entries: &[Value]) -> String {
    serde_json::to_string(&(head, entries)).unwrap_or_default()
}
