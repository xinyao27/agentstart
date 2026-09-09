use std::collections::HashSet;

use serde_json::{Map, Value};

use crate::hosts::{ExecutionHost, HostCommand, HostCommandOutput};

use super::super::super::{accumulator, text};
use super::super::ParseError;
use super::model::SqliteRow;

const SQLITE_OUTPUT_MAX_BYTES: usize = 8 * 1024 * 1024;

pub(super) async fn list(
    host: &dyn ExecutionHost,
    db_path: &str,
    limit: usize,
) -> Result<Vec<(String, i64)>, ParseError> {
    let columns = columns(host, db_path, "session").await?;
    if !required_session_columns(&columns) {
        return Ok(Vec::new());
    }
    let parent = if columns.contains("parent_id") {
        " AND parent_id IS NULL"
    } else {
        ""
    };
    let archived = if columns.contains("time_archived") {
        " AND time_archived IS NULL"
    } else {
        ""
    };
    let sql = format!(
        "SELECT id,time_created,time_updated FROM session WHERE 1=1{parent}{archived} ORDER BY time_updated DESC LIMIT {};",
        limit.min(2_000)
    );
    let rows = query(host, db_path, &sql).await?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let row = row.as_object()?;
            let id = text::string(row.get("id"))?;
            let created = row
                .get("time_created")
                .and_then(accumulator::timestamp_ms)
                .unwrap_or(0);
            let updated = row
                .get("time_updated")
                .and_then(accumulator::timestamp_ms)
                .unwrap_or(created);
            Some((id, updated))
        })
        .collect())
}

pub(super) async fn row(
    host: &dyn ExecutionHost,
    db_path: &str,
    session_id: &str,
) -> Result<Option<SqliteRow>, ParseError> {
    let session_columns = columns(host, db_path, "session").await?;
    if !required_session_columns(&session_columns) {
        return Ok(None);
    }
    let escaped = quote(session_id);
    let sql = format!(
        "SELECT {} FROM session WHERE id='{escaped}' LIMIT 1;",
        row_select(&session_columns)
    );
    let rows = query(host, db_path, &sql).await?;
    let Some(record) = rows.first().and_then(Value::as_object) else {
        return Ok(None);
    };
    let mut row = json_row(record);
    consume_messages(host, db_path, session_id, &mut row).await?;
    consume_preview(host, db_path, session_id, &mut row).await?;
    Ok(Some(row))
}

async fn consume_messages(
    host: &dyn ExecutionHost,
    db_path: &str,
    session_id: &str,
    row: &mut SqliteRow,
) -> Result<(), ParseError> {
    let session_messages = columns(host, db_path, "session_message").await?;
    let messages = columns(host, db_path, "message").await?;
    let table = if required_message_columns(&session_messages) {
        "session_message"
    } else if required_message_columns(&messages) {
        "message"
    } else {
        return Ok(());
    };
    let sql = format!(
        "SELECT time_created,data FROM {table} WHERE session_id='{}' ORDER BY time_created,id;",
        quote(session_id)
    );
    for value in query(host, db_path, &sql).await? {
        let Some(value) = value.as_object() else {
            continue;
        };
        let time = value
            .get("time_created")
            .and_then(accumulator::timestamp_ms)
            .unwrap_or(0);
        let Some(data) = text::string(value.get("data")) else {
            continue;
        };
        let Ok(message) = serde_json::from_str::<Value>(&data) else {
            continue;
        };
        let role = text::string(message.get("role"));
        if matches!(role.as_deref(), Some("user" | "assistant")) {
            row.message_count = row.message_count.saturating_add(1)
        }
        if role.as_deref() == Some("assistant") {
            row.usage
                .push((time, message.get("tokens").cloned().unwrap_or(Value::Null)))
        }
    }
    Ok(())
}

async fn consume_preview(
    host: &dyn ExecutionHost,
    db_path: &str,
    session_id: &str,
    row: &mut SqliteRow,
) -> Result<(), ParseError> {
    let messages = columns(host, db_path, "message").await?;
    let parts = columns(host, db_path, "part").await?;
    if !["id", "session_id", "data"]
        .into_iter()
        .all(|name| messages.contains(name))
        || !["message_id", "time_created", "data"]
            .into_iter()
            .all(|name| parts.contains(name))
    {
        return Ok(());
    }
    let sql = format!(
        "SELECT m.data AS message_data,p.data AS part_data,p.time_created FROM message m JOIN part p ON p.message_id=m.id WHERE m.session_id='{}' ORDER BY p.time_created DESC LIMIT 32;",
        quote(session_id)
    );
    for value in query(host, db_path, &sql).await? {
        let Some(value) = value.as_object() else {
            continue;
        };
        let (Some(message_data), Some(part_data)) = (
            text::string(value.get("message_data")),
            text::string(value.get("part_data")),
        ) else {
            continue;
        };
        let (Ok(message), Ok(part)) = (
            serde_json::from_str::<Value>(&message_data),
            serde_json::from_str::<Value>(&part_data),
        ) else {
            continue;
        };
        if text::string(part.get("type")).as_deref() != Some("text") {
            continue;
        }
        let (Some(role), Some(content)) = (
            text::string(message.get("role")),
            text::string(part.get("text")),
        ) else {
            continue;
        };
        let time = value
            .get("time_created")
            .and_then(accumulator::timestamp_ms)
            .unwrap_or(0);
        if matches!(role.as_str(), "user" | "assistant") {
            row.preview.push((role.clone(), time, content))
        }
        if row.title.is_none() && role == "user" {
            row.title = message
                .get("summary")
                .and_then(Value::as_object)
                .and_then(|summary| {
                    text::string(summary.get("title")).or_else(|| text::string(summary.get("body")))
                })
        }
    }
    Ok(())
}

async fn columns(
    host: &dyn ExecutionHost,
    db_path: &str,
    table: &str,
) -> Result<HashSet<String>, ParseError> {
    let rows = query(host, db_path, &format!("PRAGMA table_info({table});")).await?;
    Ok(rows
        .into_iter()
        .filter_map(|row| text::string(row.get("name")))
        .collect())
}

async fn query(
    host: &dyn ExecutionHost,
    db_path: &str,
    sql: &str,
) -> Result<Vec<Value>, ParseError> {
    let mut command = HostCommand::new("sqlite3", ["-readonly", "-json", db_path, sql]);
    command.max_output_bytes = Some(SQLITE_OUTPUT_MAX_BYTES);
    let output = host
        .exec(command)
        .await
        .map_err(|error| ParseError::OpenCode(error.to_string()))?;
    if output.exit_code != 0 {
        return Err(ParseError::OpenCode(command_error(&output)));
    }
    if output.stdout.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&output.stdout).map_err(ParseError::from)
}

fn json_row(row: &Map<String, Value>) -> SqliteRow {
    SqliteRow {
        id: text::string(row.get("id")).unwrap_or_default(),
        title: text::string(row.get("title")),
        cwd: text::string(row.get("directory")),
        created: row
            .get("time_created")
            .and_then(accumulator::timestamp_ms)
            .unwrap_or(0),
        updated: row
            .get("time_updated")
            .and_then(accumulator::timestamp_ms)
            .unwrap_or(0),
        model: text::string(row.get("model")),
        agent: text::string(row.get("agent")),
        input: text::number(row.get("tokens_input")),
        output: text::number(row.get("tokens_output")),
        reasoning: text::number(row.get("tokens_reasoning")),
        cache_read: text::number(row.get("tokens_cache_read")),
        message_count: 0,
        preview: Vec::new(),
        usage: Vec::new(),
    }
}

fn row_select(columns: &HashSet<String>) -> String {
    let optional = |name: &str, fallback: &str| {
        if columns.contains(name) {
            name.to_owned()
        } else {
            fallback.to_owned()
        }
    };
    [
        "id".to_owned(),
        optional("title", "NULL AS title"),
        optional("directory", "NULL AS directory"),
        "time_created".to_owned(),
        "time_updated".to_owned(),
        optional("model", "NULL AS model"),
        optional("agent", "NULL AS agent"),
        optional("tokens_input", "0 AS tokens_input"),
        optional("tokens_output", "0 AS tokens_output"),
        optional("tokens_reasoning", "0 AS tokens_reasoning"),
        optional("tokens_cache_read", "0 AS tokens_cache_read"),
    ]
    .join(",")
}
fn required_session_columns(columns: &HashSet<String>) -> bool {
    ["id", "time_created", "time_updated"]
        .into_iter()
        .all(|name| columns.contains(name))
}
fn required_message_columns(columns: &HashSet<String>) -> bool {
    ["id", "session_id", "time_created", "data"]
        .into_iter()
        .all(|name| columns.contains(name))
}
fn quote(value: &str) -> String {
    value.replace('\'', "''")
}
fn command_error(output: &HostCommandOutput) -> String {
    if output.stderr.trim().is_empty() {
        output.stdout.trim().to_owned()
    } else {
        output.stderr.trim().to_owned()
    }
}
