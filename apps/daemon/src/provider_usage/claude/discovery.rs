use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use super::super::ProviderUsageError;

const MAX_FILES: usize = 100_000;
const MAX_DIRECTORIES: usize = 100_000;
const MAX_DEPTH: usize = 64;
pub(super) const MAX_REFRESH_BYTES: u64 = 512 * 1024 * 1024;
const MAX_LINE_BYTES: u64 = 8 * 1024 * 1024;

pub(super) fn files() -> Result<Vec<PathBuf>, ProviderUsageError> {
    let home = crate::paths::resolve_local_home_path().ok_or_else(|| {
        ProviderUsageError::Scan("Claude home directory is unavailable".to_owned())
    })?;
    discover(&[
        home.join(".claude").join("projects"),
        home.join(".claude").join("transcripts"),
    ])
}

fn discover(roots: &[PathBuf]) -> Result<Vec<PathBuf>, ProviderUsageError> {
    let mut pending = roots
        .iter()
        .cloned()
        .map(|root| (root, 0))
        .collect::<Vec<_>>();
    let mut files = Vec::new();
    let mut directory_count = 0;
    let mut visited_entries = 0_u64;
    while let Some((directory, depth)) = pending.pop() {
        directory_count += 1;
        if directory_count > MAX_DIRECTORIES || depth > MAX_DEPTH {
            return Err(limit_error());
        }
        let entries = match std::fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.into()),
        };
        for entry in entries {
            visited_entries += 1;
            if visited_entries > 500_000 {
                return Err(limit_error());
            }
            let entry = entry?;
            let kind = entry.file_type()?;
            if kind.is_dir() {
                if pending.len() >= MAX_DIRECTORIES {
                    return Err(limit_error());
                }
                pending.push((entry.path(), depth + 1));
            }
            if kind.is_file()
                && entry
                    .path()
                    .extension()
                    .is_some_and(|extension| extension == "jsonl")
            {
                files.push(entry.path());
                if files.len() > MAX_FILES {
                    return Err(limit_error());
                }
            }
        }
    }
    files.sort();
    files.dedup();
    Ok(files)
}

pub(super) fn stat(path: &Path) -> Result<(f64, u64), ProviderUsageError> {
    let metadata = std::fs::metadata(path)?;
    let modified = metadata
        .modified()?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| ProviderUsageError::Scan(error.to_string()))?;
    Ok((modified.as_secs_f64() * 1000.0, metadata.len()))
}

pub(super) fn read_lines(
    path: &Path,
    mut consume: impl FnMut(&[u8]),
) -> Result<u64, ProviderUsageError> {
    let file = std::fs::File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut line_count = 0_u64;
    let mut bytes = 0_u64;
    loop {
        let mut line = Vec::new();
        let read = reader
            .by_ref()
            .take(MAX_LINE_BYTES + 1)
            .read_until(b'\n', &mut line)?;
        if read == 0 {
            break;
        }
        bytes = bytes.saturating_add(read as u64);
        if read as u64 > MAX_LINE_BYTES || bytes > MAX_REFRESH_BYTES {
            return Err(limit_error());
        }
        line_count = line_count.saturating_add(1);
        consume(&line);
    }
    Ok(line_count)
}

fn limit_error() -> ProviderUsageError {
    ProviderUsageError::Scan("Claude usage scan exceeds its resource limit".to_owned())
}
