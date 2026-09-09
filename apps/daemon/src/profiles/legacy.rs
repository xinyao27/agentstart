use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};

use rusqlite::{Connection, OpenFlags, OptionalExtension, Row, config::DbConfig, types::ValueRef};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::index::{ProfileError, profile_directory};
use crate::transport::secure_file;

const DEFAULT_PROFILE_ID: &str = "local-default";
const DATABASE_FILE: &str = "yiru.sqlite";
const COMPAT_MANIFEST_FILE: &str = "yiru-profile-compat-sources.json";
const JOURNAL_FILE: &str = "yiru-profile-migration.json";
const MAX_FILES: usize = 100_000;
const MAX_DEPTH: usize = 32;
const MAX_JOURNAL_BYTES: u64 = 4 * 1024;
const MAX_COMPAT_MANIFEST_BYTES: u64 = 64 * 1024 * 1024;
const MAX_COMPAT_DATABASE_ROWS: usize = 500_000;
const MAX_PROFILE_FILE_BYTES: u64 = 64 * 1024 * 1024;
const COMPAT_MANIFEST_SCHEMA_VERSION: u64 = 2;
const JOURNAL_SCHEMA_VERSION: u64 = 4;
const DATABASE_PROVENANCE_TABLE: &str = "yiru_profile_compat_source_row";
const DATABASE_PROVENANCE_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS yiru_profile_compat_source_row (
  table_name TEXT NOT NULL,
  row_digest TEXT NOT NULL,
  occurrences INTEGER NOT NULL CHECK(occurrences > 0),
  PRIMARY KEY(table_name, row_digest)
);
"#;

const ONE_SHOT_JSON_FILES: &[&str] = &[
    "yiru-data.json",
    "yiru-data-projects.json",
    "yiru-data-worktrees.json",
    "yiru-data-settings.json",
    "yiru-data-ui.json",
    "yiru-data-sessions.json",
    "yiru-data-runtime.json",
    "yiru-github-cache.json",
];
const BUN_COMPAT_JSON_FILES: &[&str] = &[
    "yiru-stats.json",
    "yiru-claude-usage.json",
    "yiru-codex-usage.json",
    "yiru-opencode-usage.json",
];
const ONE_SHOT_PLAIN_FILES: &[&str] = &["browser-session-meta.json"];
const BUN_COMPAT_SQLITE_FILES: &[&str] = &["orchestration.db"];
const BUN_COMPAT_DIRECTORIES: &[&str] = &[
    "agent-hooks",
    "artifacts",
    "claude-accounts",
    "codex-accounts",
    "codex-runtime-home",
    "visual-captures",
];
const ONE_SHOT_DIRECTORIES: &[&str] = &["terminal-scrollback"];
const PROFILE_BACKUP_COUNT: usize = 5;
const CODEX_SYSTEM_RESOURCE_ENTRIES: &[&str] = &[
    "skills",
    "hooks",
    "plugins",
    "plugin-state",
    "profile-v2",
    "themes",
    "prompts",
    "AGENTS.md",
];

const PROFILE_TABLES: &[&str] = &[
    "workspace_revision",
    "workspace_event",
    "execution_host",
    "project",
    "project_remote",
    "artifact",
    "browser_replay",
    "visual_capture",
    "agent_session",
    "worktree_archive",
    "ritual_schedule",
    "worktree_metadata",
    "project_wire_metadata",
    "project_catalog_order",
    "project_host_setup",
    "project_host_setup_cleanup",
    "project_independent",
    "project_independent_import",
    "project_repo_state",
];

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationJournal {
    phase: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    schema_version: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatManifest {
    #[serde(default)]
    database_rows: BTreeMap<String, BTreeMap<String, u64>>,
    directories: BTreeMap<String, Vec<CompatManifestEntry>>,
    files: BTreeSet<String>,
    schema_version: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompatManifestEntry {
    kind: CompatEntryKind,
    path: Vec<String>,
}

#[derive(Clone, Copy, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum CompatEntryKind {
    Directory,
    File,
    ProductSymlink,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum MigrationPhase {
    DatabaseCommitted,
    BunCompatSourcesRetained,
    LegacyComplete,
    LegacyWriterDivergence,
}

#[derive(Clone, Copy, Eq, PartialEq)]
struct DatabaseIdentity {
    first: u64,
    second: u64,
}

pub(super) fn migrate(root: &Path) -> Result<(), ProfileError> {
    let journal = read_journal(root)?;
    let target_root = profile_directory(root, DEFAULT_PROFILE_ID);
    let profiles_root = root.join("profiles");
    require_directory(&profiles_root, true)?;
    require_directory(&target_root, true)?;
    if journal.as_ref().is_some_and(|journal| {
        matches!(
            journal.phase,
            MigrationPhase::BunCompatSourcesRetained
                | MigrationPhase::LegacyComplete
                | MigrationPhase::LegacyWriterDivergence
        )
    }) {
        reconcile_bun_compat_sources(root, &target_root)?;
        return Ok(());
    }
    let source_database = root.join(DATABASE_FILE);
    match fs::symlink_metadata(&source_database) {
        Ok(metadata) if metadata.file_type().is_file() => {
            merge_database(
                &source_database,
                &target_root.join(DATABASE_FILE),
                &mut BTreeMap::new(),
            )?;
        }
        Ok(_) => return Err(ProfileError::MigrationConflict(source_database)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    write_journal(root, "database-committed", None)?;
    migrate_one_shot_files(root, &target_root)?;
    let mut migrated_files = 0_usize;
    for directory in ONE_SHOT_DIRECTORIES {
        let source = root.join(directory);
        match fs::symlink_metadata(&source) {
            Ok(metadata) if metadata.file_type().is_dir() => {
                merge_directory(
                    root,
                    &source,
                    &target_root.join(directory),
                    &mut migrated_files,
                )?;
            }
            Ok(_) => return Err(ProfileError::MigrationConflict(source)),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    reconcile_bun_compat_sources(root, &target_root)
}

fn migrate_one_shot_files(root: &Path, target_root: &Path) -> Result<(), ProfileError> {
    for file_name in ONE_SHOT_JSON_FILES {
        migrate_profile_json(root, target_root, file_name)?;
        for index in 0..PROFILE_BACKUP_COUNT {
            migrate_profile_json(root, target_root, &format!("{file_name}.bak.{index}"))?;
        }
    }
    for file_name in ONE_SHOT_PLAIN_FILES {
        let source = root.join(file_name);
        if is_regular_source(&source)? {
            copy_file_no_clobber(&source, &target_root.join(file_name))?;
        }
    }
    Ok(())
}

fn reconcile_bun_compat_sources(root: &Path, target_root: &Path) -> Result<(), ProfileError> {
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
    let source_database = root.join(DATABASE_FILE);
    let target_database = target_root.join(DATABASE_FILE);
    let database_was_tracked = manifest.files.contains(DATABASE_FILE)
        || database_has_internal_provenance(&target_database)?;
    if reconcile_compat_file_presence(&source_database, &target_database, database_was_tracked)? {
        merge_database(
            &source_database,
            &target_database,
            &mut manifest.database_rows,
        )?;
        require_compat_file_presence(&source_database, &target_database)?;
        manifest.files.insert(DATABASE_FILE.to_owned());
    } else {
        manifest.files.remove(DATABASE_FILE);
        manifest.database_rows.clear();
    }
    for file_name in BUN_COMPAT_JSON_FILES {
        reconcile_compat_json(root, target_root, file_name, manifest)?;
        for index in 0..PROFILE_BACKUP_COUNT {
            reconcile_compat_json(
                root,
                target_root,
                &format!("{file_name}.bak.{index}"),
                manifest,
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
            migrate_profile_sqlite(root, target_root, database)?;
            require_compat_file_presence(&source, &target)?;
            manifest.files.insert((*database).to_owned());
        } else {
            manifest.files.remove(*database);
        }
    }
    let mut migrated_files = 0_usize;
    for directory in BUN_COMPAT_DIRECTORIES {
        reconcile_compat_directory(root, target_root, directory, &mut migrated_files, manifest)?;
    }
    Ok(())
}

fn reconcile_compat_json(
    root: &Path,
    target_root: &Path,
    file_name: &str,
    manifest: &mut CompatManifest,
) -> Result<(), ProfileError> {
    let source = root.join(file_name);
    let target = target_root.join(file_name);
    let was_tracked = manifest.files.contains(file_name);
    if reconcile_compat_file_presence(&source, &target, was_tracked)? {
        if !was_tracked {
            manifest.files.insert(file_name.to_owned());
            write_compat_manifest(root, manifest)?;
        }
        migrate_profile_json(root, target_root, file_name)?;
        require_compat_file_presence(&source, &target)?;
        manifest.files.insert(file_name.to_owned());
    } else {
        manifest.files.remove(file_name);
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

fn require_compat_file_presence(source: &Path, target: &Path) -> Result<(), ProfileError> {
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
            return Ok(());
        }
        (true, _, _) => {}
    }
    let prior_entries = manifest_directory_entries(manifest, directory);
    let source_entries = scan_compat_directory(&source)?;
    for (path, prior_kind) in prior_entries {
        let source_path = join_components(&source, &path);
        let target_path = join_components(&target, &path);
        match source_entries.get(&path) {
            Some(source_kind) if source_kind != &prior_kind => {
                return Err(ProfileError::MigrationConflict(source_path));
            }
            Some(_) if path_kind(&target_path)? != Some(prior_kind) => {
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
    merge_compat_directory_snapshot(root, &source, &target, &source_entries, migrated_files)?;
    verify_compat_directory(root, &source, &target, &source_entries)?;
    require_compat_directory_presence(&source, &target)?;
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

fn verify_compat_directory(
    migration_root: &Path,
    source: &Path,
    target: &Path,
    entries: &BTreeMap<Vec<String>, CompatEntryKind>,
) -> Result<(), ProfileError> {
    for (path, kind) in entries {
        let source_path = join_components(source, path);
        let target_path = join_components(target, path);
        if path_kind(&target_path)? != Some(*kind) {
            return Err(ProfileError::MigrationConflict(target_path));
        }
        match kind {
            CompatEntryKind::Directory => {}
            CompatEntryKind::File if !files_equal(&source_path, &target_path)? => {
                return Err(ProfileError::MigrationConflict(target_path));
            }
            CompatEntryKind::File => {}
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

fn join_components(root: &Path, components: &[String]) -> PathBuf {
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
    if manifest.schema_version == 1 {
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

fn validate_database_provenance(
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
        !PROFILE_TABLES.contains(&table.as_str())
            || rows.iter().any(|(digest, occurrences)| {
                digest.len() != 64
                    || *occurrences == 0
                    || !digest
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            })
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

fn is_path_component(value: &str) -> bool {
    let mut components = Path::new(value).components();
    matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none()
}

fn migrate_profile_json(
    root: &Path,
    target_root: &Path,
    file_name: &str,
) -> Result<(), ProfileError> {
    let source = root.join(file_name);
    let Some(bytes) = read_bounded_file(&source, MAX_PROFILE_FILE_BYTES)? else {
        return Ok(());
    };
    let Ok(mut document) = serde_json::from_slice::<Value>(&bytes) else {
        return copy_file_no_clobber(&source, &target_root.join(file_name));
    };
    rewrite_managed_paths(&mut document, root, target_root);
    let payload = serde_json::to_vec_pretty(&document)?;
    publish_payload_no_clobber(&payload, &target_root.join(file_name))
}

fn rewrite_managed_paths(value: &mut Value, source_root: &Path, target_root: &Path) {
    match value {
        Value::Array(values) => {
            for value in values {
                rewrite_managed_paths(value, source_root, target_root);
            }
        }
        Value::Object(values) => {
            for (key, value) in values {
                if matches!(key.as_str(), "managedAuthPath" | "managedHomePath") {
                    rewrite_managed_path(value, source_root, target_root);
                } else {
                    rewrite_managed_paths(value, source_root, target_root);
                }
            }
        }
        Value::Bool(_) | Value::Null | Value::Number(_) | Value::String(_) => {}
    }
}

fn rewrite_managed_path(value: &mut Value, source_root: &Path, target_root: &Path) {
    let Value::String(path) = value else {
        return;
    };
    let candidate = Path::new(path);
    for directory in ["claude-accounts", "codex-accounts", "codex-runtime-home"] {
        let source = source_root.join(directory);
        let Ok(relative) = candidate.strip_prefix(&source) else {
            continue;
        };
        *path = target_root
            .join(directory)
            .join(relative)
            .to_string_lossy()
            .into_owned();
        break;
    }
}

fn migrate_profile_sqlite(
    root: &Path,
    target_root: &Path,
    file_name: &str,
) -> Result<(), ProfileError> {
    let source = root.join(file_name);
    if !is_regular_source(&source)? {
        return Ok(());
    }
    let connection = Connection::open_with_flags(
        &source,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )?;
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    if connection.query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))? != "ok" {
        return Err(ProfileError::MigrationConflict(source));
    }
    connection.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;
    connection
        .close()
        .map_err(|(_, error)| ProfileError::Sqlite(error))?;
    sync_file_and_parent(&source)?;
    copy_file_no_clobber(&source, &target_root.join(file_name))
}

fn is_regular_source(path: &Path) -> Result<bool, ProfileError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => Ok(true),
        Ok(_) => Err(ProfileError::MigrationConflict(path.to_owned())),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

fn database_has_internal_provenance(path: &Path) -> Result<bool, ProfileError> {
    if !is_regular_source(path)? {
        return Ok(false);
    }
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )?;
    let has_provenance = table_exists(&connection, "main", DATABASE_PROVENANCE_TABLE)?;
    connection
        .close()
        .map_err(|(_, error)| ProfileError::Sqlite(error))?;
    Ok(has_provenance)
}

fn merge_database(
    source: &Path,
    target: &Path,
    database_rows: &mut BTreeMap<String, BTreeMap<String, u64>>,
) -> Result<(), ProfileError> {
    let source_identity = database_identity(source)?;
    if let Ok(metadata) = fs::symlink_metadata(target)
        && !metadata.file_type().is_file()
    {
        return Err(ProfileError::MigrationConflict(target.to_owned()));
    }
    let mut connection = Connection::open_with_flags(
        target,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )?;
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    connection.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = OFF;
         PRAGMA wal_autocheckpoint = 1000;",
    )?;
    connection.set_db_config(DbConfig::SQLITE_DBCONFIG_ENABLE_ATTACH_CREATE, false)?;
    connection.set_db_config(DbConfig::SQLITE_DBCONFIG_ENABLE_ATTACH_WRITE, false)?;
    let source_text = source
        .to_str()
        .ok_or_else(|| ProfileError::MigrationConflict(source.to_owned()))?;
    connection.execute("ATTACH DATABASE ?1 AS legacy", [source_text])?;
    if database_identity(source)? != source_identity {
        let _ = connection.execute_batch("DETACH DATABASE legacy");
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    let integrity = connection.query_row("PRAGMA legacy.quick_check", [], |row| {
        row.get::<_, String>(0)
    })?;
    if integrity != "ok" {
        let _ = connection.execute_batch("DETACH DATABASE legacy");
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    let migration = merge_attached_database(&mut connection, source, database_rows);
    let detach = connection.execute_batch("DETACH DATABASE legacy");
    if let Err(error) = migration {
        let _ = detach;
        return Err(error);
    }
    detach?;
    if database_identity(source)? != source_identity {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA wal_checkpoint(TRUNCATE);",
    )?;
    if connection.prepare("PRAGMA foreign_key_check")?.exists([])? {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    connection
        .close()
        .map_err(|(_, error)| ProfileError::Sqlite(error))?;
    sync_file_and_parent(target)?;
    Ok(())
}

#[cfg(unix)]
fn database_identity(path: &Path) -> Result<DatabaseIdentity, ProfileError> {
    use std::os::unix::fs::MetadataExt as _;

    let metadata = fs::symlink_metadata(path)?;
    if !metadata.file_type().is_file() {
        return Err(ProfileError::MigrationConflict(path.to_owned()));
    }
    Ok(DatabaseIdentity {
        first: metadata.dev(),
        second: metadata.ino(),
    })
}

#[cfg(windows)]
fn database_identity(path: &Path) -> Result<DatabaseIdentity, ProfileError> {
    use std::os::windows::fs::MetadataExt as _;

    let metadata = fs::symlink_metadata(path)?;
    if !metadata.file_type().is_file() {
        return Err(ProfileError::MigrationConflict(path.to_owned()));
    }
    let Some(volume) = metadata.volume_serial_number() else {
        return Err(ProfileError::MigrationConflict(path.to_owned()));
    };
    let Some(file_index) = metadata.file_index() else {
        return Err(ProfileError::MigrationConflict(path.to_owned()));
    };
    Ok(DatabaseIdentity {
        first: u64::from(volume),
        second: file_index,
    })
}

#[cfg(not(any(unix, windows)))]
fn database_identity(path: &Path) -> Result<DatabaseIdentity, ProfileError> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.file_type().is_file() {
        return Err(ProfileError::MigrationConflict(path.to_owned()));
    }
    let modified = metadata.modified()?.duration_since(std::time::UNIX_EPOCH)?;
    Ok(DatabaseIdentity {
        first: metadata.len(),
        second: modified.as_secs() ^ u64::from(modified.subsec_nanos()),
    })
}

fn merge_attached_database(
    connection: &mut Connection,
    source: &Path,
    database_rows: &mut BTreeMap<String, BTreeMap<String, u64>>,
) -> Result<(), ProfileError> {
    let source_tables = source_tables(connection)?;
    if source_tables
        .iter()
        .any(|table| !PROFILE_TABLES.contains(&table.as_str()))
    {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    let had_internal_provenance = table_exists(connection, "main", DATABASE_PROVENANCE_TABLE)?;
    let transaction = connection.transaction()?;
    transaction.execute_batch(DATABASE_PROVENANCE_SCHEMA)?;
    if table_columns(&transaction, "main", DATABASE_PROVENANCE_TABLE)?
        != ["table_name", "row_digest", "occurrences"]
    {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    let prior_database_rows = if had_internal_provenance {
        load_internal_database_provenance(&transaction, source)?
    } else {
        database_rows.clone()
    };
    validate_database_provenance(&prior_database_rows, source)?;
    if prior_database_rows
        .iter()
        .any(|(table, rows)| !rows.is_empty() && !source_tables.contains(table))
    {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    let mut next_database_rows = BTreeMap::new();
    for table in source_tables {
        ensure_target_table(&transaction, &table, source)?;
        let source_columns = table_columns(&transaction, "legacy", &table)?;
        let target_columns = table_columns(&transaction, "main", &table)?;
        if source_columns.is_empty()
            || source_columns
                .iter()
                .any(|column| !target_columns.contains(column))
        {
            return Err(ProfileError::MigrationConflict(source.to_owned()));
        }
        let source_rows = database_row_digests(&transaction, "legacy", &table, &source_columns)?;
        if source_rows.values().any(|occurrences| *occurrences > 1) {
            return Err(ProfileError::MigrationConflict(source.to_owned()));
        }
        let target_rows = database_row_digests(&transaction, "main", &table, &source_columns)?;
        if prior_database_rows.get(&table).is_some_and(|prior_rows| {
            prior_rows.iter().any(|(digest, occurrences)| {
                source_rows.get(digest).unwrap_or(&0) < occurrences
                    || target_rows.get(digest).unwrap_or(&0) < occurrences
            })
        }) {
            return Err(ProfileError::MigrationConflict(source.to_owned()));
        }
        let quoted_table = quote_identifier(&table);
        let source_projection = source_columns
            .iter()
            .map(|column| quote_identifier(column))
            .collect::<Vec<_>>()
            .join(",");
        let mut insert_columns = source_columns.clone();
        let mut select_expressions = source_columns
            .iter()
            .map(|column| quote_identifier(column))
            .collect::<Vec<_>>();
        add_legacy_identity_column(
            &table,
            "wire_id",
            "id",
            &source_columns,
            &target_columns,
            &mut insert_columns,
            &mut select_expressions,
        );
        add_legacy_identity_column(
            &table,
            "storage_id",
            "id",
            &source_columns,
            &target_columns,
            &mut insert_columns,
            &mut select_expressions,
        );
        let insert_columns = insert_columns
            .iter()
            .map(|column| quote_identifier(column))
            .collect::<Vec<_>>()
            .join(",");
        let select_expressions = select_expressions.join(",");
        let equality = source_columns
            .iter()
            .map(|column| {
                let column = quote_identifier(column);
                format!("target.{column} IS source.{column}")
            })
            .collect::<Vec<_>>()
            .join(" AND ");
        transaction.execute_batch(&format!(
            "INSERT INTO main.{quoted_table}({insert_columns})
             SELECT {select_expressions} FROM legacy.{quoted_table} AS source
             WHERE NOT EXISTS (
               SELECT 1 FROM main.{quoted_table} AS target WHERE {equality}
             )
             ON CONFLICT DO NOTHING;"
        ))?;
        let merged_rows = database_row_digests(&transaction, "main", &table, &source_columns)?;
        if source_rows
            .iter()
            .any(|(digest, occurrences)| merged_rows.get(digest).unwrap_or(&0) < occurrences)
        {
            return Err(ProfileError::MigrationConflict(source.to_owned()));
        }
        let missing = transaction.query_row(
            &format!(
                "SELECT EXISTS(
                       SELECT {source_projection} FROM legacy.{quoted_table}
                       EXCEPT SELECT {source_projection} FROM main.{quoted_table}
                     )"
            ),
            [],
            |row| row.get::<_, bool>(0),
        )?;
        if missing {
            return Err(ProfileError::MigrationConflict(source.to_owned()));
        }
        next_database_rows.insert(table, source_rows);
    }
    store_internal_database_provenance(&transaction, &next_database_rows)?;
    transaction.commit()?;
    *database_rows = next_database_rows;
    Ok(())
}

fn add_legacy_identity_column(
    table: &str,
    target_column: &str,
    source_column: &str,
    source_columns: &[String],
    target_columns: &[String],
    insert_columns: &mut Vec<String>,
    select_expressions: &mut Vec<String>,
) {
    let applies = matches!(
        (table, target_column),
        ("project", "wire_id") | ("worktree_metadata", "storage_id")
    );
    if applies
        && !source_columns.iter().any(|column| column == target_column)
        && target_columns.iter().any(|column| column == target_column)
    {
        insert_columns.push(target_column.to_owned());
        select_expressions.push(quote_identifier(source_column));
    }
}

fn source_tables(connection: &Connection) -> Result<Vec<String>, ProfileError> {
    let mut statement = connection.prepare(
        "SELECT name FROM legacy.sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
           AND name NOT IN ('mobile_device','mobile_notification','dangerous_credential')
         ORDER BY rowid",
    )?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    let mut tables = Vec::new();
    for row in rows {
        tables.push(row?);
        if tables.len() > PROFILE_TABLES.len() {
            return Err(ProfileError::MigrationCapacity);
        }
    }
    Ok(tables)
}

fn ensure_target_table(
    connection: &Connection,
    table: &str,
    source: &Path,
) -> Result<(), ProfileError> {
    if table_exists(connection, "main", table)? {
        return Ok(());
    }
    let sql = connection
        .query_row(
            "SELECT sql FROM legacy.sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| ProfileError::MigrationConflict(source.to_owned()))?;
    let normalized = sql.trim_start().to_ascii_uppercase();
    if !normalized.starts_with("CREATE TABLE")
        || sql.contains(';')
        || normalized.contains("ATTACH DATABASE")
        || normalized.contains("PRAGMA ")
    {
        return Err(ProfileError::MigrationConflict(source.to_owned()));
    }
    connection.execute_batch(&sql)?;
    Ok(())
}

fn table_exists(
    connection: &Connection,
    schema: &str,
    table: &str,
) -> Result<bool, rusqlite::Error> {
    connection.query_row(
        &format!(
            "SELECT EXISTS(
               SELECT 1 FROM {schema}.sqlite_master WHERE type = 'table' AND name = ?1
             )"
        ),
        [table],
        |row| row.get(0),
    )
}

fn table_columns(
    connection: &Connection,
    schema: &str,
    table: &str,
) -> Result<Vec<String>, rusqlite::Error> {
    let mut statement = connection.prepare(&format!(
        "SELECT name FROM {schema}.pragma_table_info(?1) ORDER BY cid"
    ))?;
    let rows = statement.query_map([table], |row| row.get::<_, String>(0))?;
    rows.collect()
}

fn load_internal_database_provenance(
    connection: &Connection,
    source: &Path,
) -> Result<BTreeMap<String, BTreeMap<String, u64>>, ProfileError> {
    let mut statement = connection.prepare(&format!(
        "SELECT table_name,row_digest,occurrences FROM main.{} ORDER BY table_name,row_digest",
        quote_identifier(DATABASE_PROVENANCE_TABLE)
    ))?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
        ))
    })?;
    let mut result = BTreeMap::<String, BTreeMap<String, u64>>::new();
    let mut row_count = 0_usize;
    for row in rows {
        row_count = row_count
            .checked_add(1)
            .filter(|count| *count <= MAX_COMPAT_DATABASE_ROWS)
            .ok_or(ProfileError::MigrationCapacity)?;
        let (table, digest, occurrences) = row?;
        let occurrences = u64::try_from(occurrences)
            .map_err(|_| ProfileError::MigrationConflict(source.to_owned()))?;
        if result
            .entry(table)
            .or_default()
            .insert(digest, occurrences)
            .is_some()
        {
            return Err(ProfileError::MigrationConflict(source.to_owned()));
        }
    }
    Ok(result)
}

fn store_internal_database_provenance(
    transaction: &Connection,
    database_rows: &BTreeMap<String, BTreeMap<String, u64>>,
) -> Result<(), ProfileError> {
    transaction.execute(
        &format!(
            "DELETE FROM main.{}",
            quote_identifier(DATABASE_PROVENANCE_TABLE)
        ),
        [],
    )?;
    let mut statement = transaction.prepare(&format!(
        "INSERT INTO main.{}(table_name,row_digest,occurrences) VALUES (?1,?2,?3)",
        quote_identifier(DATABASE_PROVENANCE_TABLE)
    ))?;
    for (table, rows) in database_rows {
        for (digest, occurrences) in rows {
            let occurrences =
                i64::try_from(*occurrences).map_err(|_| ProfileError::MigrationCapacity)?;
            statement.execute((table, digest, occurrences))?;
        }
    }
    Ok(())
}

fn database_row_digests(
    connection: &Connection,
    schema: &str,
    table: &str,
    columns: &[String],
) -> Result<BTreeMap<String, u64>, ProfileError> {
    let projection = columns
        .iter()
        .map(|column| quote_identifier(column))
        .collect::<Vec<_>>()
        .join(",");
    let mut statement = connection.prepare(&format!(
        "SELECT {projection} FROM {}.{}",
        quote_identifier(schema),
        quote_identifier(table)
    ))?;
    let mut rows = statement.query([])?;
    let mut result = BTreeMap::new();
    let mut row_count = 0_usize;
    while let Some(row) = rows.next()? {
        row_count = row_count
            .checked_add(1)
            .filter(|count| *count <= MAX_COMPAT_DATABASE_ROWS)
            .ok_or(ProfileError::MigrationCapacity)?;
        let digest = database_row_digest(row, columns.len())?;
        let occurrences = result.entry(digest).or_insert(0_u64);
        *occurrences = occurrences
            .checked_add(1)
            .ok_or(ProfileError::MigrationCapacity)?;
    }
    Ok(result)
}

fn database_row_digest(row: &Row<'_>, column_count: usize) -> Result<String, rusqlite::Error> {
    let mut hash = Sha256::new();
    hash.update(b"yiru-profile-compat-row-v1\0");
    for index in 0..column_count {
        match row.get_ref(index)? {
            ValueRef::Null => hash.update([0]),
            ValueRef::Integer(value) => {
                hash.update([1]);
                hash.update(value.to_be_bytes());
            }
            ValueRef::Real(value) => {
                hash.update([2]);
                hash.update(value.to_bits().to_be_bytes());
            }
            ValueRef::Text(value) => {
                hash.update([3]);
                hash.update((value.len() as u64).to_be_bytes());
                hash.update(value);
            }
            ValueRef::Blob(value) => {
                hash.update([4]);
                hash.update((value.len() as u64).to_be_bytes());
                hash.update(value);
            }
        }
    }
    Ok(hash
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn quote_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn merge_directory(
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

fn merge_compat_directory_snapshot(
    migration_root: &Path,
    source: &Path,
    target: &Path,
    entries: &BTreeMap<Vec<String>, CompatEntryKind>,
    files: &mut usize,
) -> Result<(), ProfileError> {
    require_directory(source, false)?;
    require_directory(target, true)?;
    for (path, kind) in entries {
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
            CompatEntryKind::File => copy_file_no_clobber(&source_path, &target_path)?,
            CompatEntryKind::ProductSymlink => {
                migrate_product_symlink(migration_root, &source_path, &target_path)?;
            }
        }
    }
    Ok(())
}

fn publish_payload_no_clobber(payload: &[u8], target: &Path) -> Result<(), ProfileError> {
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

fn copy_file_no_clobber(source: &Path, target: &Path) -> Result<(), ProfileError> {
    match fs::symlink_metadata(target) {
        Ok(metadata) => {
            if !metadata.file_type().is_file() {
                return Err(ProfileError::MigrationConflict(target.to_owned()));
            }
            return if files_equal(source, target)? {
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
            if !files_equal(source, target)? {
                return Err(ProfileError::MigrationConflict(target.to_owned()));
            }
            let source_file = open_regular_file(source)?;
            harden_copied_file(&source_file, target)?;
            sync_file_and_parent(target)
        }
        Err(error) => Err(error.into()),
    }
}

fn require_directory(path: &Path, create: bool) -> Result<(), ProfileError> {
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

fn migrate_product_symlink(
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

fn sync_file_and_parent(path: &Path) -> Result<(), ProfileError> {
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

fn write_journal(root: &Path, phase: &str, reason: Option<String>) -> Result<(), ProfileError> {
    secure_file::write_json(
        &root.join(JOURNAL_FILE),
        &MigrationJournal {
            phase: phase.to_owned(),
            reason,
            schema_version: JOURNAL_SCHEMA_VERSION,
        },
    )?;
    Ok(())
}

fn read_journal(root: &Path) -> Result<Option<MigrationJournalState>, ProfileError> {
    let path = root.join(JOURNAL_FILE);
    let Some(bytes) = read_bounded_file(&path, MAX_JOURNAL_BYTES)? else {
        return Ok(None);
    };
    let journal = serde_json::from_slice::<MigrationJournal>(&bytes)?;
    if !(1..=JOURNAL_SCHEMA_VERSION).contains(&journal.schema_version) {
        return Err(ProfileError::MigrationConflict(path));
    }
    let phase = match journal.phase.as_str() {
        "database-committed" => MigrationPhase::DatabaseCommitted,
        "complete" => MigrationPhase::LegacyComplete,
        "bun-compat-sources-retained" if journal.schema_version >= 3 => {
            MigrationPhase::BunCompatSourcesRetained
        }
        "legacy-writer-divergence" if journal.schema_version >= 3 => {
            MigrationPhase::LegacyWriterDivergence
        }
        _ => return Err(ProfileError::MigrationConflict(path)),
    };
    Ok(Some(MigrationJournalState { phase }))
}

struct MigrationJournalState {
    phase: MigrationPhase,
}

fn read_bounded_file(path: &Path, maximum_bytes: u64) -> Result<Option<Vec<u8>>, ProfileError> {
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

fn open_regular_file(path: &Path) -> Result<File, ProfileError> {
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
