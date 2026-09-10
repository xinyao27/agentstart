use std::collections::BTreeMap;
use std::io;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use tokio::sync::{mpsc, oneshot, watch};
use tokio::time::Instant;

use crate::transport::secure_file;

use super::StatsError;
use super::activity_data::{ActivityDocument, ActivityState};
use super::model::ActivitySummary;

const SAVE_DELAY: Duration = Duration::from_secs(5);

#[derive(Clone)]
pub(super) struct ActivityAuthority {
    state: Arc<Mutex<ActivityState>>,
    commands: mpsc::Sender<Command>,
    agent_starts: watch::Sender<u64>,
}

enum Command {
    Changed,
    Flush(oneshot::Sender<io::Result<()>>),
}

impl ActivityAuthority {
    pub(super) async fn open(path: PathBuf) -> Result<Self, StatsError> {
        let (mut document, write_blocked) = load(&path).await;
        document.normalize();
        let agent_starts = watch::channel(document.total_agents_spawned()).0;
        let state = Arc::new(Mutex::new(ActivityState {
            document,
            live_agents: BTreeMap::new(),
            revision: 0,
        }));
        let (commands, receiver) = mpsc::channel(8);
        tokio::spawn(run_writer(path, state.clone(), receiver, write_blocked));
        Ok(Self {
            state,
            commands,
            agent_starts,
        })
    }

    pub(super) fn summary(&self) -> ActivitySummary {
        lock(&self.state).document.summary()
    }

    pub(super) fn total_agents_spawned(&self) -> u64 {
        lock(&self.state).document.total_agents_spawned()
    }

    pub(super) fn subscribe_agent_starts(&self) -> watch::Receiver<u64> {
        self.agent_starts.subscribe()
    }

    pub(super) fn start_agent(&self, pty_id: &str, at: i64) {
        let mut state = lock(&self.state);
        if state.live_agents.contains_key(pty_id) {
            return;
        }
        state.live_agents.insert(pty_id.to_owned(), at);
        state.document.start_agent(pty_id, at);
        state.revision = state.revision.saturating_add(1);
        // Why: publish while the mutation lock still orders starts, so concurrent PTYs
        // cannot publish an older count after a newer count.
        self.agent_starts
            .send_replace(state.document.total_agents_spawned());
        let _ = self.commands.try_send(Command::Changed);
    }

    pub(super) fn stop_agent(&self, pty_id: &str, at: i64) {
        let mut state = lock(&self.state);
        let Some(started_at) = state.live_agents.remove(pty_id) else {
            return;
        };
        state.document.stop_agent(pty_id, at, started_at);
        state.revision = state.revision.saturating_add(1);
        let _ = self.commands.try_send(Command::Changed);
    }

    pub(super) fn record_pr(&self, url: &str, number: u64, repo_id: &str) {
        let mut state = lock(&self.state);
        if state
            .document
            .record_pr(url, number, repo_id, chrono::Utc::now().timestamp_millis())
        {
            state.revision = state.revision.saturating_add(1);
            let _ = self.commands.try_send(Command::Changed);
        }
    }

    pub(super) async fn flush(&self) -> io::Result<()> {
        {
            let mut state = lock(&self.state);
            let at = chrono::Utc::now().timestamp_millis();
            for (pty_id, started_at) in std::mem::take(&mut state.live_agents) {
                state.document.stop_agent(&pty_id, at, started_at);
                state.revision = state.revision.saturating_add(1);
            }
        }
        let (response, result) = oneshot::channel();
        self.commands
            .send(Command::Flush(response))
            .await
            .map_err(|_| io::Error::other("stats persistence writer is unavailable"))?;
        result
            .await
            .map_err(|_| io::Error::other("stats persistence writer stopped"))?
    }
}

// Why: optional activity history must not prevent daemon startup, but a fresh
// counter must never overwrite unreadable history or the only corrupt copy.
async fn load(path: &std::path::Path) -> (ActivityDocument, Option<String>) {
    match tokio::fs::read(path).await {
        Ok(bytes) => match serde_json::from_slice::<serde_json::Value>(&bytes) {
            Ok(value)
                if value
                    .get("schemaVersion")
                    .and_then(serde_json::Value::as_u64)
                    .is_some_and(|version| version > 2) =>
            {
                // Why: a newer daemon owns this document; parsing only familiar fields and
                // writing them back would silently discard the newer schema's data.
                let reason = "stats history uses a newer schema version".to_owned();
                eprintln!("[stats] {reason}; persistence is disabled for this session");
                (
                    serde_json::from_value(value).unwrap_or_default(),
                    Some(reason),
                )
            }
            result => match result.and_then(serde_json::from_value) {
                Ok(document) => (document, None),
                Err(error) => {
                    eprintln!("[stats] Invalid activity history: {error}");
                    match preserve_corrupt(path.to_owned(), bytes).await {
                        Ok(()) => (ActivityDocument::default(), None),
                        Err(error) => {
                            let reason =
                                format!("corrupt stats history could not be preserved: {error}");
                            eprintln!("[stats] {reason}; persistence is disabled for this session");
                            (ActivityDocument::default(), Some(reason))
                        }
                    }
                }
            },
        },
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            (ActivityDocument::default(), None)
        }
        Err(error) => {
            let reason = format!("stats history could not be read: {error}");
            eprintln!("[stats] {reason}; persistence is disabled for this session");
            (ActivityDocument::default(), Some(reason))
        }
    }
}

async fn preserve_corrupt(path: PathBuf, bytes: Vec<u8>) -> io::Result<()> {
    tokio::task::spawn_blocking(move || {
        let mut random = [0_u8; 8];
        getrandom::fill(&mut random).map_err(io::Error::other)?;
        let backup = path.with_file_name(format!(
            "agentstart-stats.corrupt-{}-{:016x}.json",
            chrono::Utc::now().timestamp_millis(),
            u64::from_ne_bytes(random)
        ));
        secure_file::write_bytes(&backup, &bytes).map_err(io::Error::other)
    })
    .await
    .map_err(io::Error::other)?
}

async fn run_writer(
    path: PathBuf,
    state: Arc<Mutex<ActivityState>>,
    mut commands: mpsc::Receiver<Command>,
    write_blocked: Option<String>,
) {
    let mut persisted = 0;
    let mut deadline = None;
    loop {
        tokio::select! {
            command = commands.recv() => match command {
                Some(Command::Changed) => { deadline.get_or_insert(Instant::now() + SAVE_DELAY); }
                Some(Command::Flush(response)) => {
                    let result = persist(&path, &state, &mut persisted, write_blocked.as_deref()).await;
                    deadline = if result.is_err() || lock(&state).revision > persisted {
                        Some(Instant::now() + SAVE_DELAY)
                    } else { None };
                    let _ = response.send(result);
                }
                None => {
                    if let Err(error) = persist(&path, &state, &mut persisted, write_blocked.as_deref()).await {
                        eprintln!("[stats] final persistence failed: {error}");
                    }
                    return;
                }
            },
            () = wait_for_deadline(deadline) => {
                match persist(&path, &state, &mut persisted, write_blocked.as_deref()).await {
                    Ok(()) => {
                        deadline = (lock(&state).revision > persisted).then(|| Instant::now() + SAVE_DELAY);
                    }
                    Err(error) => {
                        eprintln!("[stats] persistence failed: {error}");
                        deadline = Some(Instant::now() + SAVE_DELAY);
                    }
                }
            }
        }
    }
}

async fn persist(
    path: &std::path::Path,
    state: &Mutex<ActivityState>,
    persisted: &mut u64,
    write_blocked: Option<&str>,
) -> io::Result<()> {
    let (document, revision) = {
        let state = lock(state);
        if state.revision <= *persisted {
            return Ok(());
        }
        if let Some(reason) = write_blocked {
            return Err(io::Error::other(reason.to_owned()));
        }
        (state.document.clone(), state.revision)
    };
    let path = path.to_owned();
    tokio::task::spawn_blocking(move || {
        let bytes = serde_json::to_vec(&document).map_err(io::Error::other)?;
        secure_file::write_bytes(&path, &bytes).map_err(io::Error::other)
    })
    .await
    .map_err(io::Error::other)??;
    *persisted = revision;
    Ok(())
}

async fn wait_for_deadline(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => tokio::time::sleep_until(deadline).await,
        None => std::future::pending().await,
    }
}

fn lock<T>(value: &Mutex<T>) -> MutexGuard<'_, T> {
    value
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
