use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use super::{CodexRuntimeError, managed_files};

const RESOURCE_NAMES: &[&str] = &[
    "skills",
    "hooks",
    "plugins",
    "plugin-state",
    "profile-v2",
    "themes",
    "prompts",
    "AGENTS.md",
];
const MARKER_BYTE_LIMIT: u64 = 64 * 1024;
const RESOURCE_COMPARE_BYTE_LIMIT: u64 = 64 * 1024 * 1024;

pub(super) fn sync_host(source_home: &Path, managed_home: &Path) {
    for name in RESOURCE_NAMES {
        if let Err(error) = sync_entry(source_home, managed_home, name, false) {
            eprintln!("[codex-home] failed to mirror {name}: {error}");
        }
    }
}

pub(super) fn sync_wsl_instructions(source_home: &Path, managed_home: &Path) {
    if let Err(error) = sync_entry(source_home, managed_home, "AGENTS.md", true) {
        eprintln!("[codex-home] failed to mirror WSL AGENTS.md: {error}");
    }
}

fn sync_entry(
    source_home: &Path,
    managed_home: &Path,
    name: &str,
    prefer_copy: bool,
) -> Result<(), CodexRuntimeError> {
    let source = source_home.join(name);
    let target = managed_home.join(name);
    let source_metadata = match fs::metadata(&source) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            remove_owned(&source, &target, managed_home, name)?;
            return Ok(());
        }
        Err(error) => return Err(error.into()),
    };
    if name == "AGENTS.md" && !source_metadata.is_file() {
        remove_owned(&source, &target, managed_home, name)?;
        return Ok(());
    }
    if symlink_points_to(&target, &source) {
        clear_marker(managed_home, name)?;
        if !prefer_copy {
            return Ok(());
        }
        fs::remove_file(&target)?;
    }
    let owned_copy = copy_is_owned(&source, &target, managed_home, name);
    if path_exists(&target) && !owned_copy {
        return Ok(());
    }
    if owned_copy && source_metadata.is_file() && files_equal(&source, &target) {
        return Ok(());
    }
    if owned_copy {
        remove_path(&target)?;
    }
    if !prefer_copy && create_symlink(&source, &target, source_metadata.is_dir()).is_ok() {
        clear_marker(managed_home, name)?;
        return Ok(());
    }
    if let Err(error) = copy_path(&source, &target) {
        let _ = remove_path(&target);
        return Err(error);
    }
    write_marker(managed_home, name, &source)
}

fn create_symlink(source: &Path, target: &Path, is_directory: bool) -> std::io::Result<()> {
    let parent = target
        .parent()
        .ok_or_else(|| std::io::Error::other("resource target has no parent"))?;
    fs::create_dir_all(parent)?;
    #[cfg(unix)]
    {
        let _ = is_directory;
        std::os::unix::fs::symlink(source, target)
    }
    #[cfg(windows)]
    {
        if is_directory {
            std::os::windows::fs::symlink_dir(source, target)
        } else {
            std::os::windows::fs::symlink_file(source, target)
        }
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = (source, target, is_directory);
        Err(std::io::Error::other("symbolic links are unavailable"))
    }
}

fn copy_path(source: &Path, target: &Path) -> Result<(), CodexRuntimeError> {
    copy_path_inner(source, target, &mut HashSet::new())
}

fn copy_path_inner(
    source: &Path,
    target: &Path,
    active_directories: &mut HashSet<PathBuf>,
) -> Result<(), CodexRuntimeError> {
    let metadata = fs::metadata(source)?;
    if metadata.is_file() {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(source, target)?;
        return Ok(());
    }
    if !metadata.is_dir() {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    let canonical = fs::canonicalize(source)?;
    if !active_directories.insert(canonical.clone()) {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        copy_path_inner(
            &entry.path(),
            &target.join(entry.file_name()),
            active_directories,
        )?;
    }
    active_directories.remove(&canonical);
    Ok(())
}

fn remove_owned(
    source: &Path,
    target: &Path,
    managed_home: &Path,
    name: &str,
) -> Result<(), CodexRuntimeError> {
    if symlink_points_to(target, source) || copy_is_owned(source, target, managed_home, name) {
        remove_path(target)?;
        clear_marker(managed_home, name)?;
    }
    Ok(())
}

fn remove_path(path: &Path) -> Result<(), CodexRuntimeError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || metadata.is_file() => {
            fs::remove_file(path)?;
        }
        Ok(metadata) if metadata.is_dir() => fs::remove_dir_all(path)?,
        Ok(_) => return Err(CodexRuntimeError::InvalidConfig),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    Ok(())
}

fn symlink_points_to(target: &Path, source: &Path) -> bool {
    let Ok(metadata) = fs::symlink_metadata(target) else {
        return false;
    };
    if !metadata.file_type().is_symlink() {
        return false;
    }
    let Ok(link) = fs::read_link(target) else {
        return false;
    };
    let actual = if link.is_absolute() {
        link
    } else {
        target.parent().unwrap_or_else(|| Path::new("")).join(link)
    };
    paths_equal(&actual, source)
}

fn copy_is_owned(source: &Path, target: &Path, managed_home: &Path, name: &str) -> bool {
    if !path_exists(target)
        || fs::symlink_metadata(target).is_ok_and(|metadata| metadata.file_type().is_symlink())
    {
        return false;
    }
    let Ok(Value::Object(marker)) =
        managed_files::read_bounded(&marker_path(managed_home, name), MARKER_BYTE_LIMIT)
            .ok()
            .flatten()
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
            .ok_or(())
    else {
        return false;
    };
    marker
        .get("sourcePath")
        .and_then(Value::as_str)
        .is_some_and(|recorded| paths_equal(Path::new(recorded), source))
}

fn write_marker(managed_home: &Path, name: &str, source: &Path) -> Result<(), CodexRuntimeError> {
    let mut contents = serde_json::to_vec_pretty(&json!({ "sourcePath": source }))
        .map_err(|_| CodexRuntimeError::InvalidConfig)?;
    contents.push(b'\n');
    managed_files::write_private(&marker_path(managed_home, name), &contents)?;
    Ok(())
}

fn clear_marker(managed_home: &Path, name: &str) -> Result<(), CodexRuntimeError> {
    match fs::remove_file(marker_path(managed_home, name)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn marker_path(managed_home: &Path, name: &str) -> PathBuf {
    managed_home
        .join(".agentstart-resource-copies")
        .join(format!("{name}.json"))
}

fn path_exists(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}

fn files_equal(left: &Path, right: &Path) -> bool {
    managed_files::read_bounded_source(left, RESOURCE_COMPARE_BYTE_LIMIT)
        .ok()
        .flatten()
        .zip(
            managed_files::read_bounded(right, RESOURCE_COMPARE_BYTE_LIMIT)
                .ok()
                .flatten(),
        )
        .is_some_and(|(left, right)| left == right)
}

fn paths_equal(left: &Path, right: &Path) -> bool {
    let left = left.to_string_lossy().replace('\\', "/");
    let right = right.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        left.eq_ignore_ascii_case(&right)
    } else {
        left == right
    }
}
