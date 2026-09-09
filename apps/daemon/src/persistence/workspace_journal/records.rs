use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, Transaction};
use serde_json::Value;

use super::{WorkspaceEvent, WorkspaceEventPayload, WorkspaceJournalError, WorkspaceSnapshot};

type WorkspaceEventRow = (i64, String, i64, String, String, i64);

pub(super) fn append_event(
    connection: &mut Connection,
    scope: String,
    kind: String,
    payload: WorkspaceEventPayload,
) -> Result<WorkspaceEvent, WorkspaceJournalError> {
    let transaction = connection
        .transaction()
        .map_err(WorkspaceJournalError::storage)?;
    let occurred_at = i64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(WorkspaceJournalError::storage)?
            .as_millis(),
    )
    .map_err(WorkspaceJournalError::storage)?;
    let event = append_event_in_transaction(&transaction, &scope, &kind, payload, occurred_at)?;
    transaction
        .commit()
        .map_err(WorkspaceJournalError::storage)?;
    Ok(event)
}

pub(super) fn append_events(
    connection: &mut Connection,
    scope: String,
    events: Vec<(String, WorkspaceEventPayload)>,
) -> Result<Vec<WorkspaceEvent>, WorkspaceJournalError> {
    let transaction = connection
        .transaction()
        .map_err(WorkspaceJournalError::storage)?;
    let occurred_at = i64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(WorkspaceJournalError::storage)?
            .as_millis(),
    )
    .map_err(WorkspaceJournalError::storage)?;
    let mut appended = Vec::with_capacity(events.len());
    for (kind, payload) in events {
        appended.push(append_event_in_transaction(
            &transaction,
            &scope,
            &kind,
            payload,
            occurred_at,
        )?);
    }
    transaction
        .commit()
        .map_err(WorkspaceJournalError::storage)?;
    Ok(appended)
}

pub(crate) fn append_event_in_transaction(
    transaction: &Transaction<'_>,
    scope: &str,
    kind: &str,
    payload: WorkspaceEventPayload,
    occurred_at: i64,
) -> Result<WorkspaceEvent, WorkspaceJournalError> {
    let payload_json = serde_json::to_string(&payload).map_err(WorkspaceJournalError::storage)?;
    transaction
        .execute(
            "INSERT INTO workspace_revision(scope, revision)
             VALUES (?1, 0)
             ON CONFLICT(scope) DO NOTHING",
            [scope],
        )
        .map_err(WorkspaceJournalError::storage)?;
    let revision = transaction
        .query_row(
            "UPDATE workspace_revision
             SET revision = revision + 1
             WHERE scope = ?1
             RETURNING revision",
            [scope],
            |row| row.get(0),
        )
        .optional()
        .map_err(WorkspaceJournalError::storage)?
        .ok_or(WorkspaceJournalError::RevisionUnavailable)?;
    let id = transaction
        .query_row(
            "INSERT INTO workspace_event(scope, revision, kind, payload, occurred_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             RETURNING id",
            rusqlite::params![scope, revision, kind, payload_json, occurred_at],
            |row| row.get(0),
        )
        .optional()
        .map_err(WorkspaceJournalError::storage)?
        .ok_or(WorkspaceJournalError::EventInsertFailed)?;
    Ok(WorkspaceEvent {
        id,
        kind: kind.to_owned(),
        occurred_at,
        payload,
        revision,
        scope: scope.to_owned(),
    })
}

pub(super) fn read_snapshot(
    connection: &mut Connection,
    scope: &str,
    after_id: i64,
    limit: usize,
) -> Result<WorkspaceSnapshot, WorkspaceJournalError> {
    let transaction = connection
        .transaction()
        .map_err(WorkspaceJournalError::storage)?;
    let events = read_events(&transaction, scope, after_id, None, limit)?;
    let latest_id = transaction
        .query_row(
            "SELECT MAX(id) FROM workspace_event WHERE scope = ?1",
            [scope],
            |row| row.get::<_, Option<i64>>(0),
        )
        .map_err(WorkspaceJournalError::storage)?
        .unwrap_or(0);
    let revision = read_revision(&transaction, scope)?;
    transaction
        .commit()
        .map_err(WorkspaceJournalError::storage)?;
    Ok(WorkspaceSnapshot {
        events,
        latest_id,
        revision,
    })
}

pub(crate) fn read_revision(
    connection: &Connection,
    scope: &str,
) -> Result<i64, WorkspaceJournalError> {
    connection
        .query_row(
            "SELECT revision FROM workspace_revision WHERE scope = ?1",
            [scope],
            |row| row.get(0),
        )
        .optional()
        .map_err(WorkspaceJournalError::storage)
        .map(|revision| revision.unwrap_or(0))
}

pub(super) fn count_since(
    connection: &Connection,
    scope: &str,
    occurred_after: i64,
) -> Result<usize, WorkspaceJournalError> {
    let count = connection
        .query_row(
            "SELECT COUNT(*) FROM workspace_event WHERE scope = ?1 AND occurred_at > ?2",
            rusqlite::params![scope, occurred_after],
            |row| row.get::<_, i64>(0),
        )
        .map_err(WorkspaceJournalError::storage)?;
    usize::try_from(count).map_err(WorkspaceJournalError::storage)
}

pub(super) fn read_replay_page(
    connection: &Connection,
    scope: &str,
    after_id: i64,
    through_id: i64,
    limit: usize,
) -> Result<Vec<WorkspaceEvent>, WorkspaceJournalError> {
    read_events(connection, scope, after_id, Some(through_id), limit)
}

fn read_events(
    connection: &Connection,
    scope: &str,
    after_id: i64,
    through_id: Option<i64>,
    limit: usize,
) -> Result<Vec<WorkspaceEvent>, WorkspaceJournalError> {
    let limit = i64::try_from(limit).map_err(WorkspaceJournalError::storage)?;
    let mut statement = match through_id {
        Some(_) => connection.prepare(
            "SELECT id, scope, revision, kind, payload, occurred_at
             FROM workspace_event
             WHERE scope = ?1 AND id > ?2 AND id <= ?3
             ORDER BY id ASC
             LIMIT ?4",
        ),
        None => connection.prepare(
            "SELECT id, scope, revision, kind, payload, occurred_at
             FROM workspace_event
             WHERE scope = ?1 AND id > ?2
             ORDER BY id ASC
             LIMIT ?3",
        ),
    }
    .map_err(WorkspaceJournalError::storage)?;
    let rows = match through_id {
        Some(through_id) => statement.query_map(
            rusqlite::params![scope, after_id, through_id, limit],
            read_event_row,
        ),
        None => statement.query_map(rusqlite::params![scope, after_id, limit], read_event_row),
    }
    .map_err(WorkspaceJournalError::storage)?;
    rows.map(|row| {
        let (id, scope, revision, kind, payload, occurred_at) =
            row.map_err(WorkspaceJournalError::storage)?;
        Ok(WorkspaceEvent {
            id,
            kind,
            occurred_at,
            payload: parse_payload(&payload)?,
            revision,
            scope,
        })
    })
    .collect()
}

fn read_event_row(row: &rusqlite::Row<'_>) -> Result<WorkspaceEventRow, rusqlite::Error> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
    ))
}

fn parse_payload(serialized: &str) -> Result<WorkspaceEventPayload, WorkspaceJournalError> {
    let value: Value = serde_json::from_str(serialized).map_err(WorkspaceJournalError::storage)?;
    let Value::Object(mut payload) = value else {
        return Ok(WorkspaceEventPayload::new());
    };
    payload.retain(|_, entry| super::is_payload_value(entry));
    Ok(payload)
}
