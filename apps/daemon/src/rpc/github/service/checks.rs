use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    GitHubCheckAnnotation, GitHubCheckConclusion, GitHubCheckDetails, GitHubCheckEntry,
    GitHubCheckJob, GitHubCheckJobStep, GitHubCheckRunStatus,
    GitHubServiceGetPrCheckDetailsRequest, GitHubServiceGetPrCheckDetailsResponse,
    GitHubServiceGetPrChecksRequest, GitHubServiceGetPrChecksResponse,
    GitHubServiceRerunPrChecksRequest, GitHubServiceRerunPrChecksResponse,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::Value;

use super::mapping;
use crate::rpc::github::GitHubRpc;

pub(in crate::rpc) async fn get_pr_checks(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceGetPrChecksRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .pr_checks(
            repo,
            request.pr_number,
            request.head_sha.as_deref(),
            mapping::repository_from_ref(request.pr_repo),
            request.no_cache,
        )
        .await
        .map_err(mapping::status_from_error)?;
    let checks = value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(check_entry)
        .collect();
    Ok(encode(&GitHubServiceGetPrChecksResponse { checks }))
}

pub(in crate::rpc) async fn get_pr_check_details(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceGetPrCheckDetailsRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .check_details(
            repo,
            request.check_run_id,
            request.workflow_run_id,
            request.check_name.as_deref(),
            request.url.as_deref(),
            mapping::repository_from_ref(request.pr_repo),
        )
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceGetPrCheckDetailsResponse {
        details: check_details(&value),
    }))
}

pub(in crate::rpc) async fn rerun_pr_checks(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceRerunPrChecksRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .rerun_checks(
            repo,
            request.pr_number,
            request.head_sha.as_deref(),
            request.failed_only,
            mapping::repository_from_ref(request.pr_repo),
        )
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceRerunPrChecksResponse {
        ok: value.get("ok").and_then(Value::as_bool).unwrap_or(false),
        error: value
            .get("error")
            .and_then(Value::as_str)
            .map(str::to_owned),
        count: value.get("count").and_then(Value::as_u64),
    }))
}

fn check_run_status(raw: &str) -> GitHubCheckRunStatus {
    match raw {
        "queued" => GitHubCheckRunStatus::Queued,
        "completed" => GitHubCheckRunStatus::Completed,
        _ => GitHubCheckRunStatus::InProgress,
    }
}

fn check_conclusion(raw: &str) -> GitHubCheckConclusion {
    match raw {
        "success" => GitHubCheckConclusion::Success,
        "failure" => GitHubCheckConclusion::Failure,
        "cancelled" => GitHubCheckConclusion::Cancelled,
        "skipped" => GitHubCheckConclusion::Skipped,
        "neutral" => GitHubCheckConclusion::Neutral,
        "timed_out" => GitHubCheckConclusion::TimedOut,
        "action_required" => GitHubCheckConclusion::ActionRequired,
        _ => GitHubCheckConclusion::Pending,
    }
}

pub(super) fn check_entry(raw: &Value) -> Option<GitHubCheckEntry> {
    Some(GitHubCheckEntry {
        name: raw.get("name").and_then(Value::as_str)?.to_owned(),
        status: check_run_status(raw.get("status").and_then(Value::as_str).unwrap_or("")) as i32,
        conclusion: check_conclusion(raw.get("conclusion").and_then(Value::as_str).unwrap_or(""))
            as i32,
        url: raw.get("url").and_then(Value::as_str).map(str::to_owned),
        check_run_id: raw.get("checkRunId").and_then(Value::as_u64),
        workflow_run_id: raw.get("workflowRunId").and_then(Value::as_u64),
    })
}

fn annotation(raw: &Value) -> GitHubCheckAnnotation {
    GitHubCheckAnnotation {
        path: raw.get("path").and_then(Value::as_str).map(str::to_owned),
        start_line: raw.get("startLine").and_then(Value::as_u64),
        end_line: raw.get("endLine").and_then(Value::as_u64),
        annotation_level: raw
            .get("annotationLevel")
            .and_then(Value::as_str)
            .map(str::to_owned),
        title: raw.get("title").and_then(Value::as_str).map(str::to_owned),
        message: raw
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        raw_details: raw
            .get("rawDetails")
            .and_then(Value::as_str)
            .map(str::to_owned),
    }
}

fn job_step(raw: &Value) -> GitHubCheckJobStep {
    GitHubCheckJobStep {
        name: raw
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        status: raw.get("status").and_then(Value::as_str).map(str::to_owned),
        conclusion: raw
            .get("conclusion")
            .and_then(Value::as_str)
            .map(str::to_owned),
        started_at: raw
            .get("startedAt")
            .and_then(Value::as_str)
            .map(str::to_owned),
        completed_at: raw
            .get("completedAt")
            .and_then(Value::as_str)
            .map(str::to_owned),
    }
}

fn check_job(raw: &Value) -> GitHubCheckJob {
    GitHubCheckJob {
        id: raw.get("id").and_then(Value::as_u64),
        name: raw
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        status: raw.get("status").and_then(Value::as_str).map(str::to_owned),
        conclusion: raw
            .get("conclusion")
            .and_then(Value::as_str)
            .map(str::to_owned),
        started_at: raw
            .get("startedAt")
            .and_then(Value::as_str)
            .map(str::to_owned),
        completed_at: raw
            .get("completedAt")
            .and_then(Value::as_str)
            .map(str::to_owned),
        url: raw.get("url").and_then(Value::as_str).map(str::to_owned),
        log_tail: raw
            .get("logTail")
            .and_then(Value::as_str)
            .map(str::to_owned),
        steps: raw
            .get("steps")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(job_step)
            .collect(),
    }
}

pub(super) fn check_details(raw: &Value) -> Option<GitHubCheckDetails> {
    if raw.is_null() {
        return None;
    }
    Some(GitHubCheckDetails {
        name: raw
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("Check")
            .to_owned(),
        status: raw.get("status").and_then(Value::as_str).map(str::to_owned),
        conclusion: raw
            .get("conclusion")
            .and_then(Value::as_str)
            .map(str::to_owned),
        url: raw.get("url").and_then(Value::as_str).map(str::to_owned),
        details_url: raw
            .get("detailsUrl")
            .and_then(Value::as_str)
            .map(str::to_owned),
        started_at: raw
            .get("startedAt")
            .and_then(Value::as_str)
            .map(str::to_owned),
        completed_at: raw
            .get("completedAt")
            .and_then(Value::as_str)
            .map(str::to_owned),
        title: raw.get("title").and_then(Value::as_str).map(str::to_owned),
        summary: raw
            .get("summary")
            .and_then(Value::as_str)
            .map(str::to_owned),
        text: raw.get("text").and_then(Value::as_str).map(str::to_owned),
        annotations: raw
            .get("annotations")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(annotation)
            .collect(),
        jobs: raw
            .get("jobs")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(check_job)
            .collect(),
    })
}
