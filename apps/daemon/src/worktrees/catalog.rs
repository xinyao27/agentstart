use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde_json::{Map, Value};
use thiserror::Error;
use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};

use crate::host_registry::{HostRegistry, HostRegistryError};
use crate::hosts::{HostCommand, HostCommandError, HostFilesystem};
use crate::projects::{
    Project, ProjectCatalog, ProjectCatalogError, ProjectKind, ProjectWorktreeVisibility,
};
use crate::workspace_ports::WorkspacePortProbe;

use super::git_scan::{GitWorktreeEntry, GitWorktreeScanError, GitWorktreeScanner};
use super::metadata::{WorktreeMetadata, WorktreeMetadataError, WorktreeMetadataStore};
use super::port_probes::{WorktreeGraphEntry, workspace_port_probes};

const PROBE_CACHE_TTL: Duration = Duration::from_secs(1);
const PROBE_CACHE_ENTRIES: usize = 256;

#[derive(Clone)]
pub(crate) struct WorktreeCatalog {
    cache: Arc<Mutex<HashMap<(String, String), CachedProbeSet>>>,
    hosts: HostRegistry,
    metadata: WorktreeMetadataStore,
    mutation: Arc<AsyncMutex<()>>,
    projects: ProjectCatalog,
    scanner: GitWorktreeScanner,
}

#[derive(Clone)]
struct CachedProbeSet {
    expires_at: Instant,
    value: WorktreeProbeSet,
}

#[derive(Clone)]
pub(crate) struct WorktreeProbeSet {
    pub(crate) host_id: String,
    pub(crate) probes: Vec<WorkspacePortProbe>,
    selectors: HashMap<String, SelectorFields>,
}

#[derive(Clone, Debug)]
pub(crate) struct ResolvedWorktree {
    pub(crate) authoritative: bool,
    pub(crate) branch: String,
    pub(crate) display_name: String,
    pub(crate) head: String,
    pub(crate) host_id: String,
    pub(crate) id: String,
    pub(crate) is_bare: bool,
    pub(crate) is_managed: bool,
    pub(crate) is_main_worktree: bool,
    pub(crate) is_sparse: bool,
    pub(crate) lock_reason: Option<String>,
    pub(crate) metadata: Map<String, Value>,
    pub(crate) path: String,
    pub(crate) prunable_reason: Option<String>,
    pub(crate) repo_display_name: String,
    pub(crate) repo_id: String,
    pub(crate) repo_path: String,
    pub(crate) terminal_platform: &'static str,
    pub(crate) visible: bool,
    pub(crate) workspace_kind: &'static str,
}

#[derive(Clone)]
struct SelectorFields {
    branch: String,
    display_name: String,
}

#[derive(Debug, Error)]
pub(crate) enum WorktreeCatalogError {
    #[error("worktree_selector_ambiguous")]
    AmbiguousSelector,
    #[error(transparent)]
    Git(#[from] GitWorktreeScanError),
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error("git command failed: {0}")]
    Command(String),
    #[error("worktree_not_found")]
    NotFound,
    #[error(transparent)]
    Metadata(#[from] WorktreeMetadataError),
    #[error(transparent)]
    Project(#[from] ProjectCatalogError),
}

impl WorktreeCatalog {
    pub(crate) fn new(
        projects: ProjectCatalog,
        hosts: HostRegistry,
        metadata: WorktreeMetadataStore,
    ) -> Self {
        Self {
            cache: Arc::new(Mutex::new(HashMap::new())),
            hosts,
            metadata,
            mutation: Arc::new(AsyncMutex::new(())),
            projects,
            scanner: GitWorktreeScanner::new(),
        }
    }

    pub(crate) async fn port_probes_on_host(
        &self,
        host_id: &str,
        project_id: &str,
    ) -> Result<WorktreeProbeSet, WorktreeCatalogError> {
        let project = self
            .projects
            .list()
            .await?
            .into_iter()
            .find(|project| project.execution_host_id == host_id && project.id == project_id)
            .ok_or(WorktreeCatalogError::NotFound)?;
        self.scan_project(&project).await
    }

    pub(crate) async fn port_probes_for_project(
        &self,
        project: &Project,
    ) -> Result<WorktreeProbeSet, WorktreeCatalogError> {
        self.scan_project(project).await
    }

    async fn scan_project(
        &self,
        project: &Project,
    ) -> Result<WorktreeProbeSet, WorktreeCatalogError> {
        if let Some(value) = self.cached(&project.execution_host_id, &project.id) {
            return Ok(value);
        }
        let host = self
            .hosts
            .execution_host(&project.execution_host_id)
            .await?;
        let paths = HostFilesystem::new(host.clone()).paths();
        let metadata = self.metadata.list(project.storage_id.clone()).await?;
        let entries = match project.kind {
            ProjectKind::Folder => folder_entries(project, metadata, &paths),
            ProjectKind::Git => {
                let live_paths = self.scanner.scan(host, &project.path).await?;
                git_entries(project, live_paths, metadata, &paths)
            }
        };
        let selectors = entries
            .iter()
            .filter_map(|entry| {
                entry.selector_display_name.as_ref().map(|display_name| {
                    (
                        entry.worktree_id.clone(),
                        SelectorFields {
                            branch: entry.branch.clone(),
                            display_name: display_name.clone(),
                        },
                    )
                })
            })
            .collect();
        let value = WorktreeProbeSet {
            host_id: project.execution_host_id.clone(),
            probes: workspace_port_probes(entries),
            selectors,
        };
        let now = Instant::now();
        let mut cache = lock(&self.cache);
        cache.retain(|_, cached| cached.expires_at > now);
        cache.insert(
            (project.execution_host_id.clone(), project.id.clone()),
            CachedProbeSet {
                expires_at: now + PROBE_CACHE_TTL,
                value: value.clone(),
            },
        );
        while cache.len() > PROBE_CACHE_ENTRIES {
            let Some(oldest) = cache
                .iter()
                .min_by_key(|(_, cached)| cached.expires_at)
                .map(|(key, _)| key.clone())
            else {
                break;
            };
            cache.remove(&oldest);
        }
        Ok(value)
    }

    pub(crate) async fn resolve_selector(
        &self,
        selector: &str,
    ) -> Result<WorkspacePortProbe, WorktreeCatalogError> {
        let selector = selector.strip_prefix("id:").unwrap_or(selector);
        let projects = self.projects.list().await?;
        let mut matches = Vec::new();
        let mut observed = 0_usize;
        for project in &projects {
            let probes = self.scan_project(project).await?;
            collect_matches(&mut matches, probes, selector, &mut observed);
        }
        match matches.len() {
            0 => Err(WorktreeCatalogError::NotFound),
            1 => Ok(matches.remove(0)),
            _ => Err(WorktreeCatalogError::AmbiguousSelector),
        }
    }

    pub(crate) async fn list_resolved(
        &self,
    ) -> Result<Vec<ResolvedWorktree>, WorktreeCatalogError> {
        let mut resolved = Vec::new();
        for project in self.projects.list().await? {
            let host = self
                .hosts
                .execution_host(&project.execution_host_id)
                .await?;
            let filesystem = HostFilesystem::new(host.clone());
            let paths = filesystem.paths();
            let metadata = self.metadata.list(project.storage_id.clone()).await?;
            let platform = platform_name(host.platform());
            match project.kind {
                ProjectKind::Folder => {
                    resolved.extend(folder_resolved(&project, metadata, &paths, platform));
                }
                ProjectKind::Git => match self.scanner.scan(host, &project.path).await {
                    Ok(entries) => {
                        resolved.extend(git_resolved(&project, entries, metadata, &paths, platform))
                    }
                    Err(_) => {
                        resolved.extend(metadata_resolved(&project, metadata, &paths, platform))
                    }
                },
            }
        }
        Ok(resolved)
    }

    pub(crate) async fn patch_metadata(
        &self,
        selector: &str,
        patch: Map<String, Value>,
    ) -> Result<ResolvedWorktree, WorktreeCatalogError> {
        let worktree = resolve_from(self.list_resolved().await?, selector)?;
        let project = self
            .projects
            .list()
            .await?
            .into_iter()
            .find(|project| {
                project.execution_host_id == worktree.host_id && project.id == worktree.repo_id
            })
            .ok_or(WorktreeCatalogError::NotFound)?;
        self.metadata
            .patch(
                worktree.display_name.clone(),
                worktree.host_id.clone(),
                worktree.path.clone(),
                project.storage_id,
                worktree.id.clone(),
                patch,
            )
            .await?;
        self.invalidate(&worktree.host_id, &worktree.repo_id);
        resolve_from(self.list_resolved().await?, &worktree.id)
    }

    pub(crate) async fn remove_metadata(
        &self,
        worktree: &ResolvedWorktree,
    ) -> Result<bool, WorktreeCatalogError> {
        let project = self
            .projects
            .list()
            .await?
            .into_iter()
            .find(|project| {
                project.execution_host_id == worktree.host_id && project.id == worktree.repo_id
            })
            .ok_or(WorktreeCatalogError::NotFound)?;
        let removed = self
            .metadata
            .remove(project.storage_id, worktree.id.clone())
            .await?;
        self.invalidate(&worktree.host_id, &worktree.repo_id);
        Ok(removed)
    }

    pub(crate) async fn git(
        &self,
        worktree: &ResolvedWorktree,
        args: impl IntoIterator<Item = impl Into<String>>,
    ) -> Result<crate::hosts::HostCommandOutput, WorktreeCatalogError> {
        let host = self.hosts.execution_host(&worktree.host_id).await?;
        let mut command = HostCommand::new("git", args);
        command.cwd = Some(worktree.repo_path.clone());
        command.max_output_bytes = Some(256 * 1_024);
        command.timeout_ms = Some(30_000);
        host.exec(command)
            .await
            .map_err(|error: HostCommandError| WorktreeCatalogError::Command(error.to_string()))
    }

    pub(super) async fn scan_registration(
        &self,
        worktree: &ResolvedWorktree,
    ) -> Result<Vec<super::git_scan::GitWorktreeEntry>, WorktreeCatalogError> {
        self.scan_git_worktrees(&worktree.host_id, &worktree.repo_path)
            .await
    }

    pub(super) async fn scan_git_worktrees(
        &self,
        host_id: &str,
        repo_path: &str,
    ) -> Result<Vec<super::git_scan::GitWorktreeEntry>, WorktreeCatalogError> {
        let host = self.hosts.execution_host(host_id).await?;
        Ok(self.scanner.scan(host, repo_path).await?)
    }

    pub(super) async fn has_persisted_worktree(
        &self,
        worktree: &ResolvedWorktree,
    ) -> Result<bool, WorktreeCatalogError> {
        let project = self
            .projects
            .list()
            .await?
            .into_iter()
            .find(|project| {
                project.execution_host_id == worktree.host_id && project.id == worktree.repo_id
            })
            .ok_or(WorktreeCatalogError::NotFound)?;
        let host = self.hosts.execution_host(&worktree.host_id).await?;
        let paths = HostFilesystem::new(host).paths();
        Ok(self
            .metadata
            .list(project.storage_id)
            .await?
            .iter()
            .any(|entry| {
                entry.id == worktree.id
                    && paths.equal(&entry.path, &worktree.path)
                    && entry
                        .host_id
                        .as_deref()
                        .unwrap_or(&project.execution_host_id)
                        == worktree.host_id
            }))
    }

    pub(crate) async fn execution_host(
        &self,
        host_id: &str,
    ) -> Result<Arc<dyn crate::hosts::ExecutionHost>, WorktreeCatalogError> {
        self.hosts
            .execution_host(host_id)
            .await
            .map_err(WorktreeCatalogError::Host)
    }

    pub(crate) async fn reorder(
        &self,
        ordered_ids: Vec<String>,
    ) -> Result<usize, WorktreeCatalogError> {
        let updated = self.metadata.reorder(ordered_ids).await?;
        lock(&self.cache).clear();
        Ok(updated)
    }

    pub(crate) fn invalidate_project(&self, host_id: &str, project_id: &str) {
        self.invalidate(host_id, project_id);
    }

    pub(crate) fn invalidate_worktree(&self, worktree: &ResolvedWorktree) {
        self.invalidate(&worktree.host_id, &worktree.repo_id);
    }

    pub(crate) async fn resolve_managed(
        &self,
        selector: &str,
    ) -> Result<ResolvedWorktree, WorktreeCatalogError> {
        resolve_from(self.list_resolved().await?, selector)
    }

    pub(crate) async fn resolve_for_removal(
        &self,
        selector: &str,
    ) -> Result<ResolvedWorktree, WorktreeCatalogError> {
        match self.resolve_managed(selector).await {
            Err(WorktreeCatalogError::NotFound) => {}
            result => return result,
        }
        let id = selector.strip_prefix("id:").unwrap_or(selector);
        let mut candidates = Vec::new();
        for project in self.projects.list().await? {
            let host = self
                .hosts
                .execution_host(&project.execution_host_id)
                .await?;
            let filesystem = HostFilesystem::new(host.clone());
            let paths = filesystem.paths();
            let metadata = self.metadata.list(project.storage_id.clone()).await?;
            candidates.extend(
                metadata_resolved(&project, metadata, &paths, platform_name(host.platform()))
                    .into_iter()
                    .filter(|entry| entry.id == id && !paths.equal(&entry.path, &project.path)),
            );
        }
        match candidates.len() {
            0 => Err(WorktreeCatalogError::NotFound),
            1 => Ok(candidates.remove(0)),
            _ => Err(WorktreeCatalogError::AmbiguousSelector),
        }
    }

    pub(crate) async fn project(&self, selector: &str) -> Result<Project, WorktreeCatalogError> {
        Ok(self.projects.resolve(selector).await?)
    }

    pub(crate) async fn git_at(
        &self,
        host_id: &str,
        cwd: &str,
        args: impl IntoIterator<Item = impl Into<String>>,
    ) -> Result<crate::hosts::HostCommandOutput, WorktreeCatalogError> {
        let host = self.hosts.execution_host(host_id).await?;
        let mut command = HostCommand::new("git", args);
        command.cwd = Some(cwd.to_owned());
        command.max_output_bytes = Some(256 * 1_024);
        command.timeout_ms = Some(10 * 60 * 1_000);
        host.exec(command)
            .await
            .map_err(|error: HostCommandError| WorktreeCatalogError::Command(error.to_string()))
    }

    pub(crate) async fn mutation_guard(&self) -> OwnedMutexGuard<()> {
        self.mutation.clone().lock_owned().await
    }

    fn cached(&self, host_id: &str, project_id: &str) -> Option<WorktreeProbeSet> {
        let mut cache = lock(&self.cache);
        let now = Instant::now();
        cache.retain(|_, cached| cached.expires_at > now);
        let key = (host_id.to_owned(), project_id.to_owned());
        cache.get(&key).map(|cached| cached.value.clone())
    }

    fn invalidate(&self, host_id: &str, project_id: &str) {
        lock(&self.cache).remove(&(host_id.to_owned(), project_id.to_owned()));
    }
}

fn resolve_from(
    worktrees: Vec<ResolvedWorktree>,
    selector: &str,
) -> Result<ResolvedWorktree, WorktreeCatalogError> {
    let selector = selector.strip_prefix("id:").unwrap_or(selector);
    let mut matches = worktrees
        .into_iter()
        .filter(|worktree| {
            worktree.id == selector
                || worktree.path == selector
                || worktree.display_name == selector
                || worktree.branch == selector
        })
        .take(2)
        .collect::<Vec<_>>();
    match matches.len() {
        0 => Err(WorktreeCatalogError::NotFound),
        1 => Ok(matches.remove(0)),
        _ => Err(WorktreeCatalogError::AmbiguousSelector),
    }
}

fn git_resolved(
    project: &Project,
    live_worktrees: Vec<GitWorktreeEntry>,
    metadata: Vec<WorktreeMetadata>,
    paths: &crate::hosts::HostPaths,
    platform: &'static str,
) -> Vec<ResolvedWorktree> {
    let metadata = metadata
        .into_iter()
        .map(|entry| (entry.id.clone(), entry))
        .collect::<HashMap<_, _>>();
    live_worktrees
        .into_iter()
        .map(|entry| {
            let id = format!("{}::{}", project.id, entry.path);
            let managed = metadata.get(&id);
            let visible = entry.is_main_worktree
                || managed.is_some()
                || matches!(
                    project.external_worktree_visibility,
                    ProjectWorktreeVisibility::Show
                );
            ResolvedWorktree {
                authoritative: true,
                branch: entry.branch,
                display_name: managed
                    .map(|entry| entry.display_name.as_str())
                    .filter(|name| !name.is_empty())
                    .map(str::to_owned)
                    .unwrap_or_else(|| display_fallback(project, paths, &entry.path)),
                head: entry.head,
                host_id: project.execution_host_id.clone(),
                id,
                is_bare: entry.is_bare,
                is_managed: managed.is_some(),
                is_main_worktree: entry.is_main_worktree,
                is_sparse: entry.is_sparse,
                lock_reason: entry.lock_reason,
                metadata: managed
                    .map(|entry| entry.metadata.clone())
                    .unwrap_or_default(),
                path: entry.path,
                prunable_reason: entry.prunable_reason,
                repo_display_name: project.display_name.clone(),
                repo_id: project.id.clone(),
                repo_path: project.path.clone(),
                terminal_platform: platform,
                visible,
                workspace_kind: "git",
            }
        })
        .collect()
}

fn folder_resolved(
    project: &Project,
    metadata: Vec<WorktreeMetadata>,
    paths: &crate::hosts::HostPaths,
    platform: &'static str,
) -> Vec<ResolvedWorktree> {
    let root_id = format!("{}::{}", project.id, project.path);
    let mut entries = metadata_resolved(project, metadata, paths, platform);
    if !entries.iter().any(|entry| entry.id == root_id) {
        entries.insert(
            0,
            ResolvedWorktree {
                authoritative: true,
                branch: String::new(),
                display_name: project.display_name.clone(),
                head: String::new(),
                host_id: project.execution_host_id.clone(),
                id: root_id,
                is_bare: false,
                is_managed: false,
                is_main_worktree: true,
                is_sparse: false,
                lock_reason: None,
                metadata: Map::new(),
                path: project.path.clone(),
                prunable_reason: None,
                repo_display_name: project.display_name.clone(),
                repo_id: project.id.clone(),
                repo_path: project.path.clone(),
                terminal_platform: platform,
                visible: true,
                workspace_kind: "folder-workspace",
            },
        );
    }
    entries
}

fn metadata_resolved(
    project: &Project,
    metadata: Vec<WorktreeMetadata>,
    paths: &crate::hosts::HostPaths,
    platform: &'static str,
) -> Vec<ResolvedWorktree> {
    metadata
        .into_iter()
        .filter(|entry| {
            entry
                .host_id
                .as_deref()
                .unwrap_or(&project.execution_host_id)
                == project.execution_host_id
        })
        .map(|entry| ResolvedWorktree {
            authoritative: false,
            branch: String::new(),
            display_name: if entry.display_name.is_empty() {
                display_fallback(project, paths, &entry.path)
            } else {
                entry.display_name
            },
            head: String::new(),
            host_id: project.execution_host_id.clone(),
            id: entry.id,
            is_bare: false,
            is_managed: true,
            is_main_worktree: entry.path == project.path,
            is_sparse: entry
                .metadata
                .get("sparseDirectories")
                .and_then(Value::as_array)
                .is_some_and(|directories| !directories.is_empty()),
            lock_reason: None,
            metadata: entry.metadata,
            path: entry.path,
            prunable_reason: None,
            repo_display_name: project.display_name.clone(),
            repo_id: project.id.clone(),
            repo_path: project.path.clone(),
            terminal_platform: platform,
            visible: true,
            workspace_kind: match project.kind {
                ProjectKind::Folder => "folder-workspace",
                ProjectKind::Git => "git",
            },
        })
        .collect()
}

const fn platform_name(platform: crate::hosts::HostPlatform) -> &'static str {
    match platform {
        crate::hosts::HostPlatform::Darwin => "darwin",
        crate::hosts::HostPlatform::Linux => "linux",
        crate::hosts::HostPlatform::Windows => "win32",
        crate::hosts::HostPlatform::Unknown => "unknown",
    }
}

fn collect_matches(
    matches: &mut Vec<WorkspacePortProbe>,
    probe_set: WorktreeProbeSet,
    selector: &str,
    observed: &mut usize,
) {
    for probe in probe_set.probes {
        let Some(fields) = probe_set.selectors.get(&probe.worktree_id) else {
            continue;
        };
        if *observed >= 500 {
            break;
        }
        *observed += 1;
        if probe.worktree_id == selector
            || probe.path == selector
            || fields.display_name == selector
            || fields.branch == selector
        {
            matches.push(probe);
        }
    }
}

fn folder_entries(
    project: &Project,
    metadata: Vec<WorktreeMetadata>,
    paths: &crate::hosts::HostPaths,
) -> Vec<WorktreeGraphEntry> {
    let root_id = format!("{}::{}", project.id, project.path);
    let mut entries = metadata
        .into_iter()
        .filter(|entry| {
            entry
                .host_id
                .as_deref()
                .unwrap_or(&project.execution_host_id)
                == project.execution_host_id
        })
        .map(|entry| metadata_entry(project, entry, paths))
        .collect::<Vec<_>>();
    if let Some(root) = entries
        .iter_mut()
        .find(|entry| entry.worktree_id == root_id)
    {
        root.selector_display_name = Some(paths.basename(&project.path));
    }
    if !entries.iter().any(|entry| entry.worktree_id == root_id) {
        entries.insert(
            0,
            WorktreeGraphEntry {
                branch: String::new(),
                display_name: project.display_name.clone(),
                host_id: project.execution_host_id.clone(),
                path: project.path.clone(),
                project_id: project.id.clone(),
                selector_display_name: Some(paths.basename(&project.path)),
                worktree_id: root_id,
            },
        );
    }
    entries
}

fn git_entries(
    project: &Project,
    live_worktrees: Vec<GitWorktreeEntry>,
    metadata: Vec<WorktreeMetadata>,
    paths: &crate::hosts::HostPaths,
) -> Vec<WorktreeGraphEntry> {
    let metadata = metadata
        .into_iter()
        .map(|entry| (entry.id.clone(), entry))
        .collect::<HashMap<_, _>>();
    live_worktrees
        .into_iter()
        .map(|worktree| {
            let path = worktree.path;
            let id = format!("{}::{path}", project.id);
            let display_name = metadata
                .get(&id)
                .map(|entry| entry.display_name.as_str())
                .filter(|name| !name.is_empty())
                .map(str::to_owned)
                .unwrap_or_else(|| display_fallback(project, paths, &path));
            let selector_display_name = paths.basename(&path);
            WorktreeGraphEntry {
                branch: worktree.branch,
                display_name,
                host_id: project.execution_host_id.clone(),
                path,
                project_id: project.id.clone(),
                selector_display_name: Some(selector_display_name),
                worktree_id: id,
            }
        })
        .collect()
}

fn metadata_entry(
    project: &Project,
    entry: WorktreeMetadata,
    paths: &crate::hosts::HostPaths,
) -> WorktreeGraphEntry {
    let display_name = if entry.display_name.is_empty() {
        display_fallback(project, paths, &entry.path)
    } else {
        entry.display_name
    };
    WorktreeGraphEntry {
        branch: String::new(),
        display_name,
        host_id: project.execution_host_id.clone(),
        path: entry.path,
        project_id: project.id.clone(),
        selector_display_name: None,
        worktree_id: entry.id,
    }
}

fn display_fallback(project: &Project, paths: &crate::hosts::HostPaths, path: &str) -> String {
    let basename = paths.basename(path);
    if basename.is_empty() {
        project.display_name.clone()
    } else {
        basename
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
