mod migration;
mod schema;
mod worker;

use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use async_trait::async_trait;
use rusqlite::{Connection, OpenFlags};
use thiserror::Error;
use tokio::sync::{mpsc, oneshot};

use crate::dangerous_approval::{
    DangerousCredentialMailbox, DangerousCredentialMailboxClosed, DangerousCredentialRequest,
    DangerousCredentialStore,
};
use crate::mobile::devices::{
    MobileDeviceMailbox, MobileDeviceMailboxClosed, MobileDeviceRequest, MobileDeviceStore,
};
use crate::notifications::{
    NotificationAuthority, NotificationMailbox, NotificationMailboxClosed, NotificationRequest,
};

const DATABASE_FILE_NAME: &str = "agentstart-installation.sqlite";
const DATABASE_BUSY_TIMEOUT: Duration = Duration::from_secs(5);
const DATABASE_QUEUE_CAPACITY: usize = 128;

pub(crate) struct InstallationDatabase {
    commands: mpsc::Sender<InstallationCommand>,
    dangerous_credentials: DangerousCredentialStore,
    mobile_devices: MobileDeviceStore,
    notifications: NotificationAuthority,
    worker: JoinHandle<()>,
}

pub(super) enum InstallationCommand {
    DangerousCredential(DangerousCredentialRequest),
    MobileDevices(MobileDeviceRequest),
    Notifications(NotificationRequest),
    Close(oneshot::Sender<Result<(), InstallationDatabaseError>>),
}

#[derive(Debug, Error)]
pub(crate) enum InstallationDatabaseError {
    #[error("installation database I/O failed while attempting to {operation} at {path}: {source}")]
    Io {
        operation: &'static str,
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("installation database SQLite operation failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("installation database migration conflict in {table} from {source_path}")]
    MigrationConflict {
        source_path: PathBuf,
        table: &'static str,
    },
    #[error("installation database migration source capacity exceeded")]
    MigrationCapacity,
    #[error("paired mobile devices exist but mobile-e2ee-keypair.json is missing")]
    MissingMobileKeypair,
    #[error("installation database schema is newer than this daemon")]
    SchemaUnsupported,
    #[error("installation database migration journal failed: {0}")]
    SecureFile(#[from] crate::transport::secure_file::SecureFileError),
    #[error("installation database worker is unavailable")]
    WorkerUnavailable,
    #[error("installation database worker panicked")]
    WorkerPanicked,
}

#[derive(Clone)]
struct InstallationMailbox(mpsc::Sender<InstallationCommand>);

impl InstallationDatabase {
    pub(crate) fn open(installation_root: &Path) -> Result<Self, InstallationDatabaseError> {
        crate::transport::secure_file::ensure_secure_directory(installation_root)?;
        let database_path = installation_root.join(DATABASE_FILE_NAME);
        let database_existed = inspect_database_path(&database_path)?;
        migration::validate_target_presence(installation_root, database_existed)?;
        let mut connection = Connection::open_with_flags(
            &database_path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX
                | OpenFlags::SQLITE_OPEN_NOFOLLOW,
        )?;
        crate::transport::secure_file::harden_existing_file(&database_path)?;
        configure_connection(&connection)?;
        schema::migrate(&mut connection)?;
        migration::merge_legacy_installation_data(installation_root, &mut connection)?;
        let (mailbox, receiver) = InstallationMailbox::new();
        let commands = mailbox.0.clone();
        let dangerous_credentials = DangerousCredentialStore::new(Arc::new(mailbox.clone()));
        let mobile_devices = MobileDeviceStore::new(Arc::new(mailbox.clone()));
        let notifications = NotificationAuthority::new(Arc::new(mailbox));
        let worker = thread::Builder::new()
            .name("agentstart-installation-database".to_owned())
            .spawn(move || worker::run(connection, receiver))
            .map_err(|source| io_error("start database worker", &database_path, source))?;
        Ok(Self {
            commands,
            dangerous_credentials,
            mobile_devices,
            notifications,
            worker,
        })
    }

    pub(crate) fn dangerous_credentials(&self) -> DangerousCredentialStore {
        self.dangerous_credentials.clone()
    }

    pub(crate) fn mobile_devices(&self) -> MobileDeviceStore {
        self.mobile_devices.clone()
    }

    pub(crate) fn notifications(&self) -> NotificationAuthority {
        self.notifications.clone()
    }

    pub(crate) fn close(self) -> Result<(), InstallationDatabaseError> {
        let (response, result) = oneshot::channel();
        let sent = self
            .commands
            .blocking_send(InstallationCommand::Close(response));
        let response = sent
            .map_err(|_| InstallationDatabaseError::WorkerUnavailable)
            .and_then(|()| {
                result
                    .blocking_recv()
                    .map_err(|_| InstallationDatabaseError::WorkerUnavailable)?
            });
        self.worker
            .join()
            .map_err(|_| InstallationDatabaseError::WorkerPanicked)?;
        response
    }
}

impl InstallationMailbox {
    fn new() -> (Self, mpsc::Receiver<InstallationCommand>) {
        let (sender, receiver) = mpsc::channel(DATABASE_QUEUE_CAPACITY);
        (Self(sender), receiver)
    }
}

#[async_trait]
impl DangerousCredentialMailbox for InstallationMailbox {
    async fn submit(
        &self,
        request: DangerousCredentialRequest,
    ) -> Result<(), DangerousCredentialMailboxClosed> {
        self.0
            .send(InstallationCommand::DangerousCredential(request))
            .await
            .map_err(|_| DangerousCredentialMailboxClosed)
    }
}

#[async_trait]
impl MobileDeviceMailbox for InstallationMailbox {
    async fn submit(&self, request: MobileDeviceRequest) -> Result<(), MobileDeviceMailboxClosed> {
        self.0
            .send(InstallationCommand::MobileDevices(request))
            .await
            .map_err(|_| MobileDeviceMailboxClosed)
    }
}

#[async_trait]
impl NotificationMailbox for InstallationMailbox {
    async fn submit(&self, request: NotificationRequest) -> Result<(), NotificationMailboxClosed> {
        self.0
            .send(InstallationCommand::Notifications(request))
            .await
            .map_err(|_| NotificationMailboxClosed)
    }
}

pub(super) fn close_connection(connection: Connection) -> Result<(), InstallationDatabaseError> {
    connection.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")?;
    connection
        .close()
        .map_err(|(_connection, error)| InstallationDatabaseError::Sqlite(error))
}

pub(super) fn configure_connection(
    connection: &Connection,
) -> Result<(), InstallationDatabaseError> {
    connection.busy_timeout(DATABASE_BUSY_TIMEOUT)?;
    connection.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;
         PRAGMA wal_autocheckpoint = 1000;",
    )?;
    Ok(())
}

fn inspect_database_path(path: &Path) -> Result<bool, InstallationDatabaseError> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => Ok(true),
        Ok(_) => Err(InstallationDatabaseError::MigrationConflict {
            source_path: path.to_owned(),
            table: "installation-database-path",
        }),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(source) => Err(io_error("inspect database", path, source)),
    }
}

fn io_error(operation: &'static str, path: &Path, source: io::Error) -> InstallationDatabaseError {
    InstallationDatabaseError::Io {
        operation,
        path: path.to_owned(),
        source,
    }
}
