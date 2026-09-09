use std::fs::{self, File, OpenOptions};
use std::io::{self, Read};
use std::path::{Path, PathBuf};

use crate::external_paths::path_resolution;

use super::{ShellFileError, ShellFiles};

const MAX_FILE_BYTES: u64 = 25 * 1_024 * 1_024;
const MAX_TOTAL_BYTES: u64 = 100 * 1_024 * 1_024;

#[derive(Debug)]
pub(crate) struct StageExternalPathsResult {
    pub(crate) sources: Vec<StagedExternalImportSource>,
}

#[derive(Debug)]
pub(crate) enum StagedExternalImportSource {
    Staged {
        source_path: String,
        name: String,
        kind: StagedSourceKind,
        entries: Vec<StagedExternalImportEntry>,
    },
    Skipped {
        source_path: String,
        reason: ImportSkipReason,
    },
    Failed {
        source_path: String,
        reason: String,
    },
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum StagedSourceKind {
    Directory,
    File,
}

#[derive(Debug)]
pub(crate) enum StagedExternalImportEntry {
    Directory {
        relative_path: String,
    },
    File {
        relative_path: String,
        content: Vec<u8>,
    },
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum ImportSkipReason {
    Missing,
    PermissionDenied,
    Symlink,
    Unsupported,
}

enum Visit {
    Directory(PathBuf),
    Entry(PathBuf),
}

impl ShellFiles {
    pub(crate) async fn stage_external_paths(
        &self,
        source_paths: Vec<String>,
    ) -> Result<StageExternalPathsResult, ShellFileError> {
        let mut sources = Vec::with_capacity(source_paths.len());
        for source_path in source_paths {
            let resolved = path_resolution::resolve_absolute(&source_path)?;
            self.authority
                .authorize_external(&resolved.to_string_lossy())
                .await?;
            let task_source = source_path.clone();
            let source = tokio::task::spawn_blocking(move || stage_one(task_source, resolved))
                .await
                .map_err(|error| ShellFileError::Operation(error.to_string()))?;
            sources.push(source);
        }
        Ok(StageExternalPathsResult { sources })
    }
}

fn stage_one(source_path: String, resolved: PathBuf) -> StagedExternalImportSource {
    let metadata = match fs::symlink_metadata(&resolved) {
        Ok(metadata) => metadata,
        Err(error) => return source_metadata_failure(source_path, error),
    };
    if metadata.file_type().is_symlink() {
        return skipped(source_path, ImportSkipReason::Symlink);
    }
    let kind = if metadata.is_file() {
        StagedSourceKind::File
    } else if metadata.is_dir() {
        StagedSourceKind::Directory
    } else {
        return skipped(source_path, ImportSkipReason::Unsupported);
    };
    let result = match kind {
        StagedSourceKind::File => {
            stage_file(&resolved, Path::new(""), None).map(|(entry, _)| vec![entry])
        }
        StagedSourceKind::Directory => stage_directory(&resolved),
    };
    match result {
        Ok(entries) => StagedExternalImportSource::Staged {
            source_path,
            name: resolved
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default(),
            kind,
            entries,
        },
        Err(StageError::Symlink(_)) => skipped(source_path, ImportSkipReason::Symlink),
        Err(error) => StagedExternalImportSource::Failed {
            source_path,
            reason: error.to_string(),
        },
    }
}

fn stage_directory(root: &Path) -> Result<Vec<StagedExternalImportEntry>, StageError> {
    let root_real = fs::canonicalize(root)?;
    let mut entries = vec![StagedExternalImportEntry::Directory {
        relative_path: String::new(),
    }];
    let mut total_bytes = 0;
    let mut pending = vec![Visit::Directory(root.to_owned())];
    while let Some(visit) = pending.pop() {
        match visit {
            Visit::Directory(directory) => {
                assert_directory(root, &root_real, &directory)?;
                let children = fs::read_dir(&directory)?.collect::<Result<Vec<_>, _>>()?;
                for child in children.into_iter().rev() {
                    pending.push(Visit::Entry(child.path()));
                }
            }
            Visit::Entry(path) => {
                let relative = path.strip_prefix(root).map_err(|_| {
                    StageError::Changed(format!(
                        "Path escaped upload root during staging: '{}'",
                        display_path(&path)
                    ))
                })?;
                let metadata = fs::symlink_metadata(&path)?;
                if metadata.file_type().is_symlink() {
                    return Err(StageError::Symlink(normalize_relative(relative)));
                }
                if metadata.is_dir() {
                    entries.push(StagedExternalImportEntry::Directory {
                        relative_path: normalize_relative(relative),
                    });
                    pending.push(Visit::Directory(path));
                } else if metadata.is_file() {
                    let (entry, bytes) =
                        stage_file(&path, relative, Some((&root_real, total_bytes)))?;
                    total_bytes += bytes;
                    entries.push(entry);
                } else {
                    return Err(StageError::Unsupported(normalize_relative(relative)));
                }
            }
        }
    }
    Ok(entries)
}

fn assert_directory(root: &Path, root_real: &Path, directory: &Path) -> Result<(), StageError> {
    let metadata = fs::symlink_metadata(directory)?;
    let relative = directory.strip_prefix(root).unwrap_or(directory);
    if metadata.file_type().is_symlink() {
        return Err(StageError::Symlink(normalize_relative(relative)));
    }
    if !metadata.is_dir() {
        return Err(StageError::Unsupported(normalize_relative(relative)));
    }
    assert_real_inside(root_real, directory, relative)
}

fn stage_file(
    path: &Path,
    relative: &Path,
    directory: Option<(&Path, u64)>,
) -> Result<(StagedExternalImportEntry, u64), StageError> {
    let metadata = fs::symlink_metadata(path)?;
    let display = normalize_relative(relative);
    if metadata.file_type().is_symlink() {
        return Err(StageError::Symlink(display));
    }
    if !metadata.is_file() {
        return Err(StageError::Unsupported(display));
    }
    if let Some((root_real, _)) = directory {
        assert_real_inside(root_real, path, relative)?;
    }
    let before_total = directory.map_or(metadata.len(), |(_, total)| total + metadata.len());
    assert_budget(relative, metadata.len(), before_total)?;
    let mut file = open_without_following(path)?;
    let opened = file.metadata()?;
    if !opened.is_file() || file_identity_changed(&metadata, &opened) {
        return Err(StageError::Changed(format!(
            "File changed during upload staging: '{display}'"
        )));
    }
    let opened_total = directory.map_or(opened.len(), |(_, total)| total + opened.len());
    assert_budget(relative, opened.len(), opened_total)?;
    let mut bytes = Vec::with_capacity(usize::try_from(opened.len()).unwrap_or(0));
    file.read_to_end(&mut bytes)?;
    if file.metadata()?.len() != opened.len() {
        return Err(StageError::Changed(format!(
            "File changed during upload staging: '{display}'"
        )));
    }
    Ok((
        StagedExternalImportEntry::File {
            relative_path: display,
            content: bytes,
        },
        opened.len(),
    ))
}

fn open_without_following(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(nix::libc::O_NOFOLLOW);
    }
    options.open(path)
}

#[cfg(unix)]
fn file_identity_changed(before: &fs::Metadata, opened: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    before.len() != opened.len()
        || before.ino() != 0 && opened.ino() != 0 && before.ino() != opened.ino()
        || before.dev() != 0 && opened.dev() != 0 && before.dev() != opened.dev()
}

#[cfg(not(unix))]
fn file_identity_changed(before: &fs::Metadata, opened: &fs::Metadata) -> bool {
    before.len() != opened.len()
}

fn assert_real_inside(root_real: &Path, path: &Path, relative: &Path) -> Result<(), StageError> {
    let candidate = fs::canonicalize(path)?;
    if path_inside_or_equal(&candidate, root_real) {
        Ok(())
    } else {
        Err(StageError::Changed(format!(
            "Path escaped upload root during staging: '{}'",
            normalize_relative(relative)
        )))
    }
}

#[cfg(not(windows))]
fn path_inside_or_equal(candidate: &Path, root: &Path) -> bool {
    candidate.starts_with(root)
}

#[cfg(windows)]
fn path_inside_or_equal(candidate: &Path, root: &Path) -> bool {
    let candidate = candidate
        .components()
        .map(|part| part.as_os_str().to_string_lossy().to_lowercase())
        .collect::<Vec<_>>();
    let root = root
        .components()
        .map(|part| part.as_os_str().to_string_lossy().to_lowercase())
        .collect::<Vec<_>>();
    candidate.len() >= root.len()
        && candidate
            .iter()
            .zip(root)
            .all(|(left, right)| left == &right)
}

fn assert_budget(relative: &Path, file_bytes: u64, total_bytes: u64) -> Result<(), StageError> {
    if file_bytes > MAX_FILE_BYTES {
        return Err(StageError::Budget(format!(
            "'{}' is too large for remote import",
            normalize_relative(relative)
        )));
    }
    if total_bytes > MAX_TOTAL_BYTES {
        return Err(StageError::Budget("Remote import is too large".to_owned()));
    }
    Ok(())
}

fn source_metadata_failure(source_path: String, error: io::Error) -> StagedExternalImportSource {
    match error.kind() {
        io::ErrorKind::NotFound => skipped(source_path, ImportSkipReason::Missing),
        io::ErrorKind::PermissionDenied => skipped(source_path, ImportSkipReason::PermissionDenied),
        _ => StagedExternalImportSource::Failed {
            source_path,
            reason: error.to_string(),
        },
    }
}

fn skipped(source_path: String, reason: ImportSkipReason) -> StagedExternalImportSource {
    StagedExternalImportSource::Skipped {
        source_path,
        reason,
    }
}

fn normalize_relative(path: &Path) -> String {
    path.to_string_lossy()
        .replace(['\\', '/'], "/")
        .trim_start_matches('/')
        .to_owned()
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[derive(Debug, thiserror::Error)]
enum StageError {
    #[error("{0}")]
    Budget(String),
    #[error("{0}")]
    Changed(String),
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error("Symlink not allowed in '{0}'")]
    Symlink(String),
    #[error("Unsupported file type in '{0}'")]
    Unsupported(String),
}
