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
use std::cmp::Ordering;
use std::collections::{BTreeMap, HashSet};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

pub(super) const SCHEMA_VERSION: u64 = 11;
const PREVIOUS_SCHEMA_VERSION: u64 = 10;
const MAX_REFRESH_BYTES: u64 = 512 * 1024 * 1024;
const MAX_FILE_CHUNK_BYTES: u64 = 64 * 1024 * 1024;
const MAX_LINE_BYTES: u64 = 8 * 1024 * 1024;

struct PendingFile {
    key: String,
    mtime_ms: f64,
    path: PathBuf,
    previous: Option<Value>,
    read_bytes: u64,
    resume: bool,
    is_chunked: bool,
    size: u64,
    skip: u64,
    start: u64,
}

struct ReadOutput {
    complete: bool,
    discarding_line: bool,
    next_offset: u64,
    skipped_lines: u64,
}

pub(super) fn scan(
    root: PathBuf,
    previous: Value,
    worktrees: Vec<UsageWorktree>,
) -> Result<Value, ProviderUsageError> {
    let homes = discovery::homes(&root);
    let files = discovery::files(&root, &homes)?;
    let priority = priority::load(&homes);
    let fingerprint = serde_json::to_string(&worktrees)?;
    let mut ownership = Ownership::open(&root.join("agentstart-codex-usage-ownership.sqlite"))?;
    let previous_generation = previous.get("ownershipGeneration").and_then(Value::as_str);
    let rebuild_snapshot = previous
        .get("rebuildSnapshot")
        .filter(|value| value.is_object())
        .cloned();
    let published_snapshot = json!({
        "sessions": previous.get("sessions").cloned().unwrap_or_else(|| json!([])),
        "dailyAggregates": previous
            .get("dailyAggregates")
            .cloned()
            .unwrap_or_else(|| json!([]))
    });
    let compatible_schema = matches!(
        previous.get("schemaVersion").and_then(Value::as_u64),
        Some(PREVIOUS_SCHEMA_VERSION | SCHEMA_VERSION)
    );
    let reuse = compatible_schema
        && previous_generation.is_some()
        && ownership.generation()?.as_deref() == previous_generation;
    let previous_files = if compatible_schema {
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
        let skip = files.skip.get(path).copied().unwrap_or(0);
        match previous.remove(&key) {
            Some(file)
                if reuse
                    && skip == 0
                    && file.get("mtimeMs").and_then(Value::as_f64) == Some(mtime)
                    && file.get("size").and_then(Value::as_u64) == Some(size)
                    && file.get("scanOffset").is_none()
                    && file
                        .get("hasDeferredClaims")
                        .and_then(Value::as_bool)
                        .is_some()
                    && !(lost_owner && file["hasDeferredClaims"] != false)
                    && file.get("priorityFingerprint").and_then(Value::as_str)
                        == Some(&priority.fingerprint)
                    && file.get("attributionFingerprint").and_then(Value::as_str)
                        == Some(&fingerprint) =>
            {
                processed.insert(key, file);
            }
            prior => {
                let resume = reuse
                    && prior.as_ref().is_some_and(|file| {
                        file.get("mtimeMs").and_then(Value::as_f64) == Some(mtime)
                            && file.get("size").and_then(Value::as_u64) == Some(size)
                            && file.get("priorityFingerprint").and_then(Value::as_str)
                                == Some(&priority.fingerprint)
                            && file.get("attributionFingerprint").and_then(Value::as_str)
                                == Some(&fingerprint)
                            && file
                                .get("scanOffset")
                                .and_then(Value::as_u64)
                                .is_some_and(|offset| offset >= skip && offset < size)
                    });
                let start = if resume {
                    prior
                        .as_ref()
                        .and_then(|file| file.get("scanOffset"))
                        .and_then(Value::as_u64)
                        .unwrap_or(skip)
                } else {
                    skip
                };
                changed.push(PendingFile {
                    key,
                    mtime_ms: mtime,
                    path: path.clone(),
                    previous: prior,
                    read_bytes: size.saturating_sub(start).min(MAX_FILE_CHUNK_BYTES),
                    resume,
                    is_chunked: size.saturating_sub(start) > MAX_FILE_CHUNK_BYTES,
                    size,
                    skip,
                    start,
                });
            }
        }
    }
    changed.sort_by(|left, right| {
        right
            .resume
            .cmp(&left.resume)
            .then_with(|| right.is_chunked.cmp(&left.is_chunked))
            .then_with(|| right.previous.is_none().cmp(&left.previous.is_none()))
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
    let mut oversized_files = processed
        .values()
        .filter(|file| file["chunkedFile"] == true)
        .count() as u64;
    let mut failed_files = processed
        .values()
        .filter(|file| file["ignoredFailed"] == true)
        .count() as u64;
    for pending in changed {
        let next_bytes = refresh_bytes.checked_add(pending.read_bytes);
        if next_bytes.is_some_and(|bytes| bytes <= MAX_REFRESH_BYTES) {
            refresh_bytes = next_bytes.unwrap_or(refresh_bytes);
            selected.push(pending);
        } else {
            deferred_files = deferred_files.saturating_add(1);
            if let Some(file) = pending.previous {
                processed.insert(pending.key, file);
            }
        }
    }
    let mut attribution = Attribution::new(worktrees);
    let catalog = Catalog::load_for("openai");
    let mut skipped_lines = processed
        .values()
        .filter_map(|file| file.get("skippedLines").and_then(Value::as_u64))
        .fold(0_u64, u64::saturating_add);
    for pending in selected {
        ownership.begin_file()?;
        let mut aggregation = Aggregation::default();
        let fallback_session = pending
            .path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        let resume_state = pending.previous.as_ref().and_then(|previous| {
            pending.resume.then(|| {
                serde_json::from_value(previous["parserState"].clone())
                    .ok()
                    .map(|parser| {
                        (
                            parser,
                            previous["hasDeferredClaims"].as_bool().unwrap_or(false),
                            previous["skippedLines"].as_u64().unwrap_or(0),
                            previous["discardingLine"].as_bool().unwrap_or(false),
                        )
                    })
            })?
        });
        let file_id = if resume_state.is_some() {
            ownership.file_id(&pending.key)?
        } else {
            None
        };
        let (id, mut parser, mut deferred, prior_skipped_lines, discarding_line, read_start) =
            match (file_id, resume_state) {
                (Some(id), Some((parser, deferred, skipped_lines, discarding_line))) => {
                    if let Some(previous) = pending.previous.as_ref() {
                        aggregation.merge_file(previous);
                    }
                    (
                        id,
                        parser,
                        deferred,
                        skipped_lines,
                        discarding_line,
                        pending.start,
                    )
                }
                _ => (
                    ownership.prepare(&pending.key)?,
                    parser::Parser::new(fallback_session, pending.skip),
                    false,
                    0,
                    false,
                    pending.skip,
                ),
            };
        let parsed = read(
            &pending.path,
            read_start,
            pending.read_bytes,
            pending.size,
            discarding_line,
            |line| {
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
            },
        );
        let read_output = match parsed {
            Ok(output) => output,
            Err(error @ ProviderUsageError::Read(_)) => {
                ownership.rollback_file()?;
                eprintln!(
                    "Skipping Codex usage transcript {}: {error}",
                    pending.path.display()
                );
                failed_files = failed_files.saturating_add(1);
                processed.insert(
                    pending.key.clone(),
                    json!({"path":pending.key,"mtimeMs":pending.mtime_ms,"size":pending.size,
                    "sessions":[],"dailyAggregates":[],"hasDeferredClaims":false,
                    "priorityFingerprint":priority.fingerprint,
                    "attributionFingerprint":fingerprint,"chunkedFile":false,
                    "skippedLines":0,
                    "ignoredFailed":true}),
                );
                continue;
            }
            Err(error) => {
                ownership.rollback_file()?;
                return Err(error);
            }
        };
        ownership.commit_file()?;
        let file_skipped_lines = prior_skipped_lines.saturating_add(read_output.skipped_lines);
        skipped_lines = skipped_lines.saturating_add(file_skipped_lines);
        let (sessions, daily) = aggregation.finish();
        let chunked_file =
            pending.size.saturating_sub(read_start) > pending.read_bytes || pending.resume;
        let mut file = json!({"path":pending.key,"mtimeMs":pending.mtime_ms,"size":pending.size,
            "sessions":sessions,"dailyAggregates":daily,"hasDeferredClaims":deferred,
            "priorityFingerprint":priority.fingerprint,
            "attributionFingerprint":fingerprint,"chunkedFile":chunked_file,
            "skippedLines":file_skipped_lines,"ignoredFailed":false});
        if read_output.complete {
            if chunked_file {
                oversized_files = oversized_files.saturating_add(1);
            }
        } else {
            file["scanOffset"] = json!(read_output.next_offset);
            file["parserState"] = serde_json::to_value(parser)?;
            file["discardingLine"] = json!(read_output.discarding_line);
            deferred_files = deferred_files.saturating_add(1);
        }
        processed.insert(pending.key, file);
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
    let (rebuilt_sessions, rebuilt_daily) = aggregation.finish();
    let is_rebuilding = rebuild_snapshot.is_some() || !reuse;
    let incomplete = deferred_files > 0;
    let baseline = rebuild_snapshot.unwrap_or(published_snapshot);
    let (sessions, daily, rebuild_snapshot) = if is_rebuilding && incomplete {
        (
            baseline
                .get("sessions")
                .cloned()
                .unwrap_or_else(|| json!([])),
            baseline
                .get("dailyAggregates")
                .cloned()
                .unwrap_or_else(|| json!([])),
            baseline,
        )
    } else {
        (json!(rebuilt_sessions), json!(rebuilt_daily), Value::Null)
    };
    let generation = ownership.commit()?;
    Ok(
        json!({"schemaVersion":SCHEMA_VERSION,"processedFiles":processed,"sessions":sessions,
        "dailyAggregates":daily,"ownershipGeneration":generation,
        "rebuildSnapshot":rebuild_snapshot,
        "scanWarnings":{"deferredFiles":deferred_files,"failedFiles":failed_files,
        "oversizedFiles":oversized_files,"skippedLines":skipped_lines}}),
    )
}
fn read(
    path: &Path,
    start: u64,
    max_bytes: u64,
    size: u64,
    mut discarding_line: bool,
    mut consume: impl FnMut(&str) -> Result<(), ProviderUsageError>,
) -> Result<ReadOutput, ProviderUsageError> {
    let mut file = std::fs::File::open(path)?;
    file.seek(SeekFrom::Start(start))?;
    let mut reader = BufReader::new(file);
    let mut bytes_read = 0_u64;
    let mut skipped_lines = 0_u64;
    while bytes_read < max_bytes {
        let mut line = Vec::new();
        let read = reader
            .by_ref()
            .take(MAX_LINE_BYTES + 1)
            .read_until(b'\n', &mut line)?;
        if read == 0 {
            break;
        }
        bytes_read = bytes_read.saturating_add(read as u64);
        if discarding_line {
            discarding_line = !line.ends_with(b"\n");
            continue;
        }
        if read as u64 > MAX_LINE_BYTES {
            skipped_lines = skipped_lines.saturating_add(1);
            discarding_line = !line.ends_with(b"\n");
            continue;
        }
        consume(&String::from_utf8_lossy(&line))?;
    }
    let next_offset = start.saturating_add(bytes_read).min(size);
    Ok(ReadOutput {
        complete: next_offset >= size,
        discarding_line,
        next_offset,
        skipped_lines,
    })
}
