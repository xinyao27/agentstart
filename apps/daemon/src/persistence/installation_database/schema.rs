use rusqlite::Connection;

use super::InstallationDatabaseError;

const SCHEMA_VERSION: i64 = 3;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS mobile_device (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  paired_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mobile_notification (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT NOT NULL,
  occurred_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS dangerous_credential (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  credential_id TEXT NOT NULL UNIQUE,
  public_key_spki TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS legacy_installation_mobile_device (
  source_key TEXT NOT NULL,
  device_id TEXT NOT NULL,
  PRIMARY KEY(source_key, device_id)
);
CREATE TABLE IF NOT EXISTS legacy_installation_dangerous_credential (
  source_key TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS legacy_installation_notification (
  identity_digest TEXT PRIMARY KEY,
  local_id INTEGER NOT NULL,
  target_id INTEGER UNIQUE REFERENCES mobile_notification(id) ON DELETE SET NULL
);
"#;

pub(super) fn migrate(connection: &mut Connection) -> Result<(), InstallationDatabaseError> {
    let version =
        connection.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))?;
    if version > SCHEMA_VERSION {
        return Err(InstallationDatabaseError::SchemaUnsupported);
    }
    let has_retired_delivery_columns = has_column(connection, "apns_token")?;
    let transaction = connection.transaction()?;
    transaction.execute_batch(SCHEMA)?;
    if has_retired_delivery_columns {
        transaction.execute_batch(
            "ALTER TABLE mobile_device RENAME TO mobile_device_with_retired_delivery;
             CREATE TABLE mobile_device (
               id TEXT PRIMARY KEY,
               name TEXT NOT NULL UNIQUE,
               token TEXT NOT NULL UNIQUE,
               paired_at INTEGER NOT NULL,
               last_seen_at INTEGER NOT NULL
             );
             INSERT INTO mobile_device(id, name, token, paired_at, last_seen_at)
               SELECT id, name, token, paired_at, last_seen_at
               FROM mobile_device_with_retired_delivery;
             DROP TABLE mobile_device_with_retired_delivery;",
        )?;
    }
    transaction.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    transaction.commit()?;
    Ok(())
}

fn has_column(connection: &Connection, column: &str) -> Result<bool, rusqlite::Error> {
    let mut statement = connection.prepare("PRAGMA table_info(mobile_device)")?;
    let mut rows = statement.query([])?;
    while let Some(row) = rows.next()? {
        if row.get::<_, String>(1)? == column {
            return Ok(true);
        }
    }
    Ok(false)
}
