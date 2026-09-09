mod log;
mod rollup;

use serde_json::{Value, json};

use super::context::api_args;
use super::reads::append_repo;
use super::{GitHubAuthority, GitHubError, GitHubRepository};

impl GitHubAuthority {
    pub(crate) async fn pr_checks(
        &self,
        repo: &str,
        number: u64,
        head_sha: Option<&str>,
        repository: Option<GitHubRepository>,
        no_cache: bool,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let repository = self.resolve_repository(&context, repository).await?;
        if let Some(repository) = &repository {
            if let Ok(Some(checks)) =
                rollup::fetch(self, &context, repository, number, no_cache).await
            {
                return Ok(Value::Array(checks));
            }
            if let Some(head_sha) = head_sha
                && let Some(checks) =
                    rollup::rest(self, &context, repository, head_sha, no_cache).await
            {
                return Ok(Value::Array(checks));
            }
        }
        let mut args = vec![
            "pr".to_owned(),
            "checks".to_owned(),
            number.to_string(),
            "--json".to_owned(),
            "name,state,link".to_owned(),
        ];
        append_repo(&mut args, repository.as_ref());
        match self.gh_json(&context, args, 30_000).await {
            Ok(Value::Array(checks)) => Ok(Value::Array(checks.iter().map(map_check).collect())),
            Err(GitHubError::Command(message))
                if message.to_ascii_lowercase().contains("no checks reported") =>
            {
                Ok(json!([]))
            }
            Err(error) => Err(error),
            Ok(_) => Err(GitHubError::Command(
                "GitHub returned an invalid checks response".to_owned(),
            )),
        }
    }

    pub(crate) async fn check_details(
        &self,
        repo: &str,
        check_run_id: Option<u64>,
        workflow_run_id: Option<u64>,
        check_name: Option<&str>,
        url: Option<&str>,
        repository: Option<GitHubRepository>,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let repository = self.resolve_repository(&context, repository).await?;
        let Some(repository) = repository else {
            return Ok(Value::Null);
        };
        let check = if let Some(id) = check_run_id {
            let endpoint = format!(
                "repos/{}/{}/check-runs/{id}",
                repository.owner, repository.repo
            );
            self.gh_json(&context, api_args(&repository, [endpoint]), 30_000)
                .await
                .ok()
        } else {
            None
        };
        let annotations = if let Some(id) = check_run_id {
            let endpoint = format!(
                "repos/{}/{}/check-runs/{id}/annotations?per_page=20",
                repository.owner, repository.repo
            );
            match self
                .gh_json(&context, api_args(&repository, [endpoint]), 30_000)
                .await
            {
                Ok(Value::Array(values)) => values.iter().map(map_annotation).collect(),
                _ => Vec::new(),
            }
        } else {
            Vec::new()
        };
        let run_id = workflow_run_id.or_else(|| {
            check
                .as_ref()
                .and_then(|value| value.get("details_url"))
                .and_then(Value::as_str)
                .and_then(actions_run_id)
        });
        let mut jobs = if let Some(run_id) = run_id {
            let endpoint = format!(
                "repos/{}/{}/actions/runs/{run_id}/jobs?per_page=100",
                repository.owner, repository.repo
            );
            match self
                .gh_json(&context, api_args(&repository, [endpoint]), 30_000)
                .await
            {
                Ok(value) => map_jobs(&value, check_name),
                Err(_) => Vec::new(),
            }
        } else {
            Vec::new()
        };
        log::attach(self, &context, &repository, &mut jobs).await;
        let output = check.as_ref().and_then(|value| value.get("output"));
        Ok(json!({
            "name": string(check.as_ref(), "name").or(check_name).unwrap_or("Check"),
            "status": string(check.as_ref(), "status"),
            "conclusion": string(check.as_ref(), "conclusion"),
            "url": string(check.as_ref(), "html_url").or(url),
            "detailsUrl": string(check.as_ref(), "details_url").or(url),
            "startedAt": string(check.as_ref(), "started_at"),
            "completedAt": string(check.as_ref(), "completed_at"),
            "title": output.and_then(|value| value.get("title")).and_then(Value::as_str),
            "summary": output.and_then(|value| value.get("summary")).and_then(Value::as_str),
            "text": output.and_then(|value| value.get("text")).and_then(Value::as_str),
            "annotations": annotations, "jobs": jobs
        }))
    }

    pub(crate) async fn rerun_checks(
        &self,
        repo: &str,
        number: u64,
        head_sha: Option<&str>,
        failed_only: bool,
        repository: Option<GitHubRepository>,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let Some(repository) = self.resolve_repository(&context, repository).await? else {
            return Ok(
                json!({ "ok": false, "error": "Could not resolve GitHub owner/repo for this repository" }),
            );
        };
        let checks = self
            .pr_checks(repo, number, head_sha, Some(repository.clone()), true)
            .await?;
        let mut run_ids = checks
            .as_array()
            .into_iter()
            .flatten()
            .filter(|check| !failed_only || is_failed(check.get("conclusion")))
            .filter_map(|check| check.get("workflowRunId").and_then(Value::as_u64))
            .collect::<Vec<_>>();
        run_ids.sort_unstable();
        run_ids.dedup();
        let mut check_ids = checks
            .as_array()
            .into_iter()
            .flatten()
            .filter(|check| !failed_only || is_failed(check.get("conclusion")))
            .filter(|check| check.get("workflowRunId").and_then(Value::as_u64).is_none())
            .filter_map(|check| check.get("checkRunId").and_then(Value::as_u64))
            .collect::<Vec<_>>();
        check_ids.sort_unstable();
        check_ids.dedup();
        if run_ids.is_empty() && check_ids.is_empty() {
            let error = if failed_only {
                "No failed GitHub Actions checks to rerun."
            } else {
                "No rerunnable checks found."
            };
            return Ok(json!({ "ok": false, "error": error }));
        }
        for run_id in &run_ids {
            let action = if failed_only {
                "rerun-failed-jobs"
            } else {
                "rerun"
            };
            let endpoint = format!(
                "repos/{}/{}/actions/runs/{run_id}/{action}",
                repository.owner, repository.repo
            );
            if let Err(error) = self
                .gh(
                    &context,
                    api_args(&repository, ["-X", "POST", &endpoint]),
                    30_000,
                )
                .await
            {
                return Ok(
                    json!({ "ok": false, "error": super::provider_error::stable_message(&error.to_string()) }),
                );
            }
        }
        for check_id in &check_ids {
            let endpoint = format!(
                "repos/{}/{}/check-runs/{check_id}/rerequest",
                repository.owner, repository.repo
            );
            if let Err(error) = self
                .gh(
                    &context,
                    api_args(&repository, ["-X", "POST", &endpoint]),
                    30_000,
                )
                .await
            {
                return Ok(
                    json!({ "ok": false, "error": super::provider_error::stable_message(&error.to_string()) }),
                );
            }
        }
        self.publish_mutation(&context, number);
        Ok(json!({ "ok": true, "count": run_ids.len() + check_ids.len() }))
    }
}

fn map_check(raw: &Value) -> Value {
    let state = raw
        .get("state")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_uppercase();
    let (status, conclusion) = match state.as_str() {
        "SUCCESS" | "PASS" => ("completed", "success"),
        "FAILURE" | "FAIL" | "ERROR" => ("completed", "failure"),
        "CANCELLED" => ("completed", "cancelled"),
        "SKIPPED" => ("completed", "skipped"),
        "NEUTRAL" => ("completed", "neutral"),
        "TIMED_OUT" => ("completed", "timed_out"),
        "QUEUED" | "PENDING" | "EXPECTED" => ("queued", "pending"),
        _ => ("in_progress", "pending"),
    };
    let url = raw.get("link").and_then(Value::as_str);
    let mut output = json!({ "name": raw.get("name").and_then(Value::as_str).unwrap_or("Check"), "status": status, "conclusion": conclusion, "url": url });
    if let Some(run_id) = url.and_then(actions_run_id) {
        output["workflowRunId"] = json!(run_id)
    }
    output
}

fn map_annotation(raw: &Value) -> Value {
    json!({ "path": raw.get("path").and_then(Value::as_str), "startLine": raw.get("start_line").and_then(Value::as_u64), "endLine": raw.get("end_line").and_then(Value::as_u64), "annotationLevel": raw.get("annotation_level").and_then(Value::as_str), "title": raw.get("title").and_then(Value::as_str), "message": raw.get("message").and_then(Value::as_str).unwrap_or(""), "rawDetails": raw.get("raw_details").and_then(Value::as_str) })
}

fn map_jobs(raw: &Value, check_name: Option<&str>) -> Vec<Value> {
    let jobs = raw.get("jobs").and_then(Value::as_array).into_iter().flatten().map(|job| json!({
        "id": job.get("id").and_then(Value::as_u64), "name": job.get("name").and_then(Value::as_str).unwrap_or("Unnamed job"),
        "status": job.get("status").and_then(Value::as_str), "conclusion": job.get("conclusion").and_then(Value::as_str),
        "startedAt": job.get("started_at").and_then(Value::as_str), "completedAt": job.get("completed_at").and_then(Value::as_str),
        "url": job.get("html_url").and_then(Value::as_str), "logTail": Value::Null,
        "steps": job.get("steps").and_then(Value::as_array).into_iter().flatten().map(|step| json!({ "name": step.get("name").and_then(Value::as_str).unwrap_or("Unnamed step"), "status": step.get("status").and_then(Value::as_str), "conclusion": step.get("conclusion").and_then(Value::as_str), "startedAt": step.get("started_at").and_then(Value::as_str), "completedAt": step.get("completed_at").and_then(Value::as_str) })).collect::<Vec<_>>()
    })).collect::<Vec<_>>();
    let exact = jobs
        .iter()
        .filter(|job| job.get("name").and_then(Value::as_str) == check_name)
        .cloned()
        .collect::<Vec<_>>();
    if exact.is_empty() { jobs } else { exact }
}

fn actions_run_id(url: &str) -> Option<u64> {
    url.split_once("/actions/runs/")?
        .1
        .split('/')
        .next()?
        .parse()
        .ok()
}
fn string<'a>(value: Option<&'a Value>, key: &str) -> Option<&'a str> {
    value?.get(key)?.as_str().filter(|value| !value.is_empty())
}
fn is_failed(value: Option<&Value>) -> bool {
    matches!(
        value.and_then(Value::as_str),
        Some("failure" | "cancelled" | "timed_out")
    )
}
