use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs::{self, OpenOptions};
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};

use rusqlite::{Connection, OpenFlags, OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::InstallationDatabaseError;
use crate::transport::secure_file;

const LEGACY_DATABASE_FILE: &str = "yiru.sqlite";
const JOURNAL_FILE: &str = "yiru-installation-migration.json";
const KEYPAIR_FILE: &str = "mobile-e2ee-keypair.json";
const MAX_PROFILE_SOURCES: usize = 100;
const MAX_DEVICE_ROWS: usize = 4_096;
const MAX_NOTIFICATION_ROWS: usize = 65_536;
const MAX_FIELD_BYTES: usize = 1024 * 1024;
const MAX_MIGRATION_BYTES: usize = 64 * 1024 * 1024;
const MAX_SCANNED_SOURCE_ROWS: usize =
    MAX_NOTIFICATION_ROWS + MAX_DEVICE_ROWS + MAX_PROFILE_SOURCES + 1;
const MAX_SCANNED_SOURCE_BYTES: usize = 64 * 1024 * 1024;
const MAX_JOURNAL_BYTES: u64 = 4 * 1024;

#[derive(Clone, Eq, PartialEq)]
struct MobileDeviceRow {
    apns_environment: Option<String>,
    apns_token: Option<String>,
    id: String,
    last_seen_at: i64,
    name: String,
    paired_at: i64,
    push_updated_at: Option<i64>,
    token: String,
}

#[derive(Clone, Eq, PartialEq)]
struct NotificationRow {
    id: i64,
    occurred_at: i64,
    payload: String,
}

#[derive(Clone, Eq, PartialEq)]
struct DangerousCredentialRow {
    created_at: i64,
    credential_id: String,
    id: i64,
    public_key_spki: String,
    user_id: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationJournal {
    phase: String,
    schema_version: u64,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum MigrationPhase {
    InstallationCommitted,
    SourcesRetained,
}

#[derive(Default)]
struct SourceScanBudget {
    bytes: usize,
    rows: usize,
}

struct MigrationSource {
    connection: Connection,
    identity: DatabaseIdentity,
    key: String,
    path: PathBuf,
}

struct LegacyNotificationRow {
    occurred_at: i64,
    origin_source_key: String,
    payload: String,
    target_id: Option<i64>,
}

struct NotificationProvenanceRow {
    local_id: i64,
    target_id: Option<i64>,
}

#[derive(Clone, Copy, Eq, PartialEq)]
struct DatabaseIdentity {
    first: u64,
    second: u64,
}

pub(super) fn merge_legacy_installation_data(
    installation_root: &Path,
    target: &mut Connection,
) -> Result<(), InstallationDatabaseError> {
    let phase = read_journal(installation_root)?;
    let profile_sources = profile_sources(installation_root)?;
    let mut source_candidates = Vec::with_capacity(profile_sources.len() + 1);
    let root_source = installation_root.join(LEGACY_DATABASE_FILE);
    if is_database_source(&root_source)? {
        source_candidates.push(root_source);
    }
    source_candidates.extend(profile_sources);
    let mut sources = Vec::new();
    for source in source_candidates {
        if source_has_migrated_tables(&source)? {
            sources.push(source);
        }
    }
    let mut opened_sources = Vec::with_capacity(sources.len());
    for source in sources {
        let key = migration_source_key(installation_root, &source)?;
        opened_sources.push(open_source(source, key)?);
    }

    let transaction = target.transaction()?;
    let mut migration_bytes = 0_usize;
    let mut source_scan_budget = SourceScanBudget::default();
    let target_devices = load_target_devices(&transaction, &mut migration_bytes)?;
    let mut devices = target_devices.clone();
    let mut notifications = load_target_notifications(&transaction, &mut migration_bytes)?;
    let mut notification_provenance =
        load_notification_provenance(&transaction, installation_root, &notifications)?;
    let target_dangerous = load_target_dangerous_credential(&transaction, &mut migration_bytes)?;
    let mut dangerous = target_dangerous.clone();
    let previous_device_sources = load_device_provenance(&transaction, installation_root)?;
    let previous_dangerous_sources = load_dangerous_provenance(&transaction, installation_root)?;
    let mut current_device_sources = BTreeMap::new();
    let mut current_dangerous_sources = BTreeSet::new();
    let mut legacy_notifications = HashMap::new();

    for source in &opened_sources {
        let source_devices = merge_devices(
            &source.path,
            &source.connection,
            &mut devices,
            &mut migration_bytes,
            &mut source_scan_budget,
        )?;
        current_device_sources.insert(source.key.clone(), source_devices);
        merge_notifications(
            &transaction,
            source,
            &mut notifications,
            &mut legacy_notifications,
            &mut notification_provenance,
            &mut migration_bytes,
            &mut source_scan_budget,
        )?;
        if merge_dangerous_credential(
            &source.path,
            &source.connection,
            &mut dangerous,
            &mut migration_bytes,
            &mut source_scan_budget,
        )? {
            current_dangerous_sources.insert(source.key.clone());
        }
    }
    validate_provenance(
        installation_root,
        &previous_device_sources,
        &current_device_sources,
        &target_devices,
        &previous_dangerous_sources,
        &current_dangerous_sources,
        target_dangerous.is_some(),
    )?;
    store_devices(&transaction, &target_devices, &devices, installation_root)?;
    store_dangerous_credential(&transaction, target_dangerous.as_ref(), dangerous.as_ref())?;
    store_provenance(
        &transaction,
        &current_device_sources,
        &current_dangerous_sources,
        &notification_provenance,
    )?;
    transaction.commit()?;

    ensure_mobile_keypair(installation_root, target)?;
    if !opened_sources.is_empty() || phase != Some(MigrationPhase::SourcesRetained) {
        write_journal(installation_root, "installation-committed")?;
    }
    for source in opened_sources {
        release_source(source)?;
    }
    write_journal(installation_root, "sources-retained")?;
    Ok(())
}

pub(super) fn validate_target_presence(
    installation_root: &Path,
    database_existed: bool,
) -> Result<(), InstallationDatabaseError> {
    if read_journal(installation_root)?.is_some() && !database_existed {
        return Err(InstallationDatabaseError::MigrationConflict {
            source_path: installation_root.join(JOURNAL_FILE),
            table: "migration-journal-target",
        });
    }
    Ok(())
}

fn profile_sources(root: &Path) -> Result<Vec<PathBuf>, InstallationDatabaseError> {
    let profiles_root = root.join("profiles");
    match fs::symlink_metadata(&profiles_root) {
        Ok(metadata) if metadata.file_type().is_dir() => {}
        Ok(_) => {
            return Err(InstallationDatabaseError::MigrationConflict {
                source_path: profiles_root,
                table: "profiles-path",
            });
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(source) => return Err(io_error("inspect profiles", &profiles_root, source)),
    }
    let entries = match fs::read_dir(&profiles_root) {
        Ok(entries) => entries,
        Err(source) => return Err(io_error("read profiles", &profiles_root, source)),
    };
    let mut sources = Vec::new();
    for (entry_index, entry) in entries.enumerate() {
        let entry = entry.map_err(|source| io_error("read profile", &profiles_root, source))?;
        if entry_index >= MAX_PROFILE_SOURCES {
            return Err(InstallationDatabaseError::MigrationCapacity);
        }
        if !entry
            .file_type()
            .map_err(|source| io_error("inspect profile", &entry.path(), source))?
            .is_dir()
        {
            continue;
        }
        let source = entry.path().join(LEGACY_DATABASE_FILE);
        if is_database_source(&source)? {
            sources.push(source);
        }
    }
    sources.sort();
    Ok(sources)
}

fn is_database_source(path: &Path) -> Result<bool, InstallationDatabaseError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => Ok(true),
        Ok(_) => Err(InstallationDatabaseError::MigrationConflict {
            source_path: path.to_owned(),
            table: "database-path",
        }),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(source) => Err(io_error("inspect migration database", path, source)),
    }
}

#[cfg(unix)]
fn database_identity(path: &Path) -> Result<DatabaseIdentity, InstallationDatabaseError> {
    use std::os::unix::fs::MetadataExt as _;

    let metadata = fs::symlink_metadata(path)
        .map_err(|source| io_error("identify migration database", path, source))?;
    if !metadata.file_type().is_file() {
        return conflict(path, "database-path");
    }
    Ok(DatabaseIdentity {
        first: metadata.dev(),
        second: metadata.ino(),
    })
}

#[cfg(windows)]
fn database_identity(path: &Path) -> Result<DatabaseIdentity, InstallationDatabaseError> {
    use std::os::windows::fs::MetadataExt as _;

    let metadata = fs::symlink_metadata(path)
        .map_err(|source| io_error("identify migration database", path, source))?;
    if !metadata.file_type().is_file() {
        return conflict(path, "database-path");
    }
    let Some(volume) = metadata.volume_serial_number() else {
        return conflict(path, "database-identity");
    };
    let Some(file_index) = metadata.file_index() else {
        return conflict(path, "database-identity");
    };
    Ok(DatabaseIdentity {
        first: u64::from(volume),
        second: file_index,
    })
}

#[cfg(not(any(unix, windows)))]
fn database_identity(path: &Path) -> Result<DatabaseIdentity, InstallationDatabaseError> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|source| io_error("identify migration database", path, source))?;
    if !metadata.file_type().is_file() {
        return conflict(path, "database-path");
    }
    let modified = metadata
        .modified()
        .and_then(|value| {
            value
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(io::Error::other)
        })
        .map_err(|source| io_error("identify migration database", path, source))?;
    Ok(DatabaseIdentity {
        first: metadata.len(),
        second: modified.as_secs() ^ u64::from(modified.subsec_nanos()),
    })
}

fn open_source(path: PathBuf, key: String) -> Result<MigrationSource, InstallationDatabaseError> {
    let identity = database_identity(&path)?;
    let connection = open_source_connection(&path, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    if database_identity(&path)? != identity {
        return conflict(&path, "database-path-replaced");
    }
    connection.execute_batch("BEGIN IMMEDIATE")?;
    Ok(MigrationSource {
        connection,
        identity,
        key,
        path,
    })
}

fn source_has_migrated_tables(path: &Path) -> Result<bool, InstallationDatabaseError> {
    let connection = open_source_connection(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let has_tables = has_migrated_tables(&connection)?;
    connection
        .close()
        .map_err(|(_connection, error)| InstallationDatabaseError::Sqlite(error))?;
    Ok(has_tables)
}

fn open_source_connection(
    path: &Path,
    access: OpenFlags,
) -> Result<Connection, InstallationDatabaseError> {
    let connection = Connection::open_with_flags(
        path,
        access | OpenFlags::SQLITE_OPEN_NO_MUTEX | OpenFlags::SQLITE_OPEN_NOFOLLOW,
    )?;
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    Ok(connection)
}

fn merge_devices(
    source_path: &Path,
    source: &Connection,
    devices: &mut HashMap<String, MobileDeviceRow>,
    migration_bytes: &mut usize,
    source_scan_budget: &mut SourceScanBudget,
) -> Result<BTreeSet<String>, InstallationDatabaseError> {
    if !has_table(source, "mobile_device")? {
        return Ok(BTreeSet::new());
    }
    let apns_token = optional_column(source, "mobile_device", "apns_token", "apns_token")?;
    let apns_environment = optional_column(
        source,
        "mobile_device",
        "apns_environment",
        "apns_environment",
    )?;
    let push_updated_at = optional_column(
        source,
        "mobile_device",
        "push_updated_at",
        "push_updated_at",
    )?;
    enforce_source_table_budget(
        source,
        "mobile_device",
        MAX_DEVICE_ROWS,
        &format!(
            "length(id)+length(name)+length(token)+COALESCE(length({apns_token}),0)
             +COALESCE(length({apns_environment}),0)"
        ),
        source_scan_budget,
    )?;
    check_table_integrity(source_path, source, "mobile_device")?;
    let sql = format!(
        "SELECT id,name,token,{apns_token},{apns_environment},{push_updated_at},paired_at,last_seen_at
         FROM mobile_device ORDER BY id"
    );
    let mut statement = source.prepare(&sql)?;
    let rows = statement.query_map([], |row| {
        Ok(MobileDeviceRow {
            id: row.get(0)?,
            name: row.get(1)?,
            token: row.get(2)?,
            apns_token: row.get(3)?,
            apns_environment: row.get(4)?,
            push_updated_at: row.get(5)?,
            paired_at: row.get(6)?,
            last_seen_at: row.get(7)?,
        })
    })?;
    let mut source_ids = BTreeSet::new();
    for row in rows {
        let row = row?;
        validate_device(&row)?;
        if !source_ids.insert(row.id.clone()) {
            return conflict(source_path, "mobile_device");
        }
        if devices.len() >= MAX_DEVICE_ROWS && !devices.contains_key(&row.id) {
            return Err(InstallationDatabaseError::MigrationCapacity);
        }
        if let Some(existing) = devices.get(&row.id) {
            let canonical = canonical_device(existing, &row, source_path)?;
            replace_migration_bytes(
                migration_bytes,
                device_bytes(existing),
                device_bytes(&canonical),
            )?;
            devices.insert(row.id.clone(), canonical);
        } else {
            reserve_migration_bytes(migration_bytes, device_bytes(&row))?;
            devices.insert(row.id.clone(), row);
        }
    }
    Ok(source_ids)
}

fn canonical_device(
    current: &MobileDeviceRow,
    incoming: &MobileDeviceRow,
    source_path: &Path,
) -> Result<MobileDeviceRow, InstallationDatabaseError> {
    let identity = match current.paired_at.cmp(&incoming.paired_at) {
        std::cmp::Ordering::Less => incoming,
        std::cmp::Ordering::Greater => current,
        std::cmp::Ordering::Equal => {
            if current.name != incoming.name || current.token != incoming.token {
                return conflict(source_path, "mobile_device");
            }
            current
        }
    };
    let push = match current.push_updated_at.cmp(&incoming.push_updated_at) {
        std::cmp::Ordering::Less => incoming,
        std::cmp::Ordering::Greater => current,
        std::cmp::Ordering::Equal => {
            if current.apns_token != incoming.apns_token
                || current.apns_environment != incoming.apns_environment
            {
                return conflict(source_path, "mobile_device");
            }
            current
        }
    };
    Ok(MobileDeviceRow {
        apns_environment: push.apns_environment.clone(),
        apns_token: push.apns_token.clone(),
        id: current.id.clone(),
        last_seen_at: current.last_seen_at.max(incoming.last_seen_at),
        name: identity.name.clone(),
        paired_at: identity.paired_at,
        push_updated_at: push.push_updated_at,
        token: identity.token.clone(),
    })
}

fn store_devices(
    transaction: &Transaction<'_>,
    previous: &HashMap<String, MobileDeviceRow>,
    devices: &HashMap<String, MobileDeviceRow>,
    installation_root: &Path,
) -> Result<(), InstallationDatabaseError> {
    let mut names = HashMap::with_capacity(devices.len());
    let mut tokens = HashMap::with_capacity(devices.len());
    for device in devices.values() {
        if names.insert(&device.name, &device.id).is_some()
            || tokens.insert(&device.token, &device.id).is_some()
        {
            return conflict(installation_root, "mobile_device");
        }
    }
    if previous == devices {
        return Ok(());
    }
    transaction.execute("DELETE FROM mobile_device", [])?;
    let mut devices = devices.values().collect::<Vec<_>>();
    devices.sort_by(|left, right| left.id.cmp(&right.id));
    for row in devices {
        transaction.execute(
            "INSERT INTO mobile_device(
               id,name,token,apns_token,apns_environment,push_updated_at,paired_at,last_seen_at
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                row.id,
                row.name,
                row.token,
                row.apns_token,
                row.apns_environment,
                row.push_updated_at,
                row.paired_at,
                row.last_seen_at,
            ],
        )?;
    }
    Ok(())
}

fn merge_notifications(
    target: &Transaction<'_>,
    source: &MigrationSource,
    notifications: &mut HashMap<i64, NotificationRow>,
    legacy_notifications: &mut HashMap<i64, LegacyNotificationRow>,
    notification_provenance: &mut HashMap<String, NotificationProvenanceRow>,
    migration_bytes: &mut usize,
    source_scan_budget: &mut SourceScanBudget,
) -> Result<(), InstallationDatabaseError> {
    if !has_table(&source.connection, "mobile_notification")? {
        return Ok(());
    }
    enforce_source_table_budget(
        &source.connection,
        "mobile_notification",
        MAX_NOTIFICATION_ROWS,
        "length(payload)",
        source_scan_budget,
    )?;
    check_table_integrity(&source.path, &source.connection, "mobile_notification")?;
    let mut statement = source
        .connection
        .prepare("SELECT id,payload,occurred_at FROM mobile_notification ORDER BY id")?;
    let rows = statement.query_map([], |row| {
        Ok(NotificationRow {
            id: row.get(0)?,
            payload: row.get(1)?,
            occurred_at: row.get(2)?,
        })
    })?;
    for row in rows {
        let row = row?;
        if row.payload.len() > MAX_FIELD_BYTES {
            return Err(InstallationDatabaseError::MigrationCapacity);
        }
        let local_id = row.id;
        let identity_digest = notification_identity_digest(local_id, &row)?;
        let source_target_id = notification_migration_id(&source.key, local_id);
        if let Some(canonical) = legacy_notifications.get(&local_id) {
            if canonical.origin_source_key == source.key
                || canonical.payload != row.payload
                || canonical.occurred_at != row.occurred_at
            {
                return conflict(&source.path, "mobile_notification");
            }
            let Some(provenance) = notification_provenance.get(&identity_digest) else {
                return conflict(&source.path, "legacy-notification-provenance");
            };
            if provenance.local_id != local_id || provenance.target_id != canonical.target_id {
                return conflict(&source.path, "legacy-notification-provenance");
            }
            remove_duplicate_notification(
                target,
                &source.path,
                notifications,
                source_target_id,
                canonical.target_id,
                canonical.occurred_at,
                &canonical.payload,
            )?;
            continue;
        }
        let canonical_target_id =
            if let Some(provenance) = notification_provenance.get(&identity_digest) {
                if provenance.local_id != local_id {
                    return conflict(&source.path, "legacy-notification-provenance");
                }
                provenance.target_id
            } else {
                Some(source_target_id)
            };
        let Some(target_id) = canonical_target_id else {
            remove_duplicate_notification(
                target,
                &source.path,
                notifications,
                source_target_id,
                None,
                row.occurred_at,
                &row.payload,
            )?;
            legacy_notifications.insert(
                local_id,
                LegacyNotificationRow {
                    occurred_at: row.occurred_at,
                    origin_source_key: source.key.clone(),
                    payload: row.payload,
                    target_id: None,
                },
            );
            continue;
        };
        let migrated = NotificationRow {
            id: target_id,
            occurred_at: row.occurred_at,
            payload: row.payload,
        };
        if let Some(existing) = notifications.get(&target_id) {
            if existing != &migrated {
                return conflict(&source.path, "mobile_notification");
            }
        } else {
            if notifications.len() >= MAX_NOTIFICATION_ROWS {
                return Err(InstallationDatabaseError::MigrationCapacity);
            }
            reserve_migration_bytes(migration_bytes, notification_bytes(&migrated))?;
            target.execute(
                "INSERT INTO mobile_notification(id,payload,occurred_at) VALUES (?1,?2,?3)",
                params![migrated.id, migrated.payload, migrated.occurred_at],
            )?;
            notifications.insert(migrated.id, migrated.clone());
        }
        if let Some(existing) = notification_provenance.get(&identity_digest) {
            if existing.local_id != local_id || existing.target_id != Some(target_id) {
                return conflict(&source.path, "legacy-notification-provenance");
            }
        } else {
            notification_provenance.insert(
                identity_digest,
                NotificationProvenanceRow {
                    local_id,
                    target_id: Some(target_id),
                },
            );
        }
        remove_duplicate_notification(
            target,
            &source.path,
            notifications,
            source_target_id,
            Some(target_id),
            migrated.occurred_at,
            &migrated.payload,
        )?;
        legacy_notifications.insert(
            local_id,
            LegacyNotificationRow {
                occurred_at: migrated.occurred_at,
                origin_source_key: source.key.clone(),
                payload: migrated.payload,
                target_id: Some(target_id),
            },
        );
    }
    Ok(())
}

fn remove_duplicate_notification(
    target: &Transaction<'_>,
    source_path: &Path,
    notifications: &mut HashMap<i64, NotificationRow>,
    duplicate_id: i64,
    canonical_id: Option<i64>,
    occurred_at: i64,
    payload: &str,
) -> Result<(), InstallationDatabaseError> {
    if Some(duplicate_id) == canonical_id {
        return Ok(());
    }
    let Some(existing) = notifications.get(&duplicate_id) else {
        return Ok(());
    };
    if existing.occurred_at != occurred_at || existing.payload != payload {
        return conflict(source_path, "mobile_notification");
    }
    target.execute(
        "DELETE FROM mobile_notification WHERE id = ?1",
        [duplicate_id],
    )?;
    notifications.remove(&duplicate_id);
    Ok(())
}

fn notification_identity_digest(
    local_id: i64,
    row: &NotificationRow,
) -> Result<String, InstallationDatabaseError> {
    let payload_length = u64::try_from(row.payload.len())
        .map_err(|_| InstallationDatabaseError::MigrationCapacity)?;
    let mut hash = Sha256::new();
    hash.update(b"yiru-installation-notification-identity-v1\0");
    hash.update([1]);
    hash.update(8_u64.to_be_bytes());
    hash.update(local_id.to_be_bytes());
    hash.update([2]);
    hash.update(8_u64.to_be_bytes());
    hash.update(row.occurred_at.to_be_bytes());
    hash.update([3]);
    hash.update(payload_length.to_be_bytes());
    hash.update(row.payload.as_bytes());
    Ok(hash
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn migration_source_key(
    installation_root: &Path,
    source: &Path,
) -> Result<String, InstallationDatabaseError> {
    let relative = source.strip_prefix(installation_root).map_err(|_| {
        InstallationDatabaseError::MigrationConflict {
            source_path: source.to_owned(),
            table: "migration-source",
        }
    })?;
    let components = relative.components().collect::<Vec<_>>();
    let key = match components.as_slice() {
        [Component::Normal(database)] if *database == LEGACY_DATABASE_FILE => {
            LEGACY_DATABASE_FILE.to_owned()
        }
        [
            Component::Normal(profiles),
            Component::Normal(profile),
            Component::Normal(database),
        ] if *profiles == "profiles" && *database == LEGACY_DATABASE_FILE => {
            let profile = profile.to_str().filter(|value| {
                !value.is_empty()
                    && *value != "."
                    && *value != ".."
                    && !value.contains('/')
                    && !value.contains('\\')
            });
            let Some(profile) = profile else {
                return conflict(source, "migration-source");
            };
            format!("profiles/{profile}/{LEGACY_DATABASE_FILE}")
        }
        _ => return conflict(source, "migration-source"),
    };
    Ok(key)
}

fn notification_migration_id(source_key: &str, local_id: i64) -> i64 {
    let mut hash = Sha256::new();
    hash.update(b"yiru-installation-notification-v1\0");
    hash.update(source_key.as_bytes());
    hash.update([0]);
    hash.update(local_id.to_be_bytes());
    let digest = hash.finalize();
    let mut prefix = [0_u8; 8];
    prefix.copy_from_slice(&digest[..8]);
    let magnitude = (u64::from_be_bytes(prefix) & i64::MAX as u64).max(1) as i64;
    -magnitude
}

fn merge_dangerous_credential(
    source_path: &Path,
    source: &Connection,
    dangerous: &mut Option<DangerousCredentialRow>,
    migration_bytes: &mut usize,
    source_scan_budget: &mut SourceScanBudget,
) -> Result<bool, InstallationDatabaseError> {
    if !has_table(source, "dangerous_credential")? {
        return Ok(false);
    }
    enforce_source_table_budget(
        source,
        "dangerous_credential",
        1,
        "length(credential_id)+length(public_key_spki)+length(user_id)",
        source_scan_budget,
    )?;
    check_table_integrity(source_path, source, "dangerous_credential")?;
    if source
        .prepare("SELECT 1 FROM dangerous_credential WHERE id != 1 LIMIT 1")?
        .exists([])?
    {
        return conflict(source_path, "dangerous_credential");
    }
    let row = source
        .query_row(
            "SELECT id,credential_id,public_key_spki,user_id,created_at
             FROM dangerous_credential WHERE id = 1",
            [],
            |row| {
                Ok(DangerousCredentialRow {
                    id: row.get(0)?,
                    credential_id: row.get(1)?,
                    public_key_spki: row.get(2)?,
                    user_id: row.get(3)?,
                    created_at: row.get(4)?,
                })
            },
        )
        .optional()?;
    let Some(row) = row else {
        return Ok(false);
    };
    validate_dangerous(&row)?;
    if let Some(existing) = dangerous.as_ref() {
        match existing.created_at.cmp(&row.created_at) {
            std::cmp::Ordering::Less => {
                replace_migration_bytes(
                    migration_bytes,
                    dangerous_bytes(existing),
                    dangerous_bytes(&row),
                )?;
                *dangerous = Some(row);
            }
            std::cmp::Ordering::Greater => {}
            std::cmp::Ordering::Equal if existing != &row => {
                return conflict(source_path, "dangerous_credential");
            }
            std::cmp::Ordering::Equal => {}
        }
        return Ok(true);
    }
    reserve_migration_bytes(migration_bytes, dangerous_bytes(&row))?;
    *dangerous = Some(row);
    Ok(true)
}

fn store_dangerous_credential(
    transaction: &Transaction<'_>,
    previous: Option<&DangerousCredentialRow>,
    dangerous: Option<&DangerousCredentialRow>,
) -> Result<(), InstallationDatabaseError> {
    if previous == dangerous {
        return Ok(());
    }
    transaction.execute("DELETE FROM dangerous_credential", [])?;
    if let Some(row) = dangerous {
        transaction.execute(
            "INSERT INTO dangerous_credential(
               id,credential_id,public_key_spki,user_id,created_at
             ) VALUES (?1,?2,?3,?4,?5)",
            params![
                row.id,
                row.credential_id,
                row.public_key_spki,
                row.user_id,
                row.created_at,
            ],
        )?;
    }
    Ok(())
}

fn load_device_provenance(
    connection: &Connection,
    installation_root: &Path,
) -> Result<BTreeMap<String, BTreeSet<String>>, InstallationDatabaseError> {
    enforce_table_budget(
        connection,
        "legacy_installation_mobile_device",
        MAX_SCANNED_SOURCE_ROWS,
        "length(source_key)+length(device_id)",
    )?;
    let mut statement = connection.prepare(
        "SELECT source_key,device_id
         FROM legacy_installation_mobile_device ORDER BY source_key,device_id",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut result = BTreeMap::<String, BTreeSet<String>>::new();
    for row in rows {
        let (source_key, device_id) = row?;
        provenance_source_path(installation_root, &source_key)?;
        if device_id.is_empty() || device_id.len() > MAX_FIELD_BYTES {
            return conflict(installation_root, "installation-migration-provenance");
        }
        if !result.entry(source_key).or_default().insert(device_id) {
            return conflict(installation_root, "installation-migration-provenance");
        }
    }
    Ok(result)
}

fn load_dangerous_provenance(
    connection: &Connection,
    installation_root: &Path,
) -> Result<BTreeSet<String>, InstallationDatabaseError> {
    enforce_table_budget(
        connection,
        "legacy_installation_dangerous_credential",
        MAX_PROFILE_SOURCES + 1,
        "length(source_key)",
    )?;
    let mut statement = connection.prepare(
        "SELECT source_key FROM legacy_installation_dangerous_credential ORDER BY source_key",
    )?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    let mut result = BTreeSet::new();
    for row in rows {
        let source_key = row?;
        provenance_source_path(installation_root, &source_key)?;
        if !result.insert(source_key) {
            return conflict(installation_root, "installation-migration-provenance");
        }
    }
    Ok(result)
}

fn load_notification_provenance(
    connection: &Connection,
    installation_root: &Path,
    notifications: &HashMap<i64, NotificationRow>,
) -> Result<HashMap<String, NotificationProvenanceRow>, InstallationDatabaseError> {
    enforce_table_budget(
        connection,
        "legacy_installation_notification",
        MAX_NOTIFICATION_ROWS,
        "length(identity_digest)",
    )?;
    let mut statement = connection.prepare(
        "SELECT identity_digest,local_id,target_id
         FROM legacy_installation_notification ORDER BY identity_digest",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, Option<i64>>(2)?,
        ))
    })?;
    let mut result = HashMap::new();
    for row in rows {
        let (identity_digest, local_id, target_id) = row?;
        let digest_is_valid = identity_digest.len() == 64
            && identity_digest
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte));
        let target_is_valid = match target_id {
            Some(target_id) if target_id < 0 => {
                notifications.get(&target_id).is_some_and(|notification| {
                    notification_identity_digest(local_id, notification)
                        .is_ok_and(|digest| digest == identity_digest)
                })
            }
            Some(_) => false,
            None => true,
        };
        if !digest_is_valid
            || !target_is_valid
            || result
                .insert(
                    identity_digest,
                    NotificationProvenanceRow {
                        local_id,
                        target_id,
                    },
                )
                .is_some()
        {
            return conflict(installation_root, "legacy-notification-provenance");
        }
    }
    Ok(result)
}

fn validate_provenance(
    installation_root: &Path,
    previous_devices: &BTreeMap<String, BTreeSet<String>>,
    current_devices: &BTreeMap<String, BTreeSet<String>>,
    target_devices: &HashMap<String, MobileDeviceRow>,
    previous_dangerous: &BTreeSet<String>,
    current_dangerous: &BTreeSet<String>,
    target_has_dangerous: bool,
) -> Result<(), InstallationDatabaseError> {
    for (source_key, previous_ids) in previous_devices {
        let source_path = provenance_source_path(installation_root, source_key)?;
        let current_ids = current_devices.get(source_key);
        for device_id in previous_ids {
            let source_has_device = current_ids.is_some_and(|ids| ids.contains(device_id));
            let target_has_device = target_devices.contains_key(device_id);
            if source_has_device != target_has_device {
                return conflict(&source_path, "legacy-mobile-device-divergence");
            }
        }
    }
    for source_key in previous_dangerous {
        let source_path = provenance_source_path(installation_root, source_key)?;
        if current_dangerous.contains(source_key) != target_has_dangerous {
            return conflict(&source_path, "legacy-dangerous-credential-divergence");
        }
    }
    Ok(())
}

fn store_provenance(
    transaction: &Transaction<'_>,
    device_sources: &BTreeMap<String, BTreeSet<String>>,
    dangerous_sources: &BTreeSet<String>,
    notification_provenance: &HashMap<String, NotificationProvenanceRow>,
) -> Result<(), InstallationDatabaseError> {
    transaction.execute("DELETE FROM legacy_installation_mobile_device", [])?;
    {
        let mut statement = transaction.prepare(
            "INSERT INTO legacy_installation_mobile_device(source_key,device_id)
             VALUES (?1,?2)",
        )?;
        for (source_key, device_ids) in device_sources {
            for device_id in device_ids {
                statement.execute(params![source_key, device_id])?;
            }
        }
    }
    transaction.execute("DELETE FROM legacy_installation_dangerous_credential", [])?;
    {
        let mut statement = transaction.prepare(
            "INSERT INTO legacy_installation_dangerous_credential(source_key) VALUES (?1)",
        )?;
        for source_key in dangerous_sources {
            statement.execute([source_key])?;
        }
    }
    transaction.execute("DELETE FROM legacy_installation_notification", [])?;
    {
        let mut statement = transaction.prepare(
            "INSERT INTO legacy_installation_notification(identity_digest,local_id,target_id)
             VALUES (?1,?2,?3)",
        )?;
        let mut entries = notification_provenance.iter().collect::<Vec<_>>();
        entries.sort_by(|left, right| left.0.cmp(right.0));
        for (identity_digest, provenance) in entries {
            statement.execute(params![
                identity_digest,
                provenance.local_id,
                provenance.target_id,
            ])?;
        }
    }
    Ok(())
}

fn provenance_source_path(
    installation_root: &Path,
    source_key: &str,
) -> Result<PathBuf, InstallationDatabaseError> {
    if source_key == LEGACY_DATABASE_FILE {
        return Ok(installation_root.join(LEGACY_DATABASE_FILE));
    }
    let profile = source_key
        .strip_prefix("profiles/")
        .and_then(|value| value.strip_suffix(&format!("/{LEGACY_DATABASE_FILE}")))
        .filter(|value| {
            !value.is_empty()
                && *value != "."
                && *value != ".."
                && !value.contains('/')
                && !value.contains('\\')
        });
    let Some(profile) = profile else {
        return conflict(installation_root, "installation-migration-provenance");
    };
    Ok(installation_root
        .join("profiles")
        .join(profile)
        .join(LEGACY_DATABASE_FILE))
}

fn load_target_devices(
    connection: &Connection,
    migration_bytes: &mut usize,
) -> Result<HashMap<String, MobileDeviceRow>, InstallationDatabaseError> {
    enforce_table_budget(
        connection,
        "mobile_device",
        MAX_DEVICE_ROWS,
        "length(id)+length(name)+length(token)+COALESCE(length(apns_token),0)
         +COALESCE(length(apns_environment),0)",
    )?;
    let mut statement = connection.prepare(
        "SELECT id,name,token,apns_token,apns_environment,push_updated_at,paired_at,last_seen_at
         FROM mobile_device ORDER BY id",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(MobileDeviceRow {
            id: row.get(0)?,
            name: row.get(1)?,
            token: row.get(2)?,
            apns_token: row.get(3)?,
            apns_environment: row.get(4)?,
            push_updated_at: row.get(5)?,
            paired_at: row.get(6)?,
            last_seen_at: row.get(7)?,
        })
    })?;
    let mut result = HashMap::new();
    for row in rows {
        let row = row?;
        validate_device(&row)?;
        if result.len() >= MAX_DEVICE_ROWS {
            return Err(InstallationDatabaseError::MigrationCapacity);
        }
        reserve_migration_bytes(migration_bytes, device_bytes(&row))?;
        result.insert(row.id.clone(), row);
    }
    Ok(result)
}

fn load_target_notifications(
    connection: &Connection,
    migration_bytes: &mut usize,
) -> Result<HashMap<i64, NotificationRow>, InstallationDatabaseError> {
    enforce_table_budget(
        connection,
        "mobile_notification",
        MAX_NOTIFICATION_ROWS,
        "length(payload)",
    )?;
    let mut statement =
        connection.prepare("SELECT id,payload,occurred_at FROM mobile_notification ORDER BY id")?;
    let rows = statement.query_map([], |row| {
        Ok(NotificationRow {
            id: row.get(0)?,
            payload: row.get(1)?,
            occurred_at: row.get(2)?,
        })
    })?;
    let mut result = HashMap::new();
    for row in rows {
        let row = row?;
        if result.len() >= MAX_NOTIFICATION_ROWS || row.payload.len() > MAX_FIELD_BYTES {
            return Err(InstallationDatabaseError::MigrationCapacity);
        }
        reserve_migration_bytes(migration_bytes, notification_bytes(&row))?;
        result.insert(row.id, row);
    }
    Ok(result)
}

fn load_target_dangerous_credential(
    connection: &Connection,
    migration_bytes: &mut usize,
) -> Result<Option<DangerousCredentialRow>, InstallationDatabaseError> {
    enforce_table_budget(
        connection,
        "dangerous_credential",
        1,
        "length(credential_id)+length(public_key_spki)+length(user_id)",
    )?;
    let row = connection
        .query_row(
            "SELECT id,credential_id,public_key_spki,user_id,created_at
             FROM dangerous_credential WHERE id = 1",
            [],
            |row| {
                Ok(DangerousCredentialRow {
                    id: row.get(0)?,
                    credential_id: row.get(1)?,
                    public_key_spki: row.get(2)?,
                    user_id: row.get(3)?,
                    created_at: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(InstallationDatabaseError::from)?;
    if let Some(row) = &row {
        validate_dangerous(row)?;
        reserve_migration_bytes(migration_bytes, dangerous_bytes(row))?;
    }
    Ok(row)
}

fn release_source(source: MigrationSource) -> Result<(), InstallationDatabaseError> {
    if database_identity(&source.path)? != source.identity {
        return conflict(&source.path, "migration-release-source-replaced");
    }
    let connection = source.connection;
    if !has_migrated_tables(&connection)? {
        return conflict(&source.path, "migration-release-source");
    }
    connection.execute_batch("ROLLBACK")?;
    connection
        .close()
        .map_err(|(_connection, error)| InstallationDatabaseError::Sqlite(error))
}

fn optional_column(
    connection: &Connection,
    table: &str,
    column: &str,
    expression: &str,
) -> Result<&'static str, InstallationDatabaseError> {
    if has_column(connection, table, column)? {
        Ok(match expression {
            "apns_token" => "apns_token",
            "apns_environment" => "apns_environment",
            "push_updated_at" => "push_updated_at",
            _ => "NULL",
        })
    } else {
        Ok("NULL")
    }
}

fn has_table(connection: &Connection, table: &str) -> Result<bool, rusqlite::Error> {
    connection.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1
         )",
        [table],
        |row| row.get(0),
    )
}

fn has_migrated_tables(connection: &Connection) -> Result<bool, rusqlite::Error> {
    connection.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM sqlite_master
           WHERE type = 'table'
             AND name IN ('mobile_device','mobile_notification','dangerous_credential')
         )",
        [],
        |row| row.get(0),
    )
}

fn check_table_integrity(
    source_path: &Path,
    connection: &Connection,
    table: &'static str,
) -> Result<(), InstallationDatabaseError> {
    let result = connection.query_row(&format!("PRAGMA quick_check({table})"), [], |row| {
        row.get::<_, String>(0)
    })?;
    if result != "ok" {
        return conflict(source_path, table);
    }
    Ok(())
}

fn has_column(connection: &Connection, table: &str, column: &str) -> Result<bool, rusqlite::Error> {
    connection.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM pragma_table_info(?1) WHERE name = ?2
         )",
        [table, column],
        |row| row.get(0),
    )
}

fn enforce_table_budget(
    connection: &Connection,
    table: &'static str,
    row_limit: usize,
    byte_expression: &str,
) -> Result<(), InstallationDatabaseError> {
    let (rows, bytes) = table_usage(connection, table, byte_expression)?;
    if rows > row_limit || bytes > MAX_MIGRATION_BYTES {
        return Err(InstallationDatabaseError::MigrationCapacity);
    }
    Ok(())
}

fn enforce_source_table_budget(
    connection: &Connection,
    table: &'static str,
    row_limit: usize,
    byte_expression: &str,
    budget: &mut SourceScanBudget,
) -> Result<(), InstallationDatabaseError> {
    let (rows, bytes) = table_usage(connection, table, byte_expression)?;
    if rows > row_limit || bytes > MAX_MIGRATION_BYTES {
        return Err(InstallationDatabaseError::MigrationCapacity);
    }
    budget.rows = budget
        .rows
        .checked_add(rows)
        .filter(|rows| *rows <= MAX_SCANNED_SOURCE_ROWS)
        .ok_or(InstallationDatabaseError::MigrationCapacity)?;
    budget.bytes = budget
        .bytes
        .checked_add(bytes)
        .filter(|bytes| *bytes <= MAX_SCANNED_SOURCE_BYTES)
        .ok_or(InstallationDatabaseError::MigrationCapacity)?;
    Ok(())
}

fn table_usage(
    connection: &Connection,
    table: &'static str,
    byte_expression: &str,
) -> Result<(usize, usize), InstallationDatabaseError> {
    let (rows, bytes) = connection.query_row(
        &format!("SELECT COUNT(*), COALESCE(SUM({byte_expression}), 0) FROM {table}"),
        [],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
    )?;
    Ok((
        usize::try_from(rows).map_err(|_| InstallationDatabaseError::MigrationCapacity)?,
        usize::try_from(bytes).map_err(|_| InstallationDatabaseError::MigrationCapacity)?,
    ))
}

fn ensure_mobile_keypair(
    installation_root: &Path,
    target: &Connection,
) -> Result<(), InstallationDatabaseError> {
    let has_devices =
        target.query_row("SELECT EXISTS(SELECT 1 FROM mobile_device)", [], |row| {
            row.get::<_, bool>(0)
        })?;
    if !has_devices {
        return Ok(());
    }
    let keypair_path = installation_root.join(KEYPAIR_FILE);
    match fs::symlink_metadata(&keypair_path) {
        Ok(metadata) if metadata.file_type().is_file() => Ok(()),
        Ok(_) => Err(InstallationDatabaseError::MigrationConflict {
            source_path: keypair_path,
            table: "mobile-keypair-path",
        }),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            Err(InstallationDatabaseError::MissingMobileKeypair)
        }
        Err(source) => Err(io_error("inspect mobile keypair", &keypair_path, source)),
    }
}

fn reserve_migration_bytes(
    migration_bytes: &mut usize,
    additional_bytes: usize,
) -> Result<(), InstallationDatabaseError> {
    *migration_bytes = migration_bytes
        .checked_add(additional_bytes)
        .filter(|bytes| *bytes <= MAX_MIGRATION_BYTES)
        .ok_or(InstallationDatabaseError::MigrationCapacity)?;
    Ok(())
}

fn replace_migration_bytes(
    migration_bytes: &mut usize,
    previous_bytes: usize,
    next_bytes: usize,
) -> Result<(), InstallationDatabaseError> {
    if next_bytes >= previous_bytes {
        reserve_migration_bytes(migration_bytes, next_bytes - previous_bytes)
    } else {
        *migration_bytes = migration_bytes
            .checked_sub(previous_bytes - next_bytes)
            .ok_or(InstallationDatabaseError::MigrationCapacity)?;
        Ok(())
    }
}

fn device_bytes(row: &MobileDeviceRow) -> usize {
    [
        row.id.len(),
        row.name.len(),
        row.token.len(),
        row.apns_token.as_ref().map_or(0, String::len),
        row.apns_environment.as_ref().map_or(0, String::len),
    ]
    .into_iter()
    .fold(0_usize, usize::saturating_add)
}

fn notification_bytes(row: &NotificationRow) -> usize {
    row.payload
        .len()
        .saturating_add(std::mem::size_of::<i64>() * 2)
}

fn dangerous_bytes(row: &DangerousCredentialRow) -> usize {
    [
        row.credential_id.len(),
        row.public_key_spki.len(),
        row.user_id.len(),
    ]
    .into_iter()
    .fold(std::mem::size_of::<i64>() * 2, usize::saturating_add)
}

fn validate_device(row: &MobileDeviceRow) -> Result<(), InstallationDatabaseError> {
    let fields = [
        row.id.as_str(),
        row.name.as_str(),
        row.token.as_str(),
        row.apns_token.as_deref().unwrap_or_default(),
        row.apns_environment.as_deref().unwrap_or_default(),
    ];
    if fields.iter().any(|value| value.len() > MAX_FIELD_BYTES)
        || row.id.is_empty()
        || row.name.is_empty()
        || row.token.is_empty()
    {
        return Err(InstallationDatabaseError::MigrationCapacity);
    }
    Ok(())
}

fn validate_dangerous(row: &DangerousCredentialRow) -> Result<(), InstallationDatabaseError> {
    let fields = [
        row.credential_id.as_str(),
        row.public_key_spki.as_str(),
        row.user_id.as_str(),
    ];
    if row.id != 1
        || fields
            .iter()
            .any(|value| value.is_empty() || value.len() > MAX_FIELD_BYTES)
    {
        return Err(InstallationDatabaseError::MigrationCapacity);
    }
    Ok(())
}

fn write_journal(root: &Path, phase: &str) -> Result<(), InstallationDatabaseError> {
    secure_file::write_json(
        &root.join(JOURNAL_FILE),
        &MigrationJournal {
            phase: phase.to_owned(),
            schema_version: 1,
        },
    )?;
    Ok(())
}

fn read_journal(root: &Path) -> Result<Option<MigrationPhase>, InstallationDatabaseError> {
    let path = root.join(JOURNAL_FILE);
    let Some(bytes) = read_bounded_file(&path, MAX_JOURNAL_BYTES)? else {
        return Ok(None);
    };
    let journal = serde_json::from_slice::<MigrationJournal>(&bytes).map_err(|_| {
        InstallationDatabaseError::MigrationConflict {
            source_path: path.clone(),
            table: "migration-journal",
        }
    })?;
    if journal.schema_version != 1 {
        return Err(InstallationDatabaseError::MigrationConflict {
            source_path: path,
            table: "migration-journal",
        });
    }
    match journal.phase.as_str() {
        "installation-committed" => Ok(Some(MigrationPhase::InstallationCommitted)),
        "profiles-cleaned" | "sources-retained" => Ok(Some(MigrationPhase::SourcesRetained)),
        _ => Err(InstallationDatabaseError::MigrationConflict {
            source_path: path,
            table: "migration-journal",
        }),
    }
}

fn read_bounded_file(
    path: &Path,
    maximum_bytes: u64,
) -> Result<Option<Vec<u8>>, InstallationDatabaseError> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(source) => return Err(io_error("inspect migration file", path, source)),
    };
    if !metadata.file_type().is_file() || metadata.len() > maximum_bytes {
        return conflict(path, "migration-file");
    }
    let mut options = OpenOptions::new();
    options.read(true);
    configure_no_follow(&mut options);
    let mut file = options
        .open(path)
        .map_err(|source| io_error("open migration file", path, source))?;
    let opened_metadata = file
        .metadata()
        .map_err(|source| io_error("inspect open migration file", path, source))?;
    if !opened_metadata.file_type().is_file() || opened_metadata.len() > maximum_bytes {
        return conflict(path, "migration-file");
    }
    let mut bytes = Vec::new();
    file.by_ref()
        .take(maximum_bytes.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|source| io_error("read migration file", path, source))?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > maximum_bytes {
        return conflict(path, "migration-file");
    }
    Ok(Some(bytes))
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

fn conflict<T>(source: &Path, table: &'static str) -> Result<T, InstallationDatabaseError> {
    Err(InstallationDatabaseError::MigrationConflict {
        source_path: source.to_owned(),
        table,
    })
}

fn io_error(operation: &'static str, path: &Path, source: io::Error) -> InstallationDatabaseError {
    InstallationDatabaseError::Io {
        operation,
        path: path.to_owned(),
        source,
    }
}
