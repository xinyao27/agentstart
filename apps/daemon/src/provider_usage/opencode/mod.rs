mod aggregation;
mod database;
mod discovery;
mod events;

use super::{
    ProviderUsageError,
    calendar::local_day,
    worktrees::{Attribution, UsageWorktree},
};
use aggregation::Aggregation;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    path::PathBuf,
};
pub(super) const SCHEMA_VERSION: u64 = 4;

pub(super) fn scan(
    previous: Value,
    worktrees: Vec<UsageWorktree>,
) -> Result<Value, ProviderUsageError> {
    scan_databases(previous, worktrees, discovery::paths()?)
}
fn scan_databases(
    previous: Value,
    worktrees: Vec<UsageWorktree>,
    mut paths: Vec<PathBuf>,
) -> Result<Value, ProviderUsageError> {
    paths.sort();
    paths.dedup();
    let fingerprint = serde_json::to_string(&worktrees)?;
    let previous = if previous["schemaVersion"].as_u64() == Some(SCHEMA_VERSION)
        && previous["worktreeFingerprint"].as_str() == Some(&fingerprint)
    {
        previous["processedDatabases"]
            .as_array()
            .cloned()
            .unwrap_or_default()
    } else {
        vec![]
    };
    let current = paths
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect::<HashSet<_>>();
    let reclaim = previous.iter().any(|p| {
        p["path"].as_str().is_some_and(|s| !current.contains(s))
            && p["ownedSessionIds"]
                .as_array()
                .is_some_and(|a| !a.is_empty())
    });
    let previous = previous
        .into_iter()
        .filter_map(|p| Some((p["path"].as_str()?.to_owned(), p)))
        .collect::<HashMap<_, _>>();
    let mut reused = BTreeMap::new();
    let mut changed = Vec::new();
    for path in &paths {
        let info = discovery::info(path)?;
        let cached = previous.get(path.to_string_lossy().as_ref());
        if let Some(cached) = cached.filter(|p| {
            ["mtimeMs", "size", "walMtimeMs", "walSize"]
                .iter()
                .all(|k| p[*k] == info[*k])
                && p["ownedSessionIds"].is_array()
                && p["hasDeferredClaims"].is_boolean()
                && !(reclaim && p["hasDeferredClaims"] != false)
        }) {
            reused.insert(path.clone(), cached.clone());
        } else {
            changed.push(path.clone());
        }
    }
    let demoted = reused
        .iter()
        .filter(|(path, p)| {
            p["ownedSessionIds"]
                .as_array()
                .is_some_and(|a| !a.is_empty())
                && changed
                    .iter()
                    .any(|candidate| discovery::priority(candidate) < discovery::priority(path))
        })
        .map(|(p, _)| p.clone())
        .collect::<Vec<_>>();
    for path in demoted {
        reused.remove(&path);
        changed.push(path);
    }
    let mut owners = HashMap::new();
    let mut reused_paths = reused.keys().cloned().collect::<Vec<_>>();
    reused_paths.sort_by_key(|p| discovery::priority(p));
    for path in reused_paths {
        if let Some(ids) = reused[&path]["ownedSessionIds"].as_array() {
            for id in ids.iter().filter_map(Value::as_str) {
                owners.entry(id.to_owned()).or_insert_with(|| path.clone());
            }
        }
    }
    changed.sort_by_key(|p| discovery::priority(p));
    let mut attribution = Attribution::new(worktrees);
    let mut remaining = 1_000_000usize;
    let mut remaining_bytes = 512 * 1024 * 1024usize;
    for path in changed {
        let mut info = discovery::info(&path)?;
        let mut aggregate = Aggregation::default();
        let mut owned = Vec::new();
        let mut claims = HashMap::new();
        let mut deferred = false;
        database::visit(&path, &mut remaining, &mut remaining_bytes, |event| {
            let accepted = *claims.entry(event.session_id.clone()).or_insert_with(|| {
                if owners
                    .get(&event.session_id)
                    .is_some_and(|owner| owner != &path)
                {
                    false
                } else {
                    owners.insert(event.session_id.clone(), path.clone());
                    owned.push(event.session_id.clone());
                    true
                }
            });
            if !accepted {
                deferred = true;
                return Ok(());
            }
            if let Some(day) = local_day(&event.timestamp) {
                let location = attribution.locate(event.cwd.as_deref());
                aggregate.add(event, day, location);
            }
            Ok(())
        })?;
        let (sessions, daily) = aggregate.finish();
        info["sessions"] = json!(sessions);
        info["dailyAggregates"] = json!(daily);
        info["ownedSessionIds"] = json!(owned);
        info["hasDeferredClaims"] = json!(deferred);
        reused.insert(path, info);
    }
    let mut aggregate = Aggregation::default();
    let mut processed = Vec::new();
    for path in paths {
        if let Some(database) = reused.remove(&path) {
            aggregate.merge_file(&database);
            processed.push(database);
        }
    }
    let (sessions, daily) = aggregate.finish();
    Ok(
        json!({"schemaVersion":SCHEMA_VERSION,"processedDatabases":processed,"sessions":sessions,"dailyAggregates":daily}),
    )
}
