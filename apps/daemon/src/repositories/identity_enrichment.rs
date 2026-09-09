use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::sync::{oneshot, watch};

use super::RepositoryAuthority;

const NO_IDENTITY_RETRY_TTL: Duration = Duration::from_secs(5 * 60);

#[derive(Clone)]
pub(super) struct IdentityEnrichment {
    shutdown: watch::Sender<bool>,
    state: Arc<Mutex<EnrichmentState>>,
}

#[derive(Default)]
struct EnrichmentState {
    completion: Option<oneshot::Receiver<()>>,
    is_running: bool,
    is_shutting_down: bool,
    queued: HashSet<(String, String)>,
    queue: VecDeque<EnrichmentCandidate>,
    retry_after: HashMap<(String, String), Instant>,
}

struct EnrichmentCandidate {
    path: String,
    project_id: String,
}

impl Default for IdentityEnrichment {
    fn default() -> Self {
        let (shutdown, _) = watch::channel(false);
        Self {
            shutdown,
            state: Arc::new(Mutex::new(EnrichmentState::default())),
        }
    }
}

impl IdentityEnrichment {
    pub(super) fn schedule(&self, authority: RepositoryAuthority, repos: &[Value]) {
        let now = Instant::now();
        let completion = {
            let mut state = lock(&self.state);
            if state.is_shutting_down {
                return;
            }
            state.retry_after.retain(|_, deadline| *deadline > now);
            for repo in repos {
                if repo.get("kind").and_then(Value::as_str) != Some("git")
                    || repo.get("gitRemoteIdentity").is_some()
                {
                    continue;
                }
                let Some(project_id) = repo.get("id").and_then(Value::as_str).map(str::to_owned)
                else {
                    continue;
                };
                let Some(path) = repo.get("path").and_then(Value::as_str).map(str::to_owned) else {
                    continue;
                };
                let location = ("local".to_owned(), path.clone());
                let candidate_key = (project_id.clone(), path.clone());
                if state.retry_after.contains_key(&location) || !state.queued.insert(candidate_key)
                {
                    continue;
                }
                state
                    .queue
                    .push_back(EnrichmentCandidate { path, project_id });
            }
            if state.is_running || state.queue.is_empty() {
                None
            } else {
                state.is_running = true;
                let (completion, completed) = oneshot::channel();
                state.completion = Some(completed);
                Some(completion)
            }
        };
        if let Some(completion) = completion {
            let enrichment = self.clone();
            let shutdown = self.shutdown.subscribe();
            tokio::spawn(async move {
                enrichment.run(authority, shutdown).await;
                let _ = completion.send(());
            });
        }
    }

    pub(super) async fn shutdown(&self) {
        let completion = {
            let mut state = lock(&self.state);
            state.is_shutting_down = true;
            state.queue.clear();
            state.queued.clear();
            state.completion.take()
        };
        let _ = self.shutdown.send(true);
        if let Some(completion) = completion {
            let _ = completion.await;
        }
    }

    async fn run(self, authority: RepositoryAuthority, mut shutdown: watch::Receiver<bool>) {
        loop {
            if *shutdown.borrow() {
                return;
            }
            let Some(candidate) = self.next() else {
                return;
            };
            let location = ("local".to_owned(), candidate.path.clone());
            let result = tokio::select! {
                _ = wait_for_shutdown(&mut shutdown) => return,
                result = async {
                    let host = authority.hosts.execution_host("local").await?;
                    let remotes = super::creation::git_remotes(host, &candidate.path).await?;
                    if remotes.is_empty() {
                        return Ok(None);
                    }
                    let changed = authority
                        .store_enriched_identity(
                            candidate.project_id.clone(),
                            candidate.path.clone(),
                            remotes,
                        )
                        .await?;
                    Ok::<_, super::RepositoryError>(Some(changed))
                }
                => result,
            };
            let mut state = lock(&self.state);
            state.queued.remove(&(candidate.project_id, candidate.path));
            if matches!(result, Ok(None)) {
                state
                    .retry_after
                    .insert(location, Instant::now() + NO_IDENTITY_RETRY_TTL);
            }
        }
    }

    fn next(&self) -> Option<EnrichmentCandidate> {
        let mut state = lock(&self.state);
        let candidate = state.queue.pop_front();
        if candidate.is_none() {
            state.is_running = false;
        }
        candidate
    }
}

async fn wait_for_shutdown(shutdown: &mut watch::Receiver<bool>) {
    if *shutdown.borrow() {
        return;
    }
    while shutdown.changed().await.is_ok() {
        if *shutdown.borrow() {
            return;
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
