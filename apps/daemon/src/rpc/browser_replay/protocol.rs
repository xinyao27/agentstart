use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    BrowserReplayEvent as ProtoReplayEvent, BrowserReplayEventKind as ProtoReplayEventKind,
    BrowserReplayRecording, BrowserReplayServiceListRequest, BrowserReplayServiceListResponse,
    BrowserReplayServiceRecordResultRequest, BrowserReplayServiceRecordResultResponse,
    BrowserReplayServiceSaveRequest, BrowserReplayServiceSaveResponse,
};
use yiru_protocol::transport::{decode, encode};

use crate::persistence::{
    BrowserReplay, BrowserReplayEvent, BrowserReplayEventKind, BrowserReplaySave,
    BrowserReplayStoreError, WorkspaceEventPayload,
};
use crate::rpc::protocol_call::status;

use super::BrowserReplayRpc;

const MAX_EVENTS: usize = 20_000;
const MAX_SELECTOR_LENGTH: usize = 2_048;
const MAX_KEY_LENGTH: usize = 64;
const MAX_VALUE_LENGTH: usize = 64 * 1_024;
const MAX_TITLE_LENGTH: usize = 1_024;
const MAX_LIST_LIMIT: u32 = 100;
const DEFAULT_LIST_LIMIT: usize = 20;

pub(in crate::rpc) async fn list(
    rpc: &BrowserReplayRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<BrowserReplayServiceListRequest>(payload)?;
    let project_id = required_identifier(&request.project_id)?;
    let limit = request
        .limit
        .map(|limit| usize::try_from(limit.min(MAX_LIST_LIMIT)).unwrap_or(DEFAULT_LIST_LIMIT))
        .unwrap_or(DEFAULT_LIST_LIMIT);
    let recordings = rpc
        .store
        .list(project_id, Some(limit))
        .await
        .map_err(storage_status)?
        .into_iter()
        .map(encode_recording)
        .collect();
    Ok(encode(&BrowserReplayServiceListResponse { recordings }))
}

pub(in crate::rpc) async fn record_result(
    rpc: &BrowserReplayRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<BrowserReplayServiceRecordResultRequest>(payload)?;
    let project_id = required_identifier(&request.project_id)?;
    let recording_id = required_identifier(&request.recording_id)?;
    // Why: Bun hydrates the entire recording before comparing project ownership, so malformed
    // legacy event JSON fails internally before a NOT_FOUND can be emitted; this mirrors that.
    let recording = rpc
        .store
        .find(recording_id.clone())
        .await
        .map_err(storage_status)?;
    if recording.is_none_or(|recording| recording.project_id != project_id) {
        return Err(status(StatusCode::NotFound, "browser_replay_not_found"));
    }
    let mut event_payload = WorkspaceEventPayload::new();
    event_payload.insert(
        "detail".to_owned(),
        serde_json::Value::String(request.detail),
    );
    event_payload.insert(
        "pageUrl".to_owned(),
        serde_json::Value::String(request.page_url),
    );
    event_payload.insert(
        "recordingId".to_owned(),
        serde_json::Value::String(recording_id),
    );
    event_payload.insert(
        "success".to_owned(),
        serde_json::Value::Bool(request.success),
    );
    event_payload.insert(
        "worktreeId".to_owned(),
        serde_json::Value::String(required_identifier(&request.worktree_id)?),
    );
    let event = rpc
        .journal
        .append(
            project_id,
            "browser.replay.completed".to_owned(),
            event_payload,
        )
        .await
        .map_err(|error| status(StatusCode::Internal, &error.to_string()))?;
    Ok(encode(&BrowserReplayServiceRecordResultResponse {
        event_id: event.id,
    }))
}

pub(in crate::rpc) async fn save(
    rpc: &BrowserReplayRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<BrowserReplayServiceSaveRequest>(payload)?;
    let project_id = required_identifier(&request.project_id)?;
    let page_url = required_url(&request.page_url)?;
    if request.page_title.encode_utf16().count() > MAX_TITLE_LENGTH {
        return Err(status(
            StatusCode::InvalidArgument,
            "browser_replay_page_title_too_long",
        ));
    }
    let video_artifact_id = optional_uuid(request.video_artifact_id)?;
    let events = decode_events(request.events)?;
    let recording = rpc
        .store
        .save(BrowserReplaySave {
            ended_at: request.ended_at,
            events,
            page_title: request.page_title,
            page_url,
            project_id,
            started_at: request.started_at,
            video_artifact_id,
        })
        .await
        .map_err(storage_status)?;
    Ok(encode(&BrowserReplayServiceSaveResponse {
        recording: Some(encode_recording(recording)),
    }))
}

fn decode_events(events: Vec<ProtoReplayEvent>) -> Result<Vec<BrowserReplayEvent>, Status> {
    if events.len() > MAX_EVENTS {
        return Err(status(
            StatusCode::InvalidArgument,
            "browser_replay_too_many_events",
        ));
    }
    events.into_iter().map(decode_event).collect()
}

fn decode_event(event: ProtoReplayEvent) -> Result<BrowserReplayEvent, Status> {
    let selector_length = event.selector.encode_utf16().count();
    if selector_length == 0 || selector_length > MAX_SELECTOR_LENGTH {
        return Err(status(
            StatusCode::InvalidArgument,
            "browser_replay_selector_invalid",
        ));
    }
    if let Some(key) = &event.key
        && key.encode_utf16().count() > MAX_KEY_LENGTH
    {
        return Err(status(
            StatusCode::InvalidArgument,
            "browser_replay_key_too_long",
        ));
    }
    if let Some(value) = &event.value
        && value.encode_utf16().count() > MAX_VALUE_LENGTH
    {
        return Err(status(
            StatusCode::InvalidArgument,
            "browser_replay_value_too_long",
        ));
    }
    // Why: `kind()` borrows the message, so the discriminant is read before any field moves.
    let kind = decode_kind(event.kind())?;
    Ok(BrowserReplayEvent {
        at: event.at,
        key: event.key,
        kind,
        selector: event.selector,
        value: event.value,
    })
}

fn decode_kind(kind: ProtoReplayEventKind) -> Result<BrowserReplayEventKind, Status> {
    match kind {
        ProtoReplayEventKind::Click => Ok(BrowserReplayEventKind::Click),
        ProtoReplayEventKind::Input => Ok(BrowserReplayEventKind::Input),
        ProtoReplayEventKind::Keydown => Ok(BrowserReplayEventKind::Keydown),
        ProtoReplayEventKind::Unspecified => Err(status(
            StatusCode::InvalidArgument,
            "browser_replay_event_kind_required",
        )),
    }
}

fn encode_kind(kind: BrowserReplayEventKind) -> ProtoReplayEventKind {
    match kind {
        BrowserReplayEventKind::Click => ProtoReplayEventKind::Click,
        BrowserReplayEventKind::Input => ProtoReplayEventKind::Input,
        BrowserReplayEventKind::Keydown => ProtoReplayEventKind::Keydown,
    }
}

fn encode_recording(recording: BrowserReplay) -> BrowserReplayRecording {
    BrowserReplayRecording {
        created_at: recording.created_at,
        ended_at: recording.ended_at,
        events: recording
            .events
            .into_iter()
            .map(|event| ProtoReplayEvent {
                at: event.at,
                key: event.key,
                kind: encode_kind(event.kind).into(),
                selector: event.selector,
                value: event.value,
            })
            .collect(),
        id: recording.id,
        page_title: recording.page_title,
        page_url: recording.page_url,
        project_id: recording.project_id,
        started_at: recording.started_at,
        video_artifact_id: recording.video_artifact_id,
    }
}

fn required_identifier(value: &str) -> Result<String, Status> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(status(
            StatusCode::InvalidArgument,
            "browser_replay_identifier_required",
        ));
    }
    Ok(trimmed.to_owned())
}

fn required_url(value: &str) -> Result<String, Status> {
    url::Url::parse(value).map_err(|_| {
        status(
            StatusCode::InvalidArgument,
            "browser_replay_page_url_invalid",
        )
    })?;
    Ok(value.to_owned())
}

fn optional_uuid(value: Option<String>) -> Result<Option<String>, Status> {
    let Some(value) = value else {
        return Ok(None);
    };
    let is_uuid = value.len() == 36
        && value.bytes().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => byte == b'-',
            _ => byte.is_ascii_hexdigit(),
        });
    if !is_uuid {
        return Err(status(
            StatusCode::InvalidArgument,
            "browser_replay_video_artifact_id_invalid",
        ));
    }
    Ok(Some(value))
}

fn storage_status(error: BrowserReplayStoreError) -> Status {
    status(StatusCode::Internal, &error.to_string())
}
