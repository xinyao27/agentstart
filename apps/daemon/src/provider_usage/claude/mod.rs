mod aggregation;
mod discovery;
pub(super) mod model;
mod model_pricing;
mod parser;
pub(super) mod pricing;

use std::cmp::Ordering;
use std::collections::{BTreeMap, HashSet};
use std::path::PathBuf;

use serde_json::Value;

use super::ProviderUsageError;
use super::calendar::local_day;
use super::pricing_catalog::Catalog;
use super::worktrees::{Attribution, UsageWorktree};
use aggregation::Aggregation;
use model::{ProcessedFile, ScanOutput};

pub(super) const SCHEMA_VERSION: u64 = 8;
const PREVIOUS_SCHEMA_VERSION: u64 = 7;

struct PendingFile {
    path: PathBuf,
    mtime_ms: f64,
    size: u64,
    previous: Option<ProcessedFile>,
}

pub(super) fn scan(
    previous: Value,
    worktrees: Vec<UsageWorktree>,
) -> Result<Value, ProviderUsageError> {
    let result = scan_files(previous, worktrees, discovery::files()?)?;
    Ok(serde_json::json!({
        "schemaVersion": SCHEMA_VERSION,
        "processedFiles": result.processed_files,
        "sessions": result.sessions,
        "dailyAggregates": result.daily_aggregates,
        "scanWarnings": {
            "deferredFiles": result.deferred_files,
            "failedFiles": result.failed_files,
            "oversizedFiles": result.oversized_files,
            "skippedLines": 0
        }
    }))
}

pub(super) fn scan_files(
    previous: Value,
    worktrees: Vec<UsageWorktree>,
    files: Vec<std::path::PathBuf>,
) -> Result<ScanOutput, ProviderUsageError> {
    let fingerprint = serde_json::to_string(&worktrees)?;
    let previous_files = if matches!(
        previous.get("schemaVersion").and_then(Value::as_u64),
        Some(PREVIOUS_SCHEMA_VERSION | SCHEMA_VERSION)
    ) {
        previous
            .get("processedFiles")
            .and_then(|value| serde_json::from_value::<Vec<ProcessedFile>>(value.clone()).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    let current = files
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect::<HashSet<_>>();
    let lost_owner = previous_files
        .iter()
        .any(|file| !current.contains(&file.path) && !file.owned_dedupe_keys.is_empty());
    let mut previous = previous_files
        .into_iter()
        .map(|file| (file.path.clone(), file))
        .collect::<BTreeMap<_, _>>();
    let mut reused = BTreeMap::new();
    let mut changed = Vec::new();
    for path in &files {
        let key = path.to_string_lossy().into_owned();
        let (mtime, size) = discovery::stat(path)?;
        match previous.remove(&key) {
            Some(file)
                if file.mtime_ms == mtime
                    && file.size == size
                    && file.attribution_fingerprint == fingerprint
                    && !(lost_owner && file.has_deferred_claims) =>
            {
                reused.insert(key, file);
            }
            prior => {
                changed.push(PendingFile {
                    path: path.clone(),
                    mtime_ms: mtime,
                    size,
                    previous: prior,
                });
            }
        }
    }
    changed.sort_by(|left, right| {
        right
            .previous
            .is_none()
            .cmp(&left.previous.is_none())
            .then_with(|| {
                right
                    .mtime_ms
                    .partial_cmp(&left.mtime_ms)
                    .unwrap_or(Ordering::Equal)
            })
    });
    let mut refresh_bytes = 0_u64;
    let mut selected = Vec::new();
    let mut deferred_files = 0_u64;
    let mut oversized_files = reused
        .values()
        .filter(|file| file.ignored_oversized)
        .count() as u64;
    let mut failed_files = reused.values().filter(|file| file.ignored_failed).count() as u64;
    for pending in changed {
        if pending.size > discovery::MAX_REFRESH_BYTES {
            oversized_files = oversized_files.saturating_add(1);
            let key = pending.path.to_string_lossy().into_owned();
            let file = match pending.previous {
                Some(mut file) => {
                    file.path = key.clone();
                    file.mtime_ms = pending.mtime_ms;
                    file.size = pending.size;
                    file.attribution_fingerprint = fingerprint.clone();
                    file.ignored_oversized = true;
                    file.ignored_failed = false;
                    file
                }
                None => ProcessedFile {
                    path: key,
                    mtime_ms: pending.mtime_ms,
                    size: pending.size,
                    line_count: 0,
                    sessions: Vec::new(),
                    daily_aggregates: Vec::new(),
                    owned_dedupe_keys: Vec::new(),
                    has_deferred_claims: false,
                    attribution_fingerprint: fingerprint.clone(),
                    ignored_oversized: true,
                    ignored_failed: false,
                },
            };
            reused.insert(file.path.clone(), file);
            continue;
        }
        let next_bytes = refresh_bytes.checked_add(pending.size);
        if next_bytes.is_some_and(|bytes| bytes <= discovery::MAX_REFRESH_BYTES) {
            refresh_bytes = next_bytes.unwrap_or(refresh_bytes);
            selected.push(pending);
        } else {
            deferred_files = deferred_files.saturating_add(1);
            if let Some(file) = pending.previous {
                reused.insert(file.path.clone(), file);
            }
        }
    }
    let mut owners = reused
        .values()
        .flat_map(|file| file.owned_dedupe_keys.iter().cloned())
        .collect::<HashSet<_>>();
    let mut attribution = Attribution::new(worktrees);
    let catalog = Catalog::load();
    for pending in selected {
        let path = pending.path;
        let (line_count, turns) = match parser::read(&path) {
            Ok(parsed) => parsed,
            Err(error @ ProviderUsageError::Read(_)) | Err(error @ ProviderUsageError::Scan(_)) => {
                eprintln!(
                    "Skipping Claude usage transcript {}: {error}",
                    path.display()
                );
                failed_files = failed_files.saturating_add(1);
                let key = path.to_string_lossy().into_owned();
                reused.insert(
                    key.clone(),
                    ProcessedFile {
                        path: key,
                        mtime_ms: pending.mtime_ms,
                        size: pending.size,
                        line_count: 0,
                        sessions: Vec::new(),
                        daily_aggregates: Vec::new(),
                        owned_dedupe_keys: Vec::new(),
                        has_deferred_claims: false,
                        attribution_fingerprint: fingerprint.clone(),
                        ignored_oversized: false,
                        ignored_failed: true,
                    },
                );
                continue;
            }
            Err(error) => return Err(error),
        };
        let mut aggregation = Aggregation::default();
        let mut owned_dedupe_keys = Vec::new();
        let mut has_deferred_claims = false;
        for turn in turns {
            if let Some(key) = &turn.dedupe_key {
                if !owners.insert(key.clone()) {
                    has_deferred_claims = true;
                    continue;
                }
                owned_dedupe_keys.push(key.clone());
            }
            let Some(day) = local_day(&turn.timestamp) else {
                continue;
            };
            let location = attribution.locate(turn.cwd.as_deref());
            let (cost, unpriced) = pricing::price(&turn, &catalog);
            aggregation.add(&turn, day, location, cost, unpriced);
        }
        let (sessions, daily_aggregates) = aggregation.finish();
        let key = path.to_string_lossy().into_owned();
        reused.insert(
            key.clone(),
            ProcessedFile {
                path: key,
                mtime_ms: pending.mtime_ms,
                size: pending.size,
                line_count,
                sessions,
                daily_aggregates,
                owned_dedupe_keys,
                has_deferred_claims,
                attribution_fingerprint: fingerprint.clone(),
                ignored_oversized: false,
                ignored_failed: false,
            },
        );
    }
    let processed_files = files
        .iter()
        .filter_map(|path| reused.remove(path.to_string_lossy().as_ref()))
        .collect::<Vec<_>>();
    let mut aggregation = Aggregation::default();
    for file in &processed_files {
        aggregation.merge_sessions(file.sessions.clone());
        aggregation.merge_daily(file.daily_aggregates.clone());
    }
    let (sessions, daily_aggregates) = aggregation.finish();
    Ok(ScanOutput {
        processed_files,
        sessions,
        daily_aggregates,
        deferred_files,
        failed_files,
        oversized_files,
    })
}
