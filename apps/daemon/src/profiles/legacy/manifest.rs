use super::*;

pub(super) fn reconcile_bun_compat_sources(
    root: &Path,
    target_root: &Path,
) -> Result<(), ProfileError> {
    let mut manifest = read_compat_manifest(root)?;
    let result = reconcile_bun_compat_sources_inner(root, target_root, &mut manifest);
    if let Err(ProfileError::MigrationConflict(path)) = &result {
        let relative = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .chars()
            .take(512)
            .collect::<String>();
        eprintln!(
            "[profiles] legacy-writer divergence between the Bun root source and Rust profile at {}",
            path.display()
        );
        let reason = format!("bun-root-and-rust-profile-diverged:{relative}");
        write_journal(root, "legacy-writer-divergence", Some(reason))?;
    }
    result?;
    write_compat_manifest(root, &manifest)?;
    write_journal(
        root,
        "bun-compat-sources-retained",
        Some("bun-root-compatibility-window".to_owned()),
    )
}

fn reconcile_bun_compat_sources_inner(
    root: &Path,
    target_root: &Path,
    manifest: &mut CompatManifest,
) -> Result<(), ProfileError> {
    let mut digest_budget = IdentityDigestBudget::new();
    let source_database = root.join(DATABASE_FILE);
    let target_database = target_root.join(DATABASE_FILE);
    let database_was_tracked = manifest.files.contains(DATABASE_FILE)
        || database_has_internal_provenance(&target_database)?;
    if reconcile_compat_file_presence(&source_database, &target_database, database_was_tracked)? {
        if !database_was_tracked {
            manifest.files.insert(DATABASE_FILE.to_owned());
            write_compat_manifest(root, manifest)?;
        }
        match compat_source_state(
            &source_database,
            DATABASE_FILE,
            database_was_tracked,
            manifest,
            &mut digest_budget,
        )? {
            CompatSourceState::Retained => {
                require_compat_file_presence(&source_database, &target_database)?;
            }
            CompatSourceState::Publish => {
                let identity = merge_database(
                    &source_database,
                    &target_database,
                    &mut manifest.database_rows,
                )?;
                require_compat_file_presence(&source_database, &target_database)?;
                record_compat_database_source(DATABASE_FILE, identity, manifest);
            }
        }
        manifest.files.insert(DATABASE_FILE.to_owned());
    } else {
        manifest.files.remove(DATABASE_FILE);
        manifest.database_rows.clear();
        forget_compat_fingerprints(manifest, DATABASE_FILE);
    }
    for file_name in BUN_COMPAT_JSON_FILES {
        reconcile_compat_json(root, target_root, file_name, manifest, &mut digest_budget)?;
        for index in 0..PROFILE_BACKUP_COUNT {
            reconcile_compat_json(
                root,
                target_root,
                &format!("{file_name}.bak.{index}"),
                manifest,
                &mut digest_budget,
            )?;
        }
    }
    for database in BUN_COMPAT_SQLITE_FILES {
        let source = root.join(database);
        let target = target_root.join(database);
        let was_tracked = manifest.files.contains(*database);
        if reconcile_compat_file_presence(&source, &target, was_tracked)? {
            if !was_tracked {
                manifest.files.insert((*database).to_owned());
                write_compat_manifest(root, manifest)?;
            }
            match compat_source_state(&source, database, was_tracked, manifest, &mut digest_budget)?
            {
                CompatSourceState::Retained => {
                    require_compat_file_presence(&source, &target)?;
                }
                CompatSourceState::Publish => {
                    let identity = migrate_profile_sqlite(root, target_root, database)?;
                    require_compat_file_presence(&source, &target)?;
                    record_compat_database_source(database, identity, manifest);
                }
            }
            manifest.files.insert((*database).to_owned());
        } else {
            manifest.files.remove(*database);
            forget_compat_fingerprints(manifest, database);
        }
    }
    let mut migrated_files = 0_usize;
    for directory in BUN_COMPAT_DIRECTORIES {
        reconcile_compat_directory(
            root,
            target_root,
            directory,
            &mut migrated_files,
            manifest,
            &mut digest_budget,
        )?;
    }
    Ok(())
}

fn reconcile_compat_json(
    root: &Path,
    target_root: &Path,
    file_name: &str,
    manifest: &mut CompatManifest,
    digest_budget: &mut IdentityDigestBudget,
) -> Result<(), ProfileError> {
    let source = root.join(file_name);
    let target = target_root.join(file_name);
    let was_tracked = manifest.files.contains(file_name);
    if reconcile_compat_file_presence(&source, &target, was_tracked)? {
        if !was_tracked {
            manifest.files.insert(file_name.to_owned());
            write_compat_manifest(root, manifest)?;
        }
        match compat_source_state(&source, file_name, was_tracked, manifest, digest_budget)? {
            CompatSourceState::Retained => {
                require_compat_file_presence(&source, &target)?;
            }
            CompatSourceState::Publish => {
                let identity = capture_compat_source(&source, file_name, digest_budget)?;
                migrate_profile_json(root, target_root, file_name)?;
                require_compat_file_presence(&source, &target)?;
                record_compat_source_if_unchanged(&source, file_name, identity, manifest)?;
            }
        }
        manifest.files.insert(file_name.to_owned());
    } else {
        manifest.files.remove(file_name);
        forget_compat_fingerprints(manifest, file_name);
    }
    Ok(())
}

fn reconcile_compat_file_presence(
    source: &Path,
    target: &Path,
    was_tracked: bool,
) -> Result<bool, ProfileError> {
    let source_exists = is_regular_source(source)?;
    let target_exists = is_regular_source(target)?;
    match (source_exists, target_exists, was_tracked) {
        (false, true, true) | (true, false, true) => {
            Err(ProfileError::MigrationConflict(target.to_owned()))
        }
        (false, _, _) => Ok(false),
        (true, _, _) => Ok(true),
    }
}

pub(super) fn require_compat_file_presence(
    source: &Path,
    target: &Path,
) -> Result<(), ProfileError> {
    if !is_regular_source(source)? {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    if !is_regular_source(target)? {
        return Err(ProfileError::MigrationConflict(target.to_owned()));
    }
    Ok(())
}

fn require_compat_directory_presence(source: &Path, target: &Path) -> Result<(), ProfileError> {
    if !is_directory(source)? {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    if !is_directory(target)? {
        return Err(ProfileError::MigrationConflict(target.to_owned()));
    }
    Ok(())
}

fn is_directory(path: &Path) -> Result<bool, ProfileError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_dir() => Ok(true),
        Ok(_) => Err(ProfileError::MigrationConflict(path.to_owned())),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

fn reconcile_compat_directory(
    root: &Path,
    target_root: &Path,
    directory: &str,
    migrated_files: &mut usize,
    manifest: &mut CompatManifest,
    digest_budget: &mut IdentityDigestBudget,
) -> Result<(), ProfileError> {
    let source = root.join(directory);
    let target = target_root.join(directory);
    let source_exists = is_directory(&source)?;
    let target_exists = is_directory(&target)?;
    let tracked = manifest.directories.contains_key(directory);
    match (source_exists, target_exists, tracked) {
        (false, true, true) | (true, false, true) => {
            return Err(ProfileError::MigrationConflict(target));
        }
        (false, _, _) => {
            manifest.directories.remove(directory);
            forget_compat_fingerprints(manifest, directory);
            return Ok(());
        }
        (true, _, _) => {}
    }
    let mut prior_entries = manifest_directory_entries(manifest, directory);
    forget_transient_compat_identities(manifest, directory);
    prior_entries.retain(|path, _| !is_transient_compat_entry(directory, path));
    let source_entries = scan_compat_directory(directory, &source)?;
    for (path, prior_kind) in &prior_entries {
        let source_path = join_components(&source, path);
        let target_path = join_components(&target, path);
        match source_entries.get(path) {
            Some(source_kind) if source_kind != prior_kind => {
                return Err(ProfileError::MigrationConflict(source_path));
            }
            Some(_) if path_kind(&target_path)?.as_ref() != Some(prior_kind) => {
                return Err(ProfileError::MigrationConflict(target_path));
            }
            Some(_) => {}
            None if path_kind(&target_path)?.is_some() => {
                return Err(ProfileError::MigrationConflict(target_path));
            }
            None => {}
        }
    }
    manifest.directories.insert(
        directory.to_owned(),
        source_entries
            .iter()
            .map(|(path, kind)| CompatManifestEntry {
                kind: *kind,
                path: path.clone(),
            })
            .collect(),
    );
    write_compat_manifest(root, manifest)?;
    let compat_directory = CompatDirectory {
        entries: &source_entries,
        name: directory,
        prior_entries: &prior_entries,
        source: &source,
        target: &target,
    };
    merge_compat_directory_snapshot(
        root,
        &compat_directory,
        migrated_files,
        manifest,
        digest_budget,
    )?;
    verify_compat_directory(root, &compat_directory, manifest, digest_budget)?;
    require_compat_directory_presence(&source, &target)?;
    write_compat_manifest(root, manifest)?;
    Ok(())
}

fn manifest_directory_entries(
    manifest: &CompatManifest,
    directory: &str,
) -> BTreeMap<Vec<String>, CompatEntryKind> {
    manifest
        .directories
        .get(directory)
        .into_iter()
        .flatten()
        .map(|entry| (entry.path.clone(), entry.kind))
        .collect()
}

fn scan_compat_directory(
    directory_name: &str,
    directory: &Path,
) -> Result<BTreeMap<Vec<String>, CompatEntryKind>, ProfileError> {
    let mut pending = vec![(directory.to_owned(), Vec::new(), 0_usize)];
    let mut result = BTreeMap::new();
    let mut entries = 0_usize;
    while let Some((current, components, depth)) = pending.pop() {
        if depth > MAX_DEPTH {
            return Err(ProfileError::MigrationCapacity);
        }
        for entry in fs::read_dir(&current)? {
            let entry = entry?;
            entries += 1;
            if entries > MAX_FILES {
                return Err(ProfileError::MigrationCapacity);
            }
            let path = entry.path();
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                return Err(ProfileError::MigrationConflict(path));
            };
            let mut path_components = components.clone();
            path_components.push(name);
            if is_transient_compat_entry(directory_name, &path_components) {
                continue;
            }
            let file_type = entry.file_type()?;
            let kind = if file_type.is_dir() {
                CompatEntryKind::Directory
            } else if file_type.is_file() {
                CompatEntryKind::File
            } else if file_type.is_symlink() {
                CompatEntryKind::ProductSymlink
            } else {
                return Err(ProfileError::MigrationConflict(path));
            };
            result.insert(path_components.clone(), kind);
            if kind == CompatEntryKind::Directory {
                pending.push((path, path_components, depth + 1));
            }
        }
    }
    Ok(result)
}

fn is_transient_compat_entry(directory: &str, path: &[String]) -> bool {
    path.iter()
        .any(|component| TRANSIENT_COMPAT_COMPONENTS.contains(&component.as_str()))
        || (directory == "agent-hooks"
            && path.len() == 1
            && path
                .first()
                .is_some_and(|name| is_transient_agent_hook_file(name)))
}

fn is_transient_agent_hook_file(name: &str) -> bool {
    if AGENT_HOOK_ENDPOINT_FILES.contains(&name) {
        return true;
    }
    let secure_write = ["endpoint.env", "endpoint.cmd", "last-status.json"]
        .iter()
        .any(|base| is_atomic_temporary(name, base, 32));
    let hook_storage_write = ["-hook.sh", "-hook.cmd", "-hook.ps1"].iter().any(|suffix| {
        name.split_once(suffix).is_some_and(|(provider, rest)| {
            !provider.is_empty()
                && rest
                    .strip_prefix('.')
                    .is_some_and(|metadata| is_atomic_metadata(metadata, 16))
        })
    });
    let legacy_write = [".endpoint-", ".last-status-"]
        .iter()
        .any(|prefix| is_legacy_agent_hook_temporary(name, prefix));
    secure_write || hook_storage_write || legacy_write
}

fn is_atomic_temporary(name: &str, base: &str, nonce_length: usize) -> bool {
    name.strip_prefix(base)
        .and_then(|suffix| suffix.strip_prefix('.'))
        .is_some_and(|metadata| is_atomic_metadata(metadata, nonce_length))
}

fn is_atomic_metadata(metadata: &str, nonce_length: usize) -> bool {
    metadata
        .strip_suffix(".tmp")
        .and_then(|metadata| metadata.split_once('.'))
        .is_some_and(|(pid, nonce)| {
            !pid.is_empty()
                && pid.bytes().all(|byte| byte.is_ascii_digit())
                && nonce.len() == nonce_length
                && nonce
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        })
}

fn is_legacy_agent_hook_temporary(name: &str, prefix: &str) -> bool {
    name.strip_prefix(prefix)
        .and_then(|suffix| suffix.strip_suffix(".tmp"))
        .and_then(|metadata| metadata.split_once('-'))
        .is_some_and(|(pid, uuid)| {
            !pid.is_empty()
                && pid.bytes().all(|byte| byte.is_ascii_digit())
                && is_lowercase_uuid(uuid)
        })
}

fn is_lowercase_uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)
            }
        })
}

fn forget_transient_compat_identities(manifest: &mut CompatManifest, directory: &str) {
    let prefix = format!("{directory}/");
    manifest.source_identities.retain(|key, _| {
        key.strip_prefix(&prefix)
            .map(|path| path.split('/').map(str::to_owned).collect::<Vec<_>>())
            .is_none_or(|path| !is_transient_compat_entry(directory, &path))
    });
}

/// Why: the snapshot merge and its verification both need the same five facts about one compat
/// directory, and passing them separately puts the merge over clippy's argument limit.
pub(super) struct CompatDirectory<'a> {
    pub(super) entries: &'a BTreeMap<Vec<String>, CompatEntryKind>,
    pub(super) name: &'a str,
    pub(super) prior_entries: &'a BTreeMap<Vec<String>, CompatEntryKind>,
    pub(super) source: &'a Path,
    pub(super) target: &'a Path,
}

fn verify_compat_directory(
    migration_root: &Path,
    directory: &CompatDirectory<'_>,
    manifest: &CompatManifest,
    digest_budget: &mut IdentityDigestBudget,
) -> Result<(), ProfileError> {
    for (path, kind) in directory.entries {
        let source_path = join_components(directory.source, path);
        let target_path = join_components(directory.target, path);
        if path_kind(&target_path)? != Some(*kind) {
            return Err(ProfileError::MigrationConflict(target_path));
        }
        match kind {
            CompatEntryKind::Directory => {}
            CompatEntryKind::File => {
                let is_retained = compat_source_retained(
                    &source_path,
                    &compat_fingerprint_key(directory.name, path),
                    manifest,
                    digest_budget,
                )?;
                let is_equal = is_retained
                    || files_equal_bounded(&source_path, &target_path, digest_budget)?
                        .unwrap_or(false);
                if !is_equal {
                    return Err(ProfileError::MigrationConflict(target_path));
                }
            }
            CompatEntryKind::ProductSymlink => {
                migrate_product_symlink(migration_root, &source_path, &target_path)?;
            }
        }
    }
    Ok(())
}

fn path_kind(path: &Path) -> Result<Option<CompatEntryKind>, ProfileError> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let file_type = metadata.file_type();
    if file_type.is_dir() {
        Ok(Some(CompatEntryKind::Directory))
    } else if file_type.is_file() {
        Ok(Some(CompatEntryKind::File))
    } else if file_type.is_symlink() {
        Ok(Some(CompatEntryKind::ProductSymlink))
    } else {
        Err(ProfileError::MigrationConflict(path.to_owned()))
    }
}

pub(super) fn join_components(root: &Path, components: &[String]) -> PathBuf {
    components
        .iter()
        .fold(root.to_owned(), |path, component| path.join(component))
}

fn read_compat_manifest(root: &Path) -> Result<CompatManifest, ProfileError> {
    let path = root.join(COMPAT_MANIFEST_FILE);
    let Some(bytes) = read_bounded_file(&path, MAX_COMPAT_MANIFEST_BYTES)? else {
        return Ok(empty_compat_manifest());
    };
    let mut manifest = serde_json::from_slice::<CompatManifest>(&bytes)?;
    // Why: schema 5 was briefly written with the same optional WAL fields before schema 4 writer
    // compatibility was restored.
    if (COMPAT_MANIFEST_SCHEMA_VERSION..=MAX_READABLE_COMPAT_MANIFEST_SCHEMA_VERSION)
        .contains(&manifest.schema_version)
    {
        manifest.schema_version = COMPAT_MANIFEST_SCHEMA_VERSION;
    }
    validate_compat_manifest(&manifest, &path)?;
    Ok(manifest)
}

fn write_compat_manifest(root: &Path, manifest: &CompatManifest) -> Result<(), ProfileError> {
    let path = root.join(COMPAT_MANIFEST_FILE);
    validate_compat_manifest(manifest, &path)?;
    let mut bytes = serde_json::to_vec_pretty(manifest)?;
    bytes.push(b'\n');
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > MAX_COMPAT_MANIFEST_BYTES {
        return Err(ProfileError::MigrationCapacity);
    }
    secure_file::write_bytes(&path, &bytes)?;
    Ok(())
}

fn empty_compat_manifest() -> CompatManifest {
    CompatManifest {
        database_rows: BTreeMap::new(),
        directories: BTreeMap::new(),
        files: BTreeSet::new(),
        schema_version: COMPAT_MANIFEST_SCHEMA_VERSION,
        source_identities: BTreeMap::new(),
    }
}

fn validate_compat_manifest(
    manifest: &CompatManifest,
    manifest_path: &Path,
) -> Result<(), ProfileError> {
    if manifest.schema_version != COMPAT_MANIFEST_SCHEMA_VERSION {
        return Err(ProfileError::MigrationConflict(manifest_path.to_owned()));
    }
    validate_database_provenance(&manifest.database_rows, manifest_path)?;
    let known_files = compat_file_names();
    if manifest
        .files
        .iter()
        .any(|file| !known_files.contains(file))
        || manifest
            .directories
            .keys()
            .any(|directory| !BUN_COMPAT_DIRECTORIES.contains(&directory.as_str()))
    {
        return Err(ProfileError::MigrationConflict(manifest_path.to_owned()));
    }
    if manifest.source_identities.len() > MAX_FILES
        || manifest.source_identities.iter().any(|(key, identity)| {
            !is_compat_fingerprint_key(key, &known_files)
                || !is_compat_fingerprint(&identity.fingerprint)
                || identity
                    .digest
                    .as_ref()
                    .is_some_and(|digest| !is_row_digest(digest))
                || !is_valid_wal_identity(identity)
        })
    {
        return Err(ProfileError::MigrationConflict(manifest_path.to_owned()));
    }
    let mut total_entries = 0_usize;
    for entries in manifest.directories.values() {
        total_entries = total_entries
            .checked_add(entries.len())
            .filter(|count| *count <= MAX_FILES)
            .ok_or(ProfileError::MigrationCapacity)?;
        let mut kinds = BTreeMap::new();
        for entry in entries {
            if entry.path.is_empty()
                || entry.path.len() > MAX_DEPTH + 1
                || entry
                    .path
                    .iter()
                    .any(|component| !is_path_component(component))
                || kinds.insert(entry.path.clone(), entry.kind).is_some()
            {
                return Err(ProfileError::MigrationConflict(manifest_path.to_owned()));
            }
        }
        for path in kinds.keys() {
            for parent_length in 1..path.len() {
                if kinds.get(&path[..parent_length]) != Some(&CompatEntryKind::Directory) {
                    return Err(ProfileError::MigrationConflict(manifest_path.to_owned()));
                }
            }
        }
    }
    Ok(())
}

fn is_valid_wal_identity(identity: &CompatSourceIdentity) -> bool {
    match identity.wal_present {
        None | Some(false) => identity.wal_fingerprint.is_none() && identity.wal_digest.is_none(),
        Some(true) => {
            identity
                .wal_fingerprint
                .as_ref()
                .is_some_and(|fingerprint| is_compat_fingerprint(fingerprint))
                && identity
                    .wal_digest
                    .as_ref()
                    .is_none_or(|digest| is_row_digest(digest))
        }
    }
}

pub(super) fn validate_database_provenance(
    database_rows: &BTreeMap<String, BTreeMap<String, u64>>,
    conflict_path: &Path,
) -> Result<(), ProfileError> {
    database_rows
        .values()
        .try_fold(0_usize, |total, rows| {
            rows.values().try_fold(total, |count, occurrences| {
                usize::try_from(*occurrences)
                    .ok()
                    .and_then(|occurrences| count.checked_add(occurrences))
            })
        })
        .filter(|count| *count <= MAX_COMPAT_DATABASE_ROWS)
        .ok_or(ProfileError::MigrationCapacity)?;
    if database_rows.iter().any(|(table, rows)| {
        !(PROFILE_TABLES.contains(&table.as_str())
            || RETIRED_PROFILE_TABLES.contains(&table.as_str())
            || table == DATABASE_PROVENANCE_TABLE)
            || rows
                .iter()
                .any(|(digest, occurrences)| *occurrences == 0 || !is_row_digest(digest))
    }) {
        return Err(ProfileError::MigrationConflict(conflict_path.to_owned()));
    }
    Ok(())
}

fn compat_file_names() -> BTreeSet<String> {
    let mut names = BTreeSet::from([DATABASE_FILE.to_owned()]);
    names.extend(
        BUN_COMPAT_SQLITE_FILES
            .iter()
            .map(|name| (*name).to_owned()),
    );
    for name in BUN_COMPAT_JSON_FILES {
        names.insert((*name).to_owned());
        for index in 0..PROFILE_BACKUP_COUNT {
            names.insert(format!("{name}.bak.{index}"));
        }
    }
    names
}

fn is_row_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn is_compat_fingerprint_key(key: &str, known_files: &BTreeSet<String>) -> bool {
    if known_files.contains(key) {
        return true;
    }
    let Some((directory, path)) = key.split_once('/') else {
        return false;
    };
    BUN_COMPAT_DIRECTORIES.contains(&directory)
        && !path.is_empty()
        && path.split('/').count() <= MAX_DEPTH + 1
        && path.split('/').all(is_path_component)
}

// Why: a manifest key, not a filesystem path, so it joins with `/` on every platform and stays
// stable when the same manifest is read on another host.
pub(super) fn compat_fingerprint_key(directory: &str, path: &[String]) -> String {
    let mut key = String::from(directory);
    for component in path {
        key.push('/');
        key.push_str(component);
    }
    key
}

/// The recorded identity of one Bun compat source as it stood when it was migrated.
#[derive(Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CompatSourceIdentity {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    digest: Option<String>,
    fingerprint: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    wal_digest: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    wal_fingerprint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    wal_present: Option<bool>,
}

/// Why: `codex-runtime-home` alone is routinely multi-GB, so the common answer has to come from a
/// stat. Size and mtime move on any real write, which is the same basis `database_identity` already
/// trusts for the primary database.
fn source_fingerprint(path: &Path) -> Result<Option<String>, ProfileError> {
    if !is_regular_source(path)? {
        return Ok(None);
    }
    let metadata = fs::symlink_metadata(path)?;
    let Ok(modified) = metadata.modified()?.duration_since(std::time::UNIX_EPOCH) else {
        return Ok(None);
    };
    Ok(Some(format!(
        "{}:{}:{}",
        metadata.len(),
        modified.as_secs(),
        modified.subsec_nanos()
    )))
}

/// Why: mtime is not preserved by every copy — rsync, Time Machine and archive restores routinely
/// reset sub-second precision — so a fingerprint miss is only a *suspicion*. Content settles it,
/// and only for the one file that missed, never for the whole tree.
pub(super) fn source_content_digest(
    path: &Path,
    budget: &mut IdentityDigestBudget,
) -> Result<Option<String>, ProfileError> {
    if !is_regular_source(path)? {
        return Ok(None);
    }
    let expected_bytes = fs::symlink_metadata(path)?.len();
    if expected_bytes > MAX_IDENTITY_DIGEST_FILE_BYTES || expected_bytes > budget.remaining_bytes {
        return Ok(None);
    }
    let mut file = open_regular_file(path)?;
    let mut hash = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut read_bytes = 0_u64;
    loop {
        let remaining = expected_bytes.saturating_sub(read_bytes);
        if remaining == 0 {
            break;
        }
        let capacity = usize::try_from(remaining.min(buffer.len() as u64)).unwrap_or(buffer.len());
        let read = file.read(&mut buffer[..capacity])?;
        if read == 0 {
            break;
        }
        hash.update(&buffer[..read]);
        read_bytes = read_bytes.saturating_add(u64::try_from(read).unwrap_or(u64::MAX));
    }
    budget.remaining_bytes = budget.remaining_bytes.saturating_sub(read_bytes);
    if read_bytes != expected_bytes || fs::symlink_metadata(path)?.len() != expected_bytes {
        return Ok(None);
    }
    Ok(Some(
        hash.finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
    ))
}

fn source_identity(
    path: &Path,
    key: &str,
    budget: &mut IdentityDigestBudget,
) -> Result<Option<CompatSourceIdentity>, ProfileError> {
    let Some(fingerprint) = source_fingerprint(path)? else {
        return Ok(None);
    };
    let digest = source_content_digest(path, budget)?;
    let sqlite = is_sqlite_compat_source(key);
    let wal_path = sqlite_wal_path(path);
    let wal_fingerprint = if sqlite {
        sqlite_wal_fingerprint(&wal_path)?
    } else {
        None
    };
    let wal_digest = match &wal_fingerprint {
        Some(_) => source_content_digest(&wal_path, budget)?,
        None => None,
    };
    let wal_present = sqlite.then_some(wal_fingerprint.is_some());
    Ok(Some(CompatSourceIdentity {
        digest,
        fingerprint,
        wal_digest,
        wal_fingerprint,
        wal_present,
    }))
}

pub(super) fn sqlite_wal_path(path: &Path) -> PathBuf {
    let mut value = path.as_os_str().to_owned();
    value.push("-wal");
    PathBuf::from(value)
}

fn sqlite_wal_fingerprint(path: &Path) -> Result<Option<String>, ProfileError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() && metadata.len() == 0 => Ok(None),
        Ok(_) => source_fingerprint(path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn is_sqlite_compat_source(key: &str) -> bool {
    key == DATABASE_FILE || BUN_COMPAT_SQLITE_FILES.contains(&key)
}

fn is_compat_fingerprint(value: &str) -> bool {
    let mut parts = value.split(':');
    let fields = [parts.next(), parts.next(), parts.next()];
    parts.next().is_none()
        && fields.iter().all(|field| {
            field.is_some_and(|field| {
                !field.is_empty() && field.bytes().all(|byte| byte.is_ascii_digit())
            })
        })
}

#[derive(Clone, Copy, Eq, PartialEq)]
pub(super) enum CompatSourceState {
    /// The Bun source has not been migrated yet, or changed since it was: publish it.
    Publish,
    /// Migrated earlier and unchanged since, so the profile copy owns the content and may differ.
    Retained,
}

pub(super) fn compat_source_state(
    source: &Path,
    key: &str,
    previously_migrated: bool,
    manifest: &mut CompatManifest,
    digest_budget: &mut IdentityDigestBudget,
) -> Result<CompatSourceState, ProfileError> {
    let Some(fingerprint) = source_fingerprint(source)? else {
        return Ok(CompatSourceState::Publish);
    };
    let sqlite = is_sqlite_compat_source(key);
    let wal_fingerprint = if sqlite {
        sqlite_wal_fingerprint(&sqlite_wal_path(source))?
    } else {
        None
    };
    if sqlite
        && wal_fingerprint.is_none()
        && let Some(recorded) = manifest.source_identities.get(key)
        && recorded.wal_present.is_none()
    {
        let main_retained = recorded.fingerprint == fingerprint
            || match &recorded.digest {
                Some(digest) => {
                    source_content_digest(source, digest_budget)?.as_ref() == Some(digest)
                }
                None => false,
            };
        if main_retained {
            let digest = recorded.digest.clone();
            manifest.source_identities.insert(
                key.to_owned(),
                CompatSourceIdentity {
                    digest,
                    fingerprint,
                    wal_digest: None,
                    wal_fingerprint: None,
                    wal_present: Some(false),
                },
            );
            return Ok(CompatSourceState::Retained);
        }
    }
    match manifest.source_identities.get(key) {
        Some(recorded)
            if recorded.fingerprint == fingerprint
                && (!sqlite
                    || (recorded.wal_present == Some(wal_fingerprint.is_some())
                        && recorded.wal_fingerprint == wal_fingerprint)) =>
        {
            Ok(CompatSourceState::Retained)
        }
        Some(recorded)
            if compat_source_content_retained(
                source,
                recorded,
                sqlite,
                wal_fingerprint.is_some(),
                digest_budget,
            )? =>
        {
            Ok(CompatSourceState::Retained)
        }
        Some(_) => Ok(CompatSourceState::Publish),
        // Why: an old manifest proves only that a path existed, not which source bytes reached the
        // profile. Publishing through the existing no-clobber merge proves equality or fails closed.
        None if previously_migrated => Ok(CompatSourceState::Publish),
        None => Ok(CompatSourceState::Publish),
    }
}

/// Why: the post-merge verification runs after the identity was recorded, so the stat answers it and
/// the content fallback is only reached when a copy has reset mtime.
fn compat_source_retained(
    source: &Path,
    key: &str,
    manifest: &CompatManifest,
    digest_budget: &mut IdentityDigestBudget,
) -> Result<bool, ProfileError> {
    let Some(recorded) = manifest.source_identities.get(key) else {
        return Ok(false);
    };
    let sqlite = is_sqlite_compat_source(key);
    let wal_fingerprint = if sqlite {
        sqlite_wal_fingerprint(&sqlite_wal_path(source))?
    } else {
        None
    };
    if source_fingerprint(source)?.as_ref() == Some(&recorded.fingerprint)
        && (!sqlite
            || (recorded.wal_present == Some(wal_fingerprint.is_some())
                && recorded.wal_fingerprint == wal_fingerprint))
    {
        return Ok(true);
    }
    compat_source_content_retained(
        source,
        recorded,
        sqlite,
        wal_fingerprint.is_some(),
        digest_budget,
    )
}

fn compat_source_content_retained(
    source: &Path,
    recorded: &CompatSourceIdentity,
    sqlite: bool,
    wal_present: bool,
    digest_budget: &mut IdentityDigestBudget,
) -> Result<bool, ProfileError> {
    let Some(recorded_digest) = &recorded.digest else {
        return Ok(false);
    };
    if source_content_digest(source, digest_budget)?.as_ref() != Some(recorded_digest) {
        return Ok(false);
    }
    if !sqlite {
        return Ok(true);
    }
    match (recorded.wal_present, wal_present) {
        (Some(false), false) => Ok(true),
        (Some(true), true) => {
            let Some(recorded_wal_digest) = &recorded.wal_digest else {
                return Ok(false);
            };
            Ok(
                source_content_digest(&sqlite_wal_path(source), digest_budget)?.as_ref()
                    == Some(recorded_wal_digest),
            )
        }
        _ => Ok(false),
    }
}

pub(super) fn capture_compat_source(
    source: &Path,
    key: &str,
    digest_budget: &mut IdentityDigestBudget,
) -> Result<CompatSourceIdentity, ProfileError> {
    source_identity(source, key, digest_budget)?
        .ok_or_else(|| ProfileError::MigrationConflict(source.to_owned()))
}

pub(super) fn record_compat_source_if_unchanged(
    source: &Path,
    key: &str,
    identity: CompatSourceIdentity,
    manifest: &mut CompatManifest,
) -> Result<(), ProfileError> {
    let fingerprint = source_fingerprint(source)?;
    let wal_fingerprint = if is_sqlite_compat_source(key) {
        sqlite_wal_fingerprint(&sqlite_wal_path(source))?
    } else {
        None
    };
    if fingerprint.as_ref() != Some(&identity.fingerprint)
        || (is_sqlite_compat_source(key)
            && (identity.wal_present != Some(wal_fingerprint.is_some())
                || identity.wal_fingerprint != wal_fingerprint))
    {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    manifest.source_identities.insert(key.to_owned(), identity);
    Ok(())
}

fn record_compat_database_source(
    key: &str,
    identity: DatabaseIdentity,
    manifest: &mut CompatManifest,
) {
    let wal_present = identity.wal.is_some();
    manifest.source_identities.insert(
        key.to_owned(),
        CompatSourceIdentity {
            digest: None,
            fingerprint: identity.main.fingerprint(),
            wal_digest: None,
            wal_fingerprint: identity.wal.as_ref().map(DatabaseFileIdentity::fingerprint),
            wal_present: Some(wal_present),
        },
    );
}

fn forget_compat_fingerprints(manifest: &mut CompatManifest, prefix: &str) {
    let directory_prefix = format!("{prefix}/");
    manifest
        .source_identities
        .retain(|key, _| key != prefix && !key.starts_with(&directory_prefix));
}

fn is_path_component(value: &str) -> bool {
    let mut components = Path::new(value).components();
    matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none()
}
