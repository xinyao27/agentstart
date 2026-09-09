use std::collections::HashSet;

use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde_json::Value;

use super::super::super::text;
use super::super::ParseError;
use super::model::SqliteRow;

pub(super) fn list(db_path: &str, limit: usize) -> Result<Vec<(String, i64)>, ParseError> {
    let connection = open(db_path)?;
    let columns = columns(&connection, "session")?;
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
        "SELECT id,time_created,time_updated FROM session WHERE 1=1{parent}{archived} ORDER BY time_updated DESC LIMIT ?1"
    );
    let mut statement = connection.prepare(&sql).map_err(database_error)?;
    let rows = statement
        .query_map([i64::try_from(limit).unwrap_or(i64::MAX)], |row| {
            let created: i64 = row.get(1)?;
            let updated: i64 = row.get(2)?;
            Ok((row.get(0)?, if updated > 0 { updated } else { created }))
        })
        .map_err(database_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(database_error)
}

pub(super) fn row(db_path: &str, session_id: &str) -> Result<Option<SqliteRow>, ParseError> {
    let connection = open(db_path)?;
    let session_columns = columns(&connection, "session")?;
    if !required_session_columns(&session_columns) {
        return Ok(None);
    }
    let sql = format!(
        "SELECT {} FROM session WHERE id=?1 LIMIT 1",
        row_select(&session_columns)
    );
    let mut row = connection
        .query_row(&sql, [session_id], read_row)
        .optional()
        .map_err(database_error)?;
    let Some(session) = row.as_mut() else {
        return Ok(None);
    };
    consume_messages(&connection, session_id, session)?;
    consume_preview(&connection, session_id, session)?;
    Ok(row)
}

fn consume_messages(
    connection: &Connection,
    session_id: &str,
    row: &mut SqliteRow,
) -> Result<(), ParseError> {
    let message_table = if required_message_columns(&columns(connection, "session_message")?) {
        "session_message"
    } else if required_message_columns(&columns(connection, "message")?) {
        "message"
    } else {
        return Ok(());
    };
    let sql = format!(
        "SELECT time_created,data FROM {message_table} WHERE session_id=?1 ORDER BY time_created,id"
    );
    let mut statement = connection.prepare(&sql).map_err(database_error)?;
    let messages = statement
        .query_map([session_id], |result| {
            Ok((result.get::<_, i64>(0)?, result.get::<_, String>(1)?))
        })
        .map_err(database_error)?;
    for message in messages {
        let (time, data) = message.map_err(database_error)?;
        let Ok(value) = serde_json::from_str::<Value>(&data) else {
            continue;
        };
        let role = text::string(value.get("role"));
        if matches!(role.as_deref(), Some("user" | "assistant")) {
            row.message_count = row.message_count.saturating_add(1);
        }
        if role.as_deref() == Some("assistant") {
            row.usage
                .push((time, value.get("tokens").cloned().unwrap_or(Value::Null)));
        }
    }
    Ok(())
}

fn consume_preview(
    connection: &Connection,
    session_id: &str,
    row: &mut SqliteRow,
) -> Result<(), ParseError> {
    let messages = columns(connection, "message")?;
    let parts = columns(connection, "part")?;
    if !["id", "session_id", "data"]
        .into_iter()
        .all(|name| messages.contains(name))
        || !["message_id", "time_created", "data"]
            .into_iter()
            .all(|name| parts.contains(name))
    {
        return Ok(());
    }
    let mut statement = connection.prepare("SELECT m.data,p.data,p.time_created FROM message m JOIN part p ON p.message_id=m.id WHERE m.session_id=?1 ORDER BY p.time_created DESC LIMIT 32").map_err(database_error)?;
    let values = statement
        .query_map([session_id], |result| {
            Ok((
                result.get::<_, String>(0)?,
                result.get::<_, String>(1)?,
                result.get::<_, i64>(2)?,
            ))
        })
        .map_err(database_error)?;
    for value in values {
        let (message_data, part_data, time) = value.map_err(database_error)?;
        let (Ok(message), Ok(part)) = (
            serde_json::from_str::<Value>(&message_data),
            serde_json::from_str::<Value>(&part_data),
        ) else {
            continue;
        };
        let role = text::string(message.get("role"));
        let content = (text::string(part.get("type")).as_deref() == Some("text"))
            .then(|| text::string(part.get("text")))
            .flatten();
        if let (Some(role), Some(content)) = (role, content) {
            if matches!(role.as_str(), "user" | "assistant") {
                row.preview.push((role.clone(), time, content));
            }
            if row.title.is_none() && role == "user" {
                row.title = message
                    .get("summary")
                    .and_then(Value::as_object)
                    .and_then(|summary| {
                        text::string(summary.get("title"))
                            .or_else(|| text::string(summary.get("body")))
                    });
            }
        }
    }
    Ok(())
}

fn open(path: &str) -> Result<Connection, ParseError> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(database_error)?;
    connection
        .pragma_update(None, "query_only", true)
        .map_err(database_error)?;
    Ok(connection)
}

fn columns(connection: &Connection, table: &str) -> Result<HashSet<String>, ParseError> {
    let mut statement = connection
        .prepare("SELECT name FROM pragma_table_info(?1)")
        .map_err(database_error)?;
    let rows = statement
        .query_map([table], |row| row.get::<_, String>(0))
        .map_err(database_error)?;
    rows.collect::<Result<HashSet<_>, _>>()
        .map_err(database_error)
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
        optional("title", "NULL"),
        optional("directory", "NULL"),
        "time_created".to_owned(),
        "time_updated".to_owned(),
        optional("model", "NULL"),
        optional("agent", "NULL"),
        optional("tokens_input", "0"),
        optional("tokens_output", "0"),
        optional("tokens_reasoning", "0"),
        optional("tokens_cache_read", "0"),
    ]
    .join(",")
}

fn read_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SqliteRow> {
    Ok(SqliteRow {
        id: row.get(0)?,
        title: row.get(1)?,
        cwd: row.get(2)?,
        created: row.get(3)?,
        updated: row.get(4)?,
        model: row.get(5)?,
        agent: row.get(6)?,
        input: nonnegative(row.get::<_, i64>(7)?),
        output: nonnegative(row.get::<_, i64>(8)?),
        reasoning: nonnegative(row.get::<_, i64>(9)?),
        cache_read: nonnegative(row.get::<_, i64>(10)?),
        message_count: 0,
        preview: Vec::new(),
        usage: Vec::new(),
    })
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
fn database_error(error: rusqlite::Error) -> ParseError {
    ParseError::OpenCode(error.to_string())
}
fn nonnegative(value: i64) -> u64 {
    u64::try_from(value).unwrap_or(0)
}
