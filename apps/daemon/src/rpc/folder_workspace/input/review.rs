use serde_json::{Value, json};

use crate::folder_workspaces::LinkedReview;
use crate::rpc::zod_input::{InputIssues, PathSegment, invalid_type_issue, path_json, value_type};

use super::{optional_string, required_at};

pub(super) fn parse(
    value: &Value,
    path: &[PathSegment],
    issues: &mut InputIssues,
) -> Option<LinkedReview> {
    let Some(object) = value.as_object() else {
        issues.push(invalid_type_issue(path, "object", value_type(Some(value))));
        return None;
    };
    let provider = enum_string(
        object.get("provider"),
        path,
        "provider",
        &["github"],
        issues,
    );
    let review_type = enum_string(object.get("type"), path, "type", &["pr"], issues);
    let number_path = extend(path, "number");
    let number = object.get("number").and_then(Value::as_f64).or_else(|| {
        issues.push(invalid_type_issue(
            &number_path,
            "number",
            value_type(object.get("number")),
        ));
        None
    });
    let title = required_at(
        object.get("title"),
        &extend(path, "title"),
        "Missing linked review title",
        issues,
    );
    let url = required_at(
        object.get("url"),
        &extend(path, "url"),
        "Missing linked review URL",
        issues,
    );
    match (provider, review_type, number, title, url) {
        (Some(provider), Some(review_type), Some(number), Some(title), Some(url)) => {
            Some(LinkedReview {
                number,
                provider,
                repo_id: optional_string(object.get("repoId")),
                review_type,
                title,
                url,
            })
        }
        _ => None,
    }
}

pub(super) fn agent(
    value: Option<&Value>,
    path: &[PathSegment],
    issues: &mut InputIssues,
) -> Option<String> {
    match value {
        None => None,
        Some(Value::String(value)) if AGENTS.contains(&value.as_str()) => Some(value.clone()),
        Some(Value::String(_)) => {
            issues.push(json!({"code":"custom","path":path_json(path),"message":"Invalid input"}));
            None
        }
        Some(value) => {
            issues.push(invalid_type_issue(path, "string", value_type(Some(value))));
            None
        }
    }
}

fn enum_string(
    value: Option<&Value>,
    base: &[PathSegment],
    field: &'static str,
    values: &[&str],
    issues: &mut InputIssues,
) -> Option<String> {
    let path = extend(base, field);
    match value.and_then(Value::as_str) {
        Some(value) if values.contains(&value) => Some(value.to_owned()),
        Some(_) => {
            issues.push(json!({"code":"invalid_value","values":values,"path":path_json(&path),"message":format!("Invalid option: expected one of {}", values.iter().map(|value| format!("\"{value}\"")).collect::<Vec<_>>().join("|"))}));
            None
        }
        None => {
            issues.push(invalid_type_issue(&path, "string", value_type(value)));
            None
        }
    }
}

fn extend(path: &[PathSegment], field: &'static str) -> Vec<PathSegment> {
    let mut value = path.to_vec();
    value.push(PathSegment::field(field));
    value
}

const AGENTS: &[&str] = &[
    "claude",
    "openclaude",
    "codex",
    "autohand",
    "opencode",
    "mimo-code",
    "pi",
    "omp",
    "gemini",
    "antigravity",
    "aider",
    "goose",
    "amp",
    "kilo",
    "kiro",
    "crush",
    "aug",
    "cline",
    "codebuff",
    "command-code",
    "continue",
    "cursor",
    "droid",
    "kimi",
    "mistral-vibe",
    "qwen-code",
    "rovo",
    "hermes",
    "openclaw",
    "copilot",
    "grok",
    "devin",
    "ante",
    "trae",
];
