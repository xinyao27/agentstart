use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::Ordering;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::projects::ProjectKind;

use super::refresh::{epoch_millis, outcome};
use super::{BranchLookup, GitHubAuthority, GitHubContext, GitHubError};

const POST_PUSH_DELAY_MS: u64 = 2_500;
const BACKGROUND_SPACING_MS: u64 = 10_000;
const BACKGROUND_WINDOW_MS: u64 = 5 * 60_000;
const BACKGROUND_MAX_STARTS: usize = 20;
const ACTIVE_WINDOW_MS: u64 = 30_000;
const ACTIVE_MAX_STARTS: usize = 3;
const VALIDATION_BACKOFF_MS: u64 = 5 * 60_000;
const MAX_VALIDATION_DENIALS: usize = 256;

#[derive(Clone, Copy, Debug)]
pub(crate) enum AppStarSource {
    StarNag,
    AgentValueMoment,
    OnboardingCompleted,
    Settings,
    Landing,
}

impl AppStarSource {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::StarNag => "star_nag",
            Self::AgentValueMoment => "agent_value_moment",
            Self::OnboardingCompleted => "onboarding_completed",
            Self::Settings => "settings",
            Self::Landing => "landing",
        }
    }
}

#[derive(Clone, Debug)]
pub(crate) struct PrRefreshCandidate {
    pub(crate) cache_key: String,
    pub(crate) repo_id: String,
    pub(crate) repo_path: String,
    pub(crate) repo_kind: ProjectKind,
    pub(crate) branch: String,
    pub(crate) worktree_id: Option<String>,
    pub(crate) current_head_oid: Option<String>,
    pub(crate) linked_pr_number: Option<u64>,
    pub(crate) fallback_pr_number: Option<u64>,
    pub(crate) fallback_pr_source: Option<&'static str>,
    pub(crate) is_bare: bool,
    pub(crate) is_archived: bool,
    pub(crate) cached_fetched_at_ms: Option<u64>,
    pub(crate) cached_has_pr: Option<bool>,
    pub(crate) cached_pr_state: Option<&'static str>,
    pub(crate) cached_checks_status: Option<&'static str>,
    pub(crate) cached_mergeable: Option<&'static str>,
    pub(crate) cached_merge_state_status: Option<String>,
    pub(crate) execution_host_id: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PrRefreshReason {
    Visible,
    Active,
    PostPush,
    Manual,
    Swr,
}

impl PrRefreshReason {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Visible => "visible",
            Self::Active => "active",
            Self::PostPush => "post-push",
            Self::Manual => "manual",
            Self::Swr => "swr",
        }
    }

    const fn is_background(self) -> bool {
        !matches!(self, Self::Manual)
    }

    const fn is_budgeted(self) -> bool {
        matches!(self, Self::Visible | Self::Swr)
    }

    const fn bypasses_freshness(self) -> bool {
        matches!(self, Self::Active | Self::PostPush | Self::Manual)
    }
}

pub(crate) enum PrRefreshEnqueueResult {
    Queued,
    Skipped(ValidationSkip),
}

#[derive(Clone, Copy)]
pub(crate) enum ValidationSkip {
    Denied,
    Backoff,
}

#[derive(Default)]
pub(super) struct WorkbenchState {
    active_starts: HashMap<String, VecDeque<u64>>,
    background_starts: VecDeque<u64>,
    error_failures: HashMap<String, u32>,
    next_order: u64,
    queue: HashMap<String, QueueEntry>,
    validation_denials: HashMap<String, u64>,
    visible: HashMap<String, VisibleState>,
    worker_running: bool,
}

#[derive(Clone)]
struct QueueEntry {
    aliases: HashMap<String, Value>,
    bypass_background_budget: bool,
    candidate: PrRefreshCandidate,
    due_at: u64,
    key: String,
    order: u64,
    priority: i32,
    reason: PrRefreshReason,
    window_id: String,
}

struct VisibleState {
    generation: f64,
    keys: HashSet<String>,
}

#[derive(Deserialize)]
struct ViewerResponse {
    login: String,
    email: Option<String>,
}

impl GitHubAuthority {
    pub(crate) async fn viewer(&self) -> Option<(String, Option<String>)> {
        let context = self.local_context().await.ok()?;
        let output = self
            .gh(
                &context,
                ["api", "user", "--jq", "{login: .login, email: .email}"],
                15_000,
            )
            .await
            .ok()?;
        let viewer = serde_json::from_str::<ViewerResponse>(&output).ok()?;
        let login = viewer.login.trim().to_owned();
        if login.is_empty() {
            return None;
        }
        Some((
            login,
            viewer
                .email
                .map(|email| email.trim().to_owned())
                .filter(|email| !email.is_empty()),
        ))
    }

    pub(crate) async fn check_yiru_starred(&self) -> Option<bool> {
        let context = self.local_context().await.ok()?;
        match self
            .gh(
                &context,
                ["api", "--include", "user/starred/xinyao27/yiru"],
                15_000,
            )
            .await
        {
            Ok(output) if has_starred_status(&output) => Some(true),
            Ok(_) => None,
            Err(GitHubError::Command(message)) if message.contains("HTTP 404") => Some(false),
            Err(_) => None,
        }
    }

    pub(crate) async fn star_yiru(&self) -> bool {
        let Ok(context) = self.local_context().await else {
            return false;
        };
        self.gh(
            &context,
            ["api", "-X", "PUT", "user/starred/xinyao27/yiru"],
            15_000,
        )
        .await
        .is_ok()
    }

    pub(crate) async fn enqueue_pr_refresh(
        &self,
        candidate: PrRefreshCandidate,
        reason: PrRefreshReason,
        priority: i32,
        window_id: String,
    ) -> PrRefreshEnqueueResult {
        let candidate = match self.validate_candidate(candidate).await {
            Ok(candidate) => candidate,
            Err(key) => return PrRefreshEnqueueResult::Skipped(self.note_validation_denial(key)),
        };
        self.enqueue_validated(candidate, reason, priority, window_id);
        PrRefreshEnqueueResult::Queued
    }

    pub(crate) async fn report_visible_pr_refresh_candidates(
        &self,
        candidates: Vec<PrRefreshCandidate>,
        generation: f64,
        window_id: String,
    ) -> bool {
        let mut validated = Vec::new();
        for candidate in candidates {
            if let Ok(candidate) = self.validate_candidate(candidate).await {
                validated.push(candidate);
            }
        }
        let keys = validated.iter().map(refresh_key).collect::<HashSet<_>>();
        {
            let mut state = lock(&self.workbench);
            if state
                .visible
                .get(&window_id)
                .is_some_and(|visible| generation < visible.generation)
            {
                return true;
            }
            state.visible.insert(
                window_id.clone(),
                VisibleState {
                    generation,
                    keys: keys.clone(),
                },
            );
        }
        self.remove_invisible_visible_entries();
        for candidate in validated {
            self.enqueue_validated(candidate, PrRefreshReason::Visible, 40, window_id.clone());
        }
        true
    }

    pub(crate) fn close_pr_refresh_window(&self, window_id: &str) {
        let mut state = lock(&self.workbench);
        state.visible.remove(window_id);
        let prefix = format!("{window_id}::");
        state
            .active_starts
            .retain(|scope, _| !scope.starts_with(&prefix));
        drop(state);
        self.workbench_notify.notify_one();
        self.remove_invisible_visible_entries();
    }

    async fn validate_candidate(
        &self,
        mut candidate: PrRefreshCandidate,
    ) -> Result<PrRefreshCandidate, String> {
        let denial_key = format!(
            "{}::{}",
            candidate.repo_id,
            crate::runtime_path::comparison_key(&candidate.repo_path)
        );
        let project = self
            .projects
            .resolve_id(&candidate.repo_id)
            .await
            .map_err(|_| format!("{denial_key}::unknown-repo"))?;
        if !crate::runtime_path::equal(&project.path, &candidate.repo_path) {
            return Err(format!("{denial_key}::repo-path-mismatch"));
        }
        candidate.repo_id = project.id;
        candidate.repo_path = project.path;
        candidate.execution_host_id = project.execution_host_id;
        Ok(candidate)
    }

    fn note_validation_denial(&self, key: String) -> ValidationSkip {
        let now = now_ms();
        let mut state = lock(&self.workbench);
        state
            .validation_denials
            .retain(|_, denied_at| now.saturating_sub(*denied_at) < VALIDATION_BACKOFF_MS);
        if state.validation_denials.contains_key(&key) {
            return ValidationSkip::Backoff;
        }
        if state.validation_denials.len() >= MAX_VALIDATION_DENIALS
            && let Some(oldest) = state
                .validation_denials
                .iter()
                .min_by_key(|(_, denied_at)| **denied_at)
                .map(|(key, _)| key.clone())
        {
            state.validation_denials.remove(&oldest);
        }
        state.validation_denials.insert(key, now);
        ValidationSkip::Denied
    }

    fn enqueue_validated(
        &self,
        candidate: PrRefreshCandidate,
        reason: PrRefreshReason,
        priority: i32,
        window_id: String,
    ) {
        let key = refresh_key(&candidate);
        let alias = refresh_alias(&candidate);
        if let Some(skipped_reason) = candidate_skip(&candidate) {
            self.publish_workbench_refresh(
                reason,
                vec![alias],
                json!({ "status": "skipped", "skippedReason": skipped_reason }),
            );
            return;
        }
        let now = now_ms();
        let due_at = fresh_retry_at(&candidate, reason).unwrap_or_else(|| {
            now + u64::from(reason == PrRefreshReason::PostPush) * POST_PUSH_DELAY_MS
        });
        let mut start_worker = false;
        {
            let mut state = lock(&self.workbench);
            state.next_order = state.next_order.saturating_add(1);
            let order = state.next_order;
            if let Some(existing) = state.queue.get_mut(&key) {
                existing
                    .aliases
                    .insert(candidate.cache_key.clone(), alias.clone());
                let promote = priority > existing.priority
                    || reason == PrRefreshReason::Manual
                    || (reason == PrRefreshReason::Active
                        && existing.reason == PrRefreshReason::Active)
                    || (priority >= existing.priority
                        && due_at < existing.due_at
                        && reason.bypasses_freshness());
                if promote {
                    existing.candidate = candidate;
                    existing.due_at = existing.due_at.min(due_at);
                    existing.order = order;
                    existing.priority = priority;
                    existing.reason = reason;
                    existing.window_id = window_id;
                }
            } else {
                state.queue.insert(
                    key.clone(),
                    QueueEntry {
                        aliases: HashMap::from([(candidate.cache_key.clone(), alias.clone())]),
                        bypass_background_budget: false,
                        candidate,
                        due_at,
                        key,
                        order,
                        priority,
                        reason,
                        window_id,
                    },
                );
            }
            if !state.worker_running {
                state.worker_running = true;
                start_worker = true;
            }
        }
        if !reason.is_budgeted() && due_at > now && due_at.saturating_sub(now) <= 5_000 {
            self.publish_workbench_refresh(reason, vec![alias], json!({ "status": "queued" }));
        }
        if start_worker {
            let authority = self.clone();
            tokio::spawn(async move { authority.run_refresh_queue().await });
        }
        self.workbench_notify.notify_one();
    }

    async fn run_refresh_queue(self) {
        loop {
            let (entry, wait_ms) = {
                let mut state = lock(&self.workbench);
                let now = now_ms();
                let next = state
                    .queue
                    .values()
                    .filter(|entry| entry.due_at <= now)
                    .max_by(|left, right| queue_order(left, right))
                    .map(|entry| entry.key.clone());
                if let Some(key) = next {
                    (state.queue.remove(&key), 0)
                } else if let Some(next_due) = state.queue.values().map(|entry| entry.due_at).min()
                {
                    (None, next_due.saturating_sub(now).max(1))
                } else {
                    state.worker_running = false;
                    return;
                }
            };
            let Some(mut entry) = entry else {
                tokio::select! {
                    () = tokio::time::sleep(Duration::from_millis(wait_ms)) => {}
                    () = self.workbench_notify.notified() => {}
                }
                continue;
            };
            if entry.reason == PrRefreshReason::Visible && !self.is_visible(&entry.key) {
                self.publish_entry(
                    &entry,
                    json!({ "status": "skipped", "skippedReason": "fresh" }),
                );
                continue;
            }
            if let Some(retry_at) = self.pacing_retry_at(&entry) {
                entry.due_at = retry_at;
                lock(&self.workbench).queue.insert(entry.key.clone(), entry);
                continue;
            }
            let context = match self.context(&entry.candidate.repo_id, None).await {
                Ok(context) => context,
                Err(error) => {
                    self.publish_entry(&entry, json!({ "outcome": outcome(Err(error)) }));
                    continue;
                }
            };
            let request_sequence = self.next_refresh_sequence();
            let request_started_at = epoch_millis();
            self.publish_entry_with_sequence(
                &entry,
                json!({ "status": "in-flight", "requestStartedAt": request_started_at }),
                request_sequence,
            );
            if entry.reason.is_background() {
                let snapshot = self.rate_limit_for(&context, false).await;
                if snapshot.get("ok").and_then(Value::as_bool) == Some(true)
                    && let Some(block) = self
                        .rate_guard(&context, "core")
                        .or_else(|| self.rate_guard(&context, "graphql"))
                {
                    let retry_at = block.reset_at.saturating_mul(1_000);
                    self.publish_entry(
                        &entry,
                        json!({ "status": "paused", "pausedUntil": retry_at, "skippedReason": "rate-limit" }),
                    );
                    entry.due_at = retry_at;
                    lock(&self.workbench).queue.insert(entry.key.clone(), entry);
                    continue;
                }
                self.note_pacing_start(&entry);
            }
            let fallback = entry
                .candidate
                .linked_pr_number
                .is_none()
                .then_some(entry.candidate.fallback_pr_number)
                .flatten();
            let result = self
                .pr_for_branch_context(
                    &context,
                    &entry.candidate.branch,
                    &BranchLookup {
                        linked: entry.candidate.linked_pr_number,
                        fallback,
                        accept_merged_fallback: fallback.is_some()
                            && entry.candidate.fallback_pr_source.is_some(),
                        current_head_oid: entry.candidate.current_head_oid.as_deref(),
                    },
                )
                .await;
            let refresh_outcome = outcome(result);
            if refresh_outcome.get("kind").and_then(Value::as_str) == Some("found")
                && let Some(review) = refresh_outcome.get("pr")
            {
                self.record_pr(&context.project_id, review);
            }
            self.publish_entry_with_sequence(
                &entry,
                json!({ "outcome": refresh_outcome, "requestStartedAt": request_started_at }),
                request_sequence,
            );
            self.schedule_visible_follow_up(entry, &refresh_outcome);
        }
    }

    fn pacing_retry_at(&self, entry: &QueueEntry) -> Option<u64> {
        if !entry.reason.is_background() {
            return None;
        }
        let now = now_ms();
        let mut state = lock(&self.workbench);
        prune(&mut state.background_starts, now, BACKGROUND_WINDOW_MS);
        if !entry.bypass_background_budget
            && matches!(
                entry.reason,
                PrRefreshReason::Visible | PrRefreshReason::Swr
            )
        {
            if let Some(last) = state.background_starts.back()
                && now.saturating_sub(*last) < BACKGROUND_SPACING_MS
            {
                return Some(last.saturating_add(BACKGROUND_SPACING_MS));
            }
            if state.background_starts.len() >= BACKGROUND_MAX_STARTS {
                return state
                    .background_starts
                    .front()
                    .map(|first| first.saturating_add(BACKGROUND_WINDOW_MS));
            }
        }
        if entry.reason == PrRefreshReason::Active {
            let starts = state.active_starts.entry(active_scope(entry)).or_default();
            prune(starts, now, ACTIVE_WINDOW_MS);
            if starts.len() >= ACTIVE_MAX_STARTS {
                return starts
                    .front()
                    .map(|first| first.saturating_add(ACTIVE_WINDOW_MS));
            }
        }
        None
    }

    fn note_pacing_start(&self, entry: &QueueEntry) {
        let now = now_ms();
        let mut state = lock(&self.workbench);
        if !entry.bypass_background_budget
            && matches!(
                entry.reason,
                PrRefreshReason::Visible | PrRefreshReason::Swr
            )
        {
            state.background_starts.push_back(now);
        }
        if entry.reason == PrRefreshReason::Active {
            state
                .active_starts
                .entry(active_scope(entry))
                .or_default()
                .push_back(now);
        }
    }

    fn is_visible(&self, key: &str) -> bool {
        lock(&self.workbench)
            .visible
            .values()
            .any(|visible| visible.keys.contains(key))
    }

    fn remove_invisible_visible_entries(&self) {
        let removed = {
            let mut state = lock(&self.workbench);
            let visible_keys = state
                .visible
                .values()
                .flat_map(|visible| visible.keys.iter().cloned())
                .collect::<HashSet<_>>();
            let removed_keys = state
                .queue
                .iter()
                .filter(|(key, entry)| {
                    entry.reason == PrRefreshReason::Visible && !visible_keys.contains(*key)
                })
                .map(|(key, _)| key.clone())
                .collect::<Vec<_>>();
            removed_keys
                .into_iter()
                .filter_map(|key| {
                    state.error_failures.remove(&key);
                    state.queue.remove(&key)
                })
                .collect::<Vec<_>>()
        };
        for entry in removed {
            self.publish_entry(
                &entry,
                json!({ "status": "skipped", "skippedReason": "fresh" }),
            );
        }
    }

    fn schedule_visible_follow_up(&self, mut entry: QueueEntry, refresh_outcome: &Value) {
        if !self.is_visible(&entry.key) {
            lock(&self.workbench).error_failures.remove(&entry.key);
            return;
        }
        let now = now_ms();
        let kind = refresh_outcome.get("kind").and_then(Value::as_str);
        let mut state = lock(&self.workbench);
        if kind == Some("upstream-error") {
            let failures = state.error_failures.entry(entry.key.clone()).or_default();
            *failures = failures.saturating_add(1);
            let exponent = failures.saturating_sub(1).min(4);
            entry.due_at = now.saturating_add(
                (60_000_u64.saturating_mul(2_u64.saturating_pow(exponent))).min(15 * 60_000),
            );
            entry.bypass_background_budget = false;
        } else {
            state.error_failures.remove(&entry.key);
            apply_outcome_cache(&mut entry.candidate, refresh_outcome);
            entry.due_at =
                fresh_retry_at(&entry.candidate, PrRefreshReason::Visible).unwrap_or(now);
            entry.bypass_background_budget = is_mergeability_pending(refresh_outcome);
        }
        entry.reason = PrRefreshReason::Visible;
        state.next_order = state.next_order.saturating_add(1);
        entry.order = state.next_order;
        if let Some(existing) = state.queue.get_mut(&entry.key) {
            existing.aliases.extend(entry.aliases);
            if !existing.reason.bypasses_freshness()
                && existing.priority <= entry.priority
                && existing.due_at > entry.due_at
            {
                let aliases = std::mem::take(&mut existing.aliases);
                entry.aliases = aliases;
                *existing = entry;
            }
        } else {
            state.queue.insert(entry.key.clone(), entry);
        }
    }

    async fn local_context(&self) -> Result<GitHubContext, GitHubError> {
        Ok(GitHubContext {
            execution_host_id: "local".to_owned(),
            host: self.hosts.execution_host("local").await?,
            path: ".".to_owned(),
            project_id: "local".to_owned(),
        })
    }

    fn publish_entry(&self, entry: &QueueEntry, details: Value) {
        self.publish_entry_with_sequence(entry, details, self.next_refresh_sequence());
    }

    fn publish_entry_with_sequence(&self, entry: &QueueEntry, details: Value, sequence: u64) {
        self.publish_workbench_refresh_with_sequence(
            entry.reason,
            entry.aliases.values().cloned().collect(),
            details,
            sequence,
        );
    }

    fn publish_workbench_refresh(
        &self,
        reason: PrRefreshReason,
        aliases: Vec<Value>,
        details: Value,
    ) {
        self.publish_workbench_refresh_with_sequence(
            reason,
            aliases,
            details,
            self.next_refresh_sequence(),
        );
    }

    fn publish_workbench_refresh_with_sequence(
        &self,
        reason: PrRefreshReason,
        aliases: Vec<Value>,
        details: Value,
        sequence: u64,
    ) {
        let mut event = Map::from_iter([
            ("sequence".to_owned(), json!(sequence)),
            ("reason".to_owned(), json!(reason.as_str())),
            ("aliases".to_owned(), Value::Array(aliases)),
        ]);
        if let Some(details) = details.as_object() {
            event.extend(details.clone());
        }
        drop(self.events.send(json!({
            "type": "prRefresh",
            "event": event
        })));
    }

    fn next_refresh_sequence(&self) -> u64 {
        self.refresh_sequence.fetch_add(1, Ordering::Relaxed) + 1
    }
}

fn refresh_key(candidate: &PrRefreshCandidate) -> String {
    if let Some(number) = candidate.linked_pr_number {
        format!(
            "local::{}::{}::pr::{number}",
            candidate.execution_host_id, candidate.repo_path
        )
    } else {
        format!(
            "local::{}::{}::branch::{}",
            candidate.execution_host_id, candidate.repo_path, candidate.branch
        )
    }
}

fn queue_order(left: &QueueEntry, right: &QueueEntry) -> std::cmp::Ordering {
    left.priority.cmp(&right.priority).then_with(|| {
        if left.reason == PrRefreshReason::Active
            && right.reason == PrRefreshReason::Active
            && active_scope(left) == active_scope(right)
        {
            left.order.cmp(&right.order)
        } else {
            right.order.cmp(&left.order)
        }
    })
}

fn active_scope(entry: &QueueEntry) -> String {
    format!("{}::{}", entry.window_id, entry.candidate.execution_host_id)
}

fn refresh_alias(candidate: &PrRefreshCandidate) -> Value {
    let mut alias = json!({
        "cacheKey": candidate.cache_key,
        "repoId": candidate.repo_id,
        "repoPath": candidate.repo_path,
        "branch": candidate.branch,
        "connectionId": Value::Null,
        "currentHeadOid": candidate.current_head_oid,
        "linkedPRNumber": candidate.linked_pr_number,
        "fallbackPRNumber": candidate.linked_pr_number.is_none().then_some(candidate.fallback_pr_number).flatten(),
        "fallbackPRSource": candidate.linked_pr_number.is_none().then_some(candidate.fallback_pr_source).flatten()
    });
    if let Some(worktree_id) = &candidate.worktree_id {
        alias["worktreeId"] = Value::from(worktree_id.clone());
    }
    alias
}

fn candidate_skip(candidate: &PrRefreshCandidate) -> Option<&'static str> {
    if candidate.repo_kind != ProjectKind::Git {
        Some("not-git")
    } else if candidate.is_bare {
        Some("bare")
    } else if candidate.is_archived {
        Some("archived")
    } else if candidate.branch.is_empty() && candidate.linked_pr_number.is_none() {
        Some("fresh")
    } else {
        None
    }
}

fn fresh_retry_at(candidate: &PrRefreshCandidate, reason: PrRefreshReason) -> Option<u64> {
    if reason.bypasses_freshness() {
        return None;
    }
    let fetched_at = candidate.cached_fetched_at_ms?;
    let retry_at = fetched_at.saturating_add(refresh_interval(candidate));
    (now_ms() < retry_at).then_some(retry_at)
}

fn refresh_interval(candidate: &PrRefreshCandidate) -> u64 {
    if matches!(candidate.cached_pr_state, Some("closed" | "merged")) {
        30 * 60_000
    } else if candidate.cached_has_pr == Some(false) {
        15 * 60_000
    } else if candidate.cached_has_pr == Some(true)
        && candidate.cached_pr_state == Some("open")
        && candidate.cached_mergeable == Some("UNKNOWN")
        && !matches!(
            candidate.cached_merge_state_status.as_deref(),
            Some("CLEAN" | "BEHIND" | "BLOCKED")
        )
    {
        10_000
    } else {
        match candidate.cached_checks_status {
            Some("success") => 10 * 60_000,
            Some("failure") => 3 * 60_000,
            Some("pending") => 90_000,
            _ => 60_000,
        }
    }
}

fn apply_outcome_cache(candidate: &mut PrRefreshCandidate, outcome: &Value) {
    candidate.cached_fetched_at_ms = outcome.get("fetchedAt").and_then(Value::as_u64);
    match outcome.get("kind").and_then(Value::as_str) {
        Some("found") => {
            let pr = outcome.get("pr");
            candidate.cached_has_pr = Some(true);
            candidate.cached_pr_state = pr
                .and_then(|value| value.get("state"))
                .and_then(Value::as_str)
                .and_then(cached_pr_state);
            candidate.cached_checks_status = pr
                .and_then(|value| value.get("checksStatus"))
                .and_then(Value::as_str)
                .and_then(cached_checks_status);
            candidate.cached_mergeable = pr
                .and_then(|value| value.get("mergeable"))
                .and_then(Value::as_str)
                .and_then(cached_mergeable);
            candidate.cached_merge_state_status = pr
                .and_then(|value| value.get("mergeStateStatus"))
                .and_then(Value::as_str)
                .map(str::to_owned);
        }
        Some("no-pr") => {
            candidate.cached_has_pr = Some(false);
            candidate.cached_pr_state = None;
            candidate.cached_checks_status = None;
            candidate.cached_mergeable = None;
            candidate.cached_merge_state_status = None;
        }
        _ => {}
    }
}

fn is_mergeability_pending(outcome: &Value) -> bool {
    let Some(pr) = outcome
        .get("kind")
        .and_then(Value::as_str)
        .filter(|kind| *kind == "found")
        .and_then(|_| outcome.get("pr"))
    else {
        return false;
    };
    pr.get("state").and_then(Value::as_str) == Some("open")
        && pr.get("mergeable").and_then(Value::as_str) == Some("UNKNOWN")
        && !matches!(
            pr.get("mergeStateStatus").and_then(Value::as_str),
            Some("CLEAN" | "BEHIND" | "BLOCKED")
        )
}

fn cached_pr_state(value: &str) -> Option<&'static str> {
    match value {
        "open" => Some("open"),
        "closed" => Some("closed"),
        "merged" => Some("merged"),
        "draft" => Some("draft"),
        _ => None,
    }
}

fn cached_checks_status(value: &str) -> Option<&'static str> {
    match value {
        "pending" => Some("pending"),
        "success" => Some("success"),
        "failure" => Some("failure"),
        "neutral" => Some("neutral"),
        _ => None,
    }
}

fn cached_mergeable(value: &str) -> Option<&'static str> {
    match value {
        "MERGEABLE" => Some("MERGEABLE"),
        "CONFLICTING" => Some("CONFLICTING"),
        "UNKNOWN" => Some("UNKNOWN"),
        _ => None,
    }
}

fn has_starred_status(output: &str) -> bool {
    output.lines().any(|line| {
        let mut fields = line.split_whitespace();
        fields
            .next()
            .is_some_and(|value| value.starts_with("HTTP/"))
            && matches!(fields.next(), Some("200" | "204"))
    })
}

fn prune(values: &mut VecDeque<u64>, now: u64, window_ms: u64) {
    while values
        .front()
        .is_some_and(|value| now.saturating_sub(*value) >= window_ms)
    {
        values.pop_front();
    }
}

fn now_ms() -> u64 {
    u64::try_from(epoch_millis()).unwrap_or(u64::MAX)
}

fn lock<T>(mutex: &std::sync::Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
