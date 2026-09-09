use super::projection::WorktreePsSummary;
use serde_json::{Value, json};
use std::collections::HashMap;

const STALE_AFTER_MS: i64 = 30 * 60 * 1000;

pub(super) fn attach(summaries: &mut [WorktreePsSummary], rows: Vec<Value>, now: i64) {
    let indices: HashMap<_, _> = summaries
        .iter()
        .enumerate()
        .map(|(index, summary)| {
            (
                (summary.host_id.clone(), summary.worktree_id.clone()),
                index,
            )
        })
        .collect();
    for source in rows {
        let Some(host) = source.get("hostId").and_then(Value::as_str) else {
            continue;
        };
        let Some(worktree) = source.get("worktreeId").and_then(Value::as_str) else {
            continue;
        };
        let Some(index) = indices.get(&(host.to_owned(), worktree.to_owned())) else {
            continue;
        };
        let summary = &mut summaries[*index];
        let state = source
            .get("state")
            .and_then(Value::as_str)
            .unwrap_or("done");
        let updated_at = source
            .get("receivedAt")
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let started_at = source
            .get("stateStartedAt")
            .and_then(Value::as_i64)
            .unwrap_or(updated_at);
        if state != "done" && now.saturating_sub(updated_at) <= STALE_AFTER_MS {
            summary.has_host_sidebar_activity = true;
            if state == "working" {
                summary.status = "working";
            } else if summary.status != "working" {
                summary.status = "permission";
            }
        }
        summary.agents.push(json!({
            "paneKey": source.get("paneKey"), "parentPaneKey": source.get("parentPaneKey"),
            "state": state, "agentType": source.get("agentType"),
            "prompt": source.get("prompt").and_then(Value::as_str).unwrap_or(""),
            "taskTitle": source.get("taskTitle"), "displayName": source.get("displayName"),
            "lastAssistantMessage": source.get("lastAssistantMessage"),
            "toolName": source.get("toolName"), "toolInput": source.get("toolInput"),
            "interrupted": source.get("interrupted").and_then(Value::as_bool).unwrap_or(false),
            "stateStartedAt": started_at, "updatedAt": updated_at,
        }));
    }
    for summary in summaries {
        summary.agents.sort_by_key(|row| {
            row.get("stateStartedAt")
                .and_then(Value::as_i64)
                .unwrap_or(0)
        });
    }
}
