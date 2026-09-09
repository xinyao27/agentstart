use std::io::{ErrorKind, SeekFrom};
use std::path::Path;

use tokio::fs::{self, File, OpenOptions};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};

use super::model::{
    HostDirectoryEntry, HostFileKind, HostFileStat, HostFilesystemError, HostRemoveOptions,
};

pub(super) async fn append(path: &str, content: &[u8]) -> Result<(), HostFilesystemError> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await
        .map_err(|error| HostFilesystemError::io("open for append", path, &error))?;
    file.write_all(content)
        .await
        .map_err(|error| HostFilesystemError::io("append", path, &error))
}

pub(super) async fn canonical_directory(path: &str) -> Result<String, HostFilesystemError> {
    let canonical = fs::canonicalize(path)
        .await
        .map_err(|error| HostFilesystemError::io("resolve", path, &error))?;
    let metadata = fs::metadata(&canonical)
        .await
        .map_err(|error| HostFilesystemError::io("inspect", path, &error))?;
    if !metadata.is_dir() {
        return Err(HostFilesystemError::new(
            super::model::HostFilesystemErrorKind::NotDirectory,
            "host_path_not_directory",
        ));
    }
    Ok(canonical.to_string_lossy().into_owned())
}

pub(super) async fn exists(path: &str) -> Result<bool, HostFilesystemError> {
    match fs::metadata(path).await {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[cfg(not(windows))]
pub(super) fn home_directory() -> Option<String> {
    std::env::var_os("HOME")
        .filter(|home| !home.is_empty())
        .map(|home| home.to_string_lossy().into_owned())
}

#[cfg(windows)]
pub(super) fn home_directory() -> Option<String> {
    std::env::var_os("USERPROFILE")
        .filter(|home| !home.is_empty())
        .or_else(|| {
            let mut home = std::env::var_os("HOMEDRIVE")?;
            home.push(std::env::var_os("HOMEPATH")?);
            Some(home)
        })
        .map(|home| home.to_string_lossy().into_owned())
}

pub(super) async fn mkdir(path: &str, recursive: bool) -> Result<(), HostFilesystemError> {
    let result = if recursive {
        fs::create_dir_all(path).await
    } else {
        fs::create_dir(path).await
    };
    result.map_err(|error| HostFilesystemError::io("create directory", path, &error))
}

pub(super) async fn read(
    path: &str,
    max_bytes: usize,
) -> Result<Option<Vec<u8>>, HostFilesystemError> {
    let file = match File::open(path).await {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(HostFilesystemError::io("open", path, &error)),
    };
    let limit = u64::try_from(max_bytes.saturating_add(1)).unwrap_or(u64::MAX);
    let mut content = Vec::new();
    file.take(limit)
        .read_to_end(&mut content)
        .await
        .map_err(|error| HostFilesystemError::io("read", path, &error))?;
    Ok((content.len() <= max_bytes).then_some(content))
}

pub(super) async fn read_range(
    path: &str,
    start: u64,
    max_bytes: usize,
) -> Result<Option<Vec<u8>>, HostFilesystemError> {
    let mut file = match File::open(path).await {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(HostFilesystemError::io("open", path, &error)),
    };
    if start > 0 {
        file.seek(SeekFrom::Start(start))
            .await
            .map_err(|error| HostFilesystemError::io("seek", path, &error))?;
    }
    let mut content = Vec::new();
    file.take(u64::try_from(max_bytes).unwrap_or(u64::MAX))
        .read_to_end(&mut content)
        .await
        .map_err(|error| HostFilesystemError::io("read", path, &error))?;
    Ok(Some(content))
}

pub(super) async fn read_prefix(
    path: &str,
    max_bytes: usize,
) -> Result<Option<Vec<u8>>, HostFilesystemError> {
    let file = match File::open(path).await {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(HostFilesystemError::io("open", path, &error)),
    };
    let limit = u64::try_from(max_bytes).unwrap_or(u64::MAX);
    let mut content = Vec::with_capacity(max_bytes);
    file.take(limit)
        .read_to_end(&mut content)
        .await
        .map_err(|error| HostFilesystemError::io("read", path, &error))?;
    Ok(Some(content))
}

pub(super) async fn read_dir(path: &str) -> Result<Vec<HostDirectoryEntry>, HostFilesystemError> {
    let mut entries = read_dir_raw(path).await?;
    entries.sort_unstable_by(|left, right| left.name.cmp(&right.name));
    Ok(entries)
}

pub(super) async fn read_dir_raw(
    path: &str,
) -> Result<Vec<HostDirectoryEntry>, HostFilesystemError> {
    let mut directory = fs::read_dir(path)
        .await
        .map_err(|error| HostFilesystemError::io("read directory", path, &error))?;
    let mut entries = Vec::new();
    while let Some(entry) = directory
        .next_entry()
        .await
        .map_err(|error| HostFilesystemError::io("read directory", path, &error))?
    {
        let file_type = entry
            .file_type()
            .await
            .map_err(|error| HostFilesystemError::io("inspect directory entry", path, &error))?;
        entries.push(HostDirectoryEntry {
            kind: kind_from_type(file_type),
            name: entry.file_name().to_string_lossy().into_owned(),
        });
    }
    Ok(entries)
}

pub(super) async fn remove(
    path: &str,
    options: HostRemoveOptions,
) -> Result<(), HostFilesystemError> {
    let metadata = match fs::symlink_metadata(path).await {
        Ok(metadata) => metadata,
        Err(error) if options.force && error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(HostFilesystemError::io("inspect", path, &error)),
    };
    let result = if metadata.is_dir() && options.recursive {
        fs::remove_dir_all(path).await
    } else if metadata.is_dir() {
        fs::remove_dir(path).await
    } else {
        fs::remove_file(path).await
    };
    match result {
        Ok(()) => Ok(()),
        Err(error) if options.force && error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(HostFilesystemError::io("remove", path, &error)),
    }
}

pub(super) async fn rename(from: &str, to: &str) -> Result<(), HostFilesystemError> {
    fs::rename(from, to)
        .await
        .map_err(|error| HostFilesystemError::io("rename", from, &error))
}

pub(super) async fn stat(path: &str) -> Result<Option<HostFileStat>, HostFilesystemError> {
    let metadata = match fs::symlink_metadata(path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(HostFilesystemError::io("inspect", path, &error)),
    };
    let kind = kind_from_type(metadata.file_type());
    Ok(Some(HostFileStat {
        kind,
        modified_at_ms: metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .and_then(|duration| i64::try_from(duration.as_millis()).ok()),
        size_bytes: if kind == HostFileKind::File {
            metadata.len()
        } else {
            0
        },
    }))
}

pub(super) async fn which(command: &str) -> Result<Option<String>, HostFilesystemError> {
    if command.is_empty() {
        return Ok(None);
    }
    if command.contains(std::path::MAIN_SEPARATOR) {
        return Ok(exists(command).await?.then(|| command.to_owned()));
    }
    let Some(paths) = std::env::var_os("PATH") else {
        return Ok(None);
    };
    for directory in std::env::split_paths(&paths) {
        for candidate in executable_candidates(&directory.join(command)) {
            if is_executable(&candidate).await? {
                return Ok(Some(candidate.to_string_lossy().into_owned()));
            }
        }
    }
    Ok(None)
}

pub(super) async fn write(path: &str, content: &[u8]) -> Result<(), HostFilesystemError> {
    fs::write(path, content)
        .await
        .map_err(|error| HostFilesystemError::io("write", path, &error))
}

fn kind_from_type(file_type: std::fs::FileType) -> HostFileKind {
    if file_type.is_dir() {
        HostFileKind::Directory
    } else if file_type.is_file() {
        HostFileKind::File
    } else if file_type.is_symlink() {
        HostFileKind::Symlink
    } else {
        HostFileKind::Other
    }
}

#[cfg(not(windows))]
fn executable_candidates(path: &Path) -> Vec<std::path::PathBuf> {
    vec![path.to_owned()]
}

#[cfg(windows)]
fn executable_candidates(path: &Path) -> Vec<std::path::PathBuf> {
    let extensions = std::env::var_os("PATHEXT").unwrap_or_else(|| ".COM;.EXE;.BAT;.CMD".into());
    std::iter::once(path.to_owned())
        .chain(
            extensions
                .to_string_lossy()
                .split(';')
                .filter(|extension| !extension.is_empty())
                .map(|extension| path.with_extension(extension.trim_start_matches('.'))),
        )
        .collect()
}

async fn is_executable(path: &Path) -> Result<bool, HostFilesystemError> {
    let metadata = match fs::metadata(path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(false),
        Err(_) => return Ok(false),
    };
    if !metadata.is_file() {
        return Ok(false);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        Ok(metadata.permissions().mode() & 0o111 != 0)
    }
    #[cfg(not(unix))]
    Ok(true)
}
