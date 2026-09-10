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

mod database;
mod filesystem;
mod manifest;

use database::*;
use filesystem::*;
use manifest::*;

const DEFAULT_PROFILE_ID: &str = "local-default";
const DATABASE_FILE: &str = "agentstart.sqlite";
const COMPAT_MANIFEST_FILE: &str = "agentstart-profile-compat-sources.json";
const JOURNAL_FILE: &str = "agentstart-profile-migration.json";
const MAX_FILES: usize = 100_000;
const MAX_DEPTH: usize = 32;
const MAX_JOURNAL_BYTES: u64 = 4 * 1024;
const MAX_COMPAT_MANIFEST_BYTES: u64 = 64 * 1024 * 1024;
const MAX_COMPAT_DATABASE_ROWS: usize = 500_000;
const MAX_PROFILE_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_IDENTITY_DIGEST_FILE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_IDENTITY_DIGEST_TOTAL_BYTES: u64 = 64 * 1024 * 1024;
const COMPAT_MANIFEST_SCHEMA_VERSION: u64 = 4;
const MAX_READABLE_COMPAT_MANIFEST_SCHEMA_VERSION: u64 = 5;
const JOURNAL_SCHEMA_VERSION: u64 = 4;
const DATABASE_PROVENANCE_TABLE: &str = "agentstart_profile_compat_source_row";
const DATABASE_PROVENANCE_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS agentstart_profile_compat_source_row (
  table_name TEXT NOT NULL,
  row_digest TEXT NOT NULL,
  occurrences INTEGER NOT NULL CHECK(occurrences > 0),
  PRIMARY KEY(table_name, row_digest)
);
"#;

const ONE_SHOT_JSON_FILES: &[&str] = &[
    "agentstart-data.json",
    "agentstart-data-projects.json",
    "agentstart-data-worktrees.json",
    "agentstart-data-settings.json",
    "agentstart-data-ui.json",
    "agentstart-data-sessions.json",
    "agentstart-data-runtime.json",
    "agentstart-github-cache.json",
];
const BUN_COMPAT_JSON_FILES: &[&str] = &[
    "agentstart-stats.json",
    "agentstart-claude-usage.json",
    "agentstart-codex-usage.json",
    "agentstart-opencode-usage.json",
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
// Why: agent tooling churns scratch trees inside these homes between runs, so recording them in the
// compat manifest turns an ordinary temp file into a permanent daemon-startup conflict.
// Why: these tables exist in Bun-era databases and are deliberately not migrated. A retired table
// has to stay excluded from the legacy scan *and* be tolerated in provenance recorded before it was
// retired, or every profile written while the feature existed fails validation for good.
const RETIRED_PROFILE_TABLES: &[&str] = &[
    "mobile_device",
    "mobile_notification",
    "dangerous_credential",
];
const ROW_DIGEST_DOMAIN: &[u8] = b"agentstart-profile-compat-row-v1\0";
const TRANSIENT_COMPAT_COMPONENTS: &[&str] = &["tmp", ".tmp", ".staging"];
// Why: these files contain a fresh port and bearer token on every launch, so treating either
// platform spelling as durable Bun data makes two healthy daemon generations look divergent.
const AGENT_HOOK_ENDPOINT_FILES: &[&str] = &["endpoint.env", "endpoint.cmd"];
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
    // Why: the Rust profile keeps writing its own copy after migration, so a source/target byte
    // difference is expected and says nothing. Divergence is the Bun writer changing the *root*
    // source, which only an identity recorded at migration time can detect.
    #[serde(default)]
    source_identities: BTreeMap<String, CompatSourceIdentity>,
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

#[derive(Default)]
struct RowDigests {
    current: BTreeMap<String, u64>,
}

struct IdentityDigestBudget {
    remaining_bytes: u64,
}

impl IdentityDigestBudget {
    fn new() -> Self {
        Self {
            remaining_bytes: MAX_IDENTITY_DIGEST_TOTAL_BYTES,
        }
    }
}

impl RowDigests {
    fn occurrences(&self, digest: &str) -> u64 {
        self.current.get(digest).copied().unwrap_or(0)
    }
}

#[derive(Eq, PartialEq)]
struct DatabaseIdentity {
    main: DatabaseFileIdentity,
    wal: Option<DatabaseFileIdentity>,
}

#[derive(Eq, PartialEq)]
struct DatabaseFileIdentity {
    identity: crate::file_identity::FileIdentity,
    length: u64,
    modified_nanos: u32,
    modified_seconds: u64,
}

impl DatabaseFileIdentity {
    fn fingerprint(&self) -> String {
        format!(
            "{}:{}:{}",
            self.length, self.modified_seconds, self.modified_nanos
        )
    }
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
            let _ = merge_database(
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
