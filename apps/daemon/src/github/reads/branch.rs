mod conflict;
mod discovery;
mod membership;

pub(crate) use conflict::summary as conflict_summary;

use serde_json::{Value, json};

use crate::github::mapping::{pr_info, work_item};
use crate::github::{GitHubAuthority, GitHubContext, GitHubError, GitHubRepository};

use discovery::Located;

pub(crate) struct BranchLookup<'a> {
    pub(crate) linked: Option<u64>,
    pub(crate) fallback: Option<u64>,
    pub(crate) accept_merged_fallback: bool,
    pub(crate) current_head_oid: Option<&'a str>,
}

impl GitHubAuthority {
    pub(crate) async fn pr_for_branch(
        &self,
        repo: &str,
        branch: &str,
        request: &BranchLookup<'_>,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        self.pr_for_branch_context(&context, branch, request).await
    }

    pub(crate) async fn pr_for_branch_context(
        &self,
        context: &GitHubContext,
        branch: &str,
        request: &BranchLookup<'_>,
    ) -> Result<Value, GitHubError> {
        let branch = branch.strip_prefix("refs/heads/").unwrap_or(branch);
        let (mut candidates, origin) = self.pr_repositories(context).await;
        if candidates.is_empty()
            && let Some(repository) = self.repository(context).await?
        {
            candidates.push(repository);
        }
        let current_head = match request.current_head_oid.map(str::trim) {
            Some(value) if !value.is_empty() => Some(value.to_owned()),
            _ => self
                .git(context, ["rev-parse", "HEAD"], 10_000)
                .await
                .ok()
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty()),
        };

        if let Some(number) = request.linked
            && let Some(mut located) = self.exact_pr(context, &candidates, number).await?
        {
            self.decorate_pr(context, &mut located, request.current_head_oid, true)
                .await;
            return Ok(self.located_info(located));
        }

        let mut branch_match = self
            .branch_pr(context, &candidates, origin.as_ref(), branch)
            .await?;
        if branch_match.is_none()
            && let Some((tracked_repo, tracked_branch)) =
                self.tracked_upstream(context, branch).await
            && (tracked_branch != branch
                || origin
                    .as_ref()
                    .is_none_or(|value| !same_repo(value, &tracked_repo)))
        {
            branch_match = self
                .branch_pr(context, &candidates, Some(&tracked_repo), &tracked_branch)
                .await?;
            if let Some(located) = branch_match.as_mut() {
                located.head_repository = Some(tracked_repo);
            }
        }
        let hidden_merged_number = if let Some(located) = branch_match.as_ref()
            && self
                .should_hide_merged(context, located, current_head.as_deref())
                .await
        {
            let number = located.raw.get("number").and_then(Value::as_u64);
            branch_match = None;
            number
        } else {
            None
        };
        if let Some(mut located) = branch_match {
            self.decorate_pr(context, &mut located, current_head.as_deref(), false)
                .await;
            return Ok(self.located_info(located));
        }

        if let Some(number) = request.fallback
            && let Some(mut located) = self.exact_pr(context, &candidates, number).await?
        {
            let explicit_divergence = if request.current_head_oid.is_some() {
                self.should_hide_merged(context, &located, request.current_head_oid)
                    .await
            } else {
                false
            };
            let preserve = hidden_merged_number == Some(number)
                || request.accept_merged_fallback
                || !is_merged(&located.raw);
            if preserve && !explicit_divergence {
                self.decorate_pr(context, &mut located, current_head.as_deref(), false)
                    .await;
                return Ok(self.located_info(located));
            }
        }
        Ok(Value::Null)
    }

    async fn should_hide_merged(
        &self,
        context: &GitHubContext,
        located: &Located,
        current_head: Option<&str>,
    ) -> bool {
        if !is_merged(&located.raw) {
            return false;
        }
        let Some(current_head) = current_head.filter(|value| !value.trim().is_empty()) else {
            return true;
        };
        if located.raw.get("headRefOid").and_then(Value::as_str) == Some(current_head) {
            return false;
        }
        let Some(repository) = located.repository.as_ref() else {
            return true;
        };
        membership::contains(self, context, repository, &located.raw, current_head).await
            != membership::Membership::Contained
    }

    async fn decorate_pr(
        &self,
        context: &GitHubContext,
        located: &mut Located,
        current_head: Option<&str>,
        linked: bool,
    ) {
        let Some(repository) = located.repository.as_ref() else {
            return;
        };
        let metadata = self
            .merge_metadata(
                context,
                repository,
                located.raw.get("baseRefName").and_then(Value::as_str),
            )
            .await;
        crate::github::metadata::apply(&mut located.raw, &metadata);
        if is_merged(&located.raw)
            && let Some(head) = current_head
            && located.raw.get("headRefOid").and_then(Value::as_str) != Some(head)
        {
            let membership =
                membership::contains(self, context, repository, &located.raw, head).await;
            if membership == membership::Membership::Contained {
                located.raw["confirmedContainedHeadOid"] = json!(head);
            } else if linked && membership == membership::Membership::NotContained {
                located.raw["headDivergedFromMergedPRAtOid"] = json!(head);
            }
        }
        if located.raw.get("mergeable").and_then(Value::as_str) == Some("CONFLICTING")
            && let Some(summary) = conflict::summary(self, context, &located.raw).await
        {
            located.raw["conflictSummary"] = summary;
        }
    }

    fn located_info(&self, located: Located) -> Value {
        let mut item = work_item(&located.raw, located.repository.as_ref());
        for key in [
            "confirmedContainedHeadOid",
            "headDivergedFromMergedPRAtOid",
            "conflictSummary",
        ] {
            if let Some(value) = located.raw.get(key) {
                item[key] = value.clone();
            }
        }
        if let Some(head) = located.head_repository {
            item["headRepo"] = json!({ "owner": head.owner, "repo": head.repo });
        }
        pr_info(&item)
    }
}

fn is_merged(raw: &Value) -> bool {
    raw.get("state").and_then(Value::as_str) == Some("MERGED")
}

fn same_repo(left: &GitHubRepository, right: &GitHubRepository) -> bool {
    left.owner.eq_ignore_ascii_case(&right.owner)
        && left.repo.eq_ignore_ascii_case(&right.repo)
        && left.host == right.host
}
