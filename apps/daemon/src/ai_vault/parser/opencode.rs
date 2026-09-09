mod local;
mod model;
mod remote;

use crate::hosts::{ExecutionHost, HostKind};

use super::super::model::{AiVaultSession, SessionCandidate};
use super::ParseError;

pub(super) async fn parse_sqlite(
    candidate: &SessionCandidate,
    host: &dyn ExecutionHost,
    execution_host_id: &str,
) -> Result<Option<AiVaultSession>, ParseError> {
    let Some((db_path, session_id)) = candidate.path.rsplit_once("#session:") else {
        return Ok(None);
    };
    let row = if host.kind() == HostKind::Local {
        let db_path = db_path.to_owned();
        let session_id = session_id.to_owned();
        tokio::task::spawn_blocking(move || local::row(&db_path, &session_id))
            .await
            .map_err(|error| ParseError::OpenCode(error.to_string()))??
    } else {
        remote::row(host, db_path, session_id).await?
    };
    Ok(row.and_then(|row| model::to_session(candidate, row, execution_host_id, host.platform())))
}

pub(crate) fn list_local(db_path: &str, limit: usize) -> Result<Vec<(String, i64)>, ParseError> {
    local::list(db_path, limit)
}

pub(crate) async fn list_remote(
    host: &dyn ExecutionHost,
    db_path: &str,
    limit: usize,
) -> Result<Vec<(String, i64)>, ParseError> {
    remote::list(host, db_path, limit).await
}
