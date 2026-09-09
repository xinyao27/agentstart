use super::{
    super::ProviderUsageError,
    events::{self, Event, Row},
};
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use std::{collections::HashSet, path::Path};

pub(super) fn visit(
    path: &Path,
    remaining: &mut usize,
    remaining_bytes: &mut usize,
    mut accept: impl FnMut(Event) -> Result<(), ProviderUsageError>,
) -> Result<(), ProviderUsageError> {
    let db = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(error)?;
    db.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(error)?;
    db.execute_batch("PRAGMA query_only=ON; BEGIN")
        .map_err(error)?;
    if !table(&db, "session")? {
        return Ok(());
    }
    let join = if table(&db, "project")? && column(&db, "session", "project_id")? {
        "LEFT JOIN project p ON p.id=s.project_id"
    } else {
        "LEFT JOIN (SELECT NULL AS id,NULL AS worktree) p ON 1=0"
    };
    let model = if column(&db, "session", "model")? {
        "s.model"
    } else {
        "NULL"
    };
    let mut modern_sessions = HashSet::new();
    if table(&db, "session_message")? {
        let predicate = if column(&db, "session_message", "type")? {
            "sm.type='assistant' AND EXISTS (SELECT 1 FROM session_message WHERE type='assistant' AND json_valid(data) AND json_extract(data,'$.tokens.input') IS NOT NULL)"
        } else {
            "json_valid(sm.data) AND json_extract(sm.data,'$.tokens.input') IS NOT NULL"
        };
        let query = format!(
            "SELECT sm.session_id,sm.time_created,sm.time_updated,sm.data,s.directory,p.worktree,{model},NULL,0 FROM session_message sm JOIN session s ON s.id=sm.session_id {join} WHERE {predicate} ORDER BY sm.time_created,sm.id"
        );
        rows(&db, &query, remaining, remaining_bytes, |row| {
            modern_sessions.insert(row.session_id.clone());
            if let Some(event) = events::parse(row) {
                accept(event)?;
            }
            Ok(())
        })?;
    }
    if table(&db, "message")? {
        let has_part = table(&db, "part")?;
        let parts = if has_part {
            "LEFT JOIN part part_row ON part_row.message_id=m.id"
        } else {
            ""
        };
        let predicate = "json_valid(part_row.data) AND json_extract(part_row.data,'$.type')='step-finish' AND json_type(part_row.data,'$.cost') IN ('integer','real')";
        let costs = if has_part {
            format!(
                "CASE WHEN COUNT(CASE WHEN {predicate} THEN 1 END)>0 THEN SUM(CASE WHEN {predicate} THEN CAST(json_extract(part_row.data,'$.cost') AS REAL) ELSE 0 END) ELSE NULL END,CASE WHEN COUNT(CASE WHEN {predicate} THEN 1 END)>0 THEN 1 ELSE 0 END"
            )
        } else {
            "NULL,0".to_owned()
        };
        let group = if has_part {
            format!(
                "GROUP BY m.id,m.session_id,m.time_created,m.time_updated,m.data,s.directory,p.worktree,{model}"
            )
        } else {
            String::new()
        };
        let query = format!(
            "SELECT m.session_id,m.time_created,m.time_updated,m.data,s.directory,p.worktree,{model},{costs} FROM message m JOIN session s ON s.id=m.session_id {join} {parts} WHERE json_valid(m.data) AND json_extract(m.data,'$.role')='assistant' AND json_extract(m.data,'$.tokens.input') IS NOT NULL {group} ORDER BY m.time_created,m.id"
        );
        rows(&db, &query, remaining, remaining_bytes, |row| {
            if !modern_sessions.contains(&row.session_id)
                && let Some(event) = events::parse(row)
            {
                accept(event)?;
            }
            Ok(())
        })?;
    }
    Ok(())
}
fn rows(
    db: &Connection,
    query: &str,
    remaining: &mut usize,
    remaining_bytes: &mut usize,
    mut accept: impl FnMut(Row) -> Result<(), ProviderUsageError>,
) -> Result<(), ProviderUsageError> {
    let mut statement = db.prepare(query).map_err(error)?;
    let mut rows = statement.query([]).map_err(error)?;
    while let Some(row) = rows.next().map_err(error)? {
        if *remaining == 0 {
            return Err(ProviderUsageError::Scan(
                "OpenCode message limit exceeded".to_owned(),
            ));
        }
        *remaining -= 1;
        let bytes = row
            .get_ref(3)
            .map_err(error)?
            .as_str()
            .map_err(|e| ProviderUsageError::Scan(e.to_string()))?
            .len();
        if bytes > 8 * 1024 * 1024 || bytes > *remaining_bytes {
            return Err(ProviderUsageError::Scan(
                "OpenCode message size limit exceeded".to_owned(),
            ));
        }
        *remaining_bytes -= bytes;
        accept(Row {
            session_id: row.get(0).map_err(error)?,
            created: row.get(1).map_err(error)?,
            updated: row.get(2).map_err(error)?,
            data: row.get(3).map_err(error)?,
            directory: row.get(4).map_err(error)?,
            worktree: row.get(5).map_err(error)?,
            session_model: row.get(6).map_err(error)?,
            cost_override: row.get(7).map_err(error)?,
            has_step_finish: row.get::<_, i64>(8).map_err(error)? != 0,
        })?;
    }
    Ok(())
}
fn table(db: &Connection, name: &str) -> Result<bool, ProviderUsageError> {
    db.query_row(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        [name],
        |r| r.get::<_, i64>(0),
    )
    .optional()
    .map(|v| v.is_some())
    .map_err(error)
}
fn column(db: &Connection, table: &str, name: &str) -> Result<bool, ProviderUsageError> {
    let mut statement = db
        .prepare("SELECT name FROM pragma_table_info(?)")
        .map_err(error)?;
    let columns = statement
        .query_map([table], |r| r.get::<_, String>(0))
        .map_err(error)?;
    for column in columns {
        if column.map_err(error)? == name {
            return Ok(true);
        }
    }
    Ok(false)
}
fn error(error: rusqlite::Error) -> ProviderUsageError {
    ProviderUsageError::Scan(format!("OpenCode database: {error}"))
}
