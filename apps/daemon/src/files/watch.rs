use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use notify::event::{ModifyKind, RenameMode};
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use sha2::{Digest, Sha256};
use tokio::sync::{mpsc, watch};
use tokio::time::Instant;

use crate::hosts::{ExecutionHost, HostCommand, HostFileKind, HostKind};
use crate::workspace_paths::PathResolution;

use super::model::{FileChangeEvent, FileWatchEvent};
use super::{FilesAuthority, FilesError, host_io, scope};

mod remote;

const EVENT_LIMIT: usize = 5_000;
const INNER_BATCH_INTERVAL: Duration = Duration::from_millis(20);
const INNER_EVENT_LIMIT: usize = 200;
const OUTER_BATCH_INTERVAL: Duration = Duration::from_millis(150);
const OUTER_BATCH_MAX_WAIT: Duration = Duration::from_millis(500);
const LOCAL_EVENT_QUEUE_LIMIT: usize = 256;
const REMOTE_POLL_INITIAL: Duration = Duration::from_secs(1);
const REMOTE_POLL_MAX: Duration = Duration::from_secs(15);
const REMOTE_SCAN_TIMEOUT_MS: u64 = 10_000;
const REMOTE_REVISION_OUTPUT_LIMIT: usize = 1_024;
const SNAPSHOT_OUTPUT_LIMIT: usize = 8 * 1_024 * 1_024;
const WATCH_IGNORES: &[&str] = &[
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".cache",
    "target",
    ".venv",
    "__pycache__",
];

pub(crate) struct FileWatchSubscription {
    cancel: watch::Sender<bool>,
    _local_watcher: Option<RecommendedWatcher>,
    receiver: mpsc::Receiver<FileWatchEvent>,
}

impl FileWatchSubscription {
    pub(crate) async fn next(&mut self) -> Option<FileWatchEvent> {
        self.receiver.recv().await
    }
}

impl Drop for FileWatchSubscription {
    fn drop(&mut self) {
        let _ = self.cancel.send(true);
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Fingerprint {
    identity: String,
    is_directory: bool,
    modified: String,
    size: u64,
}

struct LocalEventSource {
    overflowed: Arc<AtomicBool>,
    receiver: mpsc::Receiver<Result<Event, notify::Error>>,
}

struct WatchBatcher {
    inner_deadline: Option<Instant>,
    inner_events: Vec<FileChangeEvent>,
    inner_indices: HashMap<String, usize>,
    inner_overflowed: bool,
    outer_deadline: Option<Instant>,
    outer_events: Vec<FileChangeEvent>,
    outer_first_event_at: Option<Instant>,
    outer_overflowed: bool,
    root: String,
}

impl WatchBatcher {
    fn new(root: String) -> Self {
        Self {
            inner_deadline: None,
            inner_events: Vec::new(),
            inner_indices: HashMap::new(),
            inner_overflowed: false,
            outer_deadline: None,
            outer_events: Vec::new(),
            outer_first_event_at: None,
            outer_overflowed: false,
            root,
        }
    }

    fn push(&mut self, event: FileChangeEvent) {
        if !self.inner_overflowed {
            if event.kind == "overflow" || self.inner_events.len() >= INNER_EVENT_LIMIT {
                self.inner_overflowed = true;
            } else if let Some(index) = self.inner_indices.get(&event.absolute_path).copied() {
                self.inner_events[index] = event;
            } else {
                let index = self.inner_events.len();
                self.inner_indices
                    .insert(event.absolute_path.clone(), index);
                self.inner_events.push(event);
            }
        }
        self.inner_deadline
            .get_or_insert_with(|| Instant::now() + INNER_BATCH_INTERVAL);
    }

    fn mark_inner_overflow(&mut self) {
        self.push(overflow_event(&self.root));
    }

    fn flush_inner(&mut self) {
        self.inner_deadline = None;
        let events = if self.inner_overflowed {
            vec![overflow_event(&self.root)]
        } else {
            std::mem::take(&mut self.inner_events)
        };
        self.inner_events.clear();
        self.inner_indices.clear();
        self.inner_overflowed = false;
        self.push_outer(events);
    }

    fn push_outer(&mut self, events: Vec<FileChangeEvent>) {
        if events.is_empty() {
            return;
        }
        if !self.outer_overflowed {
            if let Some(overflow) = events.iter().find(|event| event.kind == "overflow") {
                self.outer_events = vec![overflow.clone()];
                self.outer_overflowed = true;
            } else if self.outer_events.len().saturating_add(events.len()) > EVENT_LIMIT {
                let absolute_path = events
                    .first()
                    .or_else(|| self.outer_events.first())
                    .map_or_else(String::new, |event| event.absolute_path.clone());
                self.outer_events = vec![FileChangeEvent {
                    absolute_path,
                    is_directory: None,
                    kind: "overflow",
                    old_absolute_path: None,
                }];
                self.outer_overflowed = true;
            } else {
                self.outer_events.extend(events);
            }
        }
        let now = Instant::now();
        let first_event_at = *self.outer_first_event_at.get_or_insert(now);
        self.outer_deadline =
            Some((now + OUTER_BATCH_INTERVAL).min(first_event_at + OUTER_BATCH_MAX_WAIT));
    }

    fn flush_outer(&mut self) -> Vec<FileChangeEvent> {
        self.outer_deadline = None;
        self.outer_first_event_at = None;
        self.outer_overflowed = false;
        std::mem::take(&mut self.outer_events)
    }

    fn discard_inner(&mut self) {
        self.inner_deadline = None;
        self.inner_events.clear();
        self.inner_indices.clear();
        self.inner_overflowed = false;
    }
}

impl FilesAuthority {
    pub(crate) async fn watch(
        &self,
        worktree: &str,
        connection_id: &str,
    ) -> Result<FileWatchSubscription, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (_, root) =
            scope::target(&scope, &self.paths, "", true, PathResolution::Follow).await?;
        let Some(root_metadata) = host_io::metadata(scope.host.clone(), &root, true).await? else {
            return Err(FilesError::MissingPath(root));
        };
        if root_metadata.kind != HostFileKind::Directory {
            return Err(FilesError::InvalidInput("not_a_directory"));
        }
        let remote_backend = if scope.host.kind() == HostKind::Local {
            None
        } else {
            Some(remote::resolve_backend(scope.host.clone()).await)
        };
        let sequence = self.watch_sequence.fetch_add(1, Ordering::Relaxed) + 1;
        let subscription_id = format!("files-watch-{connection_id}-{sequence}");
        let (sender, receiver) = mpsc::channel(32);
        let (cancel, cancel_receiver) = watch::channel(false);
        super::lock(&self.watches).insert(subscription_id.clone(), cancel.clone());
        let authority = self.clone();
        let task_id = subscription_id.clone();
        let local_watcher = if remote_backend.is_none() {
            let (event_sender, event_receiver) = mpsc::channel(LOCAL_EVENT_QUEUE_LIMIT);
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
            watcher.watch(std::path::Path::new(&root), RecursiveMode::Recursive)?;
            tokio::spawn(run_local_watch(
                authority,
                scope,
                root,
                task_id,
                sender,
                LocalEventSource {
                    overflowed,
                    receiver: event_receiver,
                },
                cancel_receiver,
            ));
            Some(watcher)
        } else {
            match remote_backend {
                Some(remote::Backend::Polling) => {
                    tokio::spawn(run_remote_watch(
                        authority,
                        scope,
                        root,
                        task_id,
                        sender,
                        cancel_receiver,
                    ));
                }
                Some(backend) => {
                    tokio::spawn(remote::run(
                        authority,
                        scope,
                        root,
                        task_id,
                        sender,
                        backend,
                        cancel_receiver,
                    ));
                }
                None => {}
            }
            None
        };
        Ok(FileWatchSubscription {
            cancel,
            _local_watcher: local_watcher,
            receiver,
        })
    }
}

async fn run_local_watch(
    authority: FilesAuthority,
    scope: scope::FileScope,
    root: String,
    subscription_id: String,
    sender: mpsc::Sender<FileWatchEvent>,
    mut events: LocalEventSource,
    mut cancel: watch::Receiver<bool>,
) {
    if !send_watch_started(&sender, &subscription_id).await {
        finish(&authority, &subscription_id);
        return;
    }
    if sender
        .send(FileWatchEvent::Ready {
            subscription_id: subscription_id.clone(),
        })
        .await
        .is_err()
    {
        finish(&authority, &subscription_id);
        return;
    }
    let mut batcher = WatchBatcher::new(root.clone());
    let mut terminal_error = None;
    loop {
        let inner_deadline = batcher.inner_deadline;
        let outer_deadline = batcher.outer_deadline;
        tokio::select! {
            changed = cancel.changed() => {
                if changed.is_err() || *cancel.borrow() {
                    break;
                }
            }
            event = events.receiver.recv() => {
                match event {
                    Some(Ok(event)) => {
                        if events.overflowed.swap(false, Ordering::AcqRel) {
                            batcher.mark_inner_overflow();
                        }
                        for event in normalize_local_event(&root, event) {
                            batcher.push(event);
                        }
                    }
                    Some(Err(error)) => {
                        terminal_error = Some(error.to_string());
                        break;
                    }
                    None => break,
                }
            }
            () = wait_for_deadline(inner_deadline), if inner_deadline.is_some() => {
                batcher.flush_inner();
            }
            () = wait_for_deadline(outer_deadline), if outer_deadline.is_some() => {
                let batch = batcher.flush_outer();
                if !batch.is_empty() {
                    authority.inventory.invalidate(scope.host.id(), &scope.path).await;
                    if sender.send(FileWatchEvent::Changed {
                        events: batch,
                        worktree: scope.worktree_id.clone(),
                    }).await.is_err() {
                        break;
                    }
                }
            }
        }
    }
    batcher.discard_inner();
    let batch = batcher.flush_outer();
    if !batch.is_empty() {
        authority
            .inventory
            .invalidate(scope.host.id(), &scope.path)
            .await;
        let _ = sender
            .send(FileWatchEvent::Changed {
                events: batch,
                worktree: scope.worktree_id,
            })
            .await;
    }
    if let Some(message) = terminal_error {
        let _ = sender.send(FileWatchEvent::Error { message }).await;
    }
    let _ = sender.send(FileWatchEvent::End).await;
    finish(&authority, &subscription_id);
}

async fn run_remote_watch(
    authority: FilesAuthority,
    scope: scope::FileScope,
    root: String,
    subscription_id: String,
    sender: mpsc::Sender<FileWatchEvent>,
    mut cancel: watch::Receiver<bool>,
) {
    if !send_watch_started(&sender, &subscription_id).await {
        finish(&authority, &subscription_id);
        return;
    }
    let (mut previous, mut revision) = match snapshot_remote(scope.host.clone(), &root).await {
        Ok(snapshot) => snapshot,
        Err(error) => {
            finish_with_error(&authority, &subscription_id, &sender, error).await;
            return;
        }
    };
    if sender
        .send(FileWatchEvent::Ready {
            subscription_id: subscription_id.clone(),
        })
        .await
        .is_err()
    {
        finish(&authority, &subscription_id);
        return;
    }
    let mut interval = REMOTE_POLL_INITIAL;
    let mut next_poll = Instant::now() + interval;
    let mut batcher = WatchBatcher::new(root.clone());
    let mut terminal_error = None;
    loop {
        let inner_deadline = batcher.inner_deadline;
        let outer_deadline = batcher.outer_deadline;
        tokio::select! {
            changed = cancel.changed() => {
                if changed.is_err() || *cancel.borrow() {
                    break;
                }
            }
            () = tokio::time::sleep_until(next_poll) => {
                match remote_revision(scope.host.clone(), &root).await {
                    Ok(next_revision) if revision == next_revision => {
                        interval = interval.saturating_mul(2).min(REMOTE_POLL_MAX);
                        next_poll = Instant::now() + interval;
                    }
                    Ok(_) => {
                        match snapshot_remote(scope.host.clone(), &root).await {
                            Ok((next, next_revision)) => {
                                revision = next_revision;
                                let has_changes = previous != next;
                                previous = next;
                                if !has_changes {
                                    interval = interval.saturating_mul(2).min(REMOTE_POLL_MAX);
                                    next_poll = Instant::now() + interval;
                                    continue;
                                }
                                interval = REMOTE_POLL_INITIAL;
                                next_poll = Instant::now() + interval;
                                batcher.mark_inner_overflow();
                            }
                            Err(error) => {
                                terminal_error = Some(error.to_string());
                                break;
                            }
                        }
                    }
                    Err(error) => {
                        terminal_error = Some(error.to_string());
                        break;
                    }
                }
            }
            () = wait_for_deadline(inner_deadline), if inner_deadline.is_some() => {
                batcher.flush_inner();
            }
            () = wait_for_deadline(outer_deadline), if outer_deadline.is_some() => {
                let events = batcher.flush_outer();
                if !events.is_empty() {
                    authority.inventory.invalidate(scope.host.id(), &scope.path).await;
                    if sender.send(FileWatchEvent::Changed {
                        events,
                        worktree: scope.worktree_id.clone(),
                    }).await.is_err() {
                        break;
                    }
                }
            }
        }
    }
    batcher.discard_inner();
    let events = batcher.flush_outer();
    if !events.is_empty() {
        authority
            .inventory
            .invalidate(scope.host.id(), &scope.path)
            .await;
        let _ = sender
            .send(FileWatchEvent::Changed {
                events,
                worktree: scope.worktree_id,
            })
            .await;
    }
    if let Some(message) = terminal_error {
        let _ = sender.send(FileWatchEvent::Error { message }).await;
    }
    let _ = sender.send(FileWatchEvent::End).await;
    finish(&authority, &subscription_id);
}

async fn send_watch_started(sender: &mpsc::Sender<FileWatchEvent>, subscription_id: &str) -> bool {
    sender
        .send(FileWatchEvent::Starting {
            subscription_id: subscription_id.to_owned(),
        })
        .await
        .is_ok()
}

async fn wait_for_deadline(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => tokio::time::sleep_until(deadline).await,
        None => std::future::pending::<()>().await,
    }
}

async fn finish_with_error(
    authority: &FilesAuthority,
    subscription_id: &str,
    sender: &mpsc::Sender<FileWatchEvent>,
    error: FilesError,
) {
    let _ = sender
        .send(FileWatchEvent::Error {
            message: error.to_string(),
        })
        .await;
    let _ = sender.send(FileWatchEvent::End).await;
    finish(authority, subscription_id);
}

fn finish(authority: &FilesAuthority, subscription_id: &str) {
    super::lock(&authority.watches).remove(subscription_id);
}

fn normalize_local_event(root: &str, event: Event) -> Vec<FileChangeEvent> {
    let mut normalized = Vec::new();
    match event.kind {
        EventKind::Access(_) => {}
        EventKind::Create(_) => {
            for path in event.paths {
                if let Some(event) = local_path_event(root, &path, "create") {
                    normalized.push(event);
                }
            }
        }
        EventKind::Remove(_) => {
            for path in event.paths {
                if let Some(event) = local_path_event(root, &path, "delete") {
                    normalized.push(event);
                }
            }
        }
        EventKind::Modify(ModifyKind::Name(RenameMode::Both)) if event.paths.len() >= 2 => {
            if let Some(path) = event.paths.first()
                && let Some(event) = local_path_event(root, path, "delete")
            {
                normalized.push(event);
            }
            if let Some(path) = event.paths.last()
                && let Some(event) = local_path_event(root, path, "create")
            {
                normalized.push(event);
            }
        }
        EventKind::Modify(ModifyKind::Name(RenameMode::From)) => {
            for path in event.paths {
                if let Some(event) = local_path_event(root, &path, "delete") {
                    normalized.push(event);
                }
            }
        }
        EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
            for path in event.paths {
                if let Some(event) = local_path_event(root, &path, "create") {
                    normalized.push(event);
                }
            }
        }
        EventKind::Modify(ModifyKind::Name(_)) => {
            for path in event.paths {
                let kind = if path.exists() { "create" } else { "delete" };
                if let Some(event) = local_path_event(root, &path, kind) {
                    normalized.push(event);
                }
            }
        }
        EventKind::Modify(_) => {
            for path in event.paths {
                if let Some(event) = local_path_event(root, &path, "update") {
                    normalized.push(event);
                }
            }
        }
        EventKind::Any | EventKind::Other => {
            normalized.push(overflow_event(root));
        }
    }
    normalized
}

fn local_path_event(
    root: &str,
    path: &std::path::Path,
    kind: &'static str,
) -> Option<FileChangeEvent> {
    if is_ignored_local_path(root, path) {
        return None;
    }
    let absolute_path = path.to_string_lossy().into_owned();
    let is_directory = (kind != "delete")
        .then(|| {
            std::fs::symlink_metadata(path)
                .ok()
                .map(|metadata| metadata.is_dir())
        })
        .flatten();
    Some(FileChangeEvent {
        absolute_path,
        is_directory,
        kind,
        old_absolute_path: None,
    })
}

fn is_ignored_local_path(root: &str, path: &std::path::Path) -> bool {
    let Ok(relative) = path.strip_prefix(root) else {
        return true;
    };
    relative.components().any(|component| {
        let name = component.as_os_str().to_string_lossy();
        WATCH_IGNORES.contains(&name.as_ref())
    })
}

fn overflow_event(root: &str) -> FileChangeEvent {
    FileChangeEvent {
        absolute_path: root.to_owned(),
        is_directory: None,
        kind: "overflow",
        old_absolute_path: None,
    }
}

async fn remote_revision(host: Arc<dyn ExecutionHost>, root: &str) -> Result<String, FilesError> {
    let inventory = remote_inventory_script();
    let script = format!(
        r#"{} | if command -v sha256sum >/dev/null 2>&1; then
  digest=$(sha256sum) || exit
  set -- $digest
  printf 'sha256 %s\n' "$1"
elif command -v shasum >/dev/null 2>&1; then
  digest=$(shasum -a 256) || exit
  set -- $digest
  printf 'sha256 %s\n' "$1"
else
  digest=$(cksum) || exit
  set -- $digest
  printf 'cksum %s %s\n' "$1" "$2"
fi
"#,
        inventory.trim_end()
    );
    let mut command = HostCommand::new("sh", ["-c", script.as_str()]);
    command.cwd = Some(root.to_owned());
    command.max_output_bytes = Some(REMOTE_REVISION_OUTPUT_LIMIT);
    command.timeout_ms = Some(REMOTE_SCAN_TIMEOUT_MS);
    let output = host.exec(command).await?;
    if output.exit_code != 0 || output.stdout.trim().is_empty() {
        return Err(FilesError::CommandFailed("inspect watched file tree"));
    }
    Ok(output.stdout.trim().to_owned())
}

async fn snapshot_remote(
    host: Arc<dyn ExecutionHost>,
    root: &str,
) -> Result<(HashMap<String, Fingerprint>, String), FilesError> {
    let script = remote_inventory_script();
    let mut command = HostCommand::new("sh", ["-c", script.as_str()]);
    command.capture_stdout_bytes = true;
    command.cwd = Some(root.to_owned());
    command.max_output_bytes = Some(SNAPSHOT_OUTPUT_LIMIT);
    command.timeout_ms = Some(REMOTE_SCAN_TIMEOUT_MS);
    let output = host.exec(command).await?;
    if output.exit_code != 0 {
        return Err(FilesError::CommandFailed("watch file tree"));
    }
    let bytes = output.stdout_bytes.unwrap_or_default();
    if !bytes.is_empty() && bytes.last() != Some(&0) {
        return Err(FilesError::Protocol(
            "watch snapshot was not NUL terminated",
        ));
    }
    let revision = format!("sha256 {:x}", Sha256::digest(&bytes));
    let fields = bytes
        .strip_suffix(&[0])
        .unwrap_or(&bytes)
        .split(|byte| *byte == 0)
        .collect::<Vec<_>>();
    if fields.len() % 3 != 0 {
        return Err(FilesError::Protocol("watch snapshot was incomplete"));
    }
    let filesystem = crate::hosts::HostFilesystem::new(host);
    let mut snapshot = HashMap::new();
    for fields in fields.chunks_exact(3) {
        let kind = fields[0];
        let relative = String::from_utf8_lossy(fields[1]);
        let absolute = filesystem.paths().resolve(root, &[&relative]);
        let values = String::from_utf8_lossy(fields[2]);
        let values = values.split('|').collect::<Vec<_>>();
        let [device, inode, size, modified] = values.as_slice() else {
            continue;
        };
        snapshot.insert(
            absolute,
            Fingerprint {
                identity: format!("{device}:{inode}"),
                is_directory: kind == b"d",
                modified: (*modified).to_owned(),
                size: size.parse().unwrap_or(0),
            },
        );
    }
    Ok((snapshot, revision))
}

fn remote_inventory_script() -> String {
    let ignored = WATCH_IGNORES
        .iter()
        .map(|name| format!("-name '{}'", name.replace('\'', "'\\''")))
        .collect::<Vec<_>>()
        .join(" -o ");
    format!(
        r#"
find . \( -type d \( {ignored} \) -prune \) -o -exec sh -c '
for path do
  if [ -L "$path" ]; then kind=l
  elif [ -d "$path" ]; then kind=d
  elif [ -f "$path" ]; then kind=f
  else kind=o
  fi
  if values=$(stat -c "%d|%i|%s|%y" -- "$path" 2>/dev/null); then :
  elif values=$(stat -f "%d|%i|%z|%Sm" -t "%s" -- "$path" 2>/dev/null); then :
  else continue
  fi
  printf "%s\000%s\000%s\000" "$kind" "$path" "$values"
done
' sh {{}} +
"#
    )
}
