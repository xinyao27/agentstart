// Why: the shell-state authority answers its cache and onboarding regions as
// `serde_json::Value` trees shared with the legacy JSON surface; this is the
// single place that reads those trees into the typed protobuf wire messages
// and renders protobuf updates back into the patch shapes the authority
// normalizes.
use serde_json::{Map, Value};
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::shell_cache_json_value::Kind as JsonKind;
use yiru_protocol::runtime::v1::shell_onboarding_nullable_number::Value as NullableNumber;
use yiru_protocol::runtime::v1::shell_onboarding_nullable_outcome::Value as NullableOutcome;
use yiru_protocol::runtime::v1::{
    ShellCacheGitHubCache, ShellCacheGitHubEntry, ShellCacheGitHubRecord, ShellCacheJsonNull,
    ShellCacheJsonValue, ShellCacheJsonValueEntry, ShellCacheJsonValueList,
    ShellCacheJsonValueObject, ShellCacheServiceSetGitHubRequest, ShellOnboardingChecklist,
    ShellOnboardingOutcome, ShellOnboardingServiceUpdateRequest, ShellOnboardingState,
};

pub(super) fn github_cache(value: &Value) -> ShellCacheGitHubCache {
    ShellCacheGitHubCache {
        pr: value
            .get("pr")
            .and_then(Value::as_object)
            .map(|entries| {
                entries
                    .iter()
                    .filter_map(|(key, record)| {
                        Some(ShellCacheGitHubEntry {
                            key: key.clone(),
                            value: Some(ShellCacheGitHubRecord {
                                data: Some(json_value(record.get("data")?)),
                                fetched_at: record.get("fetchedAt").and_then(Value::as_f64)?,
                            }),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default(),
    }
}

// Why: the set path renders into the exact `{pr: {key: {data, fetchedAt}}}`
// document `ShellStateAuthority::set_github_cache` normalizes — the one
// shared writer — so a protobuf write cannot bypass the cache's validation.
pub(super) fn github_cache_update_value(
    request: &ShellCacheServiceSetGitHubRequest,
) -> Result<Value, Status> {
    let cache = request
        .cache
        .as_ref()
        .ok_or_else(|| invalid_argument("A GitHub cache document is required"))?;
    let mut pr = Map::new();
    for entry in &cache.pr {
        let record = entry
            .value
            .as_ref()
            .ok_or_else(|| invalid_argument("A GitHub cache entry record is required"))?;
        let data = record
            .data
            .as_ref()
            .ok_or_else(|| invalid_argument("A GitHub cache entry payload is required"))?;
        pr.insert(
            entry.key.clone(),
            serde_json::json!({
                "data": json_value_from_proto(data),
                "fetchedAt": record.fetched_at,
            }),
        );
    }
    Ok(serde_json::json!({ "pr": pr }))
}

pub(super) fn onboarding_state(state: &Value) -> ShellOnboardingState {
    ShellOnboardingState {
        flow_version: number(state.get("flowVersion")).unwrap_or_default(),
        closed_at: state.get("closedAt").and_then(Value::as_f64),
        outcome: match state.get("outcome").and_then(Value::as_str) {
            Some("completed") => Some(ShellOnboardingOutcome::Completed as i32),
            Some("dismissed") => Some(ShellOnboardingOutcome::Dismissed as i32),
            _ => None,
        },
        last_completed_step: number(state.get("lastCompletedStep")).unwrap_or_default(),
        checklist: Some(checklist(state.get("checklist"))),
    }
}

// Why: the update renders into the sparse patch `ShellStateAuthority::
// update_onboarding` sanitizes — the one shared writer — so fields the request
// leaves unset stay untouched exactly like the legacy JSON patch.
pub(super) fn onboarding_update_value(
    request: &ShellOnboardingServiceUpdateRequest,
) -> Result<Value, Status> {
    let mut update = Map::new();
    if let Some(flow_version) = request.flow_version {
        update.insert("flowVersion".to_owned(), Value::from(flow_version));
    }
    if let Some(closed_at) = request.closed_at.as_ref().and_then(|value| value.value) {
        update.insert(
            "closedAt".to_owned(),
            match closed_at {
                NullableNumber::Null(_) => Value::Null,
                NullableNumber::Number(number) => serde_json::Number::from_f64(number)
                    .map(Value::Number)
                    .ok_or_else(|| invalid_argument("closedAt must be a finite number"))?,
            },
        );
    }
    if let Some(outcome) = request.outcome.as_ref().and_then(|value| value.value) {
        // Why: prost stores an enum inside a oneof variant as its raw i32, so
        // the outcome is decoded before it is rendered into the patch.
        let outcome = match outcome {
            NullableOutcome::Null(_) => Value::Null,
            NullableOutcome::Outcome(outcome) => match ShellOnboardingOutcome::try_from(outcome) {
                Ok(ShellOnboardingOutcome::Completed) => Value::String("completed".to_owned()),
                Ok(ShellOnboardingOutcome::Dismissed) => Value::String("dismissed".to_owned()),
                _ => return Err(invalid_argument("outcome is invalid")),
            },
        };
        update.insert("outcome".to_owned(), outcome);
    }
    if let Some(step) = request.last_completed_step {
        update.insert("lastCompletedStep".to_owned(), Value::from(step));
    }
    if let Some(checklist) = request.checklist.as_ref() {
        let mut fields = Map::new();
        let mut insert = |key: &str, value: Option<bool>| {
            if let Some(value) = value {
                fields.insert(key.to_owned(), Value::Bool(value));
            }
        };
        insert("addedRepo", checklist.added_repo);
        insert("choseAgent", checklist.chose_agent);
        insert("ranFirstAgent", checklist.ran_first_agent);
        insert(
            "ranSecondAgentOnSameTask",
            checklist.ran_second_agent_on_same_task,
        );
        insert("triedCmdJ", checklist.tried_cmd_j);
        insert("shapedSidebar", checklist.shaped_sidebar);
        insert("reviewedDiff", checklist.reviewed_diff);
        insert("openedPr", checklist.opened_pr);
        insert("addedFolder", checklist.added_folder);
        insert("openedFile", checklist.opened_file);
        insert("ranAgentOnFile", checklist.ran_agent_on_file);
        insert("dismissed", checklist.dismissed);
        update.insert("checklist".to_owned(), Value::Object(fields));
    }
    Ok(Value::Object(update))
}

fn checklist(value: Option<&Value>) -> ShellOnboardingChecklist {
    let item = |key: &str| {
        value
            .and_then(|value| value.get(key))
            .and_then(Value::as_bool)
            == Some(true)
    };
    ShellOnboardingChecklist {
        added_repo: item("addedRepo"),
        chose_agent: item("choseAgent"),
        ran_first_agent: item("ranFirstAgent"),
        ran_second_agent_on_same_task: item("ranSecondAgentOnSameTask"),
        tried_cmd_j: item("triedCmdJ"),
        shaped_sidebar: item("shapedSidebar"),
        reviewed_diff: item("reviewedDiff"),
        opened_pr: item("openedPr"),
        added_folder: item("addedFolder"),
        opened_file: item("openedFile"),
        ran_agent_on_file: item("ranAgentOnFile"),
        dismissed: item("dismissed"),
    }
}

fn number(value: Option<&Value>) -> Option<i64> {
    value.and_then(Value::as_i64)
}

fn json_value(value: &Value) -> ShellCacheJsonValue {
    let kind = match value {
        Value::Null => JsonKind::NullValue(ShellCacheJsonNull::Value as i32),
        Value::Bool(value) => JsonKind::BoolValue(*value),
        Value::Number(value) => JsonKind::NumberValue(value.as_f64().unwrap_or_default()),
        Value::String(value) => JsonKind::StringValue(value.clone()),
        Value::Array(values) => JsonKind::ListValue(ShellCacheJsonValueList {
            values: values.iter().map(json_value).collect(),
        }),
        Value::Object(object) => JsonKind::ObjectValue(ShellCacheJsonValueObject {
            entries: object
                .iter()
                .map(|(key, value)| ShellCacheJsonValueEntry {
                    key: key.clone(),
                    value: Some(json_value(value)),
                })
                .collect(),
        }),
    };
    ShellCacheJsonValue { kind: Some(kind) }
}

fn json_value_from_proto(value: &ShellCacheJsonValue) -> Value {
    match &value.kind {
        Some(JsonKind::NullValue(_)) | None => Value::Null,
        Some(JsonKind::BoolValue(value)) => Value::Bool(*value),
        Some(JsonKind::NumberValue(value)) => {
            serde_json::Number::from_f64(*value).map_or(Value::Null, Value::Number)
        }
        Some(JsonKind::StringValue(value)) => Value::String(value.clone()),
        Some(JsonKind::ListValue(value)) => {
            Value::Array(value.values.iter().map(json_value_from_proto).collect())
        }
        Some(JsonKind::ObjectValue(value)) => Value::Object(
            value
                .entries
                .iter()
                .filter_map(|entry| {
                    entry
                        .value
                        .as_ref()
                        .map(|value| (entry.key.clone(), json_value_from_proto(value)))
                })
                .collect(),
        ),
    }
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
