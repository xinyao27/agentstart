use rusqlite::Connection;

use super::InstallationDatabaseError;

const SCHEMA_VERSION: i64 = 2;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS mobile_device (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  apns_token TEXT,
  apns_environment TEXT CHECK(apns_environment IN ('production', 'sandbox')),
  push_updated_at INTEGER,
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
    let transaction = connection.transaction()?;
    transaction.execute_batch(SCHEMA)?;
    transaction.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    transaction.commit()?;
    Ok(())
}
