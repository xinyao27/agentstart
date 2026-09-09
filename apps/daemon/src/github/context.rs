use std::sync::Arc;

use serde_json::Value;

use crate::hosts::ExecutionHost;
use crate::projects::ProjectKind;

use super::{GitHubAuthority, GitHubError};

mod command;

#[derive(Clone, Debug)]
pub(crate) struct GitHubRepository {
    pub(crate) owner: String,
    pub(crate) repo: String,
    pub(crate) host: Option<String>,
}

#[derive(Clone)]
pub(crate) struct GitHubContext {
    pub(crate) execution_host_id: String,
    pub(crate) host: Arc<dyn ExecutionHost>,
    pub(crate) path: String,
    pub(crate) project_id: String,
}

impl GitHubAuthority {
    pub(crate) async fn context(
        &self,
        repo_selector: &str,
        worktree_selector: Option<&str>,
    ) -> Result<GitHubContext, GitHubError> {
        let project = self.projects.resolve(repo_selector).await?;
        if project.kind != ProjectKind::Git {
            return Err(GitHubError::Command(
                "Creating and reading GitHub reviews requires a Git repository".to_owned(),
            ));
        }
        let path = if let Some(selector) = worktree_selector {
            let worktree = self.worktrees.resolve_managed(selector).await?;
            if worktree.repo_id != project.id {
                return Err(GitHubError::Command(
                    "Access denied: worktree does not belong to repository".to_owned(),
                ));
            }
            worktree.path
        } else {
            project.path.clone()
        };
        Ok(GitHubContext {
            execution_host_id: project.execution_host_id.clone(),
            host: self
                .hosts
                .execution_host(&project.execution_host_id)
                .await?,
            path,
            project_id: project.id,
        })
    }

    pub(crate) async fn repository(
        &self,
        context: &GitHubContext,
    ) -> Result<Option<GitHubRepository>, GitHubError> {
        for remote in ["origin", "upstream"] {
            if let Some(identity) = self.repository_for_remote(context, remote).await {
                return Ok(Some(identity));
            }
        }
        let output = self
            .gh(
                context,
                ["repo", "view", "--json", "nameWithOwner,url"],
                15_000,
            )
            .await;
        let Ok(value) = output else {
            return Ok(None);
        };
        let parsed: Value = serde_json::from_str(&value)?;
        let mut repository = parsed
            .get("nameWithOwner")
            .and_then(Value::as_str)
            .and_then(parse_slug);
        if let Some(repository) = repository.as_mut() {
            repository.host = parsed
                .get("url")
                .and_then(Value::as_str)
                .and_then(parse_remote)
                .and_then(|identity| identity.host);
        }
        Ok(repository)
    }

    pub(super) async fn repository_for_remote(
        &self,
        context: &GitHubContext,
        remote: &str,
    ) -> Option<GitHubRepository> {
        let value = self
            .git(context, ["remote", "get-url", remote], 10_000)
            .await
            .ok()?;
        let identity = parse_remote(value.trim())?;
        if identity.host.is_some()
            && !self
                .authenticated_host(context, identity.host.as_deref())
                .await
        {
            return None;
        }
        Some(identity)
    }

    pub(super) async fn pr_repositories(
        &self,
        context: &GitHubContext,
    ) -> (Vec<GitHubRepository>, Option<GitHubRepository>) {
        let upstream = self.repository_for_remote(context, "upstream").await;
        let origin = self.repository_for_remote(context, "origin").await;
        let mut values = Vec::new();
        for candidate in [upstream, origin.clone()].into_iter().flatten() {
            if !values.iter().any(|existing: &GitHubRepository| {
                existing.owner.eq_ignore_ascii_case(&candidate.owner)
                    && existing.repo.eq_ignore_ascii_case(&candidate.repo)
                    && existing.host == candidate.host
            }) {
                values.push(candidate);
            }
        }
        (values, origin)
    }

    pub(crate) async fn resolve_repository(
        &self,
        context: &GitHubContext,
        override_repo: Option<GitHubRepository>,
    ) -> Result<Option<GitHubRepository>, GitHubError> {
        let detected = self.repository(context).await?;
        Ok(match override_repo {
            Some(mut repository) => {
                if repository.host.is_none() {
                    repository.host = detected.and_then(|value| value.host);
                }
                Some(repository)
            }
            None => detected,
        })
    }

    async fn authenticated_host(&self, context: &GitHubContext, host: Option<&str>) -> bool {
        let Some(host) = host else {
            return true;
        };
        self.gh(context, ["auth", "status", "--hostname", host], 10_000)
            .await
            .is_ok()
    }
}

pub(crate) fn api_args(
    repository: &GitHubRepository,
    args: impl IntoIterator<Item = impl Into<String>>,
) -> Vec<String> {
    let mut output = vec!["api".to_owned()];
    if let Some(host) = &repository.host {
        output.extend(["--hostname".to_owned(), host.clone()]);
    }
    output.extend(args.into_iter().map(Into::into));
    output
}

pub(crate) fn parse_slug(value: &str) -> Option<GitHubRepository> {
    let mut segments = value.trim().trim_matches('/').split('/');
    let owner = segments.next()?.trim();
    let repo = segments.next()?.trim().trim_end_matches(".git");
    if owner.is_empty() || repo.is_empty() || segments.next().is_some() {
        return None;
    }
    Some(GitHubRepository {
        owner: owner.to_owned(),
        repo: repo.to_owned(),
        host: None,
    })
}

pub(super) fn parse_remote(value: &str) -> Option<GitHubRepository> {
    let value = value.trim();
    let (host, path) = if let Some(value) = value.strip_prefix("git@") {
        let (host, path) = value.split_once(':')?;
        (host, path)
    } else {
        let scheme = value.find("://")?;
        let remainder = &value[scheme + 3..];
        let (authority, path) = remainder.split_once('/')?;
        let host = authority
            .rsplit_once('@')
            .map_or(authority, |(_, host)| host)
            .split(':')
            .next()?;
        (host, path)
    };
    let mut repository = parse_slug(path)?;
    let host =
        if host.eq_ignore_ascii_case("github.com") || host.eq_ignore_ascii_case("ssh.github.com") {
            None
        } else {
            Some(host.to_ascii_lowercase())
        };
    repository.host = host;
    Some(repository)
}
