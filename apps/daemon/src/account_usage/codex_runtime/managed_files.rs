use std::fs;
use std::io::{Read as _, Seek as _, Write as _};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::transport::secure_file;

use super::{CodexRuntimeError, valid_wsl_distro};

static USER_CONFIG_WRITE_LOCK: Mutex<()> = Mutex::new(());

pub(super) struct ExistingFile {
    pub(super) file: fs::File,
    pub(super) handle: same_file::Handle,
    pub(super) metadata: fs::Metadata,
}

pub(super) struct PreservingFileSnapshot {
    contents: Vec<u8>,
    original: Option<ExistingFile>,
    path: PathBuf,
    #[cfg(windows)]
    security_generation: Option<String>,
}

impl PreservingFileSnapshot {
    pub(super) fn contents(&self) -> &[u8] {
        &self.contents
    }
}

pub(super) fn read_bounded(
    path: &Path,
    maximum_bytes: u64,
) -> Result<Option<Vec<u8>>, CodexRuntimeError> {
    read_bounded_path(path, maximum_bytes)
}

pub(super) fn read_bounded_source(
    path: &Path,
    maximum_bytes: u64,
) -> Result<Option<Vec<u8>>, CodexRuntimeError> {
    let resolved = match fs::canonicalize(path) {
        Ok(resolved) => resolved,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    read_bounded_path(&resolved, maximum_bytes)
}

pub(super) fn read_preserving_snapshot(
    path: PathBuf,
    maximum_bytes: u64,
) -> Result<PreservingFileSnapshot, CodexRuntimeError> {
    let mut original = open_existing(&path)?;
    #[cfg(windows)]
    if let Some(original) = original.as_ref()
        && wsl_location(&path).is_none()
    {
        super::file_metadata::verify_windows_single_link(&path, &original.handle)?;
    }
    let contents = match original.as_mut() {
        Some(original) => {
            if original.metadata.len() > maximum_bytes {
                return Err(CodexRuntimeError::InvalidConfig);
            }
            let before = original.file.metadata()?;
            if !metadata_generation_matches(&original.metadata, &before) {
                return Err(CodexRuntimeError::InvalidConfig);
            }
            original.file.seek(std::io::SeekFrom::Start(0))?;
            let mut contents = Vec::with_capacity(usize::try_from(before.len()).unwrap_or(0));
            std::io::Read::by_ref(&mut original.file)
                .take(maximum_bytes.saturating_add(1))
                .read_to_end(&mut contents)?;
            original.file.seek(std::io::SeekFrom::Start(0))?;
            let after = original.file.metadata()?;
            if contents.len() as u64 > maximum_bytes
                || contents.len() as u64 != before.len()
                || !metadata_generation_matches(&before, &after)
            {
                return Err(CodexRuntimeError::InvalidConfig);
            }
            contents
        }
        None => Vec::new(),
    };
    #[cfg(windows)]
    let security_generation = if wsl_location(&path).is_some() {
        None
    } else {
        original
            .as_ref()
            .map(|original| {
                super::file_metadata::windows_security_generation(&path, &original.handle)
            })
            .transpose()?
    };
    Ok(PreservingFileSnapshot {
        contents,
        original,
        path,
        #[cfg(windows)]
        security_generation,
    })
}

fn read_bounded_path(
    path: &Path,
    maximum_bytes: u64,
) -> Result<Option<Vec<u8>>, CodexRuntimeError> {
    let mut options = fs::OpenOptions::new();
    options.read(true);
    configure_no_follow(&mut options);
    let mut file = match options.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) if is_symlink_error(&error) => return Err(CodexRuntimeError::InvalidConfig),
        Err(error) => return Err(error.into()),
    };
    let opened = file.metadata()?;
    if !is_regular_nofollow(&opened) || opened.len() > maximum_bytes {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    let mut contents = Vec::with_capacity(usize::try_from(opened.len()).unwrap_or(0));
    std::io::Read::by_ref(&mut file)
        .take(maximum_bytes.saturating_add(1))
        .read_to_end(&mut contents)?;
    let after = file.metadata()?;
    if contents.len() as u64 > maximum_bytes
        || !is_regular_nofollow(&after)
        || !metadata_generation_matches(&opened, &after)
    {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    Ok(Some(contents))
}

#[cfg(unix)]
fn configure_no_follow(options: &mut fs::OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt as _;

    options.custom_flags(nix::libc::O_NOFOLLOW | nix::libc::O_NONBLOCK);
}

#[cfg(windows)]
fn configure_no_follow(options: &mut fs::OpenOptions) {
    use std::os::windows::fs::OpenOptionsExt as _;

    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
}

#[cfg(not(any(unix, windows)))]
fn configure_no_follow(_options: &mut fs::OpenOptions) {}

#[cfg(unix)]
fn is_symlink_error(error: &std::io::Error) -> bool {
    error.raw_os_error() == Some(nix::libc::ELOOP)
}

#[cfg(not(unix))]
fn is_symlink_error(_error: &std::io::Error) -> bool {
    false
}

fn is_regular_nofollow(metadata: &fs::Metadata) -> bool {
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return false;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt as _;

        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return false;
        }
    }
    true
}

pub(super) fn ensure_private_directory(path: &Path) -> Result<(), CodexRuntimeError> {
    let Some((distro, linux_path)) = wsl_location(path) else {
        secure_file::ensure_secure_directory(path)?;
        return Ok(());
    };
    fs::create_dir_all(path)?;
    harden_wsl(&distro, &linux_path, true)
}

pub(super) fn write_private(path: &Path, contents: &[u8]) -> Result<(), CodexRuntimeError> {
    if wsl_location(path).is_none() {
        secure_file::write_bytes(path, contents)?;
        return Ok(());
    }
    let parent = path.parent().ok_or(CodexRuntimeError::InvalidManagedHome)?;
    fs::create_dir_all(parent)?;
    let temporary = temporary_path(path)?;
    let result = (|| {
        create_private_wsl_file(&temporary)?;
        let mut file = open_temporary(&temporary)?;
        file.write_all(contents)?;
        file.sync_all()?;
        drop(file);
        crate::atomic_file_replace::replace(&temporary, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

pub(super) fn harden_private_file(path: &Path) -> Result<(), CodexRuntimeError> {
    if let Some((distro, linux_path)) = wsl_location(path) {
        harden_wsl(&distro, &linux_path, false)
    } else {
        secure_file::harden_existing_file(path)?;
        Ok(())
    }
}

pub(super) fn write_preserving_file(
    snapshot: PreservingFileSnapshot,
    contents: &[u8],
) -> Result<(), CodexRuntimeError> {
    let _guard = USER_CONFIG_WRITE_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let PreservingFileSnapshot {
        contents: expected_contents,
        mut original,
        path,
        #[cfg(windows)]
        security_generation,
    } = snapshot;
    #[cfg(windows)]
    let expected_security_generation = security_generation.as_deref();
    #[cfg(not(windows))]
    let expected_security_generation = None;
    verify_destination(&path, original.as_ref().map(|file| &file.handle))?;
    #[cfg(windows)]
    verify_windows_security_snapshot(&path, original.as_ref(), security_generation.as_deref())?;
    verify_expected_contents(original.as_mut(), &expected_contents)?;
    let temporary = temporary_path(&path)?;
    let mut staged_handle: Option<same_file::Handle> = None;
    let result = (|| {
        let is_wsl = wsl_location(&path).is_some();
        let mut file = if is_wsl {
            create_private_wsl_file(&temporary)?;
            open_temporary(&temporary)?
        } else {
            create_temporary(&temporary)?
        };
        staged_handle = Some(same_file::Handle::from_file(file.try_clone()?)?);
        let temporary_handle = staged_handle
            .as_ref()
            .ok_or(CodexRuntimeError::InvalidConfig)?;
        if !is_wsl && let Some(original) = original.as_ref() {
            super::file_metadata::prepare_local(&path, &temporary, &file, original)?;
        }
        // Why: only the primary data stream is new. Metadata sidecars remain attached, while mtime
        // deliberately advances so Codex and filesystem watchers observe the promoted contents.
        file.set_len(0)?;
        file.seek(std::io::SeekFrom::Start(0))?;
        file.write_all(contents)?;
        if let Some(original) = original.as_ref() {
            if is_wsl {
                super::file_metadata::preserve_wsl(&path, &temporary)?;
            } else {
                super::file_metadata::finish_local(&path, &temporary, &file, original)?;
            }
        }
        verify_file_contents(&mut file, contents)?;
        file.sync_all()?;
        verify_destination(&temporary, Some(temporary_handle))?;
        drop(file);
        verify_expected_contents(original.as_mut(), &expected_contents)?;
        verify_destination(&path, original.as_ref().map(|file| &file.handle))?;
        #[cfg(windows)]
        verify_windows_security_snapshot(&path, original.as_ref(), security_generation.as_deref())?;
        let temporary_handle = staged_handle
            .take()
            .ok_or(CodexRuntimeError::InvalidConfig)?;
        commit_temporary(
            &temporary,
            &path,
            temporary_handle,
            original.take(),
            &expected_contents,
            contents,
            expected_security_generation,
        )?;
        sync_parent(&path)?;
        Ok(())
    })();
    // Why: a failed atomic exchange can leave either the staged inode or the displaced user file
    // at the temporary pathname. There is no portable conditional unlink, so failure preserves
    // the private random file for recovery instead of risking deletion after a path race.
    result
}

#[cfg(windows)]
fn verify_windows_security_snapshot(
    path: &Path,
    original: Option<&ExistingFile>,
    expected: Option<&str>,
) -> Result<(), CodexRuntimeError> {
    if wsl_location(path).is_some() {
        return Ok(());
    }
    match (original, expected) {
        (None, None) => Ok(()),
        (Some(original), Some(expected))
            if {
                super::file_metadata::verify_windows_single_link(path, &original.handle)?;
                super::file_metadata::windows_security_generation(path, &original.handle)?
                    == expected
            } =>
        {
            Ok(())
        }
        _ => Err(CodexRuntimeError::InvalidConfig),
    }
}

fn open_existing(path: &Path) -> Result<Option<ExistingFile>, CodexRuntimeError> {
    let mut options = fs::OpenOptions::new();
    // Why: replacement must not bypass a file ACL or immutable/append policy that would have
    // rejected the prior in-place update, so merely being able to rename in the parent is not
    // sufficient authority to promote a new config.
    options.read(true).write(true);
    configure_no_follow(&mut options);
    let file = match options.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) if is_symlink_error(&error) => {
            return Err(CodexRuntimeError::InvalidConfig);
        }
        Err(error) => return Err(error.into()),
    };
    let metadata = file.metadata()?;
    if !is_regular_nofollow(&metadata) || !has_single_link(&metadata) {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    let handle = same_file::Handle::from_file(file.try_clone()?)?;
    Ok(Some(ExistingFile {
        file,
        handle,
        metadata,
    }))
}

fn verify_expected_contents(
    original: Option<&mut ExistingFile>,
    expected: &[u8],
) -> Result<(), CodexRuntimeError> {
    let Some(original) = original else {
        return if expected.is_empty() {
            Ok(())
        } else {
            Err(CodexRuntimeError::InvalidConfig)
        };
    };
    let before = original.file.metadata()?;
    if !metadata_generation_matches(&original.metadata, &before)
        || before.len() != expected.len() as u64
    {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    verify_file_contents(&mut original.file, expected)?;
    let after = original.file.metadata()?;
    if !metadata_generation_matches(&before, &after) {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    Ok(())
}

fn verify_file_contents(file: &mut fs::File, expected: &[u8]) -> Result<(), CodexRuntimeError> {
    file.seek(std::io::SeekFrom::Start(0))?;
    let mut current = Vec::with_capacity(expected.len());
    std::io::Read::by_ref(file)
        .take((expected.len() as u64).saturating_add(1))
        .read_to_end(&mut current)?;
    file.seek(std::io::SeekFrom::Start(0))?;
    if current == expected {
        Ok(())
    } else {
        Err(CodexRuntimeError::InvalidConfig)
    }
}

fn metadata_generation_matches(expected: &fs::Metadata, current: &fs::Metadata) -> bool {
    if expected.len() != current.len()
        || expected
            .modified()
            .ok()
            .zip(current.modified().ok())
            .is_none_or(|(expected, current)| expected != current)
    {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt as _;

        expected.dev() == current.dev()
            && expected.ino() == current.ino()
            && expected.uid() == current.uid()
            && expected.gid() == current.gid()
            && expected.mode() == current.mode()
            && expected.ctime() == current.ctime()
            && expected.ctime_nsec() == current.ctime_nsec()
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt as _;

        expected.creation_time() == current.creation_time()
            && expected.last_write_time() == current.last_write_time()
            && expected.file_size() == current.file_size()
            && expected.file_attributes() == current.file_attributes()
    }
    #[cfg(not(any(unix, windows)))]
    {
        expected.permissions().readonly() == current.permissions().readonly()
    }
}

#[cfg(unix)]
fn has_single_link(metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt as _;

    metadata.nlink() == 1
}

#[cfg(not(unix))]
fn has_single_link(_metadata: &fs::Metadata) -> bool {
    true
}

pub(super) fn verify_destination(
    path: &Path,
    expected: Option<&same_file::Handle>,
) -> Result<(), CodexRuntimeError> {
    let current = open_existing(path)?;
    if current.as_ref().map(|file| &file.handle) != expected {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    Ok(())
}

#[cfg(not(windows))]
fn create_temporary(path: &Path) -> Result<fs::File, CodexRuntimeError> {
    let mut options = fs::OpenOptions::new();
    options.read(true).write(true).create_new(true);
    configure_no_follow(&mut options);
    configure_private_create(&mut options);
    let file = options.open(path)?;
    secure_file::harden_existing_file(path)?;
    let handle = same_file::Handle::from_file(file.try_clone()?)?;
    verify_destination(path, Some(&handle))?;
    Ok(file)
}

#[cfg(windows)]
fn create_temporary(path: &Path) -> Result<fs::File, CodexRuntimeError> {
    super::file_metadata::create_private_windows_file(path)?;
    let file = open_temporary(path)?;
    let handle = same_file::Handle::from_file(file.try_clone()?)?;
    super::file_metadata::verify_windows_single_link(path, &handle)?;
    verify_destination(path, Some(&handle))?;
    Ok(file)
}

fn open_temporary(path: &Path) -> Result<fs::File, CodexRuntimeError> {
    let mut options = fs::OpenOptions::new();
    options.read(true).write(true);
    configure_no_follow(&mut options);
    #[cfg(windows)]
    if wsl_location(path).is_none() {
        configure_temporary_share(&mut options);
    }
    let file = options.open(path)?;
    let metadata = file.metadata()?;
    if !is_regular_nofollow(&metadata) {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    Ok(file)
}

#[cfg(windows)]
fn configure_temporary_share(options: &mut fs::OpenOptions) {
    use std::os::windows::fs::OpenOptionsExt as _;

    const FILE_SHARE_READ: u32 = 0x0000_0001;
    const FILE_SHARE_WRITE: u32 = 0x0000_0002;
    // Why: deny rename/delete while Rust writes and copies metadata into the staging inode. The
    // handle is deliberately dropped immediately before the atomic exchange needs delete access.
    options.share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE);
}

#[cfg(windows)]
struct WindowsFileGeneration {
    file_id: String,
    security: String,
}

#[cfg(windows)]
fn capture_windows_generation(
    path: &Path,
    handle: &same_file::Handle,
    expected_security: Option<&str>,
) -> Result<WindowsFileGeneration, CodexRuntimeError> {
    super::file_metadata::verify_windows_single_link(path, handle)?;
    let file_id = super::file_metadata::windows_file_id(path, handle)?;
    let security = super::file_metadata::windows_security_generation(path, handle)?;
    if expected_security.is_some_and(|expected| expected != security.as_str()) {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    Ok(WindowsFileGeneration { file_id, security })
}

#[cfg(windows)]
fn verify_windows_generation(
    path: &Path,
    expected: &WindowsFileGeneration,
    contents: &[u8],
) -> Result<(), CodexRuntimeError> {
    let mut current = open_existing(path)?.ok_or(CodexRuntimeError::InvalidConfig)?;
    super::file_metadata::verify_windows_single_link(path, &current.handle)?;
    if super::file_metadata::windows_file_id(path, &current.handle)? != expected.file_id {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    verify_file_contents(&mut current.file, contents)?;
    if super::file_metadata::windows_security_generation(path, &current.handle)?
        != expected.security
    {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    Ok(())
}

fn commit_temporary(
    temporary: &Path,
    path: &Path,
    staged_handle: same_file::Handle,
    mut original: Option<ExistingFile>,
    expected_contents: &[u8],
    staged_contents: &[u8],
    expected_security_generation: Option<&str>,
) -> Result<(), CodexRuntimeError> {
    let Some(original_file) = original.as_mut() else {
        #[cfg(windows)]
        if wsl_location(path).is_none() {
            let staged_generation = capture_windows_generation(temporary, &staged_handle, None)?;
            drop(staged_handle);
            publish_new(temporary, path)?;
            return verify_windows_generation(path, &staged_generation, staged_contents);
        }
        publish_new(temporary, path)?;
        return Ok(());
    };
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        let _ = (staged_contents, expected_security_generation);
        use rustix::fs::{CWD, RenameFlags, renameat_with};

        // Why: EXCHANGE is the only local-filesystem operation that both publishes the staged
        // inode and retains the exact displaced destination for a post-swap identity/generation
        // check. A path replacement in the last pre-commit instruction window is therefore
        // detected instead of being silently destroyed by an unconditional rename.
        renameat_with(CWD, temporary, CWD, path, RenameFlags::EXCHANGE)
            .map_err(std::io::Error::from)?;
        let displaced_is_expected = verify_destination(temporary, Some(&original_file.handle))
            .and_then(|()| verify_expected_contents(Some(original_file), expected_contents))
            .and_then(|()| verify_destination(path, Some(&staged_handle)))
            .is_ok();
        if displaced_is_expected {
            fs::remove_file(temporary)?;
            return Ok(());
        }
        verify_destination(path, Some(&staged_handle))?;
        verify_destination(temporary, Some(&original_file.handle))?;
        renameat_with(CWD, path, CWD, temporary, RenameFlags::EXCHANGE)
            .map_err(std::io::Error::from)?;
        verify_destination(path, Some(&original_file.handle))?;
        verify_destination(temporary, Some(&staged_handle))?;
        Err(CodexRuntimeError::InvalidConfig)
    }
    #[cfg(windows)]
    {
        if wsl_location(path).is_some() {
            let _ = expected_security_generation;
            exchange_wsl_files(temporary, path)?;
            let displaced_is_expected = verify_destination(temporary, Some(&original_file.handle))
                .and_then(|()| {
                    verify_expected_contents(Some(&mut *original_file), expected_contents)
                })
                .and_then(|()| verify_destination(path, Some(&staged_handle)))
                .is_ok();
            if displaced_is_expected {
                fs::remove_file(temporary)?;
                return Ok(());
            }
            verify_destination(path, Some(&staged_handle))?;
            verify_destination(temporary, Some(&original_file.handle))?;
            exchange_wsl_files(path, temporary)?;
            verify_destination(path, Some(&original_file.handle))?;
            verify_destination(temporary, Some(&staged_handle))?;
            return Err(CodexRuntimeError::InvalidConfig);
        }
        let staged_generation =
            capture_windows_generation(temporary, &staged_handle, expected_security_generation)?;
        let original_generation =
            capture_windows_generation(path, &original_file.handle, expected_security_generation)?;
        // Why: ReplaceFileW deliberately opens its replacement source without sharing. All Rust
        // handles must be closed after their immutable identity/security tokens are captured, or
        // the daemon blocks its own atomic commit with a sharing violation.
        drop(staged_handle);
        drop(original.take());
        let backup = temporary_path(path)?;
        let exchange_result =
            super::file_metadata::exchange_windows_files(temporary, path, &backup);
        if exchange_result.is_err() {
            let is_effectively_committed =
                verify_windows_generation(path, &staged_generation, staged_contents).is_ok()
                    && verify_windows_generation(&backup, &original_generation, expected_contents)
                        .is_ok();
            if !is_effectively_committed {
                let can_restore_displaced = verify_destination(path, None).is_ok()
                    && verify_windows_generation(temporary, &staged_generation, staged_contents)
                        .is_ok()
                    && verify_windows_generation(&backup, &original_generation, expected_contents)
                        .is_ok();
                if can_restore_displaced {
                    fs::rename(&backup, path)?;
                    verify_windows_generation(path, &original_generation, expected_contents)?;
                }
                return Err(CodexRuntimeError::InvalidConfig);
            }
        }
        let displaced_is_expected =
            verify_windows_generation(&backup, &original_generation, expected_contents)
                .and_then(|()| verify_windows_generation(path, &staged_generation, staged_contents))
                .is_ok();
        if displaced_is_expected {
            fs::remove_file(backup)?;
            return Ok(());
        }
        let rollback = temporary_path(path)?;
        verify_windows_generation(path, &staged_generation, staged_contents)?;
        verify_windows_generation(&backup, &original_generation, expected_contents)?;
        let rollback_result =
            super::file_metadata::exchange_windows_files(&backup, path, &rollback);
        let restored = verify_windows_generation(path, &original_generation, expected_contents)
            .is_ok()
            && verify_windows_generation(&rollback, &staged_generation, staged_contents).is_ok();
        if !restored
            && rollback_result.is_err()
            && verify_destination(path, None).is_ok()
            && verify_windows_generation(&backup, &original_generation, expected_contents).is_ok()
        {
            fs::rename(&backup, path)?;
            verify_windows_generation(path, &original_generation, expected_contents)?;
        }
        // Why: rollback artifacts are retained on every error path. Removing a verified pathname
        // is not an identity-conditional operation and could delete a file swapped in afterward.
        Err(CodexRuntimeError::InvalidConfig)
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
    {
        let _ = (
            &staged_handle,
            expected_contents,
            staged_contents,
            expected_security_generation,
        );
        crate::atomic_file_replace::replace(temporary, path)?;
        Ok(())
    }
}

#[cfg(windows)]
fn exchange_wsl_files(first: &Path, second: &Path) -> Result<(), CodexRuntimeError> {
    let (first_distro, first_path) =
        wsl_location(first).ok_or(CodexRuntimeError::InvalidManagedHome)?;
    let (second_distro, second_path) =
        wsl_location(second).ok_or(CodexRuntimeError::InvalidManagedHome)?;
    if first_distro != second_distro {
        return Err(CodexRuntimeError::InvalidManagedHome);
    }
    run_wsl(
        &first_distro,
        &[
            "sh",
            "-c",
            WSL_EXCHANGE_SCRIPT,
            "agentstart-codex-exchange",
            &first_path,
            &second_path,
        ],
    )
}

#[cfg(windows)]
const WSL_EXCHANGE_SCRIPT: &str = r#"set -eu
first=$1
second=$2
[ -f "$first" ] && [ ! -L "$first" ]
[ -f "$second" ] && [ ! -L "$second" ]
stat=/usr/bin/stat; [ -x "$stat" ] || stat=/bin/stat; [ -x "$stat" ]
first_identity=$("$stat" -c '%d:%i' -- "$first")
second_identity=$("$stat" -c '%d:%i' -- "$second")
[ "$("$stat" -c '%h' -- "$first")" = 1 ]
[ "$("$stat" -c '%h' -- "$second")" = 1 ]
mv=/usr/bin/mv; [ -x "$mv" ] || mv=/bin/mv
mv_help=
if [ -x "$mv" ]; then mv_help=$("$mv" --help 2>/dev/null || :); fi
case "$mv_help" in
  *--exchange*) "$mv" --exchange --no-copy -- "$first" "$second";;
  *)
    python=/usr/bin/python3; [ -x "$python" ] || python=/bin/python3; [ -x "$python" ]
    "$python" - "$first" "$second" <<'PY'
import ctypes
import os
import sys

libc = ctypes.CDLL(None, use_errno=True)
renameat2 = libc.renameat2
renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
renameat2.restype = ctypes.c_int
if renameat2(-100, os.fsencode(sys.argv[1]), -100, os.fsencode(sys.argv[2]), 2) != 0:
    error = ctypes.get_errno()
    raise OSError(error, os.strerror(error))
PY
  ;;
esac
[ "$("$stat" -c '%d:%i' -- "$first")" = "$second_identity" ]
[ "$("$stat" -c '%d:%i' -- "$second")" = "$first_identity" ]
"#;

#[cfg(unix)]
fn publish_new(temporary: &Path, path: &Path) -> std::io::Result<()> {
    use rustix::fs::{CWD, RenameFlags, renameat_with};

    renameat_with(CWD, temporary, CWD, path, RenameFlags::NOREPLACE).map_err(std::io::Error::from)
}

#[cfg(not(unix))]
fn publish_new(temporary: &Path, path: &Path) -> std::io::Result<()> {
    fs::rename(temporary, path)
}

#[cfg(unix)]
fn sync_parent(path: &Path) -> Result<(), CodexRuntimeError> {
    let parent = path.parent().ok_or(CodexRuntimeError::InvalidConfig)?;
    fs::File::open(parent)?.sync_all()?;
    Ok(())
}

#[cfg(not(unix))]
fn sync_parent(_path: &Path) -> Result<(), CodexRuntimeError> {
    Ok(())
}

fn create_private_wsl_file(path: &Path) -> Result<(), CodexRuntimeError> {
    let (distro, linux_path) = wsl_location(path).ok_or(CodexRuntimeError::InvalidManagedHome)?;
    run_wsl(
        &distro,
        &[
            "sh",
            "-c",
            WSL_PRIVATE_CREATE_SCRIPT,
            "agentstart-codex-config",
            &linux_path,
        ],
    )
}

const WSL_PRIVATE_CREATE_SCRIPT: &str = r#"set -eu
path=$1
umask 077
(set -C; : > "$path") 2>/dev/null
stat=/usr/bin/stat; [ -x "$stat" ] || stat=/bin/stat; [ -x "$stat" ]
identity=$("$stat" -c '%d:%i' -- "$path")
exec 3<> "$path"
[ "$("$stat" -Lc '%d:%i' -- /proc/self/fd/3)" = "$identity" ]
[ "$("$stat" -Lc '%h:%a' -- /proc/self/fd/3)" = '1:600' ]
[ "$("$stat" -c '%d:%i' -- "$path")" = "$identity" ]
"#;

#[cfg(unix)]
fn configure_private_create(options: &mut fs::OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt as _;

    options.mode(0o600);
}

#[cfg(not(any(unix, windows)))]
fn configure_private_create(_options: &mut fs::OpenOptions) {}

fn temporary_path(path: &Path) -> Result<PathBuf, CodexRuntimeError> {
    let file = path
        .file_name()
        .ok_or(CodexRuntimeError::InvalidManagedHome)?
        .to_string_lossy();
    let mut random = [0_u8; 16];
    getrandom::fill(&mut random)
        .map_err(|error| std::io::Error::other(format!("OS random source failed: {error}")))?;
    Ok(path.with_file_name(format!(
        ".{file}.{}.{:x}.tmp",
        std::process::id(),
        u128::from_le_bytes(random)
    )))
}

pub(super) fn wsl_location(path: &Path) -> Option<(String, String)> {
    let normalized = path.to_string_lossy().replace('\\', "/");
    let rest = normalized
        .strip_prefix("//wsl.localhost/")
        .or_else(|| normalized.strip_prefix("//wsl$/"))?;
    let (distro, tail) = rest.split_once('/')?;
    (valid_wsl_distro(distro) && !tail.is_empty()).then(|| (distro.to_owned(), format!("/{tail}")))
}

fn harden_wsl(distro: &str, linux_path: &str, is_directory: bool) -> Result<(), CodexRuntimeError> {
    let mode = if is_directory { "700" } else { "600" };
    let kind = if is_directory { "directory" } else { "file" };
    run_wsl(
        distro,
        &[
            "sh",
            "-c",
            WSL_HARDEN_SCRIPT,
            "agentstart-codex-permissions",
            linux_path,
            mode,
            kind,
        ],
    )
}

const WSL_HARDEN_SCRIPT: &str = r#"set -eu
path=$1
mode=$2
kind=$3
stat=/usr/bin/stat; [ -x "$stat" ] || stat=/bin/stat; [ -x "$stat" ]
chmod=/usr/bin/chmod; [ -x "$chmod" ] || chmod=/bin/chmod; [ -x "$chmod" ]
case "$kind" in
  directory) [ -d "$path" ] && [ ! -L "$path" ]; exec 3< "$path";;
  file) [ -f "$path" ] && [ ! -L "$path" ]; exec 3<> "$path";;
  *) exit 2;;
esac
identity=$("$stat" -c '%d:%i' -- "$path")
[ "$("$stat" -Lc '%d:%i' -- /proc/self/fd/3)" = "$identity" ]
"$chmod" -- "$mode" /proc/self/fd/3
[ "$("$stat" -Lc '%a' -- /proc/self/fd/3)" = "$mode" ]
[ "$("$stat" -c '%d:%i' -- "$path")" = "$identity" ]
"#;

pub(super) fn run_wsl(distro: &str, arguments: &[&str]) -> Result<(), CodexRuntimeError> {
    if !cfg!(windows) {
        return Ok(());
    }
    let mut command = Command::new("wsl.exe");
    command
        .args(["-d", distro, "--"])
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut child = command.spawn()?;
    let deadline = Instant::now() + Duration::from_secs(5);
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(CodexRuntimeError::WslHomeUnavailable);
        }
        std::thread::sleep(Duration::from_millis(25));
    };
    if status.success() {
        Ok(())
    } else {
        Err(CodexRuntimeError::InvalidManagedHome)
    }
}
