use super::super::ProviderUsageError;
use rusqlite::{Connection, OptionalExtension, params};
use sha2::{Digest, Sha256};
use std::path::Path;

pub(super) struct Ownership {
    database: Connection,
    open: bool,
}
impl Ownership {
    pub fn open(path: &Path) -> Result<Self, ProviderUsageError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let database = Connection::open(path).map_err(error)?;
        database
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(error)?;
        database.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
            CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL) WITHOUT ROWID;
            CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY,path TEXT NOT NULL UNIQUE);
            CREATE TABLE IF NOT EXISTS events(event_hash BLOB PRIMARY KEY,file_id INTEGER NOT NULL) WITHOUT ROWID;
            CREATE INDEX IF NOT EXISTS events_file_id ON events(file_id);").map_err(error)?;
        Ok(Self {
            database,
            open: false,
        })
    }
    pub fn generation(&self) -> Result<Option<String>, ProviderUsageError> {
        self.database
            .query_row(
                "SELECT value FROM metadata WHERE key='generation'",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(error)
    }
    pub fn begin(&mut self, reset: bool) -> Result<(), ProviderUsageError> {
        self.database
            .execute_batch("BEGIN IMMEDIATE")
            .map_err(error)?;
        self.open = true;
        if reset {
            self.database
                .execute_batch("DELETE FROM events; DELETE FROM files; DELETE FROM metadata;")
                .map_err(error)?;
        }
        Ok(())
    }
    pub fn remove(&self, path: &str) -> Result<bool, ProviderUsageError> {
        let id: Option<i64> = self
            .database
            .query_row("SELECT id FROM files WHERE path=?", [path], |r| r.get(0))
            .optional()
            .map_err(error)?;
        let Some(id) = id else { return Ok(false) };
        let changed = self
            .database
            .execute("DELETE FROM events WHERE file_id=?", [id])
            .map_err(error)?;
        self.database
            .execute("DELETE FROM files WHERE id=?", [id])
            .map_err(error)?;
        Ok(changed > 0)
    }
    pub fn prepare(&self, path: &str) -> Result<i64, ProviderUsageError> {
        self.remove(path)?;
        self.database
            .execute("INSERT INTO files(path) VALUES (?)", [path])
            .map_err(error)?;
        Ok(self.database.last_insert_rowid())
    }
    pub fn claim(&self, file: i64, key: &str) -> Result<bool, ProviderUsageError> {
        let hash = Sha256::digest(key.as_bytes());
        let hash = &hash[..16];
        let inserted = self
            .database
            .execute(
                "INSERT OR IGNORE INTO events(event_hash,file_id) VALUES (?,?)",
                params![hash, file],
            )
            .map_err(error)?;
        if inserted > 0 {
            return Ok(true);
        };
        let owner: i64 = self
            .database
            .query_row(
                "SELECT file_id FROM events WHERE event_hash=?",
                [hash],
                |r| r.get(0),
            )
            .map_err(error)?;
        Ok(owner == file)
    }
    pub fn commit(&mut self) -> Result<String, ProviderUsageError> {
        let mut bytes = [0u8; 16];
        getrandom::fill(&mut bytes).map_err(|e| ProviderUsageError::Scan(e.to_string()))?;
        let generation = bytes.iter().map(|v| format!("{v:02x}")).collect::<String>();
        self.database
            .execute(
                "INSERT OR REPLACE INTO metadata(key,value) VALUES ('generation',?)",
                [&generation],
            )
            .map_err(error)?;
        self.database.execute_batch("COMMIT").map_err(error)?;
        self.open = false;
        Ok(generation)
    }
}
impl Drop for Ownership {
    fn drop(&mut self) {
        if self.open {
            let _ = self.database.execute_batch("ROLLBACK");
        }
    }
}
fn error(error: rusqlite::Error) -> ProviderUsageError {
    ProviderUsageError::Scan(format!("Codex ownership index: {error}"))
}
