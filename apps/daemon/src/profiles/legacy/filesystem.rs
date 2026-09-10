use super::*;

pub(super) fn merge_directory(
    migration_root: &Path,
    source: &Path,
    target: &Path,
    files: &mut usize,
) -> Result<(), ProfileError> {
    let mut pending = vec![(source.to_owned(), target.to_owned(), 0_usize)];
    while let Some((source, target, depth)) = pending.pop() {
        if depth > MAX_DEPTH {
            return Err(ProfileError::MigrationCapacity);
        }
        require_directory(&source, false)?;
        require_directory(&target, true)?;
        for entry in fs::read_dir(&source)? {
            let entry = entry?;
            *files += 1;
            if *files > MAX_FILES {
                return Err(ProfileError::MigrationCapacity);
            }
            let source_path = entry.path();
            let target_path = target.join(entry.file_name());
            let file_type = entry.file_type()?;
            if file_type.is_symlink() {
                migrate_product_symlink(migration_root, &source_path, &target_path)?;
                continue;
            }
            if file_type.is_dir() {
                pending.push((source_path, target_path, depth + 1));
                continue;
            }
            if !file_type.is_file() {
                return Err(ProfileError::MigrationConflict(source_path));
            }
            copy_file_no_clobber(&source_path, &target_path)?;
        }
    }
    Ok(())
}

pub(super) fn merge_compat_directory_snapshot(
    migration_root: &Path,
    directory: &CompatDirectory<'_>,
    files: &mut usize,
    manifest: &mut CompatManifest,
    digest_budget: &mut IdentityDigestBudget,
) -> Result<(), ProfileError> {
    let source = directory.source;
    let target = directory.target;
    require_directory(source, false)?;
    require_directory(target, true)?;
    for (path, kind) in directory.entries {
        *files = files
            .checked_add(1)
            .filter(|count| *count <= MAX_FILES)
            .ok_or(ProfileError::MigrationCapacity)?;
        let source_path = join_components(source, path);
        let target_path = join_components(target, path);
        match kind {
            CompatEntryKind::Directory => {
                require_directory(&source_path, false)?;
                require_directory(&target_path, true)?;
            }
            CompatEntryKind::File => {
                let key = compat_fingerprint_key(directory.name, path);
                let previously_migrated = directory.prior_entries.contains_key(path);
                match compat_source_state(
                    &source_path,
                    &key,
                    previously_migrated,
                    manifest,
                    digest_budget,
                )? {
                    CompatSourceState::Retained => {
                        require_compat_file_presence(&source_path, &target_path)?;
                    }
                    CompatSourceState::Publish => {
                        let identity = capture_compat_source(&source_path, &key, digest_budget)?;
                        copy_compat_file_no_clobber(&source_path, &target_path, digest_budget)?;
                        record_compat_source_if_unchanged(&source_path, &key, identity, manifest)?;
                    }
                }
            }
            CompatEntryKind::ProductSymlink => {
                migrate_product_symlink(migration_root, &source_path, &target_path)?;
            }
        }
    }
    Ok(())
}

pub(super) fn publish_payload_no_clobber(
    payload: &[u8],
    target: &Path,
) -> Result<(), ProfileError> {
    if let Some(contents) = read_bounded_file(target, MAX_PROFILE_FILE_BYTES)? {
        return if contents == payload {
            harden_file(target)?;
            sync_file_and_parent(target)
        } else {
            Err(ProfileError::MigrationConflict(target.to_owned()))
        };
    }
    let temporary = temporary_path(target)?;
    let result = (|| {
        let mut output = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        use std::io::Write as _;

        output.write_all(payload)?;
        output.sync_all()?;
        harden_file(&temporary)?;
        publish_no_clobber(&temporary, target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    match result {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
            let contents = read_bounded_file(target, MAX_PROFILE_FILE_BYTES)?
                .ok_or_else(|| ProfileError::MigrationConflict(target.to_owned()))?;
            if contents != payload {
                return Err(ProfileError::MigrationConflict(target.to_owned()));
            }
            harden_file(target)?;
            sync_file_and_parent(target)
        }
        Err(error) => Err(error.into()),
    }
}

pub(super) fn copy_file_no_clobber(source: &Path, target: &Path) -> Result<(), ProfileError> {
    copy_file_no_clobber_inner(source, target, None)
}

fn copy_compat_file_no_clobber(
    source: &Path,
    target: &Path,
    digest_budget: &mut IdentityDigestBudget,
) -> Result<(), ProfileError> {
    copy_file_no_clobber_inner(source, target, Some(digest_budget))
}

fn copy_file_no_clobber_inner(
    source: &Path,
    target: &Path,
    mut digest_budget: Option<&mut IdentityDigestBudget>,
) -> Result<(), ProfileError> {
    match fs::symlink_metadata(target) {
        Ok(metadata) => {
            if !metadata.file_type().is_file() {
                return Err(ProfileError::MigrationConflict(target.to_owned()));
            }
            return if files_equal_for_copy(source, target, digest_budget.as_deref_mut())? {
                let source_file = open_regular_file(source)?;
                harden_copied_file(&source_file, target)?;
                sync_file_and_parent(target)
            } else {
                Err(ProfileError::MigrationConflict(target.to_owned()))
            };
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    let temporary = temporary_path(target)?;
    let mut input = open_regular_file(source)?;
    let result = (|| {
        let mut output = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        io::copy(&mut input, &mut output)?;
        output.sync_all()?;
        harden_copied_file(&input, &temporary)?;
        publish_no_clobber(&temporary, target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    match result {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
            require_regular_target(target)?;
            if !files_equal_for_copy(source, target, digest_budget)? {
                return Err(ProfileError::MigrationConflict(target.to_owned()));
            }
            let source_file = open_regular_file(source)?;
            harden_copied_file(&source_file, target)?;
            sync_file_and_parent(target)
        }
        Err(error) => Err(error.into()),
    }
}

fn files_equal_for_copy(
    source: &Path,
    target: &Path,
    digest_budget: Option<&mut IdentityDigestBudget>,
) -> Result<bool, ProfileError> {
    match digest_budget {
        Some(digest_budget) => {
            Ok(files_equal_bounded(source, target, digest_budget)?.unwrap_or(false))
        }
        None => files_equal(source, target),
    }
}

pub(super) fn require_directory(path: &Path, create: bool) -> Result<(), ProfileError> {
    let result = match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_dir() => Ok(()),
        Ok(_) => Err(ProfileError::MigrationConflict(path.to_owned())),
        Err(error) if error.kind() == io::ErrorKind::NotFound && create => {
            fs::create_dir(path)?;
            if let Some(parent) = path.parent() {
                sync_directory(parent)?;
            }
            Ok(())
        }
        Err(error) => Err(error.into()),
    };
    result?;
    if create {
        secure_file::ensure_secure_directory(path)?;
        sync_directory(path)?;
    }
    Ok(())
}

fn require_regular_target(path: &Path) -> Result<(), ProfileError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => Ok(()),
        Ok(_) => Err(ProfileError::MigrationConflict(path.to_owned())),
        Err(error) => Err(error.into()),
    }
}

pub(super) fn migrate_product_symlink(
    migration_root: &Path,
    source: &Path,
    target: &Path,
) -> Result<(), ProfileError> {
    let relative = source
        .strip_prefix(migration_root)
        .map_err(|_| ProfileError::MigrationConflict(source.to_owned()))?;
    let components = relative.components().collect::<Vec<_>>();
    let resource_entry = match components.as_slice() {
        [runtime, home, entry]
            if runtime.as_os_str() == "codex-runtime-home" && home.as_os_str() == "home" =>
        {
            Some(entry.as_os_str())
        }
        [accounts, _, home, entry]
            if accounts.as_os_str() == "codex-accounts" && home.as_os_str() == "home" =>
        {
            Some(entry.as_os_str())
        }
        _ => None,
    };
    let Some(entry) = resource_entry.filter(|entry| {
        CODEX_SYSTEM_RESOURCE_ENTRIES
            .iter()
            .any(|candidate| *entry == std::ffi::OsStr::new(candidate))
    }) else {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    };
    let expected = crate::paths::resolve_local_home_path()
        .ok_or_else(|| ProfileError::MigrationConflict(source.to_owned()))?
        .join(".codex")
        .join(entry);
    let link = fs::read_link(source)?;
    if !link_targets_equal(&link, &expected) {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    match fs::symlink_metadata(target) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            if link_targets_equal(&fs::read_link(target)?, &expected) {
                return sync_directory(
                    target
                        .parent()
                        .ok_or_else(|| ProfileError::MigrationConflict(target.to_owned()))?,
                )
                .map_err(Into::into);
            }
            Err(ProfileError::MigrationConflict(target.to_owned()))
        }
        Ok(_) => Err(ProfileError::MigrationConflict(target.to_owned())),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            create_product_symlink(&expected, target, entry == "AGENTS.md")?;
            sync_directory(
                target
                    .parent()
                    .ok_or_else(|| ProfileError::MigrationConflict(target.to_owned()))?,
            )?;
            Ok(())
        }
        Err(error) => Err(error.into()),
    }
}

#[cfg(unix)]
fn create_product_symlink(source: &Path, target: &Path, _is_file: bool) -> io::Result<()> {
    std::os::unix::fs::symlink(source, target)
}

#[cfg(windows)]
fn create_product_symlink(source: &Path, target: &Path, is_file: bool) -> io::Result<()> {
    if is_file {
        std::os::windows::fs::symlink_file(source, target)
    } else {
        std::os::windows::fs::symlink_dir(source, target)
    }
}

#[cfg(not(any(unix, windows)))]
fn create_product_symlink(_source: &Path, _target: &Path, _is_file: bool) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "symbolic links are unsupported on this platform",
    ))
}

#[cfg(windows)]
fn link_targets_equal(left: &Path, right: &Path) -> bool {
    fn normalized(path: &Path) -> String {
        path.to_string_lossy()
            .trim_start_matches(r"\\?\")
            .replace('/', "\\")
            .to_ascii_lowercase()
    }
    normalized(left) == normalized(right)
}

#[cfg(not(windows))]
fn link_targets_equal(left: &Path, right: &Path) -> bool {
    left == right
}

#[cfg(unix)]
fn harden_copied_file(source: &File, target: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let source_mode = source.metadata()?.permissions().mode();
    let target_mode = if source_mode & 0o111 == 0 {
        0o600
    } else {
        0o700
    };
    fs::set_permissions(target, fs::Permissions::from_mode(target_mode))
}

#[cfg(not(unix))]
fn harden_copied_file(_source: &File, target: &Path) -> io::Result<()> {
    secure_file::harden_existing_file(target).map_err(io::Error::other)
}

fn harden_file(target: &Path) -> io::Result<()> {
    secure_file::harden_existing_file(target).map_err(io::Error::other)
}

fn files_equal(left: &Path, right: &Path) -> Result<bool, ProfileError> {
    let mut left = open_regular_file(left)?;
    let mut right = open_regular_file(right)?;
    if left.metadata()?.len() != right.metadata()?.len() {
        return Ok(false);
    }
    let mut left_buffer = [0_u8; 64 * 1024];
    let mut right_buffer = [0_u8; 64 * 1024];
    loop {
        let left_read = left.read(&mut left_buffer)?;
        let right_read = right.read(&mut right_buffer)?;
        if left_read != right_read || left_buffer[..left_read] != right_buffer[..right_read] {
            return Ok(false);
        }
        if left_read == 0 {
            return Ok(true);
        }
    }
}

pub(super) fn files_equal_bounded(
    left: &Path,
    right: &Path,
    digest_budget: &mut IdentityDigestBudget,
) -> Result<Option<bool>, ProfileError> {
    let Some(left_digest) = source_content_digest(left, digest_budget)? else {
        return Ok(None);
    };
    let Some(right_digest) = source_content_digest(right, digest_budget)? else {
        return Ok(None);
    };
    Ok(Some(left_digest == right_digest))
}

fn temporary_path(target: &Path) -> Result<PathBuf, ProfileError> {
    let mut random = [0_u8; 8];
    getrandom::fill(&mut random)?;
    let suffix = random
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let name = target
        .file_name()
        .ok_or_else(|| ProfileError::MigrationConflict(target.to_owned()))?
        .to_string_lossy();
    Ok(target.with_file_name(format!(".{name}.migration-{suffix}")))
}

#[cfg(unix)]
fn publish_no_clobber(source: &Path, target: &Path) -> io::Result<()> {
    use rustix::fs::{CWD, RenameFlags, renameat_with};

    renameat_with(CWD, source, CWD, target, RenameFlags::NOREPLACE).map_err(io::Error::from)?;
    if let Some(parent) = target.parent() {
        sync_directory(parent)?;
    }
    Ok(())
}

#[cfg(not(unix))]
fn publish_no_clobber(source: &Path, target: &Path) -> io::Result<()> {
    fs::hard_link(source, target)?;
    fs::remove_file(source)?;
    Ok(())
}

pub(super) fn sync_file_and_parent(path: &Path) -> Result<(), ProfileError> {
    open_regular_file(path)?.sync_all()?;
    if let Some(parent) = path.parent() {
        sync_directory(parent)?;
    }
    Ok(())
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> io::Result<()> {
    File::open(path)?.sync_all()
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) -> io::Result<()> {
    Ok(())
}

pub(super) fn read_bounded_file(
    path: &Path,
    maximum_bytes: u64,
) -> Result<Option<Vec<u8>>, ProfileError> {
    let mut file = match open_regular_file(path) {
        Ok(file) => file,
        Err(ProfileError::Io(error)) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    if file.metadata()?.len() > maximum_bytes {
        return Err(ProfileError::MigrationCapacity);
    }
    let mut bytes = Vec::new();
    file.by_ref()
        .take(maximum_bytes.saturating_add(1))
        .read_to_end(&mut bytes)?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > maximum_bytes {
        return Err(ProfileError::MigrationCapacity);
    }
    Ok(Some(bytes))
}

pub(super) fn open_regular_file(path: &Path) -> Result<File, ProfileError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => {}
        Ok(_) => return Err(ProfileError::MigrationConflict(path.to_owned())),
        Err(error) => return Err(error.into()),
    }
    let mut options = OpenOptions::new();
    options.read(true);
    configure_no_follow(&mut options);
    let file = options.open(path)?;
    if !file.metadata()?.file_type().is_file() {
        return Err(ProfileError::MigrationConflict(path.to_owned()));
    }
    Ok(file)
}

#[cfg(unix)]
fn configure_no_follow(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt as _;

    options.custom_flags(nix::libc::O_NOFOLLOW | nix::libc::O_NONBLOCK);
}

#[cfg(windows)]
fn configure_no_follow(options: &mut OpenOptions) {
    use std::os::windows::fs::OpenOptionsExt as _;

    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
}

#[cfg(not(any(unix, windows)))]
fn configure_no_follow(_options: &mut OpenOptions) {}
