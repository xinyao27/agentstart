use rusqlite::Connection;

use super::OrchestrationError;

pub(super) const LEGACY_RUN_ID: &str = "run_legacy_local";
const SCHEMA_VERSION: i64 = 18;

pub(super) fn migrate(connection: &mut Connection) -> Result<(), OrchestrationError> {
    let stored_version =
        connection.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))?;
    if stored_version > SCHEMA_VERSION {
        return Err(OrchestrationError::domain(
            "database_version_unsupported",
            format!(
                "Orchestration database schema {stored_version} is newer than supported schema {SCHEMA_VERSION}."
            ),
        ));
    }
    let transaction = connection.transaction()?;
    repair_legacy_tables(&transaction)?;
    transaction.execute_batch(SCHEMA)?;
    transaction.execute(
        "INSERT OR IGNORE INTO runs (
           id, objective, home_database, consumer_generation, legacy
         ) VALUES (?1, 'Legacy orchestration state (inspect only)', 'this_database', 0, 1)",
        [LEGACY_RUN_ID],
    )?;
    transaction.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    transaction.commit()?;
    Ok(())
}

fn repair_legacy_tables(connection: &Connection) -> Result<(), OrchestrationError> {
    if table_exists(connection, "messages")? {
        add_column(
            connection,
            "messages",
            "run_id",
            "TEXT NOT NULL DEFAULT 'run_legacy_local'",
        )?;
        add_column(connection, "messages", "delivered_at", "TEXT")?;
        add_column(connection, "messages", "sender_pane_key", "TEXT")?;
        let sql = connection.query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='messages'",
            [],
            |row| row.get::<_, String>(0),
        )?;
        if !sql.contains("'question'") || !sql.contains("'heartbeat'") {
            rebuild_messages(connection)?;
        }
    }
    for (column, declaration) in [
        ("created_by_terminal_handle", "TEXT"),
        ("task_title", "TEXT"),
        ("display_name", "TEXT"),
        ("run_id", "TEXT NOT NULL DEFAULT 'run_legacy_local'"),
    ] {
        add_column(connection, "tasks", column, declaration)?;
    }
    for (column, declaration) in [
        ("run_id", "TEXT NOT NULL DEFAULT 'run_legacy_local'"),
        ("assignee_pane_key", "TEXT"),
        ("capability_hash", "TEXT"),
        ("process_incarnation", "TEXT"),
        ("capability_revoked_at", "TEXT"),
        ("last_heartbeat_at", "TEXT"),
    ] {
        add_column(connection, "dispatch_contexts", column, declaration)?;
    }
    add_column(
        connection,
        "decision_gates",
        "run_id",
        "TEXT NOT NULL DEFAULT 'run_legacy_local'",
    )?;
    add_column(connection, "question_threads", "run_id", "TEXT")?;
    add_column(connection, "worker_dispatches", "runtime_epoch", "TEXT")?;
    add_column(
        connection,
        "federated_dispatches",
        "to_home_imported_sequence",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_column(
        connection,
        "remote_dispatch_attachments",
        "to_worker_imported_sequence",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_column(
        connection,
        "remote_dispatch_attachments",
        "protocol_version",
        "INTEGER NOT NULL DEFAULT 1",
    )?;
    Ok(())
}

fn table_exists(connection: &Connection, table: &str) -> Result<bool, OrchestrationError> {
    let count = connection.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
        [table],
        |row| row.get::<_, i64>(0),
    )?;
    Ok(count == 1)
}

fn add_column(
    connection: &Connection,
    table: &'static str,
    column: &'static str,
    declaration: &'static str,
) -> Result<(), OrchestrationError> {
    if !table_exists(connection, table)? || has_column(connection, table, column)? {
        return Ok(());
    }
    connection.execute_batch(&format!(
        "ALTER TABLE {table} ADD COLUMN {column} {declaration}"
    ))?;
    Ok(())
}

fn has_column(
    connection: &Connection,
    table: &str,
    column: &str,
) -> Result<bool, OrchestrationError> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(columns.iter().any(|candidate| candidate == column))
}

fn rebuild_messages(connection: &Connection) -> Result<(), OrchestrationError> {
    connection.execute_batch(
        "CREATE TABLE messages_new (
           id TEXT NOT NULL,
           run_id TEXT NOT NULL DEFAULT 'run_legacy_local',
           from_handle TEXT NOT NULL,
           to_handle TEXT NOT NULL,
           subject TEXT NOT NULL,
           body TEXT NOT NULL DEFAULT '',
           type TEXT NOT NULL DEFAULT 'status' CHECK(type IN (
             'status','dispatch','worker_done','merge_ready','escalation','handoff',
             'decision_gate','question','heartbeat'
           )),
           priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high','urgent')),
           thread_id TEXT,
           payload TEXT,
           read INTEGER NOT NULL DEFAULT 0,
           sequence INTEGER PRIMARY KEY AUTOINCREMENT,
           created_at TEXT NOT NULL DEFAULT (datetime('now')),
           delivered_at TEXT,
           sender_pane_key TEXT
         );
         INSERT INTO messages_new (
           id,run_id,from_handle,to_handle,subject,body,type,priority,thread_id,payload,
           read,sequence,created_at,delivered_at,sender_pane_key
         ) SELECT
           id,run_id,from_handle,to_handle,subject,body,type,priority,thread_id,payload,
           read,sequence,created_at,delivered_at,sender_pane_key
         FROM messages;
         DROP TABLE messages;
         ALTER TABLE messages_new RENAME TO messages;",
    )?;
    Ok(())
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  objective TEXT NOT NULL,
  home_database TEXT NOT NULL DEFAULT 'this_database',
  coordinator_handle TEXT,
  coordinator_pane_key TEXT,
  consumer_generation INTEGER NOT NULL DEFAULT 0,
  legacy INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_runs_coordinator_pane ON runs(coordinator_pane_key);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT NOT NULL,
  run_id TEXT NOT NULL DEFAULT 'run_legacy_local',
  from_handle TEXT NOT NULL,
  to_handle TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'status' CHECK(type IN (
    'status', 'dispatch', 'worker_done', 'merge_ready', 'escalation',
    'handoff', 'decision_gate', 'question', 'heartbeat'
  )),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'high', 'urgent')),
  thread_id TEXT,
  payload TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at TEXT,
  sender_pane_key TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_id ON messages(id);
CREATE INDEX IF NOT EXISTS idx_inbox ON messages(to_handle, read);
CREATE INDEX IF NOT EXISTS idx_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_run_sequence ON messages(run_id, sequence);
CREATE INDEX IF NOT EXISTS idx_messages_undelivered_inbox
  ON messages(to_handle, read, delivered_at, sequence);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  consumer_generation INTEGER NOT NULL,
  message_ids TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'outstanding'
    CHECK(status IN ('outstanding', 'acknowledged', 'fenced')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_one_outstanding
  ON deliveries(run_id) WHERE status = 'outstanding';
CREATE INDEX IF NOT EXISTS idx_deliveries_run_created ON deliveries(run_id, created_at);

CREATE TABLE IF NOT EXISTS mutation_receipts (
  caller_fingerprint TEXT NOT NULL,
  request_id TEXT NOT NULL,
  method TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending', 'completed')),
  receipt TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (caller_fingerprint, request_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL DEFAULT 'run_legacy_local',
  parent_id TEXT,
  created_by_terminal_handle TEXT,
  task_title TEXT,
  display_name TEXT,
  spec TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'ready', 'dispatched', 'completed', 'failed', 'blocked')),
  deps TEXT NOT NULL DEFAULT '[]',
  result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_run_status ON tasks(run_id, status);

CREATE TABLE IF NOT EXISTS dispatch_contexts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL DEFAULT 'run_legacy_local',
  task_id TEXT NOT NULL,
  assignee_handle TEXT,
  assignee_pane_key TEXT,
  capability_hash TEXT,
  process_incarnation TEXT,
  capability_revoked_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'dispatched', 'completed', 'failed', 'circuit_broken')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_failure TEXT,
  dispatched_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_heartbeat_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_dispatch_task ON dispatch_contexts(task_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_status ON dispatch_contexts(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_run_status ON dispatch_contexts(run_id, status);

CREATE TABLE IF NOT EXISTS question_threads (
  message_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  dispatch_id TEXT NOT NULL,
  asker_handle TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'answered', 'closed')),
  answer_message_id TEXT,
  answer_body TEXT,
  answered_by_generation INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  answered_at TEXT,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_questions_dispatch_status
  ON question_threads(dispatch_id, status);

CREATE TABLE IF NOT EXISTS decision_gates (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL DEFAULT 'run_legacy_local',
  task_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'resolved', 'timeout')),
  resolution TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_gates_task ON decision_gates(task_id);
CREATE INDEX IF NOT EXISTS idx_gates_status ON decision_gates(status);
CREATE INDEX IF NOT EXISTS idx_gates_run_status ON decision_gates(run_id, status);

CREATE TABLE IF NOT EXISTS coordinator_runs (
  id TEXT PRIMARY KEY,
  spec TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'running', 'completed', 'failed')),
  coordinator_handle TEXT NOT NULL,
  poll_interval_ms INTEGER NOT NULL DEFAULT 2000,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS worker_dispatches (
  dispatch_id TEXT PRIMARY KEY,
  runtime_epoch TEXT,
  state TEXT NOT NULL DEFAULT 'starting' CHECK(state IN (
    'starting', 'ready', 'start_unknown', 'failed', 'succeeded',
    'stopping', 'stop_unknown', 'stopped', 'abandoned'
  )),
  stage TEXT NOT NULL DEFAULT 'accepted',
  worktree_id TEXT,
  agent_terminal_handle TEXT,
  setup_state TEXT NOT NULL DEFAULT 'not_applicable',
  effects TEXT NOT NULL DEFAULT '[]',
  residual_resources TEXT NOT NULL DEFAULT '[]',
  start_options TEXT NOT NULL DEFAULT '{}',
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS federated_dispatches (
  dispatch_id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL,
  environment_name TEXT NOT NULL,
  peer_fingerprint TEXT NOT NULL,
  remote_runtime_epoch TEXT,
  protocol_version INTEGER NOT NULL DEFAULT 1,
  remote_worktree_id TEXT,
  remote_terminal_handle TEXT,
  to_home_imported_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS remote_dispatch_attachments (
  dispatch_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  home_peer_fingerprint TEXT NOT NULL,
  protocol_version INTEGER NOT NULL DEFAULT 1,
  runtime_epoch TEXT NOT NULL,
  capability_hash TEXT,
  pane_key TEXT,
  process_incarnation TEXT,
  state TEXT NOT NULL DEFAULT 'starting' CHECK(state IN (
    'starting', 'ready', 'start_unknown', 'failed', 'succeeded',
    'stopping', 'stop_unknown', 'stopped', 'abandoned'
  )),
  stage TEXT NOT NULL DEFAULT 'accepted',
  worktree_id TEXT,
  terminal_handle TEXT,
  setup_state TEXT NOT NULL DEFAULT 'not_applicable',
  effects TEXT NOT NULL DEFAULT '[]',
  residual_resources TEXT NOT NULL DEFAULT '[]',
  to_worker_imported_sequence INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS federation_relay_items (
  dispatch_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('to_home', 'to_worker')),
  sequence INTEGER NOT NULL,
  message_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  byte_count INTEGER NOT NULL,
  acked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (dispatch_id, direction, sequence),
  UNIQUE (dispatch_id, direction, message_id)
);
CREATE INDEX IF NOT EXISTS idx_federation_relay_pending
  ON federation_relay_items(dispatch_id, direction, acked_at, sequence);

CREATE TABLE IF NOT EXISTS remote_questions (
  message_id TEXT PRIMARY KEY,
  dispatch_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'answered', 'closed')),
  answer_message_id TEXT,
  answer_body TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  answered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_remote_questions_dispatch_status
  ON remote_questions(dispatch_id, status);
"#;
