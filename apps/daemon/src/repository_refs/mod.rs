mod project_selector;
mod search;

use std::sync::Arc;

use serde::Serialize;
use thiserror::Error;

use crate::host_registry::{HostRegistry, HostRegistryError};
use crate::hosts::{ExecutionHost, HostCommand};
use crate::projects::{Project, ProjectCatalog, ProjectCatalogError, ProjectKind};

const GIT_PROBE_TIMEOUT_MS: u64 = 15_000;
const GIT_PROBE_OUTPUT_LIMIT_BYTES: usize = 4 * 1_024 * 1_024;
const DEFAULT_BASE_REF_PROBES: [(&str, &str); 4] = [
    ("refs/remotes/origin/main", "origin/main"),
    ("refs/remotes/origin/master", "origin/master"),
    ("refs/heads/main", "main"),
    ("refs/heads/master", "master"),
];

#[derive(Clone)]
pub(crate) struct RepositoryRefs {
    hosts: HostRegistry,
    projects: ProjectCatalog,
}

#[derive(Debug, Error)]
pub(crate) enum RepositoryRefsError {
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error("invalid_limit")]
    InvalidLimit,
    #[error(transparent)]
    Project(#[from] ProjectCatalogError),
    #[error("repo_not_found")]
    ProjectNotFound,
    #[error("selector_ambiguous")]
    SelectorAmbiguous,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BaseRefDefaultResult {
    pub(crate) default_base_ref: Option<String>,
    pub(crate) remote_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RefDetail {
    pub(crate) local_branch_name: String,
    pub(crate) ref_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchRefsResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) ref_details: Option<Vec<RefDetail>>,
    pub(crate) refs: Vec<String>,
    pub(crate) truncated: bool,
}

impl RepositoryRefs {
    pub(crate) fn new(projects: ProjectCatalog, hosts: HostRegistry) -> Self {
        Self { hosts, projects }
    }

    pub(crate) async fn default_base_ref(
        &self,
        selector: &str,
        host_id: Option<&str>,
    ) -> Result<BaseRefDefaultResult, RepositoryRefsError> {
        let project = self.resolve_project(selector, host_id).await?;
        if project.kind == ProjectKind::Folder {
            return Ok(BaseRefDefaultResult {
                default_base_ref: None,
                remote_count: 0,
            });
        }
        let host = self
            .hosts
            .execution_host(&project.execution_host_id)
            .await?;
        let (default_base_ref, remote_count) = tokio::join!(
            resolve_default_base_ref(host.clone(), &project.path),
            count_remotes(host, &project.path),
        );
        Ok(BaseRefDefaultResult {
            default_base_ref,
            remote_count,
        })
    }

    pub(crate) async fn search(
        &self,
        selector: &str,
        query: &str,
        limit: f64,
        host_id: Option<&str>,
    ) -> Result<SearchRefsResult, RepositoryRefsError> {
        let limit = search::validate_limit(limit)?;
        let project = self.resolve_project(selector, host_id).await?;
        if project.kind == ProjectKind::Folder {
            return Ok(SearchRefsResult {
                ref_details: None,
                refs: Vec::new(),
                truncated: false,
            });
        }
        let host = self
            .hosts
            .execution_host(&project.execution_host_id)
            .await?;
        let mut details = search::search(host, &project.path, query, limit.saturating_add(1)).await;
        let truncated = details.len() > limit;
        details.truncate(limit);
        let refs = details
            .iter()
            .map(|detail| detail.ref_name.clone())
            .collect();
        Ok(SearchRefsResult {
            ref_details: Some(details),
            refs,
            truncated,
        })
    }

    async fn resolve_project(
        &self,
        selector: &str,
        host_id: Option<&str>,
    ) -> Result<Project, RepositoryRefsError> {
        let requested_host_id = host_id.unwrap_or("local");
        project_selector::resolve(self.projects.list().await?, selector, requested_host_id)
    }
}

async fn resolve_default_base_ref(host: Arc<dyn ExecutionHost>, cwd: &str) -> Option<String> {
    if let Some(symbolic_ref) = git_stdout(
        host.clone(),
        cwd,
        ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
    )
    .await
    .map(|output| output.trim().to_owned())
    .filter(|reference| !reference.is_empty())
        && has_ref(host.clone(), cwd, &symbolic_ref).await
    {
        return Some(
            symbolic_ref
                .strip_prefix("refs/remotes/")
                .unwrap_or(&symbolic_ref)
                .to_owned(),
        );
    }
    for (reference, display) in DEFAULT_BASE_REF_PROBES {
        if has_ref(host.clone(), cwd, reference).await {
            return Some(display.to_owned());
        }
    }
    None
}

async fn has_ref(host: Arc<dyn ExecutionHost>, cwd: &str, reference: &str) -> bool {
    git_stdout(host, cwd, ["rev-parse", "--verify", "--quiet", reference])
        .await
        .is_some()
}

async fn count_remotes(host: Arc<dyn ExecutionHost>, cwd: &str) -> usize {
    git_stdout(host, cwd, ["remote"])
        .await
        .map(|output| {
            output
                .split('\n')
                .filter(|line| !line.trim().is_empty())
                .count()
        })
        .unwrap_or(0)
}

pub(super) async fn git_stdout(
    host: Arc<dyn ExecutionHost>,
    cwd: &str,
    args: impl IntoIterator<Item = impl Into<String>>,
) -> Option<String> {
    let mut command = HostCommand::new("git", args);
    command.cwd = Some(cwd.to_owned());
    command.env = vec![
        ("GIT_TERMINAL_PROMPT".to_owned(), "0".to_owned()),
        ("GIT_ASKPASS".to_owned(), String::new()),
        ("SSH_ASKPASS".to_owned(), String::new()),
        ("LC_ALL".to_owned(), "C".to_owned()),
        ("LANG".to_owned(), "C".to_owned()),
        ("LANGUAGE".to_owned(), "C".to_owned()),
    ];
    command.max_output_bytes = Some(GIT_PROBE_OUTPUT_LIMIT_BYTES);
    command.timeout_ms = Some(GIT_PROBE_TIMEOUT_MS);
    let output = host.exec(command).await.ok()?;
    (output.exit_code == 0).then_some(output.stdout)
}
