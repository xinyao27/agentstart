use std::collections::HashSet;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde_json::{Map, Value};
use tokio::sync::{mpsc, oneshot};
use tokio::time::{Instant, sleep_until};

use super::WorkspaceSessionError;
use super::scrollback;
use crate::atomic_file_replace;
use crate::latest_snapshot::LatestSnapshot;
use crate::terminal_scrollback::TerminalScrollbackSnapshots;
use recovery::read_recoverable;

mod recovery;

pub(super) const BACKUP_COUNT: usize = 5;
const BACKUP_MIN_INTERVAL: Duration = Duration::from_secs(60 * 60);
const LEGACY_FILE_NAME: &str = "agentstart-data.json";
const SESSION_FILE_NAME: &str = "agentstart-data-sessions.json";
const SAVE_DEBOUNCE: Duration = Duration::from_secs(1);
const SAVE_MAX_WAIT: Duration = Duration::from_secs(5);
const CONTROL_CAPACITY: usize = 16;
const CLOSE_WRITE_ATTEMPTS: usize = 3;

#[derive(Clone)]
pub(super) struct SessionPersistence {
    commands: mpsc::Sender<PersistenceCommand>,
    pending: LatestSnapshot<PendingWrite>,
}

struct SessionStorage {
    path: PathBuf,
    snapshots: TerminalScrollbackSnapshots,
}

struct PendingWrite {
    document: Map<String, Value>,
    removed_refs: HashSet<String>,
}

enum PersistenceCommand {
    Wake,
    Flush {
        revision: u64,
        response: oneshot::Sender<Result<(), WorkspaceSessionError>>,
    },
}

impl SessionPersistence {
    pub(super) async fn open(
        user_data_path: &Path,
        snapshots: TerminalScrollbackSnapshots,
    ) -> Result<(Self, Map<String, Value>), WorkspaceSessionError> {
        let user_data_path = user_data_path.to_owned();
        let (path, document) = tokio::task::spawn_blocking(move || {
            let path = user_data_path.join(SESSION_FILE_NAME);
            let document = match read_recoverable(&path)? {
                Some(document) => document,
                None => {
                    read_recoverable(&user_data_path.join(LEGACY_FILE_NAME))?.unwrap_or_default()
                }
            };
            Ok::<_, WorkspaceSessionError>((path, document))
        })
        .await??;
        let pending = LatestSnapshot::new();
        let (commands, receiver) = mpsc::channel(CONTROL_CAPACITY);
        tokio::spawn(run(
            SessionStorage { path, snapshots },
            receiver,
            pending.clone(),
        ));
        Ok((Self { commands, pending }, document))
    }

    pub(super) fn schedule(
        &self,
        document: Map<String, Value>,
        revision: u64,
        removed_refs: HashSet<String>,
    ) -> Result<(), WorkspaceSessionError> {
        self.pending.schedule(
            PendingWrite {
                document,
                removed_refs,
            },
            revision,
            merge_removed_refs,
        );
        match self.commands.try_send(PersistenceCommand::Wake) {
            Ok(()) | Err(mpsc::error::TrySendError::Full(_)) => Ok(()),
            Err(mpsc::error::TrySendError::Closed(_)) => {
                Err(WorkspaceSessionError::PersistenceUnavailable)
            }
        }
    }

    pub(super) async fn flush(&self) -> Result<(), WorkspaceSessionError> {
        let (response, result) = oneshot::channel();
        let revision = self.pending.scheduled_revision();
        self.commands
            .send(PersistenceCommand::Flush { revision, response })
            .await
            .map_err(|_| WorkspaceSessionError::PersistenceUnavailable)?;
        result
            .await
            .map_err(|_| WorkspaceSessionError::PersistenceUnavailable)?
    }
}

impl SessionStorage {
    async fn write(
        &self,
        write: &PendingWrite,
        revision: u64,
    ) -> Result<(), WorkspaceSessionError> {
        let payload = serde_json::to_vec(&write.document)?;
        let directory = self
            .path
            .parent()
            .ok_or(WorkspaceSessionError::StoragePath)?;
        tokio::fs::create_dir_all(directory).await?;
        let temporary = temporary_path(&self.path, revision);
        let result = async {
            tokio::fs::write(&temporary, payload).await?;
            atomic_file_replace::replace_async(&temporary, &self.path).await?;
            if let Err(error) = rotate_backups(&self.path).await {
                eprintln!("[persistence] Failed to rotate session state backups: {error}");
            }
            let active_refs = scrollback::collect_document_refs(&write.document);
            let removed_refs = write
                .removed_refs
                .difference(&active_refs)
                .cloned()
                .collect();
            self.snapshots.delete_all(removed_refs).await;
            Ok(())
        }
        .await;
        if result.is_err() {
            let _ = tokio::fs::remove_file(&temporary).await;
        }
        result
    }
}

async fn run(
    storage: SessionStorage,
    mut commands: mpsc::Receiver<PersistenceCommand>,
    pending: LatestSnapshot<PendingWrite>,
) {
    let mut persisted_revision = 0;
    let mut maximum = None;
    let mut deadline = None;
    loop {
        tokio::select! {
            command = commands.recv() => match command {
                Some(PersistenceCommand::Wake) => {
                    let now = Instant::now();
                    let maximum = *maximum.get_or_insert(now + SAVE_MAX_WAIT);
                    deadline = Some((now + SAVE_DEBOUNCE).min(maximum));
                }
                Some(PersistenceCommand::Flush { revision, response }) => {
                    let result = write_through(
                        &storage,
                        &pending,
                        &mut persisted_revision,
                        revision,
                    ).await;
                    let failed = result.is_err();
                    let _ = response.send(result);
                    if failed || pending.has_pending() {
                        let now = Instant::now();
                        maximum = Some(now + SAVE_MAX_WAIT);
                        deadline = Some(now + SAVE_DEBOUNCE);
                    } else {
                        maximum = None;
                        deadline = None;
                    }
                }
                None => {
                    flush_on_close(&storage, &pending, &mut persisted_revision).await;
                    return;
                }
            },
            () = wait_for_deadline(deadline) => {
                let revision = pending.scheduled_revision();
                if let Err(error) = write_through(
                    &storage,
                    &pending,
                    &mut persisted_revision,
                    revision,
                ).await {
                    eprintln!("[persistence] Failed to write session region: {error}");
                    let now = Instant::now();
                    maximum = Some(now + SAVE_MAX_WAIT);
                    deadline = Some(now + SAVE_DEBOUNCE);
                } else {
                    maximum = None;
                    deadline = None;
                }
            }
        }
    }
}

async fn write_through(
    storage: &SessionStorage,
    pending: &LatestSnapshot<PendingWrite>,
    persisted_revision: &mut u64,
    target_revision: u64,
) -> Result<(), WorkspaceSessionError> {
    while *persisted_revision < target_revision {
        let Some(write) = pending.take() else {
            return Err(WorkspaceSessionError::PersistenceUnavailable);
        };
        if let Err(error) = storage.write(&write.value, write.revision).await {
            pending.schedule(write.value, write.revision, merge_removed_refs);
            return Err(error);
        }
        *persisted_revision = write.revision;
    }
    Ok(())
}

async fn flush_on_close(
    storage: &SessionStorage,
    pending: &LatestSnapshot<PendingWrite>,
    persisted_revision: &mut u64,
) {
    for attempt in 1..=CLOSE_WRITE_ATTEMPTS {
        if !pending.has_pending() {
            return;
        }
        let revision = pending.scheduled_revision();
        if let Err(error) = write_through(storage, pending, persisted_revision, revision).await {
            if attempt == CLOSE_WRITE_ATTEMPTS {
                eprintln!("[persistence] Failed to flush session region during shutdown: {error}");
                return;
            }
            tokio::time::sleep(SAVE_DEBOUNCE).await;
        }
    }
}

fn merge_removed_refs(latest: &mut PendingWrite, superseded: PendingWrite) {
    latest.removed_refs.extend(superseded.removed_refs);
}

async fn wait_for_deadline(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => sleep_until(deadline).await,
        None => std::future::pending().await,
    }
}

async fn rotate_backups(path: &Path) -> Result<(), WorkspaceSessionError> {
    if !should_rotate(path).await {
        return Ok(());
    }
    match tokio::fs::remove_file(backup_path(path, BACKUP_COUNT - 1)).await {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    for index in (0..BACKUP_COUNT - 1).rev() {
        let source = backup_path(path, index);
        if tokio::fs::try_exists(&source).await? {
            atomic_file_replace::replace_async(&source, &backup_path(path, index + 1)).await?;
        }
    }
    tokio::fs::copy(path, backup_path(path, 0)).await?;
    Ok(())
}

async fn should_rotate(path: &Path) -> bool {
    let Ok(metadata) = tokio::fs::metadata(backup_path(path, 0)).await else {
        return true;
    };
    let Ok(modified) = metadata.modified() else {
        return true;
    };
    SystemTime::now()
        .duration_since(modified)
        .is_ok_and(|elapsed| elapsed >= BACKUP_MIN_INTERVAL)
}

fn temporary_path(path: &Path, revision: u64) -> PathBuf {
    let mut value = OsString::from(path.as_os_str());
    value.push(format!(".{}.{revision}.tmp", std::process::id()));
    PathBuf::from(value)
}

pub(super) fn backup_path(path: &Path, index: usize) -> PathBuf {
    let mut value = OsString::from(path.as_os_str());
    value.push(format!(".bak.{index}"));
    PathBuf::from(value)
}
