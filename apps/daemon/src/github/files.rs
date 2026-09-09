mod participants;
mod viewed;

use serde_json::{Value, json};

use super::context::api_args;
use super::{GitHubAuthority, GitHubError};

const MAX_PR_FILES: usize = 300;
const MAX_FILE_BYTES: usize = 2 * 1_024 * 1_024;

impl GitHubAuthority {
    pub(crate) async fn work_item_details(
        &self,
        repo: &str,
        number: u64,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let Some(repository) = self.repository(&context).await? else {
            return Ok(Value::Null);
        };
        let mut item = self
            .work_item(repo, number, Some(repository.clone()))
            .await?;
        if item.is_null() {
            return Ok(Value::Null);
        }
        let endpoint = format!(
            "repos/{}/{}/pulls/{number}",
            repository.owner, repository.repo
        );
        let pr = self
            .gh_json(
                &context,
                api_args(&repository, ["--cache", "60s", &endpoint]),
                30_000,
            )
            .await?;
        let comments = self
            .pr_comments(repo, number, Some(repository.clone()), false)
            .await
            .unwrap_or_else(|_| json!([]));
        let metadata = self
            .merge_metadata(
                &context,
                &repository,
                item.get("baseRefName").and_then(Value::as_str),
            )
            .await;
        super::metadata::apply(&mut item, &metadata);
        let checks = self
            .pr_checks(
                repo,
                number,
                pr.pointer("/head/sha").and_then(Value::as_str),
                Some(repository.clone()),
                false,
            )
            .await
            .unwrap_or_else(|_| json!([]));
        let files_endpoint = format!("{endpoint}/files?per_page=100");
        let files_result = self
            .gh_json(
                &context,
                api_args(&repository, ["--cache", "60s", &files_endpoint]),
                30_000,
            )
            .await;
        let files_unavailable = files_result.is_err();
        let mut files = match files_result {
            Ok(Value::Array(values)) => {
                Value::Array(values.iter().take(MAX_PR_FILES).map(map_file).collect())
            }
            _ => Value::Null,
        };
        let viewed = viewed::fetch(self, &context, &repository, number).await;
        if let Some(viewed) = &viewed {
            viewed.merge(&mut files);
        }
        if item.get("mergeable").and_then(Value::as_str) == Some("CONFLICTING") {
            let conflict_input = json!({
                "baseRefName": item.get("baseRefName"),
                "baseRefOid": pr.pointer("/base/sha"),
                "headRefOid": pr.pointer("/head/sha")
            });
            if let Some(summary) =
                super::reads::conflict_summary(self, &context, &conflict_input).await
            {
                item["conflictSummary"] = summary;
            }
        }
        let participants =
            participants::fetch(self, &context, &repository, number, &item, &comments).await;
        Ok(json!({
            "item": item,
            "body": pr.get("body").and_then(Value::as_str).unwrap_or(""),
            "comments": comments,
            "headSha": pr.pointer("/head/sha").and_then(Value::as_str),
            "baseSha": pr.pointer("/base/sha").and_then(Value::as_str),
            "pullRequestId": viewed.map(|value| value.pull_request_id),
            "checks": checks,
            "files": files,
            "filesUnavailable": files_unavailable,
            "participants": participants,
            "assignees": assignee_logins(&pr)
        }))
    }

    pub(crate) async fn pr_file_contents(
        &self,
        repo: &str,
        path: &str,
        old_path: Option<&str>,
        status: &str,
        head_sha: &str,
        base_sha: &str,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let Some(repository) = self.repository(&context).await? else {
            return Ok(empty_contents(false, false));
        };
        let base_path = old_path.unwrap_or(path);
        let original = if status == "added" {
            FileContent::empty()
        } else {
            self.file_at_ref(&context, &repository, base_path, base_sha)
                .await
        };
        let modified = if status == "removed" {
            FileContent::empty()
        } else {
            self.file_at_ref(&context, &repository, path, head_sha)
                .await
        };
        Ok(json!({
            "original": original.text,
            "modified": modified.text,
            "originalIsBinary": original.binary,
            "modifiedIsBinary": modified.binary,
            "originalTooLarge": original.too_large,
            "modifiedTooLarge": modified.too_large
        }))
    }

    async fn file_at_ref(
        &self,
        context: &super::GitHubContext,
        repository: &super::GitHubRepository,
        path: &str,
        reference: &str,
    ) -> FileContent {
        let encoded_path = path
            .split('/')
            .map(percent_encode)
            .collect::<Vec<_>>()
            .join("/");
        let endpoint = format!(
            "repos/{}/{}/contents/{encoded_path}?ref={}",
            repository.owner,
            repository.repo,
            percent_encode(reference)
        );
        match self
            .gh_bytes(
                context,
                api_args(
                    repository,
                    [
                        endpoint,
                        "-H".to_owned(),
                        "Accept: application/vnd.github.raw".to_owned(),
                    ],
                ),
                30_000,
            )
            .await
        {
            Ok(value) if value.len() > MAX_FILE_BYTES => FileContent {
                text: String::new(),
                binary: false,
                too_large: true,
            },
            Ok(value) if value.contains(&0) || std::str::from_utf8(&value).is_err() => {
                FileContent {
                    text: String::new(),
                    binary: true,
                    too_large: false,
                }
            }
            Ok(value) => FileContent {
                text: String::from_utf8(value).unwrap_or_default(),
                binary: false,
                too_large: false,
            },
            Err(_) => FileContent::empty(),
        }
    }
}

struct FileContent {
    text: String,
    binary: bool,
    too_large: bool,
}
impl FileContent {
    fn empty() -> Self {
        Self {
            text: String::new(),
            binary: false,
            too_large: false,
        }
    }
}

fn empty_contents(original_binary: bool, modified_binary: bool) -> Value {
    json!({ "original": "", "modified": "", "originalIsBinary": original_binary, "modifiedIsBinary": modified_binary })
}

fn map_file(raw: &Value) -> Value {
    let patch = raw.get("patch").and_then(Value::as_str);
    let changes = raw.get("changes").and_then(Value::as_u64).unwrap_or(0);
    json!({
        "path": raw.get("filename").and_then(Value::as_str).unwrap_or(""),
        "oldPath": raw.get("previous_filename").and_then(Value::as_str),
        "status": normalize_status(raw.get("status").and_then(Value::as_str)),
        "additions": raw.get("additions").and_then(Value::as_u64).unwrap_or(0),
        "deletions": raw.get("deletions").and_then(Value::as_u64).unwrap_or(0),
        "isBinary": patch.is_none() && changes > 0,
        "reviewCommentLineNumbers": patch.map(comment_lines).unwrap_or_default()
    })
}

fn normalize_status(status: Option<&str>) -> &str {
    match status {
        Some("added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged") => {
            status.unwrap_or("modified")
        }
        _ => "modified",
    }
}

fn comment_lines(patch: &str) -> Vec<u64> {
    let mut line = 0_u64;
    let mut output = Vec::new();
    for value in patch.lines() {
        if value.starts_with("@@") {
            line = value
                .split('+')
                .nth(1)
                .and_then(|part| part.split([',', ' ']).next())
                .and_then(|part| part.parse().ok())
                .unwrap_or(0);
        } else if value.starts_with('+') && !value.starts_with("+++") {
            output.push(line);
            line += 1
        } else if !value.starts_with('-') {
            line += 1
        }
    }
    output
}

fn assignee_logins(pr: &Value) -> Value {
    Value::Array(
        pr.get("assignees")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|value| value.get("login").and_then(Value::as_str))
            .map(|value| json!(value))
            .collect(),
    )
}

pub(super) fn percent_encode(value: &str) -> String {
    let mut output = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            output.push(char::from(byte))
        } else {
            output.push_str(&format!("%{byte:02X}"))
        }
    }
    output
}
