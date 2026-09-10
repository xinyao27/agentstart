use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde::Serialize;
use serde_json::{Map, Value};
use tokio::sync::{mpsc, oneshot};
use tokio::time::{Instant, sleep_until};

use crate::atomic_file_replace;
use crate::latest_snapshot::LatestSnapshot;

use super::SettingsError;

const BACKUP_COUNT: usize = 5;
const BACKUP_INTERVAL: Duration = Duration::from_secs(60 * 60);
const LEGACY_FILE: &str = "agentstart-data.json";
const SETTINGS_FILE: &str = "agentstart-data-settings.json";
const REGION_FILES: &[&str] = &[
    "agentstart-data-projects.json",
    "agentstart-data-worktrees.json",
    SETTINGS_FILE,
    "agentstart-data-ui.json",
    "agentstart-data-sessions.json",
    "agentstart-data-runtime.json",
];
const SAVE_DEBOUNCE: Duration = Duration::from_secs(1);
const SAVE_MAX_WAIT: Duration = Duration::from_secs(5);
const CONTROL_CAPACITY: usize = 16;
const CLOSE_WRITE_ATTEMPTS: usize = 3;

#[derive(Clone)]
pub(super) struct SettingsPersistence {
    commands: mpsc::Sender<Command>,
    pending: LatestSnapshot<Map<String, Value>>,
}

enum Command {
    Wake,
    Flush {
        revision: u64,
        response: oneshot::Sender<Result<(), SettingsError>>,
    },
}

struct Storage {
    path: PathBuf,
}

impl SettingsPersistence {
    pub(super) async fn open(
        user_data_path: &Path,
    ) -> Result<(Self, Map<String, Value>, bool), SettingsError> {
        let user_data_path = user_data_path.to_owned();
        let (path, settings, existed) = tokio::task::spawn_blocking(move || {
            let path = user_data_path.join(SETTINGS_FILE);
            let legacy = user_data_path.join(LEGACY_FILE);
            let existed = legacy.exists()
                || REGION_FILES
                    .iter()
                    .any(|file| user_data_path.join(file).exists());
            let document = match read_recoverable(&path)? {
                Some(document) => Some(document),
                None => read_recoverable(&legacy)?,
            };
            let settings = match document {
                Some(document) => document
                    .get("settings")
                    .and_then(Value::as_object)
                    .cloned()
                    .ok_or(SettingsError::InvalidDocument)?,
                None => Map::new(),
            };
            Ok::<_, SettingsError>((path, settings, existed))
        })
        .await??;
        let pending = LatestSnapshot::new();
        let (commands, receiver) = mpsc::channel(CONTROL_CAPACITY);
        tokio::spawn(run(Storage { path }, receiver, pending.clone()));
        Ok((Self { commands, pending }, settings, existed))
    }

    pub(super) fn schedule(
        &self,
        settings: Map<String, Value>,
        revision: u64,
    ) -> Result<(), SettingsError> {
        self.pending.schedule(settings, revision, |_, _| {});
        match self.commands.try_send(Command::Wake) {
            Ok(()) | Err(mpsc::error::TrySendError::Full(_)) => Ok(()),
            Err(mpsc::error::TrySendError::Closed(_)) => Err(SettingsError::PersistenceUnavailable),
        }
    }

    pub(super) async fn flush(&self) -> Result<(), SettingsError> {
        let (response, result) = oneshot::channel();
        let revision = self.pending.scheduled_revision();
        self.commands
            .send(Command::Flush { revision, response })
            .await
            .map_err(|_| SettingsError::PersistenceUnavailable)?;
        result
            .await
            .map_err(|_| SettingsError::PersistenceUnavailable)?
    }
}

async fn run(
    storage: Storage,
    mut commands: mpsc::Receiver<Command>,
    pending: LatestSnapshot<Map<String, Value>>,
) {
    let mut persisted_revision = 0;
    let mut maximum = None;
    let mut deadline = None;
    loop {
        tokio::select! {
            command = commands.recv() => match command {
                Some(Command::Wake) => {
                    let now = Instant::now();
                    let maximum = *maximum.get_or_insert(now + SAVE_MAX_WAIT);
                    deadline = Some((now + SAVE_DEBOUNCE).min(maximum));
                }
                Some(Command::Flush { revision, response }) => {
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
                    eprintln!("[settings] persistence failed: {error}");
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
    storage: &Storage,
    pending: &LatestSnapshot<Map<String, Value>>,
    persisted_revision: &mut u64,
    target_revision: u64,
) -> Result<(), SettingsError> {
    while *persisted_revision < target_revision {
        let Some(write) = pending.take() else {
            return Err(SettingsError::PersistenceUnavailable);
        };
        if let Err(error) = write_snapshot(storage, &write.value, write.revision).await {
            pending.schedule(write.value, write.revision, |_, _| {});
            return Err(error);
        }
        *persisted_revision = write.revision;
    }
    Ok(())
}

async fn flush_on_close(
    storage: &Storage,
    pending: &LatestSnapshot<Map<String, Value>>,
    persisted_revision: &mut u64,
) {
    for attempt in 1..=CLOSE_WRITE_ATTEMPTS {
        if !pending.has_pending() {
            return;
        }
        let revision = pending.scheduled_revision();
        if let Err(error) = write_through(storage, pending, persisted_revision, revision).await {
            if attempt == CLOSE_WRITE_ATTEMPTS {
                eprintln!("[settings] shutdown persistence failed: {error}");
                return;
            }
            tokio::time::sleep(SAVE_DEBOUNCE).await;
        }
    }
}

async fn wait_for_deadline(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => sleep_until(deadline).await,
        None => std::future::pending().await,
    }
}

#[derive(Serialize)]
struct SettingsDocument<'a> {
    settings: &'a Map<String, Value>,
}

async fn write_snapshot(
    storage: &Storage,
    settings: &Map<String, Value>,
    revision: u64,
) -> Result<(), SettingsError> {
    let payload = serde_json::to_vec(&SettingsDocument { settings })?;
    let directory = storage.path.parent().ok_or(SettingsError::StoragePath)?;
    tokio::fs::create_dir_all(directory).await?;
    let temporary = temporary_path(&storage.path, revision);
    let result = async {
        tokio::fs::write(&temporary, payload).await?;
        tokio::fs::OpenOptions::new()
            .write(true)
            .open(&temporary)
            .await?
            .sync_all()
            .await?;
        atomic_file_replace::replace_async(&temporary, &storage.path).await?;
        sync_directory(directory).await?;
        if let Err(error) = rotate_backups(&storage.path).await {
            eprintln!("[settings] backup rotation failed: {error}");
        }
        Ok::<_, SettingsError>(())
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(&temporary).await;
    }
    result
}

#[cfg(unix)]
async fn sync_directory(directory: &Path) -> Result<(), SettingsError> {
    tokio::fs::File::open(directory).await?.sync_all().await?;
    Ok(())
}

#[cfg(not(unix))]
async fn sync_directory(_directory: &Path) -> Result<(), SettingsError> {
    Ok(())
}

fn read_recoverable(path: &Path) -> Result<Option<Map<String, Value>>, SettingsError> {
    let primary = match read_document(path) {
        Ok(Some(document)) => return Ok(Some(document)),
        Ok(None) if !has_backup(path) => return Ok(None),
        result => result,
    };
    let mut backup_error = None;
    for index in 0..BACKUP_COUNT {
        let backup = backup_path(path, index);
        match read_document(&backup) {
            Ok(Some(document)) => {
                restore(&backup, path)?;
                return Ok(Some(document));
            }
            Ok(None) => {}
            Err(error) if backup_error.is_none() => backup_error = Some(error),
            Err(_) => {}
        }
    }
    match primary {
        Err(error) => Err(error),
        Ok(None) => backup_error.map_or(Ok(None), Err),
        Ok(Some(_)) => unreachable!("valid primary documents return before backup recovery"),
    }
}

fn read_document(path: &Path) -> Result<Option<Map<String, Value>>, SettingsError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    serde_json::from_slice::<Value>(&bytes)?
        .as_object()
        .cloned()
        .map(Some)
        .ok_or(SettingsError::InvalidDocument)
}

async fn rotate_backups(path: &Path) -> Result<(), SettingsError> {
    if !should_rotate(path).await {
        return Ok(());
    }
    let _ = tokio::fs::remove_file(backup_path(path, BACKUP_COUNT - 1)).await;
    for index in (0..BACKUP_COUNT - 1).rev() {
        let source = backup_path(path, index);
        if tokio::fs::try_exists(&source).await? {
            atomic_file_replace::replace_async(&source, &backup_path(path, index + 1)).await?;
        }
    }
    snapshot(path, &backup_path(path, 0)).await
}

async fn should_rotate(path: &Path) -> bool {
    tokio::fs::metadata(backup_path(path, 0))
        .await
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| SystemTime::now().duration_since(modified).ok())
        .is_none_or(|elapsed| elapsed >= BACKUP_INTERVAL)
}

fn has_backup(path: &Path) -> bool {
    (0..BACKUP_COUNT).any(|index| backup_path(path, index).exists())
}

fn temporary_path(path: &Path, revision: u64) -> PathBuf {
    suffix(path, &format!(".{}.{revision}.tmp", std::process::id()))
}

fn backup_path(path: &Path, index: usize) -> PathBuf {
    suffix(path, &format!(".bak.{index}"))
}

fn suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut value = OsString::from(path.as_os_str());
    value.push(suffix);
    value.into()
}

fn restore(source: &Path, destination: &Path) -> Result<(), SettingsError> {
    let temporary = suffix(
        destination,
        &format!(".{}.recovery.tmp", std::process::id()),
    );
    let result = fs::copy(source, &temporary)
        .and_then(|_| atomic_file_replace::replace(&temporary, destination));
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map(|_| ()).map_err(Into::into)
}

async fn snapshot(source: &Path, destination: &Path) -> Result<(), SettingsError> {
    let temporary = suffix(
        destination,
        &format!(".{}.snapshot.tmp", std::process::id()),
    );
    let result = async {
        tokio::fs::copy(source, &temporary).await?;
        atomic_file_replace::replace_async(&temporary, destination).await?;
        Ok::<_, SettingsError>(())
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(&temporary).await;
    }
    result
}
