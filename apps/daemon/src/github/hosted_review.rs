mod create;
mod preflight;

use serde_json::{Value, json};

use super::{BranchLookup, GitHubAuthority, GitHubError};

impl GitHubAuthority {
    pub(crate) async fn hosted_review_for_branch(
        &self,
        repo: &str,
        branch: &str,
        request: &BranchLookup<'_>,
        record_stats: bool,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let info = self
            .pr_for_branch_context(&context, branch, request)
            .await?;
        if record_stats {
            self.record_pr(&context.project_id, &info);
        }
        if info.is_null() {
            return Ok(Value::Null);
        }
        let mut review = info;
        review["provider"] = json!("github");
        review["status"] = review
            .get("checksStatus")
            .cloned()
            .unwrap_or_else(|| json!("pending"));
        review
            .as_object_mut()
            .map(|value| value.remove("checksStatus"));
        Ok(review)
    }

    pub(crate) async fn hosted_review_eligibility(
        &self,
        input: &HostedReviewEligibility<'_>,
    ) -> Result<Value, GitHubError> {
        let context = self.context(input.repo, input.worktree).await?;
        let repository = self.repository(&context).await?;
        let provider = if repository.is_some() {
            "github"
        } else {
            "unsupported"
        };
        let branch = trim_ref(input.branch);
        let default_base = match input.base.filter(|value| !value.trim().is_empty()) {
            Some(value) => Some(trim_ref(value).to_owned()),
            None => preflight::default_base(self, &context).await,
        };
        let review = self
            .hosted_review_for_branch(
                input.repo,
                branch,
                &BranchLookup {
                    linked: input.linked,
                    fallback: input.fallback,
                    accept_merged_fallback: false,
                    current_head_oid: None,
                },
                false,
            )
            .await
            .unwrap_or(Value::Null);
        let summary = (!review.is_null()).then(|| {
            json!({
                "number": review.get("number"), "url": review.get("url")
            })
        });
        let base = json!({
            "provider": provider,
            "review": summary,
            "defaultBaseRef": default_base,
            "head": if branch.is_empty() { Value::Null } else { json!(branch) }
        });
        let blocked = if branch.is_empty() || branch == "HEAD" {
            Some(("detached_head", Value::Null))
        } else if !review.is_null() {
            Some(("existing_review", json!("open_existing_review")))
        } else if provider == "unsupported" {
            Some(("unsupported_provider", Value::Null))
        } else if default_base
            .as_deref()
            .is_some_and(|value| value.eq_ignore_ascii_case(branch))
        {
            Some(("default_branch", Value::Null))
        } else if input.dirty == Some(true) {
            Some(("dirty", json!("commit")))
        } else if input.has_upstream == Some(false) {
            Some(("no_upstream", json!("publish")))
        } else if input.has_upstream.is_none() {
            return Ok(eligibility(base, false, Value::Null, Value::Null));
        } else if input.behind.unwrap_or(0) > 0 {
            Some(("needs_sync", json!("sync")))
        } else if !preflight::authenticated(
            self,
            &context,
            repository.as_ref().and_then(|value| value.host.as_deref()),
        )
        .await
        {
            Some(("auth_required", json!("authenticate")))
        } else if input.ahead.unwrap_or(0) > 0 {
            Some(("needs_push", json!("push")))
        } else {
            None
        };
        Ok(match blocked {
            Some((reason, action)) => eligibility(base, false, json!(reason), action),
            None => eligibility(base, default_base.is_some(), Value::Null, Value::Null),
        })
    }

    pub(crate) async fn create_hosted_review(
        &self,
        input: &CreateHostedReview<'_>,
    ) -> Result<Value, GitHubError> {
        if input.provider != "github" {
            return Ok(create::error(
                "unsupported_provider",
                "Creating reviews for this provider is not supported yet.",
            ));
        }
        let context = self.context(input.repo, input.worktree).await?;
        let Some(repository) = self.repository(&context).await? else {
            return Ok(create::error(
                "unsupported_provider",
                "Creating pull requests requires a GitHub remote.",
            ));
        };
        let base = trim_ref(input.base);
        let title = input.title.trim();
        if base.is_empty() || title.is_empty() {
            return Ok(create::error(
                "validation",
                "Create PR failed: base branch and title are required.",
            ));
        }
        if input
            .head
            .is_some_and(|head| trim_ref(head).eq_ignore_ascii_case(base))
        {
            return Ok(create::error(
                "validation",
                "Create PR failed: choose a different base branch before creating a pull request.",
            ));
        }
        let dirty = !self
            .git(&context, ["status", "--porcelain", "-z"], 10_000)
            .await?
            .is_empty();
        let state = preflight::inspect(self, &context).await?;
        let requested_head = input.head.map(trim_ref).filter(|value| !value.is_empty());
        if let Some(blocked) = preflight::validate(&state, requested_head, base, dirty) {
            return Ok(blocked);
        }
        if !preflight::base_exists(self, &context, base).await {
            return Ok(create::error(
                "validation",
                &format!(
                    "Create PR failed: the base branch \"{base}\" hasn't been pushed to the remote. Choose a pushed base or push it first."
                ),
            ));
        }
        if let Some(existing) =
            preflight::existing_review(self, &context, &repository, &state.branch, base).await
        {
            return Ok(preflight::already_exists(&existing));
        }
        if !preflight::authenticated(self, &context, repository.host.as_deref()).await {
            return Ok(create::error(
                "auth_required",
                "Create PR failed: GitHub is not authenticated. Next step: run gh auth login in this environment.",
            ));
        }
        let body = create::body(&context, input).await;
        let mut args = vec![
            "pr".to_owned(),
            "create".to_owned(),
            "--repo".to_owned(),
            preflight::repo_label(&repository),
            "--base".to_owned(),
            base.to_owned(),
            "--title".to_owned(),
            title.to_owned(),
            "--body-file".to_owned(),
            "-".to_owned(),
        ];
        if let Some(head) = input.head.map(trim_ref).filter(|value| !value.is_empty()) {
            args.extend(["--head".to_owned(), head.to_owned()]);
        }
        if input.draft {
            args.push("--draft".to_owned())
        }
        match self
            .gh_with_input(&context, args, 60_000, Some(body.into_bytes()))
            .await
        {
            Ok(output) => {
                if let Some((number, url)) = create::parse_output(&output) {
                    self.publish_mutation(&context, number);
                    let review = json!({ "ok": true, "number": number, "url": url });
                    self.record_pr(&context.project_id, &review);
                    return Ok(review);
                }
                if let Some(found) =
                    preflight::existing_review(self, &context, &repository, &state.branch, base)
                        .await
                {
                    let number = found.get("number").and_then(Value::as_u64).unwrap_or(0);
                    self.record_pr(&context.project_id, &found);
                    self.publish_mutation(&context, number);
                    return Ok(json!({
                        "ok": true,
                        "number": number,
                        "url": found.get("url").and_then(Value::as_str).unwrap_or("")
                    }));
                }
                Ok(create::error(
                    "unknown_completion",
                    "PR creation may have completed. Refreshing branch review state...",
                ))
            }
            Err(error) => {
                let classified = create::classify_error(&error.to_string());
                let retry_lookup = matches!(
                    classified.get("code").and_then(Value::as_str),
                    Some("already_exists" | "unknown_completion")
                );
                if retry_lookup
                    && let Some(found) =
                        preflight::existing_review(self, &context, &repository, &state.branch, base)
                            .await
                {
                    return Ok(preflight::already_exists(&found));
                }
                Ok(classified)
            }
        }
    }
}

pub(crate) struct HostedReviewEligibility<'a> {
    pub(crate) repo: &'a str,
    pub(crate) worktree: Option<&'a str>,
    pub(crate) branch: &'a str,
    pub(crate) base: Option<&'a str>,
    pub(crate) dirty: Option<bool>,
    pub(crate) has_upstream: Option<bool>,
    pub(crate) ahead: Option<u64>,
    pub(crate) behind: Option<u64>,
    pub(crate) linked: Option<u64>,
    pub(crate) fallback: Option<u64>,
}

pub(crate) struct CreateHostedReview<'a> {
    pub(crate) repo: &'a str,
    pub(crate) worktree: Option<&'a str>,
    pub(crate) provider: &'a str,
    pub(crate) base: &'a str,
    pub(crate) head: Option<&'a str>,
    pub(crate) title: &'a str,
    pub(crate) body: Option<&'a str>,
    pub(crate) draft: bool,
    pub(crate) use_template: bool,
}

fn eligibility(mut base: Value, can_create: bool, blocked: Value, action: Value) -> Value {
    base["canCreate"] = json!(can_create);
    base["blockedReason"] = blocked;
    base["nextAction"] = action;
    base
}
fn trim_ref(value: &str) -> &str {
    value
        .strip_prefix("refs/heads/")
        .or_else(|| value.strip_prefix("refs/remotes/origin/"))
        .unwrap_or(value)
        .trim()
}
