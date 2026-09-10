mod mailboxes;
mod worker;

use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, SystemTimeError, UNIX_EPOCH};

use rusqlite::Connection;
use thiserror::Error;
use tokio::sync::{mpsc, oneshot};

use crate::projects::{ProjectCatalog, ProjectCatalogRequest};
use crate::ritual::{RitualScheduleRequest, RitualScheduleStore};
use crate::worktrees::{
    WorktreeArchiveRequest, WorktreeArchiveStore, WorktreeMetadataRequest, WorktreeMetadataStore,
    import_legacy_metadata,
};

use super::agent_sessions::{AgentSessionRequest, AgentSessionStore};
use super::artifact_store::{ArtifactStore, ArtifactStoreCommand};
use super::browser_replay::{BrowserReplayCommand, BrowserReplayStore};
use super::host_store::{HostStore, HostStoreRequest};
use super::schema;
use super::visual_regression::{VisualRegressionCommand, VisualRegressionStore};
use super::workspace_journal::{WorkspaceJournal, WorkspaceJournalCommand};
use mailboxes::{
    DatabaseHostStoreMailbox, DatabaseProjectCatalogMailbox, DatabaseRitualScheduleMailbox,
    DatabaseWorktreeArchiveMailbox, DatabaseWorktreeMetadataMailbox,
};
use worker::run_database_worker;

const DATABASE_FILE_NAME: &str = "agentstart.sqlite";
const DATABASE_BUSY_TIMEOUT: Duration = Duration::from_secs(5);
const DATABASE_QUEUE_CAPACITY: usize = 256;

pub(crate) struct DaemonDatabase {
    agent_sessions: AgentSessionStore,
    artifact_store: ArtifactStore,
    browser_replays: BrowserReplayStore,
    commands: mpsc::Sender<DatabaseCommand>,
    host_store: HostStore,
    project_catalog: ProjectCatalog,
    ritual_schedule: RitualScheduleStore,
    visual_regressions: VisualRegressionStore,
    worktree_archives: WorktreeArchiveStore,
    worktree_metadata: WorktreeMetadataStore,
    workspace_journal: WorkspaceJournal,
    worker: JoinHandle<()>,
}

pub(super) enum DatabaseCommand {
    AgentSession(AgentSessionRequest),
    ArtifactStore(ArtifactStoreCommand),
    BrowserReplay(BrowserReplayCommand),
    HostStore(HostStoreRequest),
    ProjectCatalog(ProjectCatalogRequest),
    RitualSchedule(RitualScheduleRequest),
    VisualRegression(VisualRegressionCommand),
    WorktreeArchive(WorktreeArchiveRequest),
    WorktreeMetadata(WorktreeMetadataRequest),
    WorkspaceJournal(WorkspaceJournalCommand),
    Close(oneshot::Sender<Result<(), DatabaseError>>),
}

#[derive(Debug, Error)]
pub(crate) enum DatabaseError {
    #[error("daemon database I/O failed while attempting to {operation} at {path}: {source}")]
    Io {
        operation: &'static str,
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("daemon database SQLite operation failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("daemon database clock failed: {0}")]
    Clock(#[from] SystemTimeError),
    #[error("daemon_database_schema_unsupported")]
    SchemaUnsupported,
    #[error("daemon_database_host_migration_foreign_key_failure")]
    HostMigrationForeignKeyFailure,
    #[error("daemon_database_wire_identity_migration_foreign_key_failure")]
    WireIdentityMigrationForeignKeyFailure,
    #[error("daemon_database_worktree_identity_migration_foreign_key_failure")]
    WorktreeIdentityMigrationForeignKeyFailure,
    #[error("daemon database worker is unavailable")]
    WorkerUnavailable,
    #[error("daemon database worker panicked")]
    WorkerPanicked,
    #[error(transparent)]
    WorktreeMetadata(#[from] crate::worktrees::WorktreeMetadataError),
}

impl DaemonDatabase {
    pub(crate) fn open(user_data_path: &Path) -> Result<Self, DatabaseError> {
        create_user_data_directory(user_data_path)?;
        let database_path = user_data_path.join(DATABASE_FILE_NAME);
        let mut connection = open_recoverable_database(&database_path)?;
        harden_database_file(&database_path)?;
        configure_connection(&connection)?;
        schema::migrate(&mut connection)?;
        import_legacy_metadata(&mut connection, user_data_path)?;
        let (commands, command_receiver) = mpsc::channel(DATABASE_QUEUE_CAPACITY);
        let artifact_store = ArtifactStore::new(commands.clone(), user_data_path.join("artifacts"));
        let agent_sessions = AgentSessionStore::new(commands.clone());
        let browser_replays = BrowserReplayStore::new(commands.clone());
        let host_store = HostStore::new(Arc::new(DatabaseHostStoreMailbox(commands.clone())));
        let project_catalog =
            ProjectCatalog::new(Arc::new(DatabaseProjectCatalogMailbox(commands.clone())));
        let ritual_schedule =
            RitualScheduleStore::new(Arc::new(DatabaseRitualScheduleMailbox(commands.clone())));
        let visual_regressions = VisualRegressionStore::new(
            commands.clone(),
            user_data_path.join("visual-captures"),
            artifact_store.clone(),
        );
        let worktree_archives =
            WorktreeArchiveStore::new(Arc::new(DatabaseWorktreeArchiveMailbox(commands.clone())));
        let worktree_metadata =
            WorktreeMetadataStore::new(Arc::new(DatabaseWorktreeMetadataMailbox(commands.clone())));
        let workspace_journal = WorkspaceJournal::new(commands.clone());
        let worker = thread::Builder::new()
            .name("agentstart-database".to_owned())
            .spawn(move || run_database_worker(connection, command_receiver))
            .map_err(|source| io_error("start database worker", &database_path, source))?;
        Ok(Self {
            agent_sessions,
            artifact_store,
            browser_replays,
            commands,
            host_store,
            project_catalog,
            ritual_schedule,
            visual_regressions,
            worktree_archives,
            worktree_metadata,
            workspace_journal,
            worker,
        })
    }

    pub(crate) fn artifact_store(&self) -> ArtifactStore {
        self.artifact_store.clone()
    }

    pub(crate) fn agent_sessions(&self) -> AgentSessionStore {
        self.agent_sessions.clone()
    }

    pub(crate) fn browser_replays(&self) -> BrowserReplayStore {
        self.browser_replays.clone()
    }

    pub(crate) fn host_store(&self) -> HostStore {
        self.host_store.clone()
    }

    pub(crate) fn project_catalog(&self) -> ProjectCatalog {
        self.project_catalog.clone()
    }

    pub(crate) fn ritual_schedule(&self) -> RitualScheduleStore {
        self.ritual_schedule.clone()
    }

    pub(crate) fn visual_regressions(&self) -> VisualRegressionStore {
        self.visual_regressions.clone()
    }

    pub(crate) fn worktree_archives(&self) -> WorktreeArchiveStore {
        self.worktree_archives.clone()
    }

    pub(crate) fn worktree_metadata(&self) -> WorktreeMetadataStore {
        self.worktree_metadata.clone()
    }

    pub(crate) fn workspace_journal(&self) -> WorkspaceJournal {
        self.workspace_journal.clone()
    }

    pub(crate) fn close(self) -> Result<(), DatabaseError> {
        let (response_sender, response_receiver) = oneshot::channel();
        let send_result = self
            .commands
            .blocking_send(DatabaseCommand::Close(response_sender));
        let response = send_result
            .map_err(|_| DatabaseError::WorkerUnavailable)
            .and_then(|()| {
                response_receiver
                    .blocking_recv()
                    .map_err(|_| DatabaseError::WorkerUnavailable)?
            });
        self.worker
            .join()
            .map_err(|_| DatabaseError::WorkerPanicked)?;
        response
    }
}

fn close_connection(connection: Connection) -> Result<(), DatabaseError> {
    let checkpoint_error = connection
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
        .err();
    let close_error = match connection.close() {
        Ok(()) => None,
        Err((connection, error)) => {
            drop(connection);
            Some(error)
        }
    };
    if let Some(error) = checkpoint_error {
        return Err(error.into());
    }
    if let Some(error) = close_error {
        return Err(error.into());
    }
    Ok(())
}

fn create_user_data_directory(path: &Path) -> Result<(), DatabaseError> {
    create_directory(path).map_err(|source| io_error("create directory", path, source))
}

fn open_recoverable_database(path: &Path) -> Result<Connection, DatabaseError> {
    let connection = Connection::open(path)?;
    let quick_check = connection.query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0));
    if matches!(quick_check, Ok(ref result) if result == "ok") {
        return Ok(connection);
    }
    // Why: the Bun database treats both a non-ok row and an inspection error as recoverable
    // corruption; preserving that policy avoids starting against a file it already rejected.
    if let Err((connection, error)) = connection.close() {
        drop(connection);
        return Err(error.into());
    }
    preserve_corrupt_database(path)?;
    Ok(Connection::open(path)?)
}

fn configure_connection(connection: &Connection) -> Result<(), DatabaseError> {
    connection.busy_timeout(DATABASE_BUSY_TIMEOUT)?;
    connection.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;
         PRAGMA wal_autocheckpoint = 1000;",
    )?;
    Ok(())
}

fn preserve_corrupt_database(path: &Path) -> Result<(), DatabaseError> {
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    let suffix = format!(".corrupt-{timestamp}-{}", std::process::id());
    for sidecar in ["", "-wal", "-shm"] {
        let source = path_with_suffix(path, sidecar);
        if source.exists() {
            let destination = path_with_suffix(path, &format!("{suffix}{sidecar}"));
            fs::rename(&source, &destination)
                .map_err(|error| io_error("preserve corrupt database", &source, error))?;
        }
    }
    Ok(())
}

fn path_with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut value = OsString::from(path.as_os_str());
    value.push(suffix);
    PathBuf::from(value)
}

#[cfg(unix)]
fn create_directory(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;

    let mut builder = fs::DirBuilder::new();
    builder.recursive(true).mode(0o700).create(path)
}

#[cfg(not(unix))]
fn create_directory(path: &Path) -> io::Result<()> {
    fs::create_dir_all(path)
}

#[cfg(unix)]
fn harden_database_file(path: &Path) -> Result<(), DatabaseError> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|source| io_error("set database permissions", path, source))
}

#[cfg(not(unix))]
fn harden_database_file(_path: &Path) -> Result<(), DatabaseError> {
    Ok(())
}

fn io_error(operation: &'static str, path: &Path, source: io::Error) -> DatabaseError {
    DatabaseError::Io {
        operation,
        path: path.to_path_buf(),
        source,
    }
}
