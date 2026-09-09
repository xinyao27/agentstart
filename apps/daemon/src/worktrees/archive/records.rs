use rusqlite::{Connection, OptionalExtension, Row, Transaction};

use super::store::{BeginArchive, WorktreeArchive, WorktreeArchiveError};

const ARCHIVE_SELECT: &str =
    "SELECT a.id,p.wire_id,a.original_worktree_id,a.path,a.branch,a.head,a.stash_oid,
            a.status,a.failure_detail,a.created_at,a.restored_at
     FROM worktree_archive a
     JOIN project p ON p.id = a.repo_id";

pub(super) fn begin(
    connection: &mut Connection,
    input: BeginArchive,
) -> Result<WorktreeArchive, WorktreeArchiveError> {
    let transaction = connection
        .transaction()
        .map_err(WorktreeArchiveError::storage)?;
    let id = random_uuid()?;
    transaction
        .execute(
            "INSERT INTO worktree_archive(
               id,repo_id,original_worktree_id,path,branch,head,stash_oid,status,
               failure_detail,created_at,restored_at
             ) VALUES (?1,?2,?3,?4,?5,?6,NULL,'archiving',NULL,?7,NULL)",
            rusqlite::params![
                id,
                input.storage_repo_id,
                input.original_worktree_id,
                input.path,
                input.branch,
                input.head,
                unix_millis(),
            ],
        )
        .map_err(WorktreeArchiveError::storage)?;
    let archive = get_transaction(&transaction, &id)?;
    transaction
        .commit()
        .map_err(WorktreeArchiveError::storage)?;
    Ok(archive)
}

pub(super) fn get(
    connection: &Connection,
    id: &str,
) -> Result<WorktreeArchive, WorktreeArchiveError> {
    query_one(connection, id)
}

pub(super) fn list(
    connection: &Connection,
    storage_repo_id: Option<&str>,
) -> Result<Vec<WorktreeArchive>, WorktreeArchiveError> {
    let sql = match storage_repo_id {
        Some(_) => {
            format!("{ARCHIVE_SELECT} WHERE a.repo_id = ?1 ORDER BY a.created_at DESC, a.id ASC")
        }
        None => format!("{ARCHIVE_SELECT} ORDER BY a.created_at DESC, a.id ASC"),
    };
    let mut statement = connection
        .prepare(&sql)
        .map_err(WorktreeArchiveError::storage)?;
    let mut archives = Vec::new();
    match storage_repo_id {
        Some(storage_repo_id) => {
            let rows = statement
                .query_map([storage_repo_id], decode)
                .map_err(WorktreeArchiveError::storage)?;
            for row in rows {
                archives.push(row.map_err(WorktreeArchiveError::storage)?);
            }
        }
        None => {
            let rows = statement
                .query_map([], decode)
                .map_err(WorktreeArchiveError::storage)?;
            for row in rows {
                archives.push(row.map_err(WorktreeArchiveError::storage)?);
            }
        }
    }
    Ok(archives)
}

pub(super) fn preserve(
    connection: &mut Connection,
    id: &str,
    stash_oid: Option<&str>,
) -> Result<WorktreeArchive, WorktreeArchiveError> {
    transition(
        connection,
        id,
        "UPDATE worktree_archive SET stash_oid=?2 WHERE id=?1",
        stash_oid,
    )
}

pub(super) fn complete(
    connection: &mut Connection,
    id: &str,
    stash_oid: Option<&str>,
) -> Result<WorktreeArchive, WorktreeArchiveError> {
    transition(
        connection,
        id,
        "UPDATE worktree_archive
         SET status='archived',stash_oid=?2,failure_detail=NULL,restored_at=NULL WHERE id=?1",
        stash_oid,
    )
}

pub(super) fn fail(
    connection: &mut Connection,
    id: &str,
    detail: &str,
) -> Result<WorktreeArchive, WorktreeArchiveError> {
    transition(
        connection,
        id,
        "UPDATE worktree_archive SET status='failed',failure_detail=?2 WHERE id=?1",
        Some(detail),
    )
}

pub(super) fn restored(
    connection: &mut Connection,
    id: &str,
) -> Result<WorktreeArchive, WorktreeArchiveError> {
    let transaction = connection
        .transaction()
        .map_err(WorktreeArchiveError::storage)?;
    let changed = transaction
        .execute(
            "UPDATE worktree_archive
             SET status='restored',failure_detail=NULL,restored_at=?2 WHERE id=?1",
            rusqlite::params![id, unix_millis()],
        )
        .map_err(WorktreeArchiveError::storage)?;
    if changed == 0 {
        return Err(WorktreeArchiveError::NotFound);
    }
    let archive = get_transaction(&transaction, id)?;
    transaction
        .commit()
        .map_err(WorktreeArchiveError::storage)?;
    Ok(archive)
}

fn transition<T: rusqlite::ToSql + ?Sized>(
    connection: &mut Connection,
    id: &str,
    sql: &str,
    value: Option<&T>,
) -> Result<WorktreeArchive, WorktreeArchiveError> {
    let transaction = connection
        .transaction()
        .map_err(WorktreeArchiveError::storage)?;
    let changed = transaction
        .execute(sql, rusqlite::params![id, value])
        .map_err(WorktreeArchiveError::storage)?;
    if changed == 0 {
        return Err(WorktreeArchiveError::NotFound);
    }
    let archive = get_transaction(&transaction, id)?;
    transaction
        .commit()
        .map_err(WorktreeArchiveError::storage)?;
    Ok(archive)
}

fn query_one(connection: &Connection, id: &str) -> Result<WorktreeArchive, WorktreeArchiveError> {
    connection
        .query_row(&format!("{ARCHIVE_SELECT} WHERE a.id=?1"), [id], decode)
        .optional()
        .map_err(WorktreeArchiveError::storage)?
        .ok_or(WorktreeArchiveError::NotFound)
}

fn get_transaction(
    transaction: &Transaction<'_>,
    id: &str,
) -> Result<WorktreeArchive, WorktreeArchiveError> {
    transaction
        .query_row(&format!("{ARCHIVE_SELECT} WHERE a.id=?1"), [id], decode)
        .optional()
        .map_err(WorktreeArchiveError::storage)?
        .ok_or(WorktreeArchiveError::NotFound)
}

fn decode(row: &Row<'_>) -> Result<WorktreeArchive, rusqlite::Error> {
    Ok(WorktreeArchive {
        id: row.get(0)?,
        repo_id: row.get(1)?,
        original_worktree_id: row.get(2)?,
        path: row.get(3)?,
        branch: row.get(4)?,
        head: row.get(5)?,
        stash_oid: row.get(6)?,
        status: row.get(7)?,
        failure_detail: row.get(8)?,
        created_at: row.get(9)?,
        restored_at: row.get(10)?,
    })
}

fn random_uuid() -> Result<String, WorktreeArchiveError> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).map_err(WorktreeArchiveError::storage)?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Ok(format!(
        "{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
        u32::from_be_bytes(bytes[0..4].try_into().map_err(|_| {
            WorktreeArchiveError::storage(std::io::Error::other("invalid UUID bytes"))
        })?),
        u16::from_be_bytes(bytes[4..6].try_into().map_err(|_| {
            WorktreeArchiveError::storage(std::io::Error::other("invalid UUID bytes"))
        })?),
        u16::from_be_bytes(bytes[6..8].try_into().map_err(|_| {
            WorktreeArchiveError::storage(std::io::Error::other("invalid UUID bytes"))
        })?),
        u16::from_be_bytes(bytes[8..10].try_into().map_err(|_| {
            WorktreeArchiveError::storage(std::io::Error::other("invalid UUID bytes"))
        })?),
        u64::from_be_bytes([
            0, 0, bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
        ])
    ))
}

fn unix_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_millis()).ok())
        .unwrap_or(i64::MAX)
}
