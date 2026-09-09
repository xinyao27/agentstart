use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension};
use serde_json::Value;

use super::{
    BrowserReplay, BrowserReplayEvent, BrowserReplayEventKind, BrowserReplaySave,
    BrowserReplayStoreError,
};

pub(super) fn find(
    connection: &Connection,
    id: &str,
) -> Result<Option<BrowserReplay>, BrowserReplayStoreError> {
    connection
        .query_row(
            "SELECT id, project_id, page_url, page_title, started_at, ended_at, events_json,
                    video_artifact_id, created_at
             FROM browser_replay
             WHERE id = ?1",
            [id],
            read_row,
        )
        .optional()
        .map_err(BrowserReplayStoreError::storage)?
        .map(hydrate)
        .transpose()
}

pub(super) fn list(
    connection: &Connection,
    project_id: &str,
    limit: usize,
) -> Result<Vec<BrowserReplay>, BrowserReplayStoreError> {
    let limit = i64::try_from(limit).map_err(BrowserReplayStoreError::storage)?;
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, page_url, page_title, started_at, ended_at, events_json,
                    video_artifact_id, created_at
             FROM browser_replay
             WHERE project_id = ?1
             ORDER BY created_at DESC
             LIMIT ?2",
        )
        .map_err(BrowserReplayStoreError::storage)?;
    let rows = statement
        .query_map(rusqlite::params![project_id, limit], read_row)
        .map_err(BrowserReplayStoreError::storage)?;
    rows.map(|row| hydrate(row.map_err(BrowserReplayStoreError::storage)?))
        .collect()
}

pub(super) fn save(
    connection: &Connection,
    input: BrowserReplaySave,
) -> Result<BrowserReplay, BrowserReplayStoreError> {
    let recording = BrowserReplay {
        created_at: now_millis()?,
        ended_at: input.ended_at,
        events: input.events,
        id: random_uuid()?,
        page_title: input.page_title,
        page_url: input.page_url,
        project_id: input.project_id,
        started_at: input.started_at,
        video_artifact_id: input.video_artifact_id,
    };
    let events_json =
        serde_json::to_string(&recording.events).map_err(BrowserReplayStoreError::storage)?;
    connection
        .execute(
            "INSERT INTO browser_replay(
               id, project_id, page_url, page_title, started_at, ended_at, events_json,
               video_artifact_id, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                recording.id,
                recording.project_id,
                recording.page_url,
                recording.page_title,
                recording.started_at,
                recording.ended_at,
                events_json,
                recording.video_artifact_id,
                recording.created_at,
            ],
        )
        .map_err(BrowserReplayStoreError::storage)?;
    Ok(recording)
}

type BrowserReplayRow = (
    String,
    String,
    String,
    String,
    f64,
    f64,
    String,
    Option<String>,
    i64,
);

fn read_row(row: &rusqlite::Row<'_>) -> Result<BrowserReplayRow, rusqlite::Error> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get(8)?,
    ))
}

fn hydrate(row: BrowserReplayRow) -> Result<BrowserReplay, BrowserReplayStoreError> {
    let (
        id,
        project_id,
        page_url,
        page_title,
        started_at,
        ended_at,
        events_json,
        video_artifact_id,
        created_at,
    ) = row;
    Ok(BrowserReplay {
        created_at,
        ended_at,
        events: parse_events(&events_json)?,
        id,
        page_title,
        page_url,
        project_id,
        started_at,
        video_artifact_id,
    })
}

fn parse_events(serialized: &str) -> Result<Vec<BrowserReplayEvent>, BrowserReplayStoreError> {
    let value =
        serde_json::from_str::<Value>(serialized).map_err(BrowserReplayStoreError::storage)?;
    let Value::Array(entries) = value else {
        return Ok(Vec::new());
    };
    Ok(entries.into_iter().filter_map(parse_event).collect())
}

fn parse_event(value: Value) -> Option<BrowserReplayEvent> {
    let object = value.as_object()?;
    let at = object.get("at")?.as_f64()?;
    let kind = match object.get("kind")?.as_str()? {
        "click" => BrowserReplayEventKind::Click,
        "input" => BrowserReplayEventKind::Input,
        "keydown" => BrowserReplayEventKind::Keydown,
        _ => return None,
    };
    let selector = object.get("selector")?.as_str()?.to_owned();
    Some(BrowserReplayEvent {
        at,
        key: object.get("key").and_then(Value::as_str).map(str::to_owned),
        kind,
        selector,
        value: object
            .get("value")
            .and_then(Value::as_str)
            .map(str::to_owned),
    })
}

fn now_millis() -> Result<i64, BrowserReplayStoreError> {
    i64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis())
        .map_err(BrowserReplayStoreError::storage)
}

fn random_uuid() -> Result<String, BrowserReplayStoreError> {
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
