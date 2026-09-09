use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, SystemTimeError, UNIX_EPOCH};

use futures_util::{StreamExt, stream};
use serde::Serialize;
use serde_json::Value;
use thiserror::Error;
use tokio::sync::{Notify, watch};

use crate::host_registry::HostRegistry;
use crate::hosts::{ExecutionHost, HostCommand, HostFileKind, HostFilesystem, HostPlatform};
use crate::worktrees::{ResolvedWorktree, WorktreeCatalog, WorktreeCatalogError};

const MAX_TOP_LEVEL_ITEMS: usize = 32;
const MAX_SCAN_DEPTH: usize = 128;
const MAX_SCANNED_ENTRIES: usize = 100_000;
const MAX_RETAINED_SCAN_BYTES: usize = 64 * 1_024 * 1_024;
const ENTRY_OVERHEAD_BYTES: usize = 512;
const FILESYSTEM_CONCURRENCY: usize = 48;
const DU_TIMEOUT_MS: u64 = 120_000;
const DU_MAX_OUTPUT_BYTES: usize = 16 * 1_024 * 1_024;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum WorkspaceSpaceItemKind {
    Directory,
    File,
    Symlink,
    Other,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSpaceItem {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) kind: WorkspaceSpaceItemKind,
    pub(crate) size_bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSpaceWorktree {
    pub(crate) worktree_id: String,
    pub(crate) repo_id: String,
    pub(crate) repo_display_name: String,
    pub(crate) repo_path: String,
    pub(crate) display_name: String,
    pub(crate) path: String,
    pub(crate) branch: String,
    pub(crate) is_main_worktree: bool,
    pub(crate) is_remote: bool,
    pub(crate) is_sparse: bool,
    pub(crate) can_delete: bool,
    pub(crate) last_activity_at: i64,
    pub(crate) status: String,
    pub(crate) error: Option<String>,
    pub(crate) scanned_at: i64,
    pub(crate) size_bytes: u64,
    pub(crate) reclaimable_bytes: u64,
    pub(crate) skipped_entry_count: usize,
    pub(crate) top_level_items: Vec<WorkspaceSpaceItem>,
    pub(crate) omitted_top_level_item_count: usize,
    pub(crate) omitted_top_level_size_bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSpaceRepoSummary {
    pub(crate) repo_id: String,
    pub(crate) display_name: String,
    pub(crate) path: String,
    pub(crate) is_remote: bool,
    pub(crate) worktree_count: usize,
    pub(crate) scanned_worktree_count: usize,
    pub(crate) unavailable_worktree_count: usize,
    pub(crate) total_size_bytes: u64,
    pub(crate) reclaimable_bytes: u64,
    pub(crate) error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSpaceAnalysis {
    pub(crate) scanned_at: i64,
    pub(crate) total_size_bytes: u64,
    pub(crate) reclaimable_bytes: u64,
    pub(crate) worktree_count: usize,
    pub(crate) scanned_worktree_count: usize,
    pub(crate) unavailable_worktree_count: usize,
    pub(crate) repos: Vec<WorkspaceSpaceRepoSummary>,
    pub(crate) worktrees: Vec<WorkspaceSpaceWorktree>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub(crate) enum WorkspaceSpaceAnalyzeResult {
    Complete {
        ok: bool,
        analysis: WorkspaceSpaceAnalysis,
    },
    Cancelled {
        ok: bool,
        cancelled: bool,
    },
}

#[derive(Clone)]
pub(crate) struct WorkspaceSpaceAuthority {
    hosts: HostRegistry,
    in_flight: Arc<Mutex<Option<Arc<WorkspaceSpaceScan>>>>,
    worktrees: WorktreeCatalog,
}

struct WorkspaceSpaceScan {
    cancel_requested: AtomicBool,
    cancel_signal: watch::Sender<bool>,
    completed: Notify,
    outcome: Mutex<Option<Result<WorkspaceSpaceAnalyzeResult, String>>>,
}

#[derive(Debug, Error)]
pub(crate) enum WorkspaceSpaceError {
    #[error(transparent)]
    Worktree(#[from] WorktreeCatalogError),
    #[error("workspace space scan clock failed: {0}")]
    Clock(#[from] std::time::SystemTimeError),
    #[error("workspace space scan failed: {0}")]
    Shared(String),
}

impl WorkspaceSpaceAuthority {
    pub(crate) fn new(hosts: HostRegistry, worktrees: WorktreeCatalog) -> Self {
        Self {
            hosts,
            in_flight: Arc::new(Mutex::new(None)),
            worktrees,
        }
    }

    pub(crate) fn cancel(&self) -> bool {
        let scan = lock(&self.in_flight).clone();
        scan.is_some_and(|scan| {
            if scan.cancel_requested.swap(true, Ordering::AcqRel) {
                return false;
            }
            let _ = scan.cancel_signal.send(true);
            true
        })
    }

    pub(crate) async fn analyze(&self) -> Result<WorkspaceSpaceAnalyzeResult, WorkspaceSpaceError> {
        let (scan, should_start) = {
            let mut in_flight = lock(&self.in_flight);
            match in_flight.as_ref() {
                Some(scan) => (scan.clone(), false),
                None => {
                    let (cancel_signal, _) = watch::channel(false);
                    let scan = Arc::new(WorkspaceSpaceScan {
                        cancel_requested: AtomicBool::new(false),
                        cancel_signal,
                        completed: Notify::new(),
                        outcome: Mutex::new(None),
                    });
                    *in_flight = Some(scan.clone());
                    (scan, true)
                }
            }
        };
        if should_start {
            let authority = self.clone();
            let running = scan.clone();
            tokio::spawn(async move {
                authority.run_scan(running).await;
            });
        }
        wait_for_scan(scan).await
    }

    async fn run_scan(&self, scan: Arc<WorkspaceSpaceScan>) {
        let outcome = match now_millis() {
            Ok(scanned_at) => self
                .analyze_inner(
                    scanned_at,
                    &scan.cancel_requested,
                    scan.cancel_signal.subscribe(),
                )
                .await
                .map_err(|error| error.to_string()),
            Err(error) => Err(error.to_string()),
        };
        *lock(&scan.outcome) = Some(outcome);
        {
            let mut in_flight = lock(&self.in_flight);
            if in_flight
                .as_ref()
                .is_some_and(|active| Arc::ptr_eq(active, &scan))
            {
                *in_flight = None;
            }
        }
        scan.completed.notify_waiters();
    }

    async fn analyze_inner(
        &self,
        scanned_at: i64,
        cancel_requested: &AtomicBool,
        cancel_signal: watch::Receiver<bool>,
    ) -> Result<WorkspaceSpaceAnalyzeResult, WorkspaceSpaceError> {
        let resolved = self
            .worktrees
            .list_resolved()
            .await?
            .into_iter()
            .filter(|worktree| worktree.host_id == "local" && worktree.prunable_reason.is_none())
            .collect::<Vec<_>>();
        let total = resolved.len();
        let mut rows = Vec::with_capacity(total);
        for worktree in &resolved {
            if cancel_requested.load(Ordering::Acquire) {
                return Ok(WorkspaceSpaceAnalyzeResult::Cancelled {
                    ok: false,
                    cancelled: true,
                });
            }
            let row = self
                .scan_worktree(
                    worktree,
                    scanned_at,
                    cancel_requested,
                    cancel_signal.clone(),
                )
                .await;
            if cancel_requested.load(Ordering::Acquire) {
                return Ok(WorkspaceSpaceAnalyzeResult::Cancelled {
                    ok: false,
                    cancelled: true,
                });
            }
            rows.push(row);
        }
        rows.sort_by(|left, right| {
            right
                .size_bytes
                .cmp(&left.size_bytes)
                .then_with(|| left.display_name.cmp(&right.display_name))
        });
        let mut repos = Vec::new();
        let mut observed_repo_ids = HashSet::new();
        let repo_ids = resolved
            .iter()
            .map(|worktree| worktree.repo_id.as_str())
            .filter(|repo_id| observed_repo_ids.insert(*repo_id))
            .collect::<Vec<_>>();
        for repo_id in repo_ids {
            let group = rows
                .iter()
                .filter(|candidate| candidate.repo_id == repo_id)
                .collect::<Vec<_>>();
            let Some(row) = group.first() else {
                continue;
            };
            repos.push(WorkspaceSpaceRepoSummary {
                repo_id: row.repo_id.clone(),
                display_name: row.repo_display_name.clone(),
                path: row.repo_path.clone(),
                is_remote: row.is_remote,
                worktree_count: group.len(),
                scanned_worktree_count: group.iter().filter(|item| item.status == "ok").count(),
                unavailable_worktree_count: group.iter().filter(|item| item.status != "ok").count(),
                total_size_bytes: group.iter().map(|item| item.size_bytes).sum(),
                reclaimable_bytes: group.iter().map(|item| item.reclaimable_bytes).sum(),
                error: group.iter().find_map(|item| item.error.clone()),
            });
        }
        Ok(WorkspaceSpaceAnalyzeResult::Complete {
            ok: true,
            analysis: WorkspaceSpaceAnalysis {
                scanned_at,
                total_size_bytes: rows.iter().map(|row| row.size_bytes).sum(),
                reclaimable_bytes: rows.iter().map(|row| row.reclaimable_bytes).sum(),
                worktree_count: rows.len(),
                scanned_worktree_count: rows.iter().filter(|row| row.status == "ok").count(),
                unavailable_worktree_count: rows.iter().filter(|row| row.status != "ok").count(),
                repos,
                worktrees: rows,
            },
        })
    }

    async fn scan_worktree(
        &self,
        worktree: &ResolvedWorktree,
        scanned_at: i64,
        cancel_requested: &AtomicBool,
        cancel_signal: watch::Receiver<bool>,
    ) -> WorkspaceSpaceWorktree {
        let Ok(host) = self.hosts.execution_host(&worktree.host_id).await else {
            return unavailable(worktree, scanned_at, "unavailable", "host unavailable");
        };
        let filesystem = HostFilesystem::new(host.clone());
        let root = match filesystem.stat(&worktree.path).await {
            Ok(Some(root)) => root,
            Ok(None) => {
                return unavailable(worktree, scanned_at, "missing", "workspace path is missing");
            }
            Err(error) => {
                let detail = error.to_string();
                return unavailable(worktree, scanned_at, classify_status(&detail), &detail);
            }
        };
        if matches!(host.platform(), HostPlatform::Darwin | HostPlatform::Linux)
            && root.kind == HostFileKind::Directory
            && let Some(row) = scan_with_du(
                host.as_ref(),
                &filesystem,
                worktree,
                scanned_at,
                cancel_requested,
                cancel_signal,
            )
            .await
        {
            return row;
        }
        let mut top = Vec::new();
        let mut skipped = 0;
        let mut size = 0_u64;
        let mut scanned_entries = 0_usize;
        let mut stack = vec![(worktree.path.clone(), 0_usize, None::<usize>)];
        while let Some((path, depth, top_index)) = stack.pop() {
            if cancel_requested.load(Ordering::Acquire) {
                return unavailable(worktree, scanned_at, "unavailable", "scan cancelled");
            }
            scanned_entries += 1;
            if scanned_entries > MAX_SCANNED_ENTRIES {
                return unavailable(
                    worktree,
                    scanned_at,
                    "error",
                    "workspace is too large to scan safely",
                );
            }
            if depth > MAX_SCAN_DEPTH {
                skipped += 1;
                continue;
            }
            let Ok(Some(stat)) = filesystem.stat(&path).await else {
                skipped += 1;
                continue;
            };
            size = size.saturating_add(stat.size_bytes);
            let top_index = if depth == 1 {
                top.push(WorkspaceSpaceItem {
                    name: filesystem.paths().basename(&path),
                    path: path.clone(),
                    kind: item_kind(stat.kind),
                    size_bytes: stat.size_bytes,
                });
                Some(top.len() - 1)
            } else {
                if let Some(index) = top_index {
                    top[index].size_bytes = top[index].size_bytes.saturating_add(stat.size_bytes);
                }
                top_index
            };
            if stat.kind == HostFileKind::Directory {
                match filesystem.read_dir_raw(&path).await {
                    Ok(entries) => {
                        for entry in entries {
                            stack.push((
                                filesystem.paths().join(&[&path, &entry.name]),
                                depth + 1,
                                top_index,
                            ));
                        }
                    }
                    Err(_) => skipped += 1,
                }
            }
        }
        top.sort_by_key(|item| std::cmp::Reverse(item.size_bytes));
        let omitted_size = top
            .iter()
            .skip(MAX_TOP_LEVEL_ITEMS)
            .map(|item| item.size_bytes)
            .sum();
        let omitted_count = top.len().saturating_sub(MAX_TOP_LEVEL_ITEMS);
        top.truncate(MAX_TOP_LEVEL_ITEMS);
        successful_row(
            worktree,
            scanned_at,
            size.max(root.size_bytes),
            skipped,
            top,
            omitted_count,
            omitted_size,
        )
    }
}

async fn scan_with_du(
    host: &dyn ExecutionHost,
    filesystem: &HostFilesystem,
    worktree: &ResolvedWorktree,
    scanned_at: i64,
    cancel_requested: &AtomicBool,
    cancel_signal: watch::Receiver<bool>,
) -> Option<WorkspaceSpaceWorktree> {
    let mut command = HostCommand::new("du", ["-k", "-d", "1", worktree.path.as_str()]);
    command.cancel = Some(cancel_signal);
    command.max_output_bytes = Some(DU_MAX_OUTPUT_BYTES);
    command.timeout_ms = Some(DU_TIMEOUT_MS);
    let output = host.exec(command).await.ok()?;
    if output.exit_code != 0 || cancel_requested.load(Ordering::Acquire) {
        return None;
    }
    let sizes = parse_du_sizes(&output.stdout);
    let entries = filesystem.read_dir_raw(&worktree.path).await.ok()?;
    let retained_bytes = worktree
        .path
        .encode_utf16()
        .count()
        .saturating_mul(2)
        .saturating_add(entries.iter().fold(0_usize, |total, entry| {
            total.saturating_add(
                entry
                    .name
                    .encode_utf16()
                    .count()
                    .saturating_mul(2)
                    .saturating_add(ENTRY_OVERHEAD_BYTES),
            )
        }));
    if entries.len() > MAX_SCANNED_ENTRIES || retained_bytes > MAX_RETAINED_SCAN_BYTES {
        return Some(unavailable(
            worktree,
            scanned_at,
            "error",
            "workspace is too large to scan safely",
        ));
    }
    let paths = filesystem.paths();
    let items = stream::iter(entries.into_iter().map(|entry| {
        let filesystem = filesystem.clone();
        let path = paths.join(&[&worktree.path, &entry.name]);
        let du_size = sizes.get(&normalize_du_path(&path)).copied();
        async move {
            let stat = filesystem.stat(&path).await.ok().flatten()?;
            Some(WorkspaceSpaceItem {
                name: entry.name,
                path,
                kind: item_kind(stat.kind),
                size_bytes: du_size.unwrap_or(stat.size_bytes),
            })
        }
    }))
    .buffer_unordered(FILESYSTEM_CONCURRENCY)
    .collect::<Vec<_>>()
    .await;
    if cancel_requested.load(Ordering::Acquire) {
        return None;
    }
    let skipped = items.iter().filter(|item| item.is_none()).count();
    let mut top = items.into_iter().flatten().collect::<Vec<_>>();
    top.sort_by(|left, right| {
        right
            .size_bytes
            .cmp(&left.size_bytes)
            .then_with(|| left.name.cmp(&right.name))
    });
    let omitted_size = top
        .iter()
        .skip(MAX_TOP_LEVEL_ITEMS)
        .map(|item| item.size_bytes)
        .sum();
    let omitted_count = top.len().saturating_sub(MAX_TOP_LEVEL_ITEMS);
    let root_size = sizes
        .get(&normalize_du_path(&worktree.path))
        .copied()
        .unwrap_or_else(|| top.iter().map(|item| item.size_bytes).sum());
    top.truncate(MAX_TOP_LEVEL_ITEMS);
    Some(successful_row(
        worktree,
        scanned_at,
        root_size,
        skipped,
        top,
        omitted_count,
        omitted_size,
    ))
}

fn parse_du_sizes(stdout: &str) -> HashMap<String, u64> {
    stdout
        .lines()
        .filter_map(|line| {
            let split = line.find(char::is_whitespace)?;
            let kibibytes = line[..split].parse::<u64>().ok()?;
            let path = line[split..].trim_start();
            (!path.is_empty()).then(|| (normalize_du_path(path), kibibytes.saturating_mul(1_024)))
        })
        .collect()
}

fn normalize_du_path(path: &str) -> String {
    let trimmed = path.trim_end_matches('/');
    if trimmed.is_empty() {
        path.to_owned()
    } else {
        trimmed.to_owned()
    }
}

fn successful_row(
    worktree: &ResolvedWorktree,
    scanned_at: i64,
    size_bytes: u64,
    skipped_entry_count: usize,
    top_level_items: Vec<WorkspaceSpaceItem>,
    omitted_top_level_item_count: usize,
    omitted_top_level_size_bytes: u64,
) -> WorkspaceSpaceWorktree {
    WorkspaceSpaceWorktree {
        worktree_id: worktree.id.clone(),
        repo_id: worktree.repo_id.clone(),
        repo_display_name: worktree.repo_display_name.clone(),
        repo_path: worktree.repo_path.clone(),
        display_name: worktree.display_name.clone(),
        path: worktree.path.clone(),
        branch: worktree.branch.clone(),
        is_main_worktree: worktree.is_main_worktree,
        is_remote: false,
        is_sparse: worktree.is_sparse,
        can_delete: !worktree.is_main_worktree,
        last_activity_at: last_activity_at(worktree),
        status: "ok".to_owned(),
        error: None,
        scanned_at,
        size_bytes,
        reclaimable_bytes: if worktree.is_main_worktree {
            0
        } else {
            size_bytes
        },
        skipped_entry_count,
        top_level_items,
        omitted_top_level_item_count,
        omitted_top_level_size_bytes,
    }
}

async fn wait_for_scan(
    scan: Arc<WorkspaceSpaceScan>,
) -> Result<WorkspaceSpaceAnalyzeResult, WorkspaceSpaceError> {
    loop {
        let completed = scan.completed.notified();
        if let Some(outcome) = lock(&scan.outcome).clone() {
            return outcome.map_err(WorkspaceSpaceError::Shared);
        }
        completed.await;
    }
}

fn unavailable(
    worktree: &ResolvedWorktree,
    scanned_at: i64,
    status: &str,
    error: &str,
) -> WorkspaceSpaceWorktree {
    WorkspaceSpaceWorktree {
        worktree_id: worktree.id.clone(),
        repo_id: worktree.repo_id.clone(),
        repo_display_name: worktree.repo_display_name.clone(),
        repo_path: worktree.repo_path.clone(),
        display_name: worktree.display_name.clone(),
        path: worktree.path.clone(),
        branch: worktree.branch.clone(),
        is_main_worktree: worktree.is_main_worktree,
        is_remote: worktree.host_id != "local",
        is_sparse: worktree.is_sparse,
        can_delete: !worktree.is_main_worktree,
        last_activity_at: last_activity_at(worktree),
        status: status.to_owned(),
        error: Some(error.to_owned()),
        scanned_at,
        size_bytes: 0,
        reclaimable_bytes: 0,
        skipped_entry_count: 0,
        top_level_items: Vec::new(),
        omitted_top_level_item_count: 0,
        omitted_top_level_size_bytes: 0,
    }
}

fn last_activity_at(worktree: &ResolvedWorktree) -> i64 {
    worktree
        .metadata
        .get("lastActivityAt")
        .and_then(Value::as_i64)
        .or_else(|| {
            worktree
                .metadata
                .get("lastActivityAt")
                .and_then(Value::as_f64)
                .filter(|value| value.is_finite())
                .map(|value| value as i64)
        })
        .unwrap_or(0)
}

fn classify_status(detail: &str) -> &'static str {
    let detail = detail.to_ascii_lowercase();
    if detail.contains("permission denied") || detail.contains("access is denied") {
        "permission-denied"
    } else if detail.contains("not found") || detail.contains("no such file") {
        "missing"
    } else {
        "error"
    }
}

fn item_kind(kind: HostFileKind) -> WorkspaceSpaceItemKind {
    match kind {
        HostFileKind::Directory => WorkspaceSpaceItemKind::Directory,
        HostFileKind::File => WorkspaceSpaceItemKind::File,
        HostFileKind::Symlink => WorkspaceSpaceItemKind::Symlink,
        HostFileKind::Other => WorkspaceSpaceItemKind::Other,
    }
}

fn now_millis() -> Result<i64, SystemTimeError> {
    Ok(
        i64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis())
            .unwrap_or(i64::MAX),
    )
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
