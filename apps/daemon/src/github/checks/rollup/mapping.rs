use serde_json::{Map, Value, json};

use super::super::super::GitHubRepository;
use super::super::actions_run_id;

pub(super) fn check_run(raw: &Value, name: &str) -> Value {
    let status = raw.get("status").and_then(Value::as_str).unwrap_or("");
    let conclusion = raw.get("conclusion").and_then(Value::as_str);
    let url = raw
        .get("detailsUrl")
        .or_else(|| raw.get("details_url"))
        .or_else(|| raw.get("url"))
        .or_else(|| raw.get("html_url"))
        .and_then(Value::as_str);
    let mut output = Map::from_iter([
        ("name".to_owned(), json!(name)),
        ("status".to_owned(), json!(status_value(status))),
        (
            "conclusion".to_owned(),
            conclusion_value(status, conclusion),
        ),
        ("url".to_owned(), json!(url)),
    ]);
    insert_number(
        &mut output,
        "checkRunId",
        raw.get("databaseId").or_else(|| raw.get("id")),
    );
    let workflow = raw
        .pointer("/checkSuite/workflowRun/databaseId")
        .and_then(Value::as_u64)
        .or_else(|| url.and_then(actions_run_id));
    if let Some(workflow) = workflow {
        output.insert("workflowRunId".to_owned(), json!(workflow));
    }
    Value::Object(output)
}

pub(super) fn status(raw: &Value, name: &str) -> Value {
    let state = raw.get("state").and_then(Value::as_str).unwrap_or("");
    let url = raw
        .get("targetUrl")
        .or_else(|| raw.get("target_url"))
        .and_then(Value::as_str);
    let mut output = json!({
        "name": name,
        "status": status_value(state),
        "conclusion": conclusion_value(state, Some(state)),
        "url": url
    });
    if let Some(id) = url.and_then(actions_run_id) {
        output["workflowRunId"] = json!(id);
    }
    output
}

pub(super) fn pending_suite(
    repository: &GitHubRepository,
    raw: &Value,
    head_sha: Option<&str>,
    index: usize,
) -> Value {
    let id = raw
        .get("databaseId")
        .or_else(|| raw.get("id"))
        .and_then(Value::as_u64);
    let name = raw
        .pointer("/app/name")
        .or_else(|| raw.pointer("/app/slug"))
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| id.map(|id| format!("#{id}")))
        .unwrap_or_else(|| format!("{}:{}", head_sha.unwrap_or("check-suite"), index + 1));
    let url = raw
        .get("url")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| {
            head_sha.map(|sha| {
                format!(
                    "https://{}/{}/{}/commits/{sha}/checks{}",
                    repository.host.as_deref().unwrap_or("github.com"),
                    repository.owner,
                    repository.repo,
                    id.map_or_else(String::new, |id| format!("#check-suite-{id}"))
                )
            })
        });
    json!({ "name": name, "status": "completed", "conclusion": "action_required", "url": url })
}

fn status_value(value: &str) -> &'static str {
    match value.to_ascii_lowercase().as_str() {
        "queued" | "pending" | "expected" => "queued",
        "completed" | "success" | "failure" | "error" => "completed",
        _ => "in_progress",
    }
}

fn conclusion_value(status: &str, conclusion: Option<&str>) -> Value {
    let value = conclusion.unwrap_or(status).to_ascii_lowercase();
    let mapped = match value.as_str() {
        "success" => "success",
        "failure" | "error" => "failure",
        "cancelled" => "cancelled",
        "timed_out" => "timed_out",
        "neutral" => "neutral",
        "skipped" => "skipped",
        "action_required" => "action_required",
        _ => "pending",
    };
    json!(mapped)
}

fn insert_number(output: &mut Map<String, Value>, key: &str, value: Option<&Value>) {
    if let Some(value) = value.and_then(Value::as_u64) {
        output.insert(key.to_owned(), json!(value));
    }
}
