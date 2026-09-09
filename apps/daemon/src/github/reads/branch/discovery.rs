use serde_json::Value;

use super::super::{PR_FIELDS, append_repo};
use crate::github::context::api_args;
use crate::github::{GitHubAuthority, GitHubContext, GitHubError, GitHubRepository};

pub(super) struct Located {
    pub(super) raw: Value,
    pub(super) repository: Option<GitHubRepository>,
    pub(super) head_repository: Option<GitHubRepository>,
}

impl GitHubAuthority {
    pub(super) async fn exact_pr(
        &self,
        context: &GitHubContext,
        candidates: &[GitHubRepository],
        number: u64,
    ) -> Result<Option<Located>, GitHubError> {
        let probes = if candidates.is_empty() {
            vec![None]
        } else {
            candidates.iter().cloned().map(Some).collect()
        };
        let mut pending = None;
        for repository in probes {
            let mut args = vec![
                "pr".to_owned(),
                "view".to_owned(),
                number.to_string(),
                "--json".to_owned(),
                PR_FIELDS.to_owned(),
            ];
            append_repo(&mut args, repository.as_ref());
            match self.gh_json(context, args, 30_000).await {
                Ok(raw) => {
                    return Ok(Some(Located {
                        raw,
                        repository,
                        head_repository: None,
                    }));
                }
                Err(GitHubError::Command(message)) if missing_pr(&message) => {}
                Err(error) => pending = Some(error),
            }
        }
        pending.map_or(Ok(None), Err)
    }

    pub(super) async fn branch_pr(
        &self,
        context: &GitHubContext,
        candidates: &[GitHubRepository],
        head: Option<&GitHubRepository>,
        branch: &str,
    ) -> Result<Option<Located>, GitHubError> {
        for candidate in candidates {
            let raw = if let Some(head) = head {
                let query = format!("{}:{}", head.owner, branch);
                let endpoint = format!(
                    "repos/{}/{}/pulls?head={}&state=all&per_page=1",
                    candidate.owner,
                    candidate.repo,
                    crate::github::files::percent_encode(&query)
                );
                self.gh_json(context, api_args(candidate, [endpoint]), 30_000)
                    .await?
                    .as_array()
                    .and_then(|values| values.first())
                    .cloned()
            } else {
                self.list_branch_pr(context, candidate, branch).await?
            };
            if let Some(raw) = raw {
                let number = raw.get("number").and_then(Value::as_u64).unwrap_or(0);
                if number > 0
                    && let Some(located) = self
                        .exact_pr(context, std::slice::from_ref(candidate), number)
                        .await?
                {
                    return Ok(Some(Located {
                        head_repository: head.cloned(),
                        ..located
                    }));
                }
            }
        }
        Ok(None)
    }

    async fn list_branch_pr(
        &self,
        context: &GitHubContext,
        repository: &GitHubRepository,
        branch: &str,
    ) -> Result<Option<Value>, GitHubError> {
        let mut args = vec![
            "pr".to_owned(),
            "list".to_owned(),
            "--head".to_owned(),
            branch.to_owned(),
            "--state".to_owned(),
            "all".to_owned(),
            "--limit".to_owned(),
            "1".to_owned(),
            "--json".to_owned(),
            PR_FIELDS.to_owned(),
        ];
        append_repo(&mut args, Some(repository));
        Ok(self
            .gh_json(context, args, 30_000)
            .await?
            .as_array()
            .and_then(|values| values.first())
            .cloned())
    }

    pub(super) async fn tracked_upstream(
        &self,
        context: &GitHubContext,
        branch: &str,
    ) -> Option<(GitHubRepository, String)> {
        let remote = self
            .git(
                context,
                ["config", "--get", &format!("branch.{branch}.remote")],
                10_000,
            )
            .await
            .ok()?;
        let merge = self
            .git(
                context,
                ["config", "--get", &format!("branch.{branch}.merge")],
                10_000,
            )
            .await
            .ok()?;
        let repository = self.repository_for_remote(context, remote.trim()).await?;
        let branch = merge
            .trim()
            .strip_prefix("refs/heads/")
            .unwrap_or(merge.trim());
        Some((repository, branch.to_owned()))
    }
}

fn missing_pr(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("no pull request")
        || lower.contains("could not find")
        || lower.contains("http 404")
}
