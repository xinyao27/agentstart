use super::super::ProviderUsageError;
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

pub(super) fn paths() -> Result<Vec<PathBuf>, ProviderUsageError> {
    let home = crate::paths::resolve_local_home_path()
        .ok_or_else(|| ProviderUsageError::Scan("Local home is unavailable".to_owned()))?;
    let data = std::env::var_os("XDG_DATA_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            if cfg!(windows) {
                std::env::var_os("LOCALAPPDATA")
                    .or_else(|| std::env::var_os("APPDATA"))
                    .map(PathBuf::from)
                    .unwrap_or_else(|| home.join("AppData").join("Local"))
            } else {
                home.join(".local").join("share")
            }
        })
        .join("opencode");
    if let Some(raw) = std::env::var("OPENCODE_DB")
        .ok()
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty() && s != ":memory:")
    {
        let path = PathBuf::from(raw);
        let path = if path.is_absolute() {
            path
        } else {
            data.join(path)
        };
        return match std::fs::metadata(&path) {
            Ok(m) if m.is_file() => Ok(vec![path]),
            Ok(_) => Ok(vec![]),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
            Err(e) => Err(e.into()),
        };
    }
    let entries = match std::fs::read_dir(data) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.into()),
    };
    let mut paths = Vec::new();
    for (count, entry) in entries.enumerate() {
        if count >= 100_000 {
            return Err(ProviderUsageError::Scan(
                "OpenCode directory entry limit exceeded".to_owned(),
            ));
        }
        let entry = entry?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let accepted = name == "opencode.db"
            || name
                .strip_prefix("opencode-")
                .and_then(|s| s.strip_suffix(".db"))
                .is_some_and(|s| {
                    !s.is_empty()
                        && s.bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
                });
        if accepted && entry.file_type()?.is_file() {
            paths.push(entry.path());
        }
        if paths.len() > 1024 {
            return Err(ProviderUsageError::Scan(
                "OpenCode database limit exceeded".to_owned(),
            ));
        }
    }
    paths.sort();
    Ok(paths)
}
pub(super) fn priority(path: &Path) -> (u8, PathBuf) {
    (
        u8::from(
            !path
                .file_name()
                .is_some_and(|s| s.to_string_lossy().eq_ignore_ascii_case("opencode.db")),
        ),
        path.to_path_buf(),
    )
}
pub(super) fn info(path: &Path) -> Result<Value, ProviderUsageError> {
    let metadata = std::fs::metadata(path)?;
    if metadata.len() > 8 * 1024 * 1024 * 1024 {
        return Err(ProviderUsageError::Scan(
            "OpenCode database size limit exceeded".to_owned(),
        ));
    }
    let mut wal_name = path.as_os_str().to_os_string();
    wal_name.push("-wal");
    let wal = match std::fs::metadata(PathBuf::from(wal_name)) {
        Ok(m) => Some(m),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(e.into()),
    };
    if wal
        .as_ref()
        .is_some_and(|m| m.len() > 8 * 1024 * 1024 * 1024)
    {
        return Err(ProviderUsageError::Scan(
            "OpenCode WAL size limit exceeded".to_owned(),
        ));
    }
    // Why: SQLite WAL commits do not necessarily change the main database's size or modification time.
    Ok(
        json!({"path":path.to_string_lossy(),"mtimeMs":mtime(&metadata),"size":metadata.len(),"walMtimeMs":wal.as_ref().map(mtime),"walSize":wal.map(|m|m.len())}),
    )
}
fn mtime(metadata: &std::fs::Metadata) -> f64 {
    metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}
