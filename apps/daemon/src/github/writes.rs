use serde_json::{Value, json};

use super::context::api_args;
use super::reads::append_repo;
use super::{GitHubAuthority, GitHubError, GitHubRepository};

impl GitHubAuthority {
    pub(crate) async fn update_title(
        &self,
        repo: &str,
        number: u64,
        title: &str,
        repository: Option<GitHubRepository>,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let repository = self.resolve_repository(&context, repository).await?;
        let mut args = vec![
            "pr".to_owned(),
            "edit".to_owned(),
            number.to_string(),
            "--title".to_owned(),
            title.to_owned(),
        ];
        append_repo(&mut args, repository.as_ref());
        let successful = self.gh(&context, args, 30_000).await.is_ok();
        if successful {
            self.publish_mutation(&context, number)
        }
        Ok(json!(successful))
    }

    pub(crate) async fn update_pr(
        &self,
        repo: &str,
        number: u64,
        title: Option<&str>,
        body: Option<&str>,
        repository: Option<GitHubRepository>,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let Some(repository) = self.resolve_repository(&context, repository).await? else {
            return Ok(mutation_error(
                "Could not resolve GitHub owner/repo for this repository",
            ));
        };
        if title.is_some_and(|value| value.trim().is_empty()) {
            return Ok(mutation_error("Title is required"));
        }
        if title.is_none() && body.is_none() {
            return Ok(json!({ "ok": true }));
        }
        let endpoint = format!(
            "repos/{}/{}/pulls/{number}",
            repository.owner, repository.repo
        );
        let args = api_args(&repository, ["-X".to_owned(), "PATCH".to_owned(), endpoint]);
        let mut args = args;
        if let Some(title) = title {
            args.extend(["--raw-field".to_owned(), format!("title={}", title.trim())])
        }
        if let Some(body) = body {
            args.extend(["--raw-field".to_owned(), format!("body={body}")])
        }
        Ok(self.mutation(&context, number, args).await)
    }

    pub(crate) async fn merge_pr(
        &self,
        repo: &str,
        number: u64,
        method: &str,
        repository: Option<GitHubRepository>,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let repository = self.resolve_repository(&context, repository).await?;
        let mut args = vec![
            "pr".to_owned(),
            "merge".to_owned(),
            number.to_string(),
            format!("--{method}"),
        ];
        append_repo(&mut args, repository.as_ref());
        Ok(self.mutation(&context, number, args).await)
    }

    pub(crate) async fn set_auto_merge(
        &self,
        repo: &str,
        number: u64,
        enabled: bool,
        method: &str,
        repository: Option<GitHubRepository>,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let repository = self.resolve_repository(&context, repository).await?;
        let mut args = vec!["pr".to_owned(), "merge".to_owned(), number.to_string()];
        if enabled {
            args.extend(["--auto".to_owned(), format!("--{method}")])
        } else {
            args.push("--disable-auto".to_owned())
        }
        append_repo(&mut args, repository.as_ref());
        Ok(self.mutation(&context, number, args).await)
    }

    pub(crate) async fn update_state(
        &self,
        repo: &str,
        number: u64,
        state: &str,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let repository = self.repository(&context).await?;
        let command = if state == "closed" { "close" } else { "reopen" };
        let mut args = vec!["pr".to_owned(), command.to_owned(), number.to_string()];
        append_repo(&mut args, repository.as_ref());
        Ok(self.mutation(&context, number, args).await)
    }

    pub(crate) async fn reviewers(
        &self,
        repo: &str,
        number: u64,
        reviewers: &[String],
        remove: bool,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let repository = self.repository(&context).await?;
        let reviewers = reviewers
            .iter()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>();
        if reviewers.is_empty() {
            return Ok(mutation_error("Enter at least one reviewer"));
        }
        let mut args = vec![
            "pr".to_owned(),
            "edit".to_owned(),
            number.to_string(),
            if remove {
                "--remove-reviewer"
            } else {
                "--add-reviewer"
            }
            .to_owned(),
            reviewers.join(","),
        ];
        append_repo(&mut args, repository.as_ref());
        Ok(self.mutation(&context, number, args).await)
    }

    pub(crate) async fn resolve_thread(
        &self,
        repo: &str,
        thread_id: &str,
        resolve: bool,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let repository = self.repository(&context).await?;
        let operation = if resolve {
            "resolveReviewThread"
        } else {
            "unresolveReviewThread"
        };
        let query = format!(
            "mutation($threadId: ID!) {{ {operation}(input: {{threadId: $threadId}}) {{ thread {{ id }} }} }}"
        );
        let successful = if let Some(repository) = repository {
            self.gh(
                &context,
                api_args(
                    &repository,
                    [
                        "graphql".to_owned(),
                        "-f".to_owned(),
                        format!("query={query}"),
                        "-f".to_owned(),
                        format!("threadId={thread_id}"),
                    ],
                ),
                30_000,
            )
            .await
            .is_ok()
        } else {
            false
        };
        Ok(json!(successful))
    }

    pub(crate) async fn set_file_viewed(
        &self,
        repo: &str,
        pull_request_id: &str,
        path: &str,
        viewed: bool,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let repository = self.repository(&context).await?;
        let operation = if viewed {
            "markFileAsViewed"
        } else {
            "unmarkFileAsViewed"
        };
        let query = format!(
            "mutation($pullRequestId: ID!, $path: String!) {{ {operation}(input: {{pullRequestId: $pullRequestId, path: $path}}) {{ pullRequest {{ id }} }} }}"
        );
        let successful = if let Some(repository) = repository {
            self.gh(
                &context,
                api_args(
                    &repository,
                    [
                        "graphql".to_owned(),
                        "-f".to_owned(),
                        format!("query={query}"),
                        "-f".to_owned(),
                        format!("pullRequestId={pull_request_id}"),
                        "-f".to_owned(),
                        format!("path={path}"),
                    ],
                ),
                30_000,
            )
            .await
            .is_ok()
        } else {
            false
        };
        Ok(json!(successful))
    }

    async fn mutation(
        &self,
        context: &super::GitHubContext,
        number: u64,
        args: Vec<String>,
    ) -> Value {
        match self.gh(context, args, 60_000).await {
            Ok(_) => {
                self.publish_mutation(context, number);
                json!({ "ok": true })
            }
            Err(error) => {
                mutation_error(&super::provider_error::stable_message(&error.to_string()))
            }
        }
    }
}

fn mutation_error(error: &str) -> Value {
    json!({ "ok": false, "error": error })
}
