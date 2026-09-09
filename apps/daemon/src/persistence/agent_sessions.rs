use rusqlite::OptionalExtension;
use tokio::sync::{mpsc, oneshot};

use super::database::{DatabaseCommand, DatabaseError};

#[derive(Clone)]
pub(crate) struct AgentSessionStore {
    commands: mpsc::Sender<DatabaseCommand>,
}

#[derive(Clone, Debug)]
pub(crate) struct AgentSessionRow {
    pub(crate) agent: String,
    pub(crate) completed_at: Option<i64>,
    pub(crate) created_at: i64,
    pub(crate) id: String,
    pub(crate) phase: String,
    pub(crate) status: String,
    pub(crate) terminal_handle: String,
    pub(crate) title: Option<String>,
    pub(crate) updated_at: i64,
    pub(crate) worktree_id: String,
}

pub(crate) enum AgentSessionRequest {
    List {
        worktree_id: Option<String>,
        response: oneshot::Sender<Result<Vec<AgentSessionRow>, DatabaseError>>,
    },
    Find {
        id: String,
        response: oneshot::Sender<Result<Option<AgentSessionRow>, DatabaseError>>,
    },
    Create {
        row: AgentSessionRow,
        response: oneshot::Sender<Result<(), DatabaseError>>,
    },
    Update {
        id: String,
        phase: String,
        status: String,
        response: oneshot::Sender<Result<Option<AgentSessionRow>, DatabaseError>>,
    },
}

impl AgentSessionStore {
    pub(super) fn new(commands: mpsc::Sender<DatabaseCommand>) -> Self {
        Self { commands }
    }

    pub(crate) async fn list(
        &self,
        worktree_id: Option<&str>,
    ) -> Result<Vec<AgentSessionRow>, DatabaseError> {
        let (response, result) = oneshot::channel();
        self.commands
            .send(DatabaseCommand::AgentSession(AgentSessionRequest::List {
                worktree_id: worktree_id.map(str::to_owned),
                response,
            }))
            .await
            .map_err(|_| DatabaseError::WorkerUnavailable)?;
        result.await.map_err(|_| DatabaseError::WorkerUnavailable)?
    }

    pub(crate) async fn find(&self, id: &str) -> Result<Option<AgentSessionRow>, DatabaseError> {
        let (response, result) = oneshot::channel();
        self.commands
            .send(DatabaseCommand::AgentSession(AgentSessionRequest::Find {
                id: id.to_owned(),
                response,
            }))
            .await
            .map_err(|_| DatabaseError::WorkerUnavailable)?;
        result.await.map_err(|_| DatabaseError::WorkerUnavailable)?
    }

    pub(crate) async fn create(&self, row: AgentSessionRow) -> Result<(), DatabaseError> {
        let (response, result) = oneshot::channel();
        self.commands
            .send(DatabaseCommand::AgentSession(AgentSessionRequest::Create {
                row,
                response,
            }))
            .await
            .map_err(|_| DatabaseError::WorkerUnavailable)?;
        result.await.map_err(|_| DatabaseError::WorkerUnavailable)?
    }

    pub(crate) async fn update(
        &self,
        id: &str,
        phase: &str,
        status: &str,
    ) -> Result<Option<AgentSessionRow>, DatabaseError> {
        let (response, result) = oneshot::channel();
        self.commands
            .send(DatabaseCommand::AgentSession(AgentSessionRequest::Update {
                id: id.to_owned(),
                phase: phase.to_owned(),
                status: status.to_owned(),
                response,
            }))
            .await
            .map_err(|_| DatabaseError::WorkerUnavailable)?;
        result.await.map_err(|_| DatabaseError::WorkerUnavailable)?
    }
}

pub(super) fn handle(connection: &rusqlite::Connection, request: AgentSessionRequest) {
    match request {
        AgentSessionRequest::List {
            worktree_id,
            response,
        } => {
            let result = (|| {
                let mut statement = connection.prepare(
                    "SELECT agent, completed_at, created_at, id, phase, status,
                            terminal_handle, title, updated_at, worktree_id
                     FROM agent_session
                     WHERE (?1 IS NULL OR worktree_id = ?1)
                     ORDER BY updated_at DESC",
                )?;
                let rows = statement
                    .query_map([worktree_id], |row| {
                        Ok(AgentSessionRow {
                            agent: row.get(0)?,
                            completed_at: row.get(1)?,
                            created_at: row.get(2)?,
                            id: row.get(3)?,
                            phase: row.get(4)?,
                            status: row.get(5)?,
                            terminal_handle: row.get(6)?,
                            title: row.get(7)?,
                            updated_at: row.get(8)?,
                            worktree_id: row.get(9)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })();
            let _ = response.send(result);
        }
        AgentSessionRequest::Find { id, response } => {
            let result = connection
                .query_row(
                    "SELECT agent, completed_at, created_at, id, phase, status,
                            terminal_handle, title, updated_at, worktree_id
                     FROM agent_session WHERE id = ?1",
                    [id],
                    |row| {
                        Ok(AgentSessionRow {
                            agent: row.get(0)?,
                            completed_at: row.get(1)?,
                            created_at: row.get(2)?,
                            id: row.get(3)?,
                            phase: row.get(4)?,
                            status: row.get(5)?,
                            terminal_handle: row.get(6)?,
                            title: row.get(7)?,
                            updated_at: row.get(8)?,
                            worktree_id: row.get(9)?,
                        })
                    },
                )
                .optional()
                .map_err(DatabaseError::from);
            let _ = response.send(result);
        }
        AgentSessionRequest::Create { row, response } => {
            let result = connection
                .execute(
                    "INSERT INTO agent_session(
                       id, terminal_handle, worktree_id, agent, phase, status, title,
                       created_at, updated_at, completed_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    rusqlite::params![
                        row.id,
                        row.terminal_handle,
                        row.worktree_id,
                        row.agent,
                        row.phase,
                        row.status,
                        row.title,
                        row.created_at,
                        row.updated_at,
                        row.completed_at,
                    ],
                )
                .map(|_| ())
                .map_err(DatabaseError::from);
            let _ = response.send(result);
        }
        AgentSessionRequest::Update {
            id,
            phase,
            status,
            response,
        } => {
            let now = epoch_millis();
            let result = (|| {
                let updated = connection.execute(
                    "UPDATE agent_session
                     SET phase = ?2, status = ?3, updated_at = ?4, completed_at = ?5
                     WHERE id = ?1",
                    rusqlite::params![id, phase, status, now, (status != "running").then_some(now)],
                )?;
                if updated == 0 {
                    return Ok(None);
                }
                connection
                    .query_row(
                        "SELECT agent, completed_at, created_at, id, phase, status,
                                terminal_handle, title, updated_at, worktree_id
                         FROM agent_session WHERE id = ?1",
                        [id],
                        |row| {
                            Ok(AgentSessionRow {
                                agent: row.get(0)?,
                                completed_at: row.get(1)?,
                                created_at: row.get(2)?,
                                id: row.get(3)?,
                                phase: row.get(4)?,
                                status: row.get(5)?,
                                terminal_handle: row.get(6)?,
                                title: row.get(7)?,
                                updated_at: row.get(8)?,
                                worktree_id: row.get(9)?,
                            })
                        },
                    )
                    .map(Some)
                    .map_err(Into::into)
            })();
            let _ = response.send(result);
        }
    }
}

fn epoch_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_millis()).ok())
        .unwrap_or(0)
}
