use std::collections::HashSet;
use std::ffi::OsString;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde_json::{Map, Value};
use tokio::sync::Mutex;

use super::CleanupTombstone;

const BACKUP_COUNT: usize = 5;
const LOCAL_HOST_ID: &str = "local";
const PROJECTS_FILE: &str = "yiru-data-projects.json";
const WORKTREES_FILE: &str = "yiru-data-worktrees.json";
const LEGACY_FILE: &str = "yiru-data.json";

#[derive(Clone)]
pub(super) struct StateCleanup {
    inner: Arc<CleanupInner>,
}

struct CleanupInner {
    mutation: Mutex<()>,
    user_data_path: PathBuf,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum StateCleanupError {
    #[error("project state cleanup document was not an object: {0}")]
    InvalidDocument(PathBuf),
    #[error("project state cleanup I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("project state cleanup JSON failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("project state cleanup worker failed: {0}")]
    Worker(#[from] tokio::task::JoinError),
}

impl StateCleanup {
    pub(super) fn new(user_data_path: &Path) -> Self {
        Self {
            inner: Arc::new(CleanupInner {
                mutation: Mutex::new(()),
                user_data_path: user_data_path.to_owned(),
            }),
        }
    }

    pub(super) async fn replay(&self, cleanup: &CleanupTombstone) -> Result<(), StateCleanupError> {
        let _mutation = self.inner.mutation.lock().await;
        let cleanup = cleanup.clone();
        let user_data_path = self.inner.user_data_path.clone();
        tokio::task::spawn_blocking(move || replay(&user_data_path, &cleanup)).await?
    }
}

fn replay(path: &Path, cleanup: &CleanupTombstone) -> Result<(), StateCleanupError> {
    let projects_path = path.join(PROJECTS_FILE);
    let legacy_path = path.join(LEGACY_FILE);
    clean_file(&projects_path, cleanup, true, false)?;
    clean_file(&path.join(WORKTREES_FILE), cleanup, false, true)?;
    clean_file(&legacy_path, cleanup, true, true)
}

fn clean_file(
    path: &Path,
    cleanup: &CleanupTombstone,
    projects: bool,
    worktrees: bool,
) -> Result<(), StateCleanupError> {
    let Some(mut document) = read_recoverable(path)? else {
        return Ok(());
    };
    if projects {
        prune_projects(&mut document, cleanup);
    }
    if worktrees {
        prune_worktrees(&mut document, cleanup);
    }
    let payload = serde_json::to_vec(&Value::Object(document))?;
    write_atomic(path, &payload)?;
    write_atomic(&backup_path(path, 0), &payload)
}

fn read_recoverable(path: &Path) -> Result<Option<Map<String, Value>>, StateCleanupError> {
    match read_document(path) {
        Ok(Some(document)) => return Ok(Some(document)),
        Ok(None) => {}
        Err(primary) if !has_backup(path) => return Err(primary),
        Err(_) => {}
    }
    for index in 0..BACKUP_COUNT {
        if let Ok(Some(document)) = read_document(&backup_path(path, index)) {
            return Ok(Some(document));
        }
    }
    if path.exists() || has_backup(path) {
        return Err(StateCleanupError::InvalidDocument(path.to_owned()));
    }
    Ok(None)
}

fn read_document(path: &Path) -> Result<Option<Map<String, Value>>, StateCleanupError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    serde_json::from_slice::<Value>(&bytes)?
        .as_object()
        .cloned()
        .map(Some)
        .ok_or_else(|| StateCleanupError::InvalidDocument(path.to_owned()))
}

fn prune_projects(document: &mut Map<String, Value>, cleanup: &CleanupTombstone) {
    prune_setups(document, cleanup);
    let mut repo_survives = false;
    if let Some(repos) = document.get_mut("repos").and_then(Value::as_array_mut) {
        repos.retain(|repo| {
            let matches_id = repo.get("id").and_then(Value::as_str) == Some(&cleanup.repo_id);
            let matches_host = repo_host(repo) == cleanup.host_id;
            let keep = !(matches_id && (cleanup.prune_all_hosts || matches_host));
            repo_survives |= keep && matches_id;
            keep
        });
    }
    let drop_repo_state = cleanup.drop_sparse_presets && !repo_survives;
    if drop_repo_state {
        document
            .get_mut("sparsePresetsByRepo")
            .and_then(Value::as_object_mut)
            .map(|presets| presets.remove(&cleanup.repo_id));
        prune_compatibility(document, &cleanup.repo_id);
    }
}

fn prune_compatibility(document: &mut Map<String, Value>, repo_id: &str) {
    let current_repo_ids: HashSet<String> = document
        .get("repos")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|repo| repo.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();
    // Why: independent setups keep their project alive after the last source repo disappears.
    // A legacy setup whose id equals its removed repo id is still repo-backed, not independent.
    let independent_project_ids: HashSet<String> = document
        .get("projectHostSetups")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|setup| {
            let id = setup.get("id").and_then(Value::as_str).unwrap_or_default();
            let repo_id = setup
                .get("repoId")
                .and_then(Value::as_str)
                .unwrap_or_default();
            !current_repo_ids.contains(id)
                && (repo_id.is_empty() || (!current_repo_ids.contains(repo_id) && id != repo_id))
        })
        .filter_map(|setup| {
            setup
                .get("projectId")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .collect();
    if let Some(projects) = document.get_mut("projects").and_then(Value::as_array_mut) {
        projects.retain_mut(|project| {
            let has_independent_setup = project
                .get("id")
                .and_then(Value::as_str)
                .is_some_and(|id| independent_project_ids.contains(id));
            let Some(source_ids) = project
                .get_mut("sourceRepoIds")
                .and_then(Value::as_array_mut)
            else {
                return true;
            };
            source_ids.retain(|id| id.as_str() != Some(repo_id));
            !source_ids.is_empty() || has_independent_setup
        });
    }
}

fn prune_setups(document: &mut Map<String, Value>, cleanup: &CleanupTombstone) {
    let Some(setups) = document
        .get_mut("projectHostSetups")
        .and_then(Value::as_array_mut)
    else {
        return;
    };
    setups.retain(|setup| {
        let matches_id = setup.get("repoId").and_then(Value::as_str) == Some(&cleanup.repo_id);
        let matches_host = setup_host(setup) == cleanup.host_id;
        !(matches_id && (cleanup.prune_all_hosts || matches_host))
    });
}

fn setup_host(setup: &Value) -> &str {
    setup
        .get("hostId")
        .and_then(Value::as_str)
        .filter(|host| !host.is_empty())
        .unwrap_or_else(|| repo_host(setup))
}

fn prune_worktrees(document: &mut Map<String, Value>, cleanup: &CleanupTombstone) {
    let membership = document
        .get("worktreeMeta")
        .and_then(Value::as_object)
        .map(|metadata| {
            metadata
                .iter()
                .filter(|(id, entry)| belongs_to_cleanup(id, entry, cleanup))
                .map(|(id, _)| id.clone())
                .collect::<std::collections::HashSet<_>>()
        })
        .unwrap_or_default();
    if let Some(metadata) = document
        .get_mut("worktreeMeta")
        .and_then(Value::as_object_mut)
    {
        metadata.retain(|id, _| !membership.contains(id));
    }
    if let Some(lineage) = document
        .get_mut("worktreeLineageById")
        .and_then(Value::as_object_mut)
    {
        lineage.retain(|child, value| {
            let parent = value.get("parentWorktreeId").and_then(Value::as_str);
            !membership.contains(child) && parent.is_none_or(|id| !membership.contains(id))
        });
    }
    if let Some(lineage) = document
        .get_mut("workspaceLineageByChildKey")
        .and_then(Value::as_object_mut)
    {
        lineage.retain(|child, value| {
            let child = worktree_from_workspace_key(child);
            let parent = value
                .get("parentWorkspaceKey")
                .and_then(Value::as_str)
                .and_then(worktree_from_workspace_key);
            child.is_none_or(|id| !membership.contains(id))
                && parent.is_none_or(|id| !membership.contains(id))
        });
    }
}

fn belongs_to_cleanup(id: &str, entry: &Value, cleanup: &CleanupTombstone) -> bool {
    if !worktree_belongs_to_repo(id, &cleanup.repo_id) {
        return false;
    }
    cleanup.prune_all_hosts
        || entry
            .get("hostId")
            .and_then(Value::as_str)
            .unwrap_or(LOCAL_HOST_ID)
            == cleanup.host_id
}

fn worktree_belongs_to_repo(id: &str, repo_id: &str) -> bool {
    id == repo_id
        || id
            .strip_prefix(repo_id)
            .is_some_and(|rest| rest.starts_with("::"))
}

fn worktree_from_workspace_key(value: &str) -> Option<&str> {
    value.strip_prefix("worktree:").filter(|id| !id.is_empty())
}

fn repo_host(repo: &Value) -> &str {
    repo.get("executionHostId")
        .and_then(Value::as_str)
        .filter(|host| !host.is_empty())
        .unwrap_or(LOCAL_HOST_ID)
}

fn write_atomic(path: &Path, payload: &[u8]) -> Result<(), StateCleanupError> {
    let parent = path
        .parent()
        .ok_or_else(|| StateCleanupError::InvalidDocument(path.to_owned()))?;
    fs::create_dir_all(parent)?;
    let temporary = temporary_path(path);
    let result = (|| {
        let mut file = File::create(&temporary)?;
        file.write_all(payload)?;
        file.sync_all()?;
        crate::atomic_file_replace::replace(&temporary, path)?;
        File::open(parent)?.sync_all()
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(Into::into)
}

fn has_backup(path: &Path) -> bool {
    (0..BACKUP_COUNT).any(|index| backup_path(path, index).exists())
}

fn backup_path(path: &Path, index: usize) -> PathBuf {
    suffix(path, &format!(".bak.{index}"))
}

fn temporary_path(path: &Path) -> PathBuf {
    suffix(path, &format!(".repo-cleanup.{}.tmp", std::process::id()))
}

fn suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut value = OsString::from(path.as_os_str());
    value.push(suffix);
    value.into()
}
