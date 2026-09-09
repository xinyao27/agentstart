mod aggregation;
mod discovery;
mod model_names;
mod ownership;
mod parser;
pub(super) mod pricing;
mod priority;
pub(super) mod token_delta;

use super::{
    ProviderUsageError,
    calendar::local_day,
    pricing_catalog::Catalog,
    worktrees::{Attribution, UsageWorktree},
};
use aggregation::Aggregation;
use ownership::Ownership;
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashSet};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

pub(super) const SCHEMA_VERSION: u64 = 10;

pub(super) fn scan(
    root: PathBuf,
    previous: Value,
    worktrees: Vec<UsageWorktree>,
) -> Result<Value, ProviderUsageError> {
    let homes = discovery::homes(&root);
    let files = discovery::files(&root, &homes)?;
    let priority = priority::load(&homes);
    let fingerprint = serde_json::to_string(&worktrees)?;
    let mut ownership = Ownership::open(&root.join("yiru-codex-usage-ownership.sqlite"))?;
    let previous_generation = previous.get("ownershipGeneration").and_then(Value::as_str);
    let reuse = previous.get("schemaVersion").and_then(Value::as_u64) == Some(SCHEMA_VERSION)
        && previous.get("worktreeFingerprint").and_then(Value::as_str) == Some(&fingerprint)
        && previous_generation.is_some()
        && ownership.generation()?.as_deref() == previous_generation;
    let previous_files = if reuse {
        previous
            .get("processedFiles")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    ownership.begin(!reuse)?;
    let current = files
        .paths
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect::<HashSet<_>>();
    let mut lost_owner = false;
    for file in &previous_files {
        if let Some(path) = file.get("path").and_then(Value::as_str)
            && !current.contains(path)
        {
            lost_owner |= ownership.remove(path)?;
        }
    }
    let mut previous = previous_files
        .into_iter()
        .filter_map(|file| Some((file.get("path")?.as_str()?.to_owned(), file)))
        .collect::<BTreeMap<_, _>>();
    let mut processed = BTreeMap::new();
    let mut changed = Vec::new();
    for path in &files.paths {
        let key = path.to_string_lossy().into_owned();
        let (mtime, size) = discovery::stat(path)?;
        let reusable = previous.remove(&key).filter(|file| {
            files.skip.get(path).copied().unwrap_or(0) == 0
                && file.get("mtimeMs").and_then(Value::as_f64) == Some(mtime)
                && file.get("size").and_then(Value::as_u64) == Some(size)
                && file
                    .get("hasDeferredClaims")
                    .and_then(Value::as_bool)
                    .is_some()
                && !(lost_owner && file["hasDeferredClaims"] != false)
                && file.get("priorityFingerprint").and_then(Value::as_str)
                    == Some(&priority.fingerprint)
        });
        if let Some(file) = reusable {
            processed.insert(key, file);
        } else {
            changed.push(path);
        }
    }
    let mut attribution = Attribution::new(worktrees);
    let catalog = Catalog::load_for("openai");
    for path in changed {
        let key = path.to_string_lossy().into_owned();
        let id = ownership.prepare(&key)?;
        let (mtime, size) = discovery::stat(path)?;
        let skip = files.skip.get(path).copied().unwrap_or(0);
        let mut parser = parser::Parser::new(
            path.file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            skip,
        );
        let mut aggregation = Aggregation::default();
        let mut deferred = false;
        read(path, skip, |line| {
            if let Some(event) = parser.parse(line) {
                if !ownership.claim(id, &event.event_key)? {
                    deferred = true;
                    return Ok(());
                }
                if let Some(day) = local_day(&event.timestamp) {
                    let location = attribution.locate(event.cwd.as_deref());
                    aggregation.add(event, day, location, &priority, &catalog);
                }
            }
            Ok(())
        })?;
        let (sessions, daily) = aggregation.finish();
        processed.insert(
            key.clone(),
            json!({"path":key,"mtimeMs":mtime,"size":size,
            "sessions":sessions,"dailyAggregates":daily,"hasDeferredClaims":deferred,
            "priorityFingerprint":priority.fingerprint}),
        );
    }
    let processed = files
        .paths
        .iter()
        .filter_map(|p| processed.remove(p.to_string_lossy().as_ref()))
        .collect::<Vec<_>>();
    let mut aggregation = Aggregation::default();
    for file in &processed {
        aggregation.merge_file(file);
    }
    let (sessions, daily) = aggregation.finish();
    let generation = ownership.commit()?;
    Ok(
        json!({"schemaVersion":SCHEMA_VERSION,"processedFiles":processed,"sessions":sessions,
        "dailyAggregates":daily,"ownershipGeneration":generation}),
    )
}
fn read(
    path: &Path,
    skip: u64,
    mut consume: impl FnMut(&str) -> Result<(), ProviderUsageError>,
) -> Result<(), ProviderUsageError> {
    let mut file = std::fs::File::open(path)?;
    file.seek(SeekFrom::Start(skip))?;
    let mut reader = BufReader::new(file);
    loop {
        let mut line = Vec::new();
        let read = reader
            .by_ref()
            .take(8 * 1024 * 1024 + 1)
            .read_until(b'\n', &mut line)?;
        if read == 0 {
            break;
        }
        if read > 8 * 1024 * 1024 {
            return Err(ProviderUsageError::Scan(
                "Codex transcript line exceeds 8 MiB".into(),
            ));
        }
        consume(&String::from_utf8_lossy(&line))?;
    }
    Ok(())
}
