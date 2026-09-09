use rusqlite::{Connection, OptionalExtension};

use super::{Artifact, ArtifactStatus, ArtifactStoreError};

type ArtifactRow = (String, String, String, String, i64, String, i64);

pub(super) fn clear_writing(connection: &Connection) -> Result<(), ArtifactStoreError> {
    connection
        .execute("DELETE FROM artifact WHERE status = 'writing'", [])
        .map(|_| ())
        .map_err(ArtifactStoreError::storage)
}

pub(super) fn find(
    connection: &Connection,
    id: &str,
) -> Result<Option<Artifact>, ArtifactStoreError> {
    connection
        .query_row(
            "SELECT id, project_id, file_name, mime_type, byte_length, status, created_at
             FROM artifact
             WHERE id = ?1",
            [id],
            read_artifact,
        )
        .optional()
        .map_err(ArtifactStoreError::storage)?
        .map(hydrate_artifact)
        .transpose()
}

pub(super) fn insert(
    connection: &Connection,
    artifact: &Artifact,
) -> Result<(), ArtifactStoreError> {
    connection
        .execute(
            "INSERT INTO artifact(
               id, project_id, file_name, mime_type, byte_length, status, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'writing', ?6)",
            rusqlite::params![
                artifact.id,
                artifact.project_id,
                artifact.file_name,
                artifact.mime_type,
                artifact.byte_length,
                artifact.created_at,
            ],
        )
        .map(|_| ())
        .map_err(ArtifactStoreError::storage)
}

pub(super) fn update_byte_length(
    connection: &Connection,
    id: &str,
    byte_length: i64,
) -> Result<(), ArtifactStoreError> {
    connection
        .execute(
            "UPDATE artifact SET byte_length = ?2 WHERE id = ?1 AND status = 'writing'",
            rusqlite::params![id, byte_length],
        )
        .map(|_| ())
        .map_err(ArtifactStoreError::storage)
}

pub(super) fn mark_ready(connection: &Connection, id: &str) -> Result<(), ArtifactStoreError> {
    connection
        .execute(
            "UPDATE artifact SET status = 'ready' WHERE id = ?1 AND status = 'writing'",
            [id],
        )
        .map(|_| ())
        .map_err(ArtifactStoreError::storage)
}

pub(super) fn remove_writing(connection: &Connection, id: &str) -> Result<(), ArtifactStoreError> {
    connection
        .execute(
            "DELETE FROM artifact WHERE id = ?1 AND status = 'writing'",
            [id],
        )
        .map(|_| ())
        .map_err(ArtifactStoreError::storage)
}

fn read_artifact(row: &rusqlite::Row<'_>) -> Result<ArtifactRow, rusqlite::Error> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
    ))
}

fn hydrate_artifact(row: ArtifactRow) -> Result<Artifact, ArtifactStoreError> {
    let (id, project_id, file_name, mime_type, byte_length, status, created_at) = row;
    let status = match status.as_str() {
        "ready" => ArtifactStatus::Ready,
        "writing" => ArtifactStatus::Writing,
        _ => return Err(ArtifactStoreError::InvalidStatus(status)),
    };
    Ok(Artifact {
        byte_length,
        created_at,
        file_name,
        id,
        mime_type,
        project_id,
        status,
    })
}
