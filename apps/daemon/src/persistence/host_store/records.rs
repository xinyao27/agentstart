use std::time::{SystemTime, UNIX_EPOCH};
use std::{io, num::TryFromIntError};

use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use serde_json::json;

use super::{HostMutation, HostRecord, HostSnapshot, HostStoreError, RegisteredHostKind};

const HOST_CONFIG_SCOPE: &str = "host-config";

pub(super) fn snapshot(connection: &mut Connection) -> Result<HostSnapshot, HostStoreError> {
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Deferred)?;
    let hosts = list(&transaction)?;
    let revision = read_revision(&transaction)?;
    transaction.commit()?;
    Ok(HostSnapshot { hosts, revision })
}

pub(super) fn find(connection: &mut Connection, id: &str) -> Result<HostRecord, HostStoreError> {
    read_host(connection, id)?.ok_or(HostStoreError::NotFound)
}

pub(super) fn add(
    connection: &mut Connection,
    expected_revision: i64,
    host: HostRecord,
) -> Result<HostMutation, HostStoreError> {
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    assert_revision(&transaction, expected_revision)?;
    transaction.execute(
        "INSERT INTO execution_host(id, kind, label, target, platform, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET label = excluded.label",
        params![
            &host.id,
            host.kind.as_str(),
            &host.label,
            &host.target,
            &host.platform,
            host.created_at
        ],
    )?;
    let revision = append_event(
        &transaction,
        "host.added",
        json!({
            "hostId": host.id,
            "kind": host.kind.as_str(),
            "label": host.label
        }),
    )?;
    transaction.commit()?;
    Ok(HostMutation { revision })
}

pub(super) fn remove(
    connection: &mut Connection,
    expected_revision: i64,
    host_id: &str,
) -> Result<HostMutation, HostStoreError> {
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    assert_revision(&transaction, expected_revision)?;
    if host_has_projects(&transaction, host_id)? {
        return Err(HostStoreError::HasProjects);
    }
    if transaction.execute("DELETE FROM execution_host WHERE id = ?1", [host_id])? != 1 {
        return Err(HostStoreError::NotFound);
    }
    let revision = append_event(&transaction, "host.removed", json!({ "hostId": host_id }))?;
    transaction.commit()?;
    Ok(HostMutation { revision })
}

fn list(connection: &Connection) -> Result<Vec<HostRecord>, HostStoreError> {
    let mut statement = connection.prepare(
        "SELECT id, kind, label, target, platform, created_at
         FROM execution_host ORDER BY created_at ASC",
    )?;
    let rows = statement.query_map([], row)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn read_host(connection: &Connection, id: &str) -> Result<Option<HostRecord>, HostStoreError> {
    connection
        .query_row(
            "SELECT id, kind, label, target, platform, created_at
             FROM execution_host WHERE id = ?1",
            [id],
            row,
        )
        .optional()
        .map_err(Into::into)
}

fn row(row: &rusqlite::Row<'_>) -> Result<HostRecord, rusqlite::Error> {
    let kind = row.get::<_, String>(1)?;
    let kind = RegisteredHostKind::parse(&kind).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            1,
            rusqlite::types::Type::Text,
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("unknown host kind {kind}"),
            )
            .into(),
        )
    })?;
    Ok(HostRecord {
        id: row.get(0)?,
        kind,
        label: row.get(2)?,
        target: row.get(3)?,
        platform: row.get(4)?,
        created_at: row.get(5)?,
    })
}

fn assert_revision(
    transaction: &Transaction<'_>,
    expected_revision: i64,
) -> Result<(), HostStoreError> {
    let actual_revision = read_revision(transaction)?;
    if actual_revision == expected_revision {
        Ok(())
    } else {
        Err(HostStoreError::RevisionConflict {
            actual_revision,
            expected_revision,
            scope: HOST_CONFIG_SCOPE,
        })
    }
}

fn read_revision(connection: &Connection) -> Result<i64, HostStoreError> {
    connection
        .query_row(
            "SELECT revision FROM workspace_revision WHERE scope = ?1",
            [HOST_CONFIG_SCOPE],
            |row| row.get(0),
        )
        .optional()
        .map(|revision| revision.unwrap_or(0))
        .map_err(Into::into)
}

fn append_event(
    transaction: &Transaction<'_>,
    kind: &str,
    payload: serde_json::Value,
) -> Result<i64, HostStoreError> {
    let revision = read_revision(transaction)?
        .checked_add(1)
        .ok_or(HostStoreError::RevisionUnavailable)?;
    transaction.execute(
        "INSERT INTO workspace_revision(scope, revision) VALUES (?1, ?2)
         ON CONFLICT(scope) DO UPDATE SET revision = excluded.revision",
        params![HOST_CONFIG_SCOPE, revision],
    )?;
    transaction.execute(
        "INSERT INTO workspace_event(scope, revision, kind, payload, occurred_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            HOST_CONFIG_SCOPE,
            revision,
            kind,
            serde_json::to_string(&payload)?,
            epoch_millis()?
        ],
    )?;
    Ok(revision)
}

fn host_has_projects(connection: &Connection, host_id: &str) -> Result<bool, HostStoreError> {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM project WHERE host_id = ?1)",
            [host_id],
            |row| row.get(0),
        )
        .map_err(Into::into)
}

fn epoch_millis() -> Result<i64, HostStoreError> {
    let millis = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    i64::try_from(millis).map_err(milliseconds_overflow)
}

fn milliseconds_overflow(error: TryFromIntError) -> HostStoreError {
    HostStoreError::Sqlite(rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}
