use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use futures_util::{StreamExt, stream};
use serde_json::{Map, Value, json};
use tokio::sync::broadcast;

use crate::host_registry::HostRegistry;
use crate::hosts::{HostCommand, HostCommandOutput};
use crate::ui::UiAuthority;
use crate::worktrees::{ResolvedWorktree, WorktreeCatalog};

const CLASSIFIER_VERSION: i64 = 2;
const ARCHIVED_IDLE_MS: i64 = 7 * 24 * 60 * 60 * 1_000;
const IDLE_MS: i64 = 30 * 24 * 60 * 60 * 1_000;
const GIT_READ_TIMEOUT_MS: u64 = 8_000;
const GIT_MAX_OUTPUT_BYTES: usize = 4 * 1_024 * 1_024;
const WORKTREE_SCAN_CONCURRENCY: usize = 3;

#[derive(Clone)]
pub(crate) struct WorkspaceCleanupAuthority {
    dismissed: Arc<Mutex<HashMap<String, Value>>>,
    events: broadcast::Sender<Value>,
    hosts: HostRegistry,
    ui: UiAuthority,
    worktrees: WorktreeCatalog,
}

struct GitEvidence {
    blockers: Vec<&'static str>,
    checked_at: Option<i64>,
    clean: Option<bool>,
    upstream_ahead: Option<i64>,
    upstream_behind: Option<i64>,
}

impl GitEvidence {
    fn skipped() -> Self {
        Self {
            blockers: Vec::new(),
            checked_at: None,
            clean: None,
            upstream_ahead: None,
            upstream_behind: None,
        }
    }

    fn failed() -> Self {
        Self {
            blockers: vec!["git-status-error"],
            ..Self::skipped()
        }
    }
}

impl WorkspaceCleanupAuthority {
    pub(crate) fn new(hosts: HostRegistry, ui: UiAuthority, worktrees: WorktreeCatalog) -> Self {
        let dismissed = ui
            .get()
            .get("workspaceCleanup")
            .and_then(|value| value.get("dismissals"))
            .and_then(Value::as_object)
            .map(|values| values.clone().into_iter().collect())
            .unwrap_or_default();
        let (events, _) = broadcast::channel(64);
        Self {
            dismissed: Arc::new(Mutex::new(dismissed)),
            events,
            hosts,
            ui,
            worktrees,
        }
    }

    pub(crate) fn subscribe(&self) -> broadcast::Receiver<Value> {
        self.events.subscribe()
    }

    pub(crate) async fn scan(
        &self,
        worktree_id: Option<&str>,
        skip: &[String],
        scan_id: Option<&str>,
    ) -> Value {
        let scanned_at = epoch_millis();
        if worktree_id.is_some_and(|id| !valid_worktree_id(id)) {
            return json!({ "scannedAt": scanned_at, "candidates": [], "errors": [] });
        }
        let target_id = worktree_id.map(str::to_owned);
        let scan_id = scan_id.map(str::to_owned);
        let skip = skip.iter().cloned().collect::<HashSet<_>>();
        let resolved = match self.worktrees.list_resolved().await {
            Ok(worktrees) => worktrees,
            Err(error) => {
                return json!({
                    "scannedAt": scanned_at,
                    "candidates": [],
                    "errors": [{
                        "repoId": "",
                        "repoName": "",
                        "message": safe_scan_error(&error.to_string()),
                    }],
                });
            }
        };
        let worktrees = resolved
            .into_iter()
            .filter(|worktree| worktree.host_id == "local")
            .filter(|worktree| target_id.as_ref().is_none_or(|id| id == &worktree.id))
            .filter(|worktree| {
                target_id.is_some()
                    || (worktree.workspace_kind == "git"
                        && !worktree.is_main_worktree
                        && !inactivity_reasons(worktree, scanned_at).is_empty())
            })
            .collect::<Vec<_>>();
        let with_activity = stream::iter(worktrees.into_iter().map(resolve_activity))
            .buffer_unordered(WORKTREE_SCAN_CONCURRENCY)
            .collect::<Vec<_>>()
            .await;
        let candidate_worktrees = with_activity
            .into_iter()
            .filter(|worktree| {
                target_id.is_some() || !inactivity_reasons(worktree, scanned_at).is_empty()
            })
            .collect::<Vec<_>>();
        let total_worktrees = candidate_worktrees.len();
        let mut candidates = Vec::with_capacity(total_worktrees);
        let errors = Vec::<Value>::new();
        let mut scanned_worktrees = 0_usize;
        self.publish_progress(
            scan_id.as_deref(),
            scanned_at,
            total_worktrees,
            scanned_worktrees,
            Vec::new(),
            &errors,
        );
        let scans = stream::iter(candidate_worktrees.into_iter().enumerate().map(
            |(index, worktree)| {
                let authority = self.clone();
                let skip_git = skip.contains(&worktree.id) && target_id.is_none();
                async move {
                    (
                        index,
                        authority.candidate(&worktree, scanned_at, skip_git).await,
                    )
                }
            },
        ))
        .buffer_unordered(WORKTREE_SCAN_CONCURRENCY);
        tokio::pin!(scans);
        while let Some((index, candidate)) = scans.next().await {
            scanned_worktrees += 1;
            self.publish_progress(
                scan_id.as_deref(),
                scanned_at,
                total_worktrees,
                scanned_worktrees,
                vec![candidate.clone()],
                &errors,
            );
            candidates.push((index, candidate));
        }
        candidates.sort_unstable_by_key(|(index, _)| *index);
        let candidates = candidates
            .into_iter()
            .map(|(_, candidate)| candidate)
            .collect::<Vec<_>>();
        json!({ "scannedAt": scanned_at, "candidates": candidates, "errors": errors })
    }

    fn publish_progress(
        &self,
        scan_id: Option<&str>,
        scanned_at: i64,
        total_worktrees: usize,
        scanned_worktrees: usize,
        candidates: Vec<Value>,
        errors: &[Value],
    ) {
        let Some(scan_id) = scan_id else {
            return;
        };
        let _ = self.events.send(json!({
            "type": "workspaceCleanupScanProgress",
            "progress": {
                "scanId": scan_id,
                "scannedAt": scanned_at,
                "candidates": candidates,
                "errors": errors,
                "scannedWorktreeCount": scanned_worktrees,
                "totalWorktreeCount": total_worktrees,
                "candidateMode": "append",
            }
        }));
    }

    async fn candidate(
        &self,
        worktree: &ResolvedWorktree,
        scanned_at: i64,
        skip_git: bool,
    ) -> Value {
        let mut blockers = Vec::new();
        if worktree.is_main_worktree {
            blockers.push("main-worktree");
        }
        if worktree.workspace_kind != "git" {
            blockers.push("folder-repo");
        }
        if metadata_bool(worktree, "isPinned") {
            blockers.push("pinned");
        }
        let should_read_git = !skip_git && blockers.is_empty();
        let git = if should_read_git {
            self.git_evidence(worktree).await
        } else {
            GitEvidence::skipped()
        };
        blockers.extend(git.blockers.iter().copied());
        blockers.sort_unstable();
        blockers.dedup();
        let reasons = inactivity_reasons(worktree, scanned_at);
        let branch = worktree
            .branch
            .strip_prefix("refs/heads/")
            .filter(|branch| !branch.is_empty())
            .unwrap_or("HEAD");
        let last_activity_at = persisted_activity_at(worktree);
        let fingerprint = format!(
            "{CLASSIFIER_VERSION}|{branch}|{}|{}|{}",
            worktree.head,
            match git.clean {
                Some(true) => "clean",
                Some(false) => "dirty",
                None => "unknown",
            },
            last_activity_at.div_euclid(24 * 60 * 60 * 1_000),
        );
        let can_select = !reasons.is_empty()
            && git.clean == Some(true)
            && git.checked_at.is_some()
            && blockers.is_empty();
        let tier = if blockers.is_empty() {
            if can_select { "ready" } else { "review" }
        } else {
            "protected"
        };
        let mut candidate = Map::from_iter([
            ("worktreeId".to_owned(), Value::String(worktree.id.clone())),
            ("repoId".to_owned(), Value::String(worktree.repo_id.clone())),
            (
                "repoName".to_owned(),
                Value::String(worktree.repo_display_name.clone()),
            ),
            ("connectionId".to_owned(), Value::Null),
            (
                "displayName".to_owned(),
                Value::String(worktree.display_name.clone()),
            ),
            ("branch".to_owned(), Value::String(branch.to_owned())),
            ("path".to_owned(), Value::String(worktree.path.clone())),
            ("tier".to_owned(), Value::String(tier.to_owned())),
            ("selectedByDefault".to_owned(), Value::Bool(can_select)),
            ("reasons".to_owned(), json!(reasons)),
            ("blockers".to_owned(), json!(blockers)),
            ("lastActivityAt".to_owned(), json!(last_activity_at)),
            ("localContext".to_owned(), local_context(worktree)),
            (
                "git".to_owned(),
                json!({
                    "clean": git.clean,
                    "upstreamAhead": git.upstream_ahead,
                    "upstreamBehind": git.upstream_behind,
                    "checkedAt": git.checked_at,
                }),
            ),
            ("fingerprint".to_owned(), Value::String(fingerprint)),
        ]);
        if let Some(created_at) = metadata_i64(worktree, "createdAt") {
            candidate.insert("createdAt".to_owned(), json!(created_at));
        }
        Value::Object(candidate)
    }

    async fn git_evidence(&self, worktree: &ResolvedWorktree) -> GitEvidence {
        let Ok(host) = self.hosts.execution_host("local").await else {
            return GitEvidence::failed();
        };
        let status = run_git(
            host.as_ref(),
            &worktree.path,
            ["status", "--porcelain=v1", "--untracked-files=normal"],
        )
        .await;
        let Some(status) = status.filter(command_succeeded) else {
            return GitEvidence::failed();
        };
        let clean = status.stdout.is_empty();
        let checked_at = epoch_millis();
        let mut blockers = Vec::new();
        if !clean {
            blockers.push("dirty-files");
        }
        let upstream = run_git(
            host.as_ref(),
            &worktree.path,
            [
                "rev-parse",
                "--abbrev-ref",
                "--symbolic-full-name",
                "@{upstream}",
            ],
        )
        .await;
        let (upstream_ahead, upstream_behind) = match upstream.filter(command_succeeded) {
            Some(_) => {
                let counts = run_git(
                    host.as_ref(),
                    &worktree.path,
                    ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
                )
                .await;
                let Some(counts) = counts.filter(command_succeeded) else {
                    return GitEvidence::failed();
                };
                let Some((ahead, behind)) = parse_counts(&counts.stdout) else {
                    return GitEvidence::failed();
                };
                if ahead > 0 {
                    blockers.push("unpushed-commits");
                }
                (Some(ahead), Some(behind))
            }
            None if clean => {
                let unpushed = run_git(
                    host.as_ref(),
                    &worktree.path,
                    ["rev-list", "--count", "HEAD", "--not", "--remotes"],
                )
                .await
                .filter(command_succeeded)
                .and_then(|output| output.stdout.trim().parse::<i64>().ok());
                match unpushed {
                    Some(count) if count > 0 => blockers.push("unpushed-commits"),
                    Some(_) => {}
                    None => blockers.push("unknown-base"),
                }
                (None, None)
            }
            None => (None, None),
        };
        GitEvidence {
            blockers,
            checked_at: Some(checked_at),
            clean: Some(clean),
            upstream_ahead,
            upstream_behind,
        }
    }

    pub(crate) fn dismiss(&self, dismissals: &[Value]) -> Value {
        let mut values = lock(&self.dismissed);
        for dismissal in dismissals {
            if dismissal.get("classifierVersion").and_then(Value::as_f64)
                == Some(CLASSIFIER_VERSION as f64)
                && dismissal
                    .get("dismissedAt")
                    .and_then(Value::as_f64)
                    .is_some_and(f64::is_finite)
                && let Some(id) = dismissal.get("worktreeId").and_then(Value::as_str)
                && !id.is_empty()
                && dismissal
                    .get("fingerprint")
                    .and_then(Value::as_str)
                    .is_some_and(|fingerprint| !fingerprint.is_empty())
            {
                values.insert(id.to_owned(), dismissal.clone());
            }
        }
        let object = values.clone().into_iter().collect::<Map<_, _>>();
        self.ui.set(Map::from_iter([(
            "workspaceCleanup".to_owned(),
            json!({ "dismissals": object }),
        )]));
        json!({ "dismissals": object })
    }

    pub(crate) fn clear_dismissals(&self) -> Value {
        lock(&self.dismissed).clear();
        self.ui.set(Map::from_iter([(
            "workspaceCleanup".to_owned(),
            json!({ "dismissals": {} }),
        )]));
        json!({ "dismissals": {} })
    }
}

async fn run_git<const N: usize>(
    host: &dyn crate::hosts::ExecutionHost,
    cwd: &str,
    args: [&str; N],
) -> Option<HostCommandOutput> {
    let mut command = HostCommand::new("git", args);
    command.cwd = Some(cwd.to_owned());
    command.max_output_bytes = Some(GIT_MAX_OUTPUT_BYTES);
    command.timeout_ms = Some(GIT_READ_TIMEOUT_MS);
    host.exec(command).await.ok()
}

fn command_succeeded(output: &HostCommandOutput) -> bool {
    output.exit_code == 0
}

fn parse_counts(output: &str) -> Option<(i64, i64)> {
    let mut values = output.split_whitespace();
    let ahead = values.next()?.parse().ok()?;
    let behind = values.next()?.parse().ok()?;
    values.next().is_none().then_some((ahead, behind))
}

async fn resolve_activity(mut worktree: ResolvedWorktree) -> ResolvedWorktree {
    let path = PathBuf::from(&worktree.path);
    let git_path = path.join(".git");
    let mut newest = persisted_activity_at(&worktree);
    newest = newest.max(modified_at(&path).await);
    newest = newest.max(modified_at(&git_path).await);
    if let Some(git_directory) = git_directory(&path, &git_path).await {
        newest = newest.max(modified_at(&git_directory).await);
        newest = newest.max(modified_at(&git_directory.join("HEAD")).await);
        newest = newest.max(modified_at(&git_directory.join("logs").join("HEAD")).await);
    }
    worktree
        .metadata
        .insert("lastActivityAt".to_owned(), json!(newest));
    worktree
}

async fn git_directory(worktree_path: &Path, git_path: &Path) -> Option<PathBuf> {
    let contents = tokio::fs::read_to_string(git_path).await.ok()?;
    let line = contents
        .lines()
        .find_map(|line| line.trim().strip_prefix("gitdir:"))?
        .trim();
    if line.is_empty() {
        return None;
    }
    let path = PathBuf::from(line);
    Some(if path.is_absolute() {
        path
    } else {
        worktree_path.join(path)
    })
}

async fn modified_at(path: &Path) -> i64 {
    let Ok(modified) = tokio::fs::symlink_metadata(path)
        .await
        .and_then(|metadata| metadata.modified())
    else {
        return 0;
    };
    system_time_millis(modified)
}

fn inactivity_reasons(worktree: &ResolvedWorktree, scanned_at: i64) -> Vec<&'static str> {
    let age = scanned_at.saturating_sub(persisted_activity_at(worktree));
    let mut reasons = Vec::new();
    if metadata_bool(worktree, "isArchived") && age >= ARCHIVED_IDLE_MS {
        reasons.push("archived");
    }
    if age >= IDLE_MS {
        reasons.push("idle-clean");
    }
    reasons
}

fn persisted_activity_at(worktree: &ResolvedWorktree) -> i64 {
    metadata_i64(worktree, "lastActivityAt")
        .unwrap_or(0)
        .max(metadata_i64(worktree, "createdAt").unwrap_or(0))
}

fn metadata_i64(worktree: &ResolvedWorktree, field: &str) -> Option<i64> {
    worktree
        .metadata
        .get(field)
        .and_then(Value::as_i64)
        .or_else(|| {
            worktree
                .metadata
                .get(field)
                .and_then(Value::as_f64)
                .filter(|value| value.is_finite())
                .map(|value| value as i64)
        })
}

fn metadata_bool(worktree: &ResolvedWorktree, field: &str) -> bool {
    worktree
        .metadata
        .get(field)
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn local_context(worktree: &ResolvedWorktree) -> Value {
    let comments = worktree
        .metadata
        .get("diffComments")
        .and_then(Value::as_array);
    let newest = comments.and_then(|comments| {
        comments
            .iter()
            .filter_map(|comment| comment.get("createdAt").and_then(Value::as_i64))
            .max()
    });
    json!({
        "terminalTabCount": 0,
        "cleanEditorTabCount": 0,
        "browserTabCount": 0,
        "diffCommentCount": comments.map_or(0, Vec::len),
        "newestDiffCommentAt": newest,
        "retainedDoneAgentCount": 0,
    })
}

fn valid_worktree_id(id: &str) -> bool {
    id.contains("::")
}

fn safe_scan_error(error: &str) -> &'static str {
    let error = error.to_ascii_lowercase();
    if error.contains("not a git repository") || error.contains("not a git worktree") {
        "Repository is not a git checkout."
    } else if error.contains("not found")
        || error.contains("no such file")
        || error.contains("does not exist")
    {
        "Repository folder was not found."
    } else if error.contains("permission denied") || error.contains("access is denied") {
        "Repository folder is not accessible."
    } else {
        "Git could not list worktrees."
    }
}

fn epoch_millis() -> i64 {
    system_time_millis(SystemTime::now())
}

fn system_time_millis(time: SystemTime) -> i64 {
    i64::try_from(
        time.duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
    )
    .unwrap_or(i64::MAX)
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
