use std::ffi::OsString;
use std::path::{Component, Path, PathBuf};

pub(crate) fn resolve_absolute(target_path: &str) -> std::io::Result<PathBuf> {
    if target_path.is_empty() {
        return std::env::current_dir().map(normalize);
    }
    Ok(normalize(std::path::absolute(Path::new(target_path))?))
}

pub(crate) fn normalize(path: impl AsRef<Path>) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.as_ref().components() {
        match component {
            Component::Prefix(_) | Component::RootDir | Component::Normal(_) => {
                normalized.push(component.as_os_str());
            }
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
        }
    }
    normalized
}

pub(crate) async fn canonicalize(path: &Path) -> std::io::Result<PathBuf> {
    let mut candidate = path.to_owned();
    let mut missing = Vec::<OsString>::new();
    loop {
        match tokio::fs::canonicalize(&candidate).await {
            Ok(canonical) => {
                let mut resolved = normalize(canonical);
                for segment in missing.iter().rev() {
                    resolved.push(segment);
                }
                return Ok(normalize(resolved));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let Some(name) = candidate.file_name() else {
                    return Err(error);
                };
                missing.push(name.to_owned());
                let Some(parent) = candidate.parent() else {
                    return Err(error);
                };
                candidate = parent.to_owned();
            }
            Err(error) => return Err(error),
        }
    }
}

pub(crate) async fn canonicalize_preserving_leaf(path: &Path) -> std::io::Result<PathBuf> {
    let Some(parent) = path.parent() else {
        return canonicalize(path).await;
    };
    let Some(leaf) = path.file_name() else {
        return canonicalize(path).await;
    };
    let mut canonical = canonicalize(parent).await?;
    canonical.push(leaf);
    Ok(normalize(canonical))
}
