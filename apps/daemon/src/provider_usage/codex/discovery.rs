use super::super::ProviderUsageError;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub(super) fn homes(root: &Path) -> Vec<PathBuf> {
    let system = crate::paths::resolve_local_home_path().map(|home| home.join(".codex"));
    let mut homes = vec![root.join("codex-runtime-home").join("home")];
    if let Some(home) = &system {
        homes.push(home.clone());
    }
    let accounts = root.join("codex-accounts");
    if let (Ok(entries), Ok(canonical_root)) = (
        std::fs::read_dir(&accounts),
        std::fs::canonicalize(&accounts),
    ) {
        for entry in entries.flatten() {
            if !entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                continue;
            }
            let home = entry.path().join("home");
            let Ok(canonical) = std::fs::canonicalize(&home) else {
                continue;
            };
            if canonical == canonical_root
                || !canonical.starts_with(&canonical_root)
                || system
                    .as_ref()
                    .and_then(|p| std::fs::canonicalize(p).ok())
                    .is_some_and(|p| canonical.starts_with(p))
            {
                continue;
            }
            let marker = canonical.join(".yiru-managed-home");
            if !std::fs::symlink_metadata(&marker).is_ok_and(|m| m.is_file())
                || !std::fs::read_to_string(marker)
                    .is_ok_and(|text| text.trim() == entry.file_name().to_string_lossy())
                || !std::fs::symlink_metadata(home.join("sessions")).is_ok_and(|m| m.is_dir())
            {
                continue;
            }
            homes.push(home);
        }
    }
    homes.sort();
    homes.dedup();
    homes
}

pub(super) struct Files {
    pub paths: Vec<PathBuf>,
    pub skip: HashMap<PathBuf, u64>,
}

pub(super) fn files(root: &Path, homes: &[PathBuf]) -> Result<Files, ProviderUsageError> {
    let mut paths = Vec::new();
    for home in homes {
        let mut pending = vec![(home.join("sessions"), 0)];
        let mut visited = 0;
        while let Some((directory, depth)) = pending.pop() {
            visited += 1;
            if visited > 100_000 || depth > 64 {
                return Err(ProviderUsageError::Scan(
                    "Codex history directory limit exceeded".into(),
                ));
            }
            let Ok(entries) = std::fs::read_dir(directory) else {
                continue;
            };
            for entry in entries.flatten() {
                let Ok(kind) = entry.file_type() else {
                    continue;
                };
                if kind.is_dir() {
                    pending.push((entry.path(), depth + 1));
                } else if kind.is_file() && entry.path().extension().is_some_and(|v| v == "jsonl") {
                    paths.push(entry.path());
                }
            }
        }
    }
    paths.sort();
    paths.dedup();
    let runtime = root.join("codex-runtime-home").join("home");
    let mut excluded = HashSet::new();
    let mut skip = HashMap::<PathBuf, u64>::new();
    for path in &paths {
        let Ok(relative) = path.strip_prefix(runtime.join("sessions")) else {
            continue;
        };
        let marker = runtime
            .join(".yiru-session-copies")
            .join(format!("{}.json", relative.to_string_lossy()));
        let Some(marker) = std::fs::read(marker)
            .ok()
            .and_then(|v| serde_json::from_slice::<Marker>(&v).ok())
        else {
            continue;
        };
        let Ok((mtime, size)) = stat(path) else {
            continue;
        };
        let target_matches = size == marker.target_size && mtime == marker.target_mtime_ms;
        let source_matches = stat(&marker.source_path).is_ok_and(|(mtime, size)| {
            size == marker.source_size && mtime == marker.source_mtime_ms
        });
        if !target_matches && !source_matches {
            let count = skip.entry(marker.source_path).or_default();
            *count = (*count).max(marker.source_size);
        } else {
            let excluded_path = if !target_matches || source_matches {
                &marker.source_path
            } else {
                path
            };
            excluded.insert(alias(excluded_path));
        }
    }
    let mut aliases = HashSet::new();
    paths.retain(|path| {
        let key = alias(path);
        !excluded.contains(&key) && aliases.insert(key)
    });
    Ok(Files { paths, skip })
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Marker {
    source_path: PathBuf,
    source_size: u64,
    source_mtime_ms: f64,
    target_size: u64,
    target_mtime_ms: f64,
}

pub(super) fn stat(path: &Path) -> Result<(f64, u64), ProviderUsageError> {
    let metadata = std::fs::metadata(path)?;
    let modified = metadata
        .modified()?
        .duration_since(UNIX_EPOCH)
        .map_err(|e| ProviderUsageError::Scan(e.to_string()))?;
    Ok((modified.as_secs_f64() * 1000.0, metadata.len()))
}
fn alias(path: &Path) -> String {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if let Ok(metadata) = std::fs::metadata(path)
            && metadata.ino() != 0
        {
            return format!("{}:{}", metadata.dev(), metadata.ino());
        }
    }
    // Why: same-file's Windows handle identity also recognizes hard-linked rollouts.
    #[cfg(windows)]
    {
        use std::hash::{Hash, Hasher};
        if let Ok(handle) = same_file::Handle::from_path(path) {
            let mut hash = std::collections::hash_map::DefaultHasher::new();
            handle.hash(&mut hash);
            return format!("file:{}", hash.finish());
        }
    }
    let path = std::fs::canonicalize(path)
        .unwrap_or_else(|_| path.to_owned())
        .to_string_lossy()
        .into_owned();
    if cfg!(windows) {
        path.to_lowercase()
    } else {
        path
    }
}
