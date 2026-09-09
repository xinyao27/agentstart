use std::collections::HashMap;
use std::io;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use thiserror::Error;
use tokio::sync::{mpsc, oneshot};
use tokio::time::{Instant, sleep_until};

use crate::transport::secure_file::HardenedDirectory;

const DOCUMENT_VERSION: u32 = 2;
const SAVE_DEBOUNCE: Duration = Duration::from_millis(250);
// Why: a continuous hook stream would otherwise keep pushing the debounce
// deadline out forever, so an unbroken burst still reaches disk this often.
const SAVE_MAX_WAIT: Duration = Duration::from_secs(2);
// Why: `Wake` carries no data — the writer reads the live maps — so a full
// control channel already has a wake pending and dropping the duplicate is
// correct. This bounds the queue without ever losing a revision.
const CONTROL_CAPACITY: usize = 16;
// Why: one bounded policy covers every explicit flush, so a transient
// filesystem error cannot strand shutdown and a persistent one cannot spin.
const FLUSH_ATTEMPTS: usize = 3;
const FLUSH_RETRY_BACKOFF: Duration = Duration::from_millis(50);

pub(super) type StatusMap = Arc<Mutex<HashMap<String, Value>>>;

/// Why: an explicit flush is the only caller that needs the truth about
/// durability. Ordinary status mutations stay infallible, so this error can
/// never reach an RPC handler.
#[derive(Debug, Error)]
pub(crate) enum AgentStatusFlushError {
    #[error("agent status persistence writer is unavailable")]
    WriterUnavailable,
    #[error("agent status revision {revision} is unpersisted after {attempts} attempts: {source}")]
    Unpersisted {
        attempts: usize,
        revision: u64,
        #[source]
        source: io::Error,
    },
}

/// Coalescing writer for the agent-status file.
///
/// Why: every status change used to clone both maps, re-serialize them and run
/// three blocking filesystem syscalls on the calling Tokio worker. Mutations
/// now only raise a revision and poke this actor, which reads the live maps
/// once per debounced write.
#[derive(Clone)]
pub(super) struct AgentStatusPersistence {
    commands: mpsc::Sender<Command>,
    scheduled_revision: Arc<AtomicU64>,
}

enum Command {
    Wake,
    Flush {
        response: oneshot::Sender<Result<(), AgentStatusFlushError>>,
        target_revision: u64,
    },
}

struct Storage {
    /// Why: opened lazily on the first write and reused, so the directory is
    /// hardened once instead of once per debounced write. Cleared after any
    /// failure so the next bounded retry re-hardens and re-fingerprints it.
    directory: Option<HardenedDirectory>,
    migration: StatusMap,
    path: PathBuf,
    statuses: StatusMap,
}

impl AgentStatusPersistence {
    pub(super) fn start(path: PathBuf, statuses: StatusMap, migration: StatusMap) -> Self {
        let (commands, receiver) = mpsc::channel(CONTROL_CAPACITY);
        let scheduled_revision = Arc::new(AtomicU64::new(0));
        tokio::spawn(run(
            Storage {
                directory: None,
                migration,
                path,
                statuses,
            },
            receiver,
            scheduled_revision.clone(),
        ));
        Self {
            commands,
            scheduled_revision,
        }
    }

    /// Records that `revision` needs persisting and wakes the writer.
    ///
    /// Why: callers run inside RPC handlers, so a saturated or closed control
    /// channel must never surface as a request failure.
    pub(super) fn schedule(&self, revision: u64) {
        self.scheduled_revision
            .fetch_max(revision, Ordering::AcqRel);
        let _ = self.commands.try_send(Command::Wake);
    }

    /// Settles every revision scheduled before this call.
    ///
    /// Why: the target is captured here rather than inside the writer, so the
    /// caller learns about exactly the state it could observe. A revision
    /// scheduled after this point can neither delay nor fail the flush.
    pub(super) async fn flush(&self) -> Result<(), AgentStatusFlushError> {
        let target_revision = self.scheduled_revision.load(Ordering::Acquire);
        let (response, result) = oneshot::channel();
        self.commands
            .send(Command::Flush {
                response,
                target_revision,
            })
            .await
            .map_err(|_| AgentStatusFlushError::WriterUnavailable)?;
        result
            .await
            .map_err(|_| AgentStatusFlushError::WriterUnavailable)?
    }
}

async fn run(
    mut storage: Storage,
    mut commands: mpsc::Receiver<Command>,
    scheduled_revision: Arc<AtomicU64>,
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
                Some(Command::Flush { response, target_revision }) => {
                    let result = write_until_settled(
                        &mut storage,
                        &scheduled_revision,
                        &mut persisted_revision,
                        target_revision,
                    )
                    .await;
                    let failed = result.is_err();
                    let _ = response.send(result);
                    // Why: a failed flush, or revisions scheduled while it ran,
                    // still need the timer. Only a clean and fully drained
                    // writer may idle with no deadline armed.
                    if failed || is_behind(&scheduled_revision, persisted_revision) {
                        let now = Instant::now();
                        maximum = Some(now + SAVE_MAX_WAIT);
                        deadline = Some(now + SAVE_DEBOUNCE);
                    } else {
                        maximum = None;
                        deadline = None;
                    }
                }
                None => {
                    flush_on_close(&mut storage, &scheduled_revision, &mut persisted_revision)
                        .await;
                    return;
                }
            },
            () = wait_for_deadline(deadline) => {
                // Why: the background path stays isolated — a write failure is
                // reported and retried on the timer, never surfaced to a caller.
                match write_once(&mut storage, &scheduled_revision, &mut persisted_revision).await {
                    Ok(()) => {
                        maximum = None;
                        deadline = None;
                    }
                    Err(error) => {
                        eprintln!("[agent-status] persistence failed: {error}");
                        let now = Instant::now();
                        maximum = Some(now + SAVE_MAX_WAIT);
                        deadline = Some(now + SAVE_DEBOUNCE);
                    }
                }
            }
        }
    }
}

/// Writes the live maps once when they are behind.
///
/// Why: the writer reads the live maps rather than a queued copy, so one write
/// always stores the newest state and no revision between `persisted_revision`
/// and the observed one needs its own file.
async fn write_once(
    storage: &mut Storage,
    scheduled_revision: &AtomicU64,
    persisted_revision: &mut u64,
) -> io::Result<()> {
    let observed = scheduled_revision.load(Ordering::Acquire);
    if *persisted_revision >= observed {
        return Ok(());
    }
    write_snapshot(storage).await?;
    // Why: `encode` reads the maps after the load above, so the file holds at
    // least `observed`. Recording exactly `observed` never claims more than was
    // durably written, at the cost of one redundant write later.
    *persisted_revision = observed;
    Ok(())
}

/// Drives `target_revision` to disk under a bounded retry policy.
///
/// Why: an explicit flush must either reach the requested revision or say why
/// it could not. `scheduled_revision` only ever grows, so a successful write
/// lands at or past the target and the loop terminates.
async fn write_until_settled(
    storage: &mut Storage,
    scheduled_revision: &AtomicU64,
    persisted_revision: &mut u64,
    target_revision: u64,
) -> Result<(), AgentStatusFlushError> {
    let mut last_error = None;
    for attempt in 1..=FLUSH_ATTEMPTS {
        if *persisted_revision >= target_revision {
            return Ok(());
        }
        match write_once(storage, scheduled_revision, persisted_revision).await {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = Some(error);
                if attempt < FLUSH_ATTEMPTS {
                    tokio::time::sleep(FLUSH_RETRY_BACKOFF).await;
                }
            }
        }
    }
    Err(AgentStatusFlushError::Unpersisted {
        attempts: FLUSH_ATTEMPTS,
        revision: target_revision,
        source: last_error.unwrap_or_else(|| io::Error::other("flush completed no write attempt")),
    })
}

/// Why: the last handle dropped without an explicit flush, so this is the only
/// remaining chance to store the final state and nobody is left to receive an
/// error.
async fn flush_on_close(
    storage: &mut Storage,
    scheduled_revision: &AtomicU64,
    persisted_revision: &mut u64,
) {
    let target_revision = scheduled_revision.load(Ordering::Acquire);
    if let Err(error) = write_until_settled(
        storage,
        scheduled_revision,
        persisted_revision,
        target_revision,
    )
    .await
    {
        eprintln!("[agent-status] shutdown persistence failed: {error}");
    }
}

fn is_behind(scheduled_revision: &AtomicU64, persisted_revision: u64) -> bool {
    scheduled_revision.load(Ordering::Acquire) > persisted_revision
}

async fn wait_for_deadline(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => sleep_until(deadline).await,
        None => std::future::pending().await,
    }
}

#[derive(Serialize)]
struct StatusDocument<'a> {
    version: u32,
    entries: &'a HashMap<String, Value>,
    #[serde(rename = "migrationUnsupportedPtys")]
    migration_unsupported_ptys: Vec<&'a Value>,
}

/// Serializes both live maps in one pass while holding their locks.
///
/// Why: borrowing the maps keeps the encode allocation-free apart from the
/// output buffer, and no `await` happens under the guards. `statuses` is always
/// locked before `migration`, matching every other path in this module; no path
/// holds one of them while acquiring the other, so the pair cannot deadlock.
fn encode(storage: &Storage) -> io::Result<Vec<u8>> {
    let statuses = lock(&storage.statuses);
    let migration = lock(&storage.migration);
    serde_json::to_vec(&StatusDocument {
        version: DOCUMENT_VERSION,
        entries: &statuses,
        migration_unsupported_ptys: migration.values().collect(),
    })
    .map_err(io::Error::other)
}

/// Stages and atomically replaces the status document.
///
/// Why: `HardenedDirectory` owns the hardened sequence this needs — a random
/// same-directory staging name, one exclusive `create_new` open that cannot
/// traverse a symlink or reparse point, `write_all` then `sync_all` on that same
/// handle, atomic rename, directory fsync, and removal of only the staging file
/// it created. Reusing it keeps one audited implementation instead of a second
/// copy here, and it does the permission work once rather than per write.
///
/// Why blocking pool: the primitive is synchronous, so it runs under
/// `spawn_blocking` to keep the actor's task and every Tokio worker free. The
/// caller still sees an ordinary future, so the debounce, coalescing and retry
/// behaviour above are unchanged.
async fn write_snapshot(storage: &mut Storage) -> io::Result<()> {
    let payload = encode(storage)?;
    let directory = hardened_directory(storage).await?;
    let path = storage.path.clone();
    let result = tokio::task::spawn_blocking(move || directory.write_bytes(&path, &payload))
        .await
        .map_err(io::Error::other)?
        .map_err(io::Error::other);
    if result.is_err() {
        // Why: the failure may be exactly the drift check refusing a replaced or
        // re-owned directory, so the cached handle is dropped and the next
        // bounded retry re-hardens and re-fingerprints before writing.
        storage.directory = None;
    }
    result
}

/// Returns the cached hardened directory, opening it on first use.
///
/// Why: opening runs the only permission work in this path — on Windows an
/// `icacls` pass over the directory — so it happens once per process rather than
/// once per debounced write. Doing it lazily rather than at startup keeps a
/// transient failure inside the existing retry policy instead of stranding it in
/// construction.
async fn hardened_directory(storage: &mut Storage) -> io::Result<HardenedDirectory> {
    if let Some(directory) = &storage.directory {
        return Ok(directory.clone());
    }
    let parent = storage
        .path
        .parent()
        .ok_or_else(|| io::Error::other("agent status path has no parent directory"))?
        .to_owned();
    let directory = tokio::task::spawn_blocking(move || HardenedDirectory::open(&parent))
        .await
        .map_err(io::Error::other)?
        .map_err(io::Error::other)?;
    storage.directory = Some(directory.clone());
    Ok(directory)
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
