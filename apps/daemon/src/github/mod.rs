mod checks;
mod comments;
mod context;
mod draft;
mod files;
mod hosted_review;
mod mapping;
mod metadata;
mod provider_error;
mod rate_limit;
mod reads;
mod refresh;
mod workbench;
mod writes;

use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

use serde_json::Value;
use thiserror::Error;
use tokio::sync::{Notify, Semaphore, broadcast};

use crate::account_usage::StatsAuthority;
use crate::host_registry::HostRegistry;
use crate::host_registry::HostRegistryError;
use crate::hosts::HostCommandError;
use crate::projects::{ProjectCatalog, ProjectCatalogError};
use crate::worktrees::{WorktreeCatalog, WorktreeCatalogError};

pub(crate) use comments::{ReviewComment, ReviewReply};
pub(crate) use context::{GitHubContext, GitHubRepository};
pub(crate) use hosted_review::{CreateHostedReview, HostedReviewEligibility};
pub(crate) use reads::BranchLookup;
pub(crate) use workbench::{
    AppStarSource, PrRefreshCandidate, PrRefreshEnqueueResult, PrRefreshReason, ValidationSkip,
};

pub(crate) fn refresh_error(error: &GitHubError) -> (&'static str, &'static str) {
    let kind = provider_error::classify(&error.to_string());
    (
        provider_error::refresh_type(kind),
        provider_error::refresh_message(kind),
    )
}

#[derive(Clone)]
pub(crate) struct GitHubAuthority {
    stats: Arc<OnceLock<StatsAuthority>>,
    events: broadcast::Sender<Value>,
    hosts: HostRegistry,
    log_cache: Arc<Mutex<HashMap<String, Option<String>>>>,
    membership_cache: Arc<Mutex<HashMap<String, (Instant, String)>>>,
    merge_cache: Arc<Mutex<HashMap<String, (Instant, Value)>>>,
    permits: Arc<Semaphore>,
    projects: ProjectCatalog,
    rate_state: Arc<Mutex<rate_limit::RateState>>,
    refresh_sequence: Arc<AtomicU64>,
    worktrees: WorktreeCatalog,
    workbench: Arc<Mutex<workbench::WorkbenchState>>,
    workbench_notify: Arc<Notify>,
}

#[derive(Debug, Error)]
pub(crate) enum GitHubError {
    #[error("{0}")]
    Command(String),
    #[error(transparent)]
    Host(#[from] HostCommandError),
    #[error(transparent)]
    HostRegistry(#[from] HostRegistryError),
    #[error("github response was invalid: {0}")]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Project(#[from] ProjectCatalogError),
    #[error("github command capacity closed")]
    Shutdown,
    #[error("GitHub {bucket} rate limit is low; retry after {reset_at}")]
    RateLimited { bucket: &'static str, reset_at: u64 },
    #[error(transparent)]
    Worktree(#[from] WorktreeCatalogError),
}

impl GitHubAuthority {
    pub(crate) fn new(
        projects: ProjectCatalog,
        worktrees: WorktreeCatalog,
        hosts: HostRegistry,
    ) -> Self {
        let (events, _) = broadcast::channel(128);
        Self {
            stats: Arc::new(OnceLock::new()),
            events,
            hosts,
            log_cache: Arc::new(Mutex::new(HashMap::new())),
            membership_cache: Arc::new(Mutex::new(HashMap::new())),
            merge_cache: Arc::new(Mutex::new(HashMap::new())),
            permits: Arc::new(Semaphore::new(4)),
            projects,
            rate_state: Arc::new(Mutex::new(rate_limit::RateState::default())),
            refresh_sequence: Arc::new(AtomicU64::new(0)),
            worktrees,
            workbench: Arc::new(Mutex::new(workbench::WorkbenchState::default())),
            workbench_notify: Arc::new(Notify::new()),
        }
    }

    pub(crate) fn configure_stats(&self, stats: StatsAuthority) {
        let _ = self.stats.set(stats);
    }

    fn record_pr(&self, repo_id: &str, review: &Value) {
        let Some(stats) = self.stats.get() else {
            return;
        };
        if let (Some(url), Some(number)) = (
            review.get("url").and_then(Value::as_str),
            review.get("number").and_then(Value::as_u64),
        ) && !url.is_empty()
            && number > 0
        {
            stats.record_pr_created(url, number, repo_id);
        }
    }

    pub(crate) fn subscribe(&self) -> broadcast::Receiver<Value> {
        self.events.subscribe()
    }

    fn publish_mutation(&self, context: &GitHubContext, number: u64) {
        drop(self.events.send(serde_json::json!({
            "type": "workItemMutated",
            "item": {
                "repoPath": context.path,
                "repoId": context.project_id,
                "type": "pr",
                "number": number
            }
        })));
    }
}
