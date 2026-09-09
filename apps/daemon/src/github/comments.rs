mod read;

use serde_json::{Value, json};

use super::context::api_args;
use super::{GitHubAuthority, GitHubError, GitHubRepository};

impl GitHubAuthority {
    pub(crate) async fn pr_comments(
        &self,
        repo: &str,
        number: u64,
        repository: Option<GitHubRepository>,
        no_cache: bool,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let Some(repository) = self.resolve_repository(&context, repository).await? else {
            return Ok(json!([]));
        };
        read::fetch(self, &context, &repository, number, no_cache).await
    }

    pub(crate) async fn add_pr_comment(
        &self,
        repo: &str,
        number: u64,
        body: &str,
        repository: Option<GitHubRepository>,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let repository = self.resolve_repository(&context, repository).await?;
        let Some(repository) = repository else {
            return Ok(
                json!({ "ok": false, "error": "Could not resolve GitHub owner/repo for this repository" }),
            );
        };
        let endpoint = format!(
            "repos/{}/{}/issues/{number}/comments",
            repository.owner, repository.repo
        );
        let args = api_args(
            &repository,
            [
                "-X".to_owned(),
                "POST".to_owned(),
                endpoint,
                "--raw-field".to_owned(),
                format!("body={body}"),
            ],
        );
        match self.gh_json(&context, args, 30_000).await {
            Ok(raw) => {
                self.publish_mutation(&context, number);
                Ok(json!({ "ok": true, "comment": map_comment(&raw, false) }))
            }
            Err(error) => Ok(
                json!({ "ok": false, "error": super::provider_error::stable_message(&error.to_string()) }),
            ),
        }
    }

    pub(crate) async fn add_review_comment(
        &self,
        input: &ReviewComment<'_>,
    ) -> Result<Value, GitHubError> {
        let context = self.context(input.repo, None).await?;
        let Some(repository) = self.repository(&context).await? else {
            return Ok(
                json!({ "ok": false, "error": "Could not resolve GitHub owner/repo for this repository" }),
            );
        };
        let endpoint = format!(
            "repos/{}/{}/pulls/{}/comments",
            repository.owner, repository.repo, input.number
        );
        let args = vec![
            "-X".to_owned(),
            "POST".to_owned(),
            endpoint,
            "--raw-field".to_owned(),
            format!("body={}", input.body),
            "--raw-field".to_owned(),
            format!("commit_id={}", input.commit_id),
            "--raw-field".to_owned(),
            format!("path={}", input.path),
            "--raw-field".to_owned(),
            format!("line={}", input.line),
            "--raw-field".to_owned(),
            "side=RIGHT".to_owned(),
        ];
        let mut args = api_args(&repository, args);
        if let Some(start_line) = input.start_line {
            args.extend([
                "--raw-field".to_owned(),
                format!("start_line={start_line}"),
                "--raw-field".to_owned(),
                "start_side=RIGHT".to_owned(),
            ]);
        }
        match self.gh_json(&context, args, 30_000).await {
            Ok(raw) => {
                self.publish_mutation(&context, input.number);
                Ok(json!({ "ok": true, "comment": map_comment(&raw, true) }))
            }
            Err(error) => Ok(
                json!({ "ok": false, "error": super::provider_error::stable_message(&error.to_string()) }),
            ),
        }
    }

    pub(crate) async fn add_review_reply(
        &self,
        input: &ReviewReply<'_>,
    ) -> Result<Value, GitHubError> {
        let context = self.context(input.repo, None).await?;
        let Some(repository) = self
            .resolve_repository(&context, input.repository.clone())
            .await?
        else {
            return Ok(
                json!({ "ok": false, "error": "Could not resolve GitHub owner/repo for this repository" }),
            );
        };
        let endpoint = format!(
            "repos/{}/{}/pulls/{}/comments/{}/replies",
            repository.owner, repository.repo, input.number, input.comment_id
        );
        let args = api_args(
            &repository,
            [
                "-X".to_owned(),
                "POST".to_owned(),
                endpoint,
                "--raw-field".to_owned(),
                format!("body={}", input.body),
            ],
        );
        match self.gh_json(&context, args, 30_000).await {
            Ok(raw) => {
                self.publish_mutation(&context, input.number);
                let mut comment = map_comment(&raw, true);
                for (key, value) in [
                    ("threadId", input.thread_id.map(Value::from)),
                    ("path", input.path.map(Value::from)),
                    ("line", input.line.map(Value::from)),
                ] {
                    if comment.get(key).is_none()
                        && let Some(value) = value
                    {
                        comment[key] = value;
                    }
                }
                Ok(json!({ "ok": true, "comment": comment }))
            }
            Err(error) => Ok(
                json!({ "ok": false, "error": super::provider_error::stable_message(&error.to_string()) }),
            ),
        }
    }
}

pub(crate) struct ReviewComment<'a> {
    pub(crate) repo: &'a str,
    pub(crate) number: u64,
    pub(crate) commit_id: &'a str,
    pub(crate) path: &'a str,
    pub(crate) line: u64,
    pub(crate) start_line: Option<u64>,
    pub(crate) body: &'a str,
}

pub(crate) struct ReviewReply<'a> {
    pub(crate) repo: &'a str,
    pub(crate) number: u64,
    pub(crate) comment_id: u64,
    pub(crate) body: &'a str,
    pub(crate) thread_id: Option<&'a str>,
    pub(crate) path: Option<&'a str>,
    pub(crate) line: Option<u64>,
    pub(crate) repository: Option<GitHubRepository>,
}

pub(super) fn map_comment(raw: &Value, inline: bool) -> Value {
    let user = raw.get("user");
    let mut output = json!({
        "id": raw.get("id").and_then(Value::as_u64).unwrap_or(0),
        "author": user.and_then(|value| value.get("login")).and_then(Value::as_str).unwrap_or("ghost"),
        "authorAvatarUrl": user.and_then(|value| value.get("avatar_url")).and_then(Value::as_str).unwrap_or(""),
        "body": raw.get("body").and_then(Value::as_str).unwrap_or(""),
        "createdAt": raw.get("created_at").or_else(|| raw.get("submitted_at")).and_then(Value::as_str).unwrap_or(""),
        "url": raw.get("html_url").and_then(Value::as_str).unwrap_or(""),
        "isBot": user.and_then(|value| value.get("type")).and_then(Value::as_str) == Some("Bot")
    });
    if inline {
        if let Some(path) = raw.get("path") {
            output["path"] = path.clone()
        }
        if let Some(line) = raw.get("line").or_else(|| raw.get("original_line")) {
            output["line"] = line.clone()
        }
        if let Some(line) = raw
            .get("start_line")
            .or_else(|| raw.get("original_start_line"))
        {
            output["startLine"] = line.clone()
        }
        output["isOutdated"] = json!(raw.get("line").is_some_and(Value::is_null));
    }
    output
}
