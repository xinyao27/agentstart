use rusqlite::{Connection, OptionalExtension, Row, params};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};

use super::OrchestrationError;
use super::schema::LEGACY_RUN_ID;

pub(crate) fn random_prefixed_id(prefix: &str) -> Result<String, OrchestrationError> {
    let mut bytes = [0_u8; 6];
    getrandom::fill(&mut bytes)
        .map_err(|error| OrchestrationError::domain("entropy_unavailable", error.to_string()))?;
    let mut suffix = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write;
        write!(&mut suffix, "{byte:02x}")
            .map_err(|_| OrchestrationError::domain("encoding_failed", "ID encoding failed"))?;
    }
    Ok(format!("{prefix}_{suffix}"))
}

pub(crate) fn capability_hash(capability: &str) -> String {
    let digest = Sha256::digest(capability.as_bytes());
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write;
        let _ = write!(&mut encoded, "{byte:02x}");
    }
    encoded
}

pub(crate) fn run_row(row: &Row<'_>) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "objective": row.get::<_, String>(1)?,
        "home_database": row.get::<_, String>(2)?,
        "coordinator_handle": row.get::<_, Option<String>>(3)?,
        "coordinator_pane_key": row.get::<_, Option<String>>(4)?,
        "consumer_generation": row.get::<_, i64>(5)?,
        "legacy": row.get::<_, i64>(6)?,
        "created_at": expose_timestamp(row.get::<_, String>(7)?),
        "updated_at": expose_timestamp(row.get::<_, String>(8)?),
    }))
}

pub(crate) fn task_row(row: &Row<'_>) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "run_id": row.get::<_, String>(1)?,
        "parent_id": row.get::<_, Option<String>>(2)?,
        "created_by_terminal_handle": row.get::<_, Option<String>>(3)?,
        "task_title": row.get::<_, Option<String>>(4)?,
        "display_name": row.get::<_, Option<String>>(5)?,
        "spec": row.get::<_, String>(6)?,
        "status": row.get::<_, String>(7)?,
        "deps": row.get::<_, String>(8)?,
        "result": row.get::<_, Option<String>>(9)?,
        "created_at": expose_timestamp(row.get::<_, String>(10)?),
        "completed_at": optional_timestamp(row.get::<_, Option<String>>(11)?),
    }))
}

pub(crate) fn dispatch_row(row: &Row<'_>) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "run_id": row.get::<_, String>(1)?,
        "task_id": row.get::<_, String>(2)?,
        "assignee_handle": row.get::<_, Option<String>>(3)?,
        "assignee_pane_key": row.get::<_, Option<String>>(4)?,
        "capability_hash": row.get::<_, Option<String>>(5)?,
        "process_incarnation": row.get::<_, Option<String>>(6)?,
        "capability_revoked_at": optional_timestamp(row.get::<_, Option<String>>(7)?),
        "status": row.get::<_, String>(8)?,
        "failure_count": row.get::<_, i64>(9)?,
        "last_failure": row.get::<_, Option<String>>(10)?,
        "dispatched_at": optional_timestamp(row.get::<_, Option<String>>(11)?),
        "completed_at": optional_timestamp(row.get::<_, Option<String>>(12)?),
        "created_at": expose_timestamp(row.get::<_, String>(13)?),
        "last_heartbeat_at": optional_timestamp(row.get::<_, Option<String>>(14)?),
    }))
}

pub(crate) fn message_row(row: &Row<'_>) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "run_id": row.get::<_, String>(1)?,
        "from_handle": row.get::<_, String>(2)?,
        "to_handle": row.get::<_, String>(3)?,
        "subject": row.get::<_, String>(4)?,
        "body": row.get::<_, String>(5)?,
        "type": row.get::<_, String>(6)?,
        "priority": row.get::<_, String>(7)?,
        "thread_id": row.get::<_, Option<String>>(8)?,
        "payload": row.get::<_, Option<String>>(9)?,
        "read": row.get::<_, i64>(10)?,
        "sequence": row.get::<_, i64>(11)?,
        "created_at": expose_timestamp(row.get::<_, String>(12)?),
        "delivered_at": optional_timestamp(row.get::<_, Option<String>>(13)?),
        "sender_pane_key": row.get::<_, Option<String>>(14)?,
    }))
}

pub(crate) fn gate_row(row: &Row<'_>) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "run_id": row.get::<_, String>(1)?,
        "task_id": row.get::<_, String>(2)?,
        "question": row.get::<_, String>(3)?,
        "options": row.get::<_, String>(4)?,
        "status": row.get::<_, String>(5)?,
        "resolution": row.get::<_, Option<String>>(6)?,
        "created_at": expose_timestamp(row.get::<_, String>(7)?),
        "resolved_at": optional_timestamp(row.get::<_, Option<String>>(8)?),
    }))
}

pub(crate) fn question_row(row: &Row<'_>) -> rusqlite::Result<Value> {
    Ok(json!({
        "message_id": row.get::<_, String>(0)?,
        "run_id": row.get::<_, String>(1)?,
        "dispatch_id": row.get::<_, String>(2)?,
        "asker_handle": row.get::<_, String>(3)?,
        "status": row.get::<_, String>(4)?,
        "answer_message_id": row.get::<_, Option<String>>(5)?,
        "answer_body": row.get::<_, Option<String>>(6)?,
        "answered_by_generation": row.get::<_, Option<i64>>(7)?,
        "created_at": expose_timestamp(row.get::<_, String>(8)?),
        "answered_at": optional_timestamp(row.get::<_, Option<String>>(9)?),
        "closed_at": optional_timestamp(row.get::<_, Option<String>>(10)?),
    }))
}

pub(crate) fn find_run(
    connection: &Connection,
    id: &str,
) -> Result<Option<Value>, OrchestrationError> {
    connection
        .query_row(
            "SELECT id,objective,home_database,coordinator_handle,coordinator_pane_key,
                    consumer_generation,legacy,created_at,updated_at FROM runs WHERE id=?1",
            [id],
            run_row,
        )
        .optional()
        .map_err(Into::into)
}

pub(crate) fn find_task(
    connection: &Connection,
    id: &str,
) -> Result<Option<Value>, OrchestrationError> {
    connection
        .query_row(
            "SELECT id,run_id,parent_id,created_by_terminal_handle,task_title,display_name,
                    spec,status,deps,result,created_at,completed_at FROM tasks WHERE id=?1",
            [id],
            task_row,
        )
        .optional()
        .map_err(Into::into)
}

pub(crate) fn find_dispatch(
    connection: &Connection,
    id: &str,
) -> Result<Option<Value>, OrchestrationError> {
    connection
        .query_row(
            "SELECT id,run_id,task_id,assignee_handle,assignee_pane_key,capability_hash,
                    process_incarnation,capability_revoked_at,status,failure_count,last_failure,
                    dispatched_at,completed_at,created_at,last_heartbeat_at
             FROM dispatch_contexts WHERE id=?1",
            [id],
            dispatch_row,
        )
        .optional()
        .map_err(Into::into)
}

pub(crate) fn latest_dispatch_for_task(
    connection: &Connection,
    task_id: &str,
) -> Result<Option<Value>, OrchestrationError> {
    connection
        .query_row(
            "SELECT id,run_id,task_id,assignee_handle,assignee_pane_key,capability_hash,
                    process_incarnation,capability_revoked_at,status,failure_count,last_failure,
                    dispatched_at,completed_at,created_at,last_heartbeat_at
             FROM dispatch_contexts WHERE task_id=?1 ORDER BY rowid DESC LIMIT 1",
            [task_id],
            dispatch_row,
        )
        .optional()
        .map_err(Into::into)
}

pub(crate) fn find_worker(
    connection: &Connection,
    dispatch_id: &str,
) -> Result<Option<Value>, OrchestrationError> {
    connection
        .query_row(
            "SELECT dispatch_id,runtime_epoch,state,stage,worktree_id,agent_terminal_handle,
                    effects,residual_resources,start_options,last_error,created_at,updated_at,
                    setup_state
             FROM worker_dispatches WHERE dispatch_id=?1",
            [dispatch_id],
            |row| {
                let effects = row.get::<_, String>(6)?;
                let residual = row.get::<_, String>(7)?;
                let options = row.get::<_, String>(8)?;
                Ok(json!({
                    "dispatch_id": row.get::<_, String>(0)?,
                    "runtime_epoch": row.get::<_, Option<String>>(1)?,
                    "state": row.get::<_, String>(2)?,
                    "stage": row.get::<_, String>(3)?,
                    "worktree_id": row.get::<_, Option<String>>(4)?,
                    "agent_terminal_handle": row.get::<_, Option<String>>(5)?,
                    "setup_state": row.get::<_, String>(12)?,
                    "effects": effects,
                    "residual_resources": residual,
                    "start_options": options,
                    "last_error": row.get::<_, Option<String>>(9)?,
                    "created_at": expose_timestamp(row.get::<_, String>(10)?),
                    "updated_at": expose_timestamp(row.get::<_, String>(11)?),
                    "residualResources": parse_json(&row.get::<_, String>(7)?),
                    "startOptions": parse_json(&row.get::<_, String>(8)?),
                }))
            },
        )
        .optional()
        .map_err(Into::into)
}

pub(crate) fn insert_message(
    connection: &Connection,
    input: &Map<String, Value>,
) -> Result<Value, OrchestrationError> {
    let id = input
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .map(Ok)
        .unwrap_or_else(|| random_prefixed_id("msg"))?;
    let run_id = string(input, "runId").unwrap_or_else(|| LEGACY_RUN_ID.to_owned());
    if find_run(connection, &run_id)?.is_none() {
        return Err(OrchestrationError::domain(
            "run_not_found",
            format!("Run {run_id} was not found."),
        ));
    }
    connection.execute(
        "INSERT INTO messages (
           id,run_id,from_handle,to_handle,subject,body,type,priority,thread_id,payload,sender_pane_key
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![
            id,
            run_id,
            string(input, "from").unwrap_or_else(|| "unknown".to_owned()),
            string(input, "to").unwrap_or_default(),
            string(input, "subject").unwrap_or_default(),
            string(input, "body").unwrap_or_default(),
            string(input, "type").unwrap_or_else(|| "status".to_owned()),
            string(input, "priority").unwrap_or_else(|| "normal".to_owned()),
            string(input, "threadId"),
            string(input, "payload"),
            string(input, "senderPaneKey"),
        ],
    )?;
    connection
        .query_row(
            "SELECT id,run_id,from_handle,to_handle,subject,body,type,priority,thread_id,
                    payload,read,sequence,created_at,delivered_at,sender_pane_key
             FROM messages WHERE id=?1",
            [id],
            message_row,
        )
        .map_err(Into::into)
}

pub(crate) fn list_messages(
    connection: &Connection,
    to: Option<&str>,
    unread_only: bool,
    types: &[String],
    limit: usize,
    ascending: bool,
) -> Result<Vec<Value>, OrchestrationError> {
    let mut sql = String::from(
        "SELECT id,run_id,from_handle,to_handle,subject,body,type,priority,thread_id,
                payload,read,sequence,created_at,delivered_at,sender_pane_key FROM messages",
    );
    let mut clauses = Vec::new();
    if to.is_some() {
        clauses.push("to_handle=:to");
    }
    if unread_only {
        clauses.push("read=0");
    }
    if !types.is_empty() {
        clauses.push("type IN (SELECT value FROM json_each(:types))");
    }
    if !clauses.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&clauses.join(" AND "));
    }
    sql.push_str(if ascending {
        " ORDER BY sequence ASC LIMIT :limit"
    } else {
        " ORDER BY sequence DESC LIMIT :limit"
    });
    let types_json = serde_json::to_string(types)
        .map_err(|error| OrchestrationError::domain("encoding_failed", error.to_string()))?;
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(
        rusqlite::named_params! {
            ":to": to,
            ":types": types_json,
            ":limit": i64::try_from(limit).unwrap_or(i64::MAX),
        },
        message_row,
    )?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub(crate) fn mark_read(connection: &Connection, ids: &[String]) -> Result<(), OrchestrationError> {
    let ids = serde_json::to_string(ids)
        .map_err(|error| OrchestrationError::domain("encoding_failed", error.to_string()))?;
    connection.execute(
        "UPDATE messages SET read=1 WHERE id IN (SELECT value FROM json_each(?1))",
        [ids],
    )?;
    Ok(())
}

pub(crate) fn promote_ready_tasks(
    connection: &Connection,
    completed_id: &str,
) -> Result<(), OrchestrationError> {
    let mut statement = connection.prepare(
        "SELECT id,deps FROM tasks WHERE status='pending' AND deps LIKE '%' || ?1 || '%'",
    )?;
    let candidates = statement
        .query_map([completed_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for (id, deps) in candidates {
        let dependency_ids = serde_json::from_str::<Vec<String>>(&deps).unwrap_or_default();
        if !dependency_ids
            .iter()
            .any(|dependency| dependency == completed_id)
        {
            continue;
        }
        let mut all_complete = true;
        for dependency in dependency_ids {
            let status = connection
                .query_row(
                    "SELECT status FROM tasks WHERE id=?1",
                    [dependency],
                    |row| row.get::<_, String>(0),
                )
                .optional()?;
            if status.as_deref() != Some("completed") {
                all_complete = false;
                break;
            }
        }
        if all_complete {
            connection.execute("UPDATE tasks SET status='ready' WHERE id=?1", [id])?;
        }
    }
    Ok(())
}

pub(crate) fn require_current_run_for_pane(
    connection: &Connection,
    pane_key: &str,
) -> Result<Value, OrchestrationError> {
    let mut statement = connection.prepare(
        "SELECT id,objective,home_database,coordinator_handle,coordinator_pane_key,
                consumer_generation,legacy,created_at,updated_at
         FROM runs WHERE coordinator_pane_key IS NOT NULL AND legacy=0",
    )?;
    let runs = statement
        .query_map([], run_row)?
        .collect::<Result<Vec<_>, _>>()?;
    runs.into_iter()
        .find(|run| {
            run.get("coordinator_pane_key")
                .and_then(Value::as_str)
                .is_some_and(|candidate| pane_keys_match(candidate, pane_key))
        })
        .ok_or_else(|| {
            OrchestrationError::domain(
                "run_required",
                "No active Run is bound to this coordinator terminal.",
            )
        })
}

pub(crate) fn active_dispatch_for_identity(
    connection: &Connection,
    handle: &str,
    pane_key: Option<&str>,
) -> Result<Option<Value>, OrchestrationError> {
    if let Some(dispatch) = connection
        .query_row(
            "SELECT id,run_id,task_id,assignee_handle,assignee_pane_key,capability_hash,
                    process_incarnation,capability_revoked_at,status,failure_count,last_failure,
                    dispatched_at,completed_at,created_at,last_heartbeat_at
             FROM dispatch_contexts
             WHERE assignee_handle=?1 AND status IN ('pending','dispatched') LIMIT 1",
            [handle],
            dispatch_row,
        )
        .optional()?
    {
        return Ok(Some(dispatch));
    }
    let Some(pane_key) = pane_key else {
        return Ok(None);
    };
    let mut statement = connection.prepare(
        "SELECT id,run_id,task_id,assignee_handle,assignee_pane_key,capability_hash,
                process_incarnation,capability_revoked_at,status,failure_count,last_failure,
                dispatched_at,completed_at,created_at,last_heartbeat_at
         FROM dispatch_contexts
         WHERE assignee_pane_key IS NOT NULL AND status IN ('pending','dispatched')",
    )?;
    let dispatches = statement
        .query_map([], dispatch_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(dispatches.into_iter().find(|dispatch| {
        dispatch
            .get("assignee_pane_key")
            .and_then(Value::as_str)
            .is_some_and(|candidate| pane_keys_match(candidate, pane_key))
    }))
}

pub(crate) fn require_string<'a>(
    object: &'a Map<String, Value>,
    key: &str,
) -> Result<&'a str, OrchestrationError> {
    object
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| OrchestrationError::domain("invalid_argument", format!("Missing --{key}")))
}

pub(crate) fn string(object: &Map<String, Value>, key: &str) -> Option<String> {
    object
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

pub(crate) fn object(value: &Value) -> Result<&Map<String, Value>, OrchestrationError> {
    value
        .as_object()
        .ok_or_else(|| OrchestrationError::domain("invalid_argument", "Input must be an object."))
}

pub(crate) fn value_string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned)
}

pub(crate) fn value_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(Value::as_i64)
}

pub(crate) fn pane_keys_match(left: &str, right: &str) -> bool {
    if left == right {
        return true;
    }
    match (left.split_once(':'), right.split_once(':')) {
        (Some((_, left_leaf)), Some((_, right_leaf))) => left_leaf == right_leaf,
        _ => false,
    }
}

pub(crate) fn parse_json(value: &str) -> Value {
    serde_json::from_str(value).unwrap_or(Value::Null)
}

fn expose_timestamp(value: String) -> String {
    if value.len() >= 19
        && value.as_bytes().get(4) == Some(&b'-')
        && value.as_bytes().get(10) == Some(&b' ')
    {
        format!("{}Z", value.replacen(' ', "T", 1))
    } else {
        value
    }
}

fn optional_timestamp(value: Option<String>) -> Value {
    value
        .map(expose_timestamp)
        .map(Value::String)
        .unwrap_or(Value::Null)
}
