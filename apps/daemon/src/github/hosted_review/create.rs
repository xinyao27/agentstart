use serde_json::{Value, json};

use crate::hosts::HostFilesystem;

use super::super::GitHubContext;
use super::CreateHostedReview;

pub(super) async fn body(context: &GitHubContext, input: &CreateHostedReview<'_>) -> String {
    let body = input.body.unwrap_or("");
    if !input.use_template || !body.trim().is_empty() {
        return body.to_owned();
    }
    let filesystem = HostFilesystem::new(context.host.clone());
    for candidate in [
        ".github/pull_request_template.md",
        ".github/PULL_REQUEST_TEMPLATE.md",
        "pull_request_template.md",
        "PULL_REQUEST_TEMPLATE.md",
        "docs/pull_request_template.md",
        "docs/PULL_REQUEST_TEMPLATE.md",
    ] {
        let path = filesystem.paths().join(&[&context.path, candidate]);
        if let Ok(Some(body)) = filesystem.read_text(&path, 1024 * 1024).await {
            return body;
        }
    }
    String::new()
}

pub(super) fn error(code: &str, error: &str) -> Value {
    json!({ "ok": false, "code": code, "error": error })
}

pub(super) fn classify_error(message: &str) -> Value {
    let lower = message.to_ascii_lowercase();
    if lower.contains("not logged")
        || lower.contains("not authenticated")
        || lower.contains("authentication")
        || lower.contains("gh auth login")
        || lower.contains("http 401")
    {
        error(
            "auth_required",
            "Create PR failed: GitHub is not authenticated. Next step: run gh auth login in this environment.",
        )
    } else if lower.contains("already exists") {
        error(
            "already_exists",
            "A pull request already exists for this branch.",
        )
    } else if lower.contains("timed out") || lower.contains("timeout") {
        error(
            "unknown_completion",
            "PR creation may have completed. Refreshing branch review state...",
        )
    } else if lower.contains("validation failed") || lower.contains("http 422") {
        error(
            "validation",
            "Create PR failed: GitHub rejected the pull request. Check the base branch and branch state, then try again.",
        )
    } else {
        error(
            "unknown",
            "Create PR failed: GitHub could not create the pull request. Try again in a moment.",
        )
    }
}

pub(super) fn parse_output(output: &str) -> Option<(u64, String)> {
    let trimmed = output.trim();
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        let number = value.get("number").and_then(Value::as_u64);
        let url = value.get("url").and_then(Value::as_str);
        if let (Some(number), Some(url)) = (number, url.filter(|value| !value.is_empty())) {
            return Some((number, url.to_owned()));
        }
    }
    let value = output
        .split_whitespace()
        .find(|value| value.contains("/pull/"))?;
    let number = value
        .split("/pull/")
        .nth(1)?
        .trim_matches(|character: char| !character.is_ascii_digit())
        .parse()
        .ok()?;
    Some((number, value.to_owned()))
}
