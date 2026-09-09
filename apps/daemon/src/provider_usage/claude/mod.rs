mod aggregation;
mod discovery;
pub(super) mod model;
mod model_pricing;
mod parser;
pub(super) mod pricing;

use std::collections::{BTreeMap, HashSet};

use serde_json::Value;

use super::ProviderUsageError;
use super::calendar::local_day;
use super::pricing_catalog::Catalog;
use super::worktrees::{Attribution, UsageWorktree};
use aggregation::Aggregation;
use model::{ProcessedFile, ScanOutput};

pub(super) const SCHEMA_VERSION: u64 = 7;

pub(super) fn scan(
    previous: Value,
    worktrees: Vec<UsageWorktree>,
) -> Result<Value, ProviderUsageError> {
    let result = scan_files(previous, worktrees, discovery::files()?)?;
    Ok(serde_json::json!({
        "schemaVersion": SCHEMA_VERSION,
        "processedFiles": result.processed_files,
        "sessions": result.sessions,
        "dailyAggregates": result.daily_aggregates
    }))
}

pub(super) fn scan_files(
    previous: Value,
    worktrees: Vec<UsageWorktree>,
    files: Vec<std::path::PathBuf>,
) -> Result<ScanOutput, ProviderUsageError> {
    let fingerprint = serde_json::to_string(&worktrees)?;
    let previous_files = if previous.get("schemaVersion").and_then(Value::as_u64)
        == Some(SCHEMA_VERSION)
        && previous.get("worktreeFingerprint").and_then(Value::as_str) == Some(fingerprint.as_str())
    {
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
        if let Some(file) = previous.remove(&key).filter(|file| {
            file.mtime_ms == mtime && file.size == size && !(lost_owner && file.has_deferred_claims)
        }) {
            reused.insert(key, file);
        } else {
            changed.push(path);
        }
    }
    let mut owners = reused
        .values()
        .flat_map(|file| file.owned_dedupe_keys.iter().cloned())
        .collect::<HashSet<_>>();
    let mut attribution = Attribution::new(worktrees);
    let catalog = Catalog::load();
    for path in changed {
        let (mtime_ms, size) = discovery::stat(path)?;
        let (line_count, turns) = parser::read(path)?;
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
                mtime_ms,
                size,
                line_count,
                sessions,
                daily_aggregates,
                owned_dedupe_keys,
                has_deferred_claims,
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
    })
}
