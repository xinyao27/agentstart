use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, UNIX_EPOCH};

use base64::Engine;
use notify::event::ModifyKind;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::sync::{mpsc, watch};

use crate::hosts::HostKind;
use crate::workspace_paths::PathResolution;

use super::model::{LogTailReadResult, LogTailWatchEvent};
use super::{FilesAuthority, FilesError};

const LOG_TAIL_CHUNK_BYTES: usize = 256 * 1_024;
const LOG_TAIL_EVENT_QUEUE_LIMIT: usize = 64;
const LOG_TAIL_OVERFLOW_INTERVAL: Duration = Duration::from_millis(250);

pub(crate) struct LogTailWatchSubscription {
    cancel: watch::Sender<bool>,
    _watcher: RecommendedWatcher,
    receiver: mpsc::Receiver<LogTailWatchEvent>,
}

impl LogTailWatchSubscription {
    pub(crate) async fn next(&mut self) -> Option<LogTailWatchEvent> {
        self.receiver.recv().await
    }
}

impl Drop for LogTailWatchSubscription {
    fn drop(&mut self) {
        let _ = self.cancel.send(true);
    }
}

impl FilesAuthority {
    pub(crate) async fn read_log_tail(
        &self,
        file_path: &str,
        from_byte_offset: u64,
        expected_identity: Option<&str>,
    ) -> Result<LogTailReadResult, FilesError> {
        let path = self.resolve_local_log_path(file_path).await?;
        let mut file = tokio::fs::File::open(&path).await?;
        let initial = file.metadata().await?;
        if !initial.is_file() {
            return Err(FilesError::InvalidInput(
                "Local log tail target is not a file",
            ));
        }
        let file_identity = local_log_identity(&file, &initial).await?;
        if from_byte_offset > initial.len()
            || expected_identity.is_some_and(|expected| expected != file_identity)
        {
            return Ok(reset_result(initial.len(), file_identity));
        }

        let bytes_to_read = usize::try_from(
            initial
                .len()
                .saturating_sub(from_byte_offset)
                .min(LOG_TAIL_CHUNK_BYTES as u64),
        )
        .map_err(|_| FilesError::Protocol("invalid log tail byte count"))?;
        let mut bytes = vec![0; bytes_to_read];
        if bytes_to_read > 0 {
            file.seek(std::io::SeekFrom::Start(from_byte_offset))
                .await?;
        }
        let mut bytes_read = 0;
        while bytes_read < bytes_to_read {
            let count = file.read(&mut bytes[bytes_read..]).await?;
            if count == 0 {
                break;
            }
            bytes_read += count;
        }
        bytes.truncate(bytes_read);
        let next_byte_offset = from_byte_offset.saturating_add(bytes_read as u64);
        let final_metadata = file.metadata().await?;
        if next_byte_offset > final_metadata.len() {
            return Ok(reset_result(final_metadata.len(), file_identity));
        }
        Ok(LogTailReadResult {
            content_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
            file_identity,
            file_size: final_metadata.len(),
            has_more: next_byte_offset < final_metadata.len(),
            next_byte_offset,
            reset: false,
        })
    }

    pub(crate) async fn watch_log_tail(
        &self,
        file_path: &str,
        connection_id: &str,
    ) -> Result<LogTailWatchSubscription, FilesError> {
        let path = self.resolve_local_log_path(file_path).await?;
        let metadata = tokio::fs::metadata(&path).await?;
        if !metadata.is_file() {
            return Err(FilesError::InvalidInput(
                "Local log tail target is not a file",
            ));
        }
        let sequence = self.watch_sequence.fetch_add(1, Ordering::Relaxed) + 1;
        let subscription_id = format!("files-log-tail-{connection_id}-{sequence}");
        let (sender, receiver) = mpsc::channel(32);
        let (cancel, cancel_receiver) = watch::channel(false);
        let (event_sender, event_receiver) = mpsc::channel(LOG_TAIL_EVENT_QUEUE_LIMIT);
        let overflowed = Arc::new(AtomicBool::new(false));
        let callback_overflowed = overflowed.clone();
        let mut watcher = RecommendedWatcher::new(
            move |event| {
                if event_sender.try_send(event).is_err() {
                    callback_overflowed.store(true, Ordering::Release);
                }
            },
            Config::default(),
        )?;
        watcher.watch(std::path::Path::new(&path), RecursiveMode::NonRecursive)?;
        super::lock(&self.watches).insert(subscription_id.clone(), cancel.clone());
        tokio::spawn(run_log_tail_watch(
            self.clone(),
            subscription_id,
            sender,
            event_receiver,
            overflowed,
            cancel_receiver,
        ));
        Ok(LogTailWatchSubscription {
            cancel,
            _watcher: watcher,
            receiver,
        })
    }

    async fn resolve_local_log_path(&self, file_path: &str) -> Result<String, FilesError> {
        let authorized = self
            .paths
            .resolve(file_path, PathResolution::Follow)
            .await?;
        if authorized.host.kind() != HostKind::Local {
            return Err(FilesError::InvalidInput(
                "Local log tail requires a local file",
            ));
        }
        Ok(authorized.path)
    }
}

async fn run_log_tail_watch(
    authority: FilesAuthority,
    subscription_id: String,
    sender: mpsc::Sender<LogTailWatchEvent>,
    mut events: mpsc::Receiver<Result<Event, notify::Error>>,
    overflowed: Arc<AtomicBool>,
    mut cancel: watch::Receiver<bool>,
) {
    if sender
        .send(LogTailWatchEvent::Ready {
            subscription_id: subscription_id.clone(),
        })
        .await
        .is_err()
    {
        super::lock(&authority.watches).remove(&subscription_id);
        return;
    }
    let mut overflow_interval = tokio::time::interval(LOG_TAIL_OVERFLOW_INTERVAL);
    overflow_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    overflow_interval.tick().await;
    loop {
        tokio::select! {
            changed = cancel.changed() => {
                if changed.is_err() || *cancel.borrow() {
                    break;
                }
            }
            event = events.recv() => {
                match event {
                    Some(Ok(event)) => {
                        if let Some(event_type) = log_tail_event_type(event.kind)
                            && sender.send(LogTailWatchEvent::Changed { event_type }).await.is_err()
                        {
                            break;
                        }
                    }
                    Some(Err(_)) => {
                        let _ = sender.send(LogTailWatchEvent::Changed { event_type: "rename" }).await;
                        break;
                    }
                    None => break,
                }
            }
            _ = overflow_interval.tick() => {
                if overflowed.swap(false, Ordering::AcqRel)
                    && sender.send(LogTailWatchEvent::Changed { event_type: "rename" }).await.is_err()
                {
                    break;
                }
            }
        }
    }
    let _ = sender.send(LogTailWatchEvent::End).await;
    super::lock(&authority.watches).remove(&subscription_id);
}

fn log_tail_event_type(kind: EventKind) -> Option<&'static str> {
    match kind {
        EventKind::Access(_) => None,
        EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_)) => {
            Some("rename")
        }
        EventKind::Modify(_) | EventKind::Any | EventKind::Other => Some("change"),
    }
}

fn reset_result(file_size: u64, file_identity: String) -> LogTailReadResult {
    LogTailReadResult {
        content_base64: String::new(),
        file_identity,
        file_size,
        has_more: file_size > 0,
        next_byte_offset: 0,
        reset: true,
    }
}

async fn local_log_identity(
    file: &tokio::fs::File,
    metadata: &std::fs::Metadata,
) -> Result<String, std::io::Error> {
    let (device, inode) = local_identity_fields(file, metadata).await?;
    let birthtime_ms = metadata
        .created()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map_or(0.0, |value| value.as_secs_f64() * 1_000.0);
    Ok(format!("{device}:{inode}:{birthtime_ms}"))
}

#[cfg(unix)]
async fn local_identity_fields(
    _file: &tokio::fs::File,
    metadata: &std::fs::Metadata,
) -> Result<(u64, u64), std::io::Error> {
    use std::os::unix::fs::MetadataExt;
    Ok((metadata.dev(), metadata.ino()))
}

#[cfg(windows)]
async fn local_identity_fields(
    file: &tokio::fs::File,
    _metadata: &std::fs::Metadata,
) -> Result<(u64, u64), std::io::Error> {
    let file = file.try_clone().await?.into_std().await;
    let identity = crate::file_identity::FileIdentity::from_file(&file)?;
    Ok((identity.fingerprint(), 0))
}
