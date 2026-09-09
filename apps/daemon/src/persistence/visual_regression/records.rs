use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension};

use super::{
    VisualRegressionCapture, VisualRegressionCaptureRow, VisualRegressionSave,
    VisualRegressionStoreError,
};

pub(super) fn latest(
    connection: &Connection,
    project_id: &str,
    worktree_id: &str,
) -> Result<Option<VisualRegressionCaptureRow>, VisualRegressionStoreError> {
    connection
        .query_row(
            "SELECT id, project_id, worktree_id, page_url, width, height, diff_ratio,
                    image_artifact_id, created_at
             FROM visual_capture
             WHERE project_id = ?1 AND worktree_id = ?2
             ORDER BY created_at DESC
             LIMIT 1",
            rusqlite::params![project_id, worktree_id],
            read_capture_row,
        )
        .optional()
        .map_err(VisualRegressionStoreError::storage)
}

pub(super) fn save(
    connection: &Connection,
    input: VisualRegressionSave,
) -> Result<VisualRegressionCapture, VisualRegressionStoreError> {
    let capture = VisualRegressionCapture {
        created_at: now_millis()?,
        diff_ratio: input.diff_ratio,
        height: input.height,
        id: random_uuid()?,
        image_artifact_id: input.image_artifact_id,
        page_url: input.page_url,
        project_id: input.project_id,
        width: input.width,
        worktree_id: input.worktree_id,
    };
    connection
        .execute(
            "INSERT INTO visual_capture(
               id, project_id, worktree_id, page_url, width, height, diff_ratio,
               image_artifact_id, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                capture.id,
                capture.project_id,
                capture.worktree_id,
                capture.page_url,
                capture.width,
                capture.height,
                capture.diff_ratio,
                capture.image_artifact_id,
                capture.created_at,
            ],
        )
        .map_err(VisualRegressionStoreError::storage)?;
    Ok(capture)
}

pub(super) fn bind_artifact(
    connection: &Connection,
    capture_id: &str,
    image_artifact_id: &str,
) -> Result<(), VisualRegressionStoreError> {
    connection
        .execute(
            "UPDATE visual_capture SET image_artifact_id = ?2 WHERE id = ?1",
            rusqlite::params![capture_id, image_artifact_id],
        )
        .map(|_| ())
        .map_err(VisualRegressionStoreError::storage)
}

fn read_capture_row(
    row: &rusqlite::Row<'_>,
) -> Result<VisualRegressionCaptureRow, rusqlite::Error> {
    Ok(VisualRegressionCaptureRow {
        id: row.get(0)?,
        project_id: row.get(1)?,
        worktree_id: row.get(2)?,
        page_url: row.get(3)?,
        width: row.get(4)?,
        height: row.get(5)?,
        diff_ratio: row.get(6)?,
        image_artifact_id: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn now_millis() -> Result<i64, VisualRegressionStoreError> {
    i64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis())
        .map_err(VisualRegressionStoreError::storage)
}

fn random_uuid() -> Result<String, VisualRegressionStoreError> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes)?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Ok(format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    ))
}
