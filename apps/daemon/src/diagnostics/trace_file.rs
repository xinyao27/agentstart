use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use crate::transport::secure_file;

pub(super) const TRACE_MAX_BYTES: u64 = 10 * 1024 * 1024;
pub(super) const TRACE_MAX_FILES: u8 = 10;

pub(super) fn trace_file_path(user_data_path: &Path) -> PathBuf {
    user_data_path.join("logs").join("daemon.trace.ndjson")
}

pub(super) struct TraceFileWriter {
    file: Option<File>,
    file_path: PathBuf,
    size: u64,
}

impl TraceFileWriter {
    pub(super) fn new(file_path: PathBuf) -> Self {
        Self {
            file: None,
            file_path,
            size: 0,
        }
    }

    pub(super) fn append(&mut self, line: &[u8]) {
        if line.len() as u64 > TRACE_MAX_BYTES {
            return;
        }
        if self.append_inner(line).is_err() {
            // Why: local diagnostics must never turn an app error into a daemon failure.
            self.file = None;
            self.size = 0;
        }
    }

    pub(super) fn flush(&mut self) {
        if let Some(file) = &mut self.file {
            let _ = file.flush();
        }
    }

    fn append_inner(&mut self, line: &[u8]) -> Result<(), io::Error> {
        self.open_if_needed()?;
        if let Some(file) = &self.file {
            self.size = file.metadata()?.len();
        }
        if self.size > 0 && self.size.saturating_add(line.len() as u64) > TRACE_MAX_BYTES {
            self.file = None;
            rotate(&self.file_path);
            self.size = 0;
            self.open_if_needed()?;
        }
        let Some(file) = &mut self.file else {
            return Ok(());
        };
        file.write_all(line)?;
        self.size = self.size.saturating_add(line.len() as u64);
        Ok(())
    }

    fn open_if_needed(&mut self) -> Result<(), io::Error> {
        if self.file.is_some() {
            return Ok(());
        }
        let directory = self.file_path.parent().ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidInput, "trace file has no directory")
        })?;
        secure_file::ensure_secure_directory(directory).map_err(io::Error::other)?;
        harden_existing_family(&self.file_path);

        let mut options = OpenOptions::new();
        options.append(true).create(true);
        configure_secure_append(&mut options);
        let file = options.open(&self.file_path)?;
        let metadata = file.metadata()?;
        if !is_regular_file(&metadata) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "trace target is not a regular file",
            ));
        }
        secure_file::harden_existing_file(&self.file_path).map_err(io::Error::other)?;
        self.size = metadata.len();
        self.file = Some(file);
        Ok(())
    }
}

pub(super) fn trace_family_paths(file_path: &Path) -> Vec<PathBuf> {
    (0..TRACE_MAX_FILES)
        .map(|index| trace_path(file_path, index))
        .collect()
}

fn trace_path(file_path: &Path, index: u8) -> PathBuf {
    if index == 0 {
        return file_path.to_owned();
    }
    let mut path = file_path.as_os_str().to_owned();
    path.push(format!(".{index}"));
    PathBuf::from(path)
}

fn rotate(file_path: &Path) {
    for index in (1..TRACE_MAX_FILES).rev() {
        let source = trace_path(file_path, index - 1);
        let destination = trace_path(file_path, index);
        if !fs::symlink_metadata(&source).is_ok_and(|metadata| is_regular_file(&metadata)) {
            continue;
        }
        match fs::symlink_metadata(&destination) {
            Ok(metadata) if metadata.file_type().is_dir() => continue,
            Ok(_) => {
                if fs::remove_file(&destination).is_err() {
                    continue;
                }
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(_) => continue,
        }
        let _ = fs::rename(source, destination);
    }
}

fn harden_existing_family(file_path: &Path) {
    for path in trace_family_paths(file_path) {
        if fs::symlink_metadata(&path).is_ok_and(|metadata| is_regular_file(&metadata)) {
            let _ = secure_file::harden_existing_file(&path);
        }
    }
}

#[cfg(unix)]
fn configure_secure_append(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt;

    options
        .mode(0o600)
        .custom_flags(nix::libc::O_NOFOLLOW | nix::libc::O_NONBLOCK);
}

#[cfg(unix)]
pub(super) fn configure_no_follow(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt;

    options.custom_flags(nix::libc::O_NOFOLLOW | nix::libc::O_NONBLOCK);
}

#[cfg(windows)]
fn configure_secure_append(options: &mut OpenOptions) {
    use std::os::windows::fs::OpenOptionsExt;

    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
}

#[cfg(windows)]
pub(super) fn configure_no_follow(options: &mut OpenOptions) {
    use std::os::windows::fs::OpenOptionsExt;

    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
}

#[cfg(not(any(unix, windows)))]
fn configure_secure_append(_options: &mut OpenOptions) {}

#[cfg(not(any(unix, windows)))]
pub(super) fn configure_no_follow(_options: &mut OpenOptions) {}

#[cfg(windows)]
pub(super) fn is_regular_file(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;

    metadata.file_type().is_file() && metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0
}

#[cfg(not(windows))]
pub(super) fn is_regular_file(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_file()
}
