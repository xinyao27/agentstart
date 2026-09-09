use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::workspace_events_service_watch_response::Event;
use yiru_protocol::runtime::v1::{
    WorkspaceConsoleSource, WorkspaceEventsServiceAppendConsoleRequest,
    WorkspaceEventsServiceAppendConsoleResponse, WorkspaceEventsServiceAppendPerformanceRequest,
    WorkspaceEventsServiceAppendPerformanceResponse,
    WorkspaceEventsServiceGetProjectRevisionRequest,
    WorkspaceEventsServiceGetProjectRevisionResponse, WorkspaceEventsServiceListRequest,
    WorkspaceEventsServiceListResponse, WorkspaceEventsServiceWatchRequest,
    WorkspaceEventsServiceWatchResponse, WorkspaceWatchReady,
};
use yiru_protocol::transport::{decode, encode};

use crate::persistence::WorkspaceJournalError;
use crate::projects::ProjectCatalogError;
use crate::repositories::ecmascript;
use crate::rpc::protocol_call::ProtocolCallContext;

use super::WorkspaceEventsError;
use super::WorkspaceEventsRpc;
use super::input::{ConsoleEntry, ConsoleInput, PerformanceInput};
use super::protocol_values::protocol_event;

const MAX_PROJECT_ID_CODE_UNITS: usize = 4_096;
const MAX_SCOPE_CODE_UNITS: usize = 4_096;
const DEFAULT_PAGE_SIZE: u32 = 100;
const MAX_PAGE_SIZE: u32 = 500;
// Why: the protobuf appends mirror the legacy JSON bounds (input.rs) so a
// caller migrating transports cannot push entries the JSON surface rejects.
const MAX_CONSOLE_ENTRIES: usize = 100;
const MAX_CONSOLE_TEXT_CODE_UNITS: usize = 16 * 1_024;
const MAX_PAGE_URL_CODE_UNITS: usize = 8_192;
const MAX_METRIC_COUNT: u32 = 100;

pub(in crate::rpc) async fn append_console(
    rpc: &WorkspaceEventsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorkspaceEventsServiceAppendConsoleRequest>(payload)?;
    let input = console_input(request)?;
    let claim = rpc.append_console(input).await.map_err(append_status)?;
    Ok(encode(&WorkspaceEventsServiceAppendConsoleResponse {
        claimed_terminal_handle: claim.claimed_terminal_handle,
        events_appended: u32::try_from(claim.events_appended)
            .map_err(|_| data_loss("Console event count cannot be represented"))?,
    }))
}

pub(in crate::rpc) async fn append_performance(
    rpc: &WorkspaceEventsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorkspaceEventsServiceAppendPerformanceRequest>(payload)?;
    let input = performance_input(request)?;
    let event = rpc.append_performance(input).await.map_err(append_status)?;
    Ok(encode(&WorkspaceEventsServiceAppendPerformanceResponse {
        event: Some(protocol_event(event)),
    }))
}

fn console_input(
    request: WorkspaceEventsServiceAppendConsoleRequest,
) -> Result<ConsoleInput, Status> {
    let project_id = required_project_id(&request.project_id)?.to_owned();
    let worktree_id = required_project_id(&request.worktree_id)
        .map_err(|_| console_worktree_error())?
        .to_owned();
    let page_url = required_page_url(&request.page_url)?.to_owned();
    if request.entries.is_empty() || request.entries.len() > MAX_CONSOLE_ENTRIES {
        return Err(invalid_argument(
            "Console entries must contain between 1 and 100 items",
        ));
    }
    let mut entries = Vec::with_capacity(request.entries.len());
    for entry in request.entries {
        if !entry.occurred_at.is_finite() || entry.occurred_at < 0.0 {
            return Err(invalid_argument(
                "Console entry occurredAt must be a finite nonnegative number",
            ));
        }
        let source = protocol_console_source(entry.source())?;
        let text = entry.text.trim();
        if text.is_empty() || text.encode_utf16().count() > MAX_CONSOLE_TEXT_CODE_UNITS {
            return Err(invalid_argument(
                "Console text must contain between 1 and 16384 UTF-16 code units",
            ));
        }
        if let Some(stack) = entry.stack.as_deref()
            && stack.encode_utf16().count() > MAX_CONSOLE_TEXT_CODE_UNITS
        {
            return Err(invalid_argument(
                "Console stack must be a string no longer than 16384 UTF-16 code units",
            ));
        }
        entries.push(ConsoleEntry {
            occurred_at: entry.occurred_at,
            source: source.to_owned(),
            stack: entry.stack,
            text: text.to_owned(),
        });
    }
    Ok(ConsoleInput {
        entries,
        page_url,
        project_id,
        worktree_id,
    })
}

fn performance_input(
    request: WorkspaceEventsServiceAppendPerformanceRequest,
) -> Result<PerformanceInput, Status> {
    let project_id = required_project_id(&request.project_id)?.to_owned();
    let worktree_id = required_project_id(&request.worktree_id)?.to_owned();
    let page_url = required_page_url(&request.page_url)?.to_owned();
    if request.metric_count == 0 || request.metric_count > MAX_METRIC_COUNT {
        return Err(invalid_argument(
            "Performance metrics must contain between 1 and 100 entries",
        ));
    }
    let artifact_id = required_artifact_id(&request.artifact_id)?.to_owned();
    Ok(PerformanceInput {
        artifact_id,
        metric_count: request.metric_count as usize,
        page_url,
        project_id,
        worktree_id,
    })
}

fn protocol_console_source(source: WorkspaceConsoleSource) -> Result<&'static str, Status> {
    match source {
        WorkspaceConsoleSource::Console => Ok("console"),
        WorkspaceConsoleSource::Exception => Ok("exception"),
        WorkspaceConsoleSource::Log => Ok("log"),
        WorkspaceConsoleSource::Unspecified => {
            Err(invalid_argument("Console entry source is invalid"))
        }
    }
}

fn required_page_url(value: &str) -> Result<&str, Status> {
    if value.encode_utf16().count() > MAX_PAGE_URL_CODE_UNITS || url::Url::parse(value).is_err() {
        return Err(invalid_argument("Performance page URL is invalid"));
    }
    Ok(value)
}

fn required_artifact_id(value: &str) -> Result<&str, Status> {
    if is_uuid(value) {
        Ok(value)
    } else {
        Err(invalid_argument(
            "Performance artifact identifier is invalid",
        ))
    }
}

// Why: the legacy artifactId schema is the web UUID pattern including the two
// reserved all-zero/all-f forms.
fn is_uuid(value: &str) -> bool {
    if matches!(
        value,
        "00000000-0000-0000-0000-000000000000" | "ffffffff-ffff-ffff-ffff-ffffffffffff"
    ) {
        return true;
    }
    let bytes = value.as_bytes();
    bytes.len() == 36
        && [8, 13, 18, 23]
            .into_iter()
            .all(|index| bytes[index] == b'-')
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| [8, 13, 18, 23].contains(&index) || byte.is_ascii_hexdigit())
        && matches!(bytes[14], b'1'..=b'8')
        && matches!(bytes[19], b'8' | b'9' | b'a'..=b'b' | b'A'..=b'B')
}

fn console_worktree_error() -> Status {
    invalid_argument("Worktree identifier must contain 1 through 4096 UTF-16 code units")
}

fn append_status(_: WorkspaceEventsError) -> Status {
    // Why: the legacy workspaceEvents verbs answered every authority failure
    // with a bare 500, so the protobuf surface mirrors that instead of
    // inventing finer statuses the client never saw.
    status(StatusCode::Internal, "Workspace event append failed")
}

fn data_loss(message: &str) -> Status {
    status(StatusCode::DataLoss, message)
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

pub(in crate::rpc) async fn get_project_revision(
    rpc: &WorkspaceEventsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorkspaceEventsServiceGetProjectRevisionRequest>(payload)?;
    let project_id = required_project_id(&request.project_id)?;
    let project = rpc
        .projects
        .resolve_id(project_id)
        .await
        .map_err(project_status)?;
    let revision = rpc
        .journal
        .revision(project.id)
        .await
        .map_err(journal_status)?;
    let revision = u64::try_from(revision).map_err(|_| {
        status(
            StatusCode::DataLoss,
            "Project workspace revision is negative",
        )
    })?;
    Ok(encode(&WorkspaceEventsServiceGetProjectRevisionResponse {
        revision,
    }))
}

pub(in crate::rpc) async fn list(
    rpc: &WorkspaceEventsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorkspaceEventsServiceListRequest>(payload)?;
    let scope = required_scope(&request.scope)?.to_owned();
    let after_id = resume_cursor(request.after_id)?;
    let limit = page_size(request.limit)?;
    let snapshot = rpc
        .journal
        .snapshot(scope, after_id, limit)
        .await
        .map_err(list_status)?;
    Ok(encode(&WorkspaceEventsServiceListResponse {
        events: snapshot.events.into_iter().map(protocol_event).collect(),
        latest_id: snapshot.latest_id,
        revision: snapshot.revision,
    }))
}

/// Tail the journal from the caller's cursor. The subscription pages through
/// storage instead of buffering, and `send_stream_payload` waits on the
/// connection's response budget, so a slow reader bounds the tail rather than
/// growing it. Cancellation drops this future, and the subscription with it.
pub(in crate::rpc) async fn watch(
    rpc: &WorkspaceEventsRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    let request = decode::<WorkspaceEventsServiceWatchRequest>(payload)?;
    let scope = required_scope(&request.scope)?.to_owned();
    let after_id = resume_cursor(request.after_id)?;
    let revision = rpc
        .journal
        .revision(scope.clone())
        .await
        .map_err(journal_status)?;
    context
        .send_stream_payload(encode(&WorkspaceEventsServiceWatchResponse {
            event: Some(Event::Ready(WorkspaceWatchReady { revision, after_id })),
        }))
        .await?;
    let mut subscription = rpc
        .journal
        .subscribe(scope, after_id)
        .await
        .map_err(journal_status)?;
    while let Some(event) = subscription.next().await.map_err(journal_status)? {
        context
            .send_stream_payload(encode(&WorkspaceEventsServiceWatchResponse {
                event: Some(Event::Appended(protocol_event(event))),
            }))
            .await?;
    }
    Ok(())
}

fn required_scope(value: &str) -> Result<&str, Status> {
    let value = ecmascript::trim(value);
    if value.is_empty()
        || value.encode_utf16().count() > MAX_SCOPE_CODE_UNITS
        || value.contains('\0')
    {
        return Err(status(
            StatusCode::InvalidArgument,
            "Workspace event scope must contain 1 through 4096 UTF-16 code units",
        ));
    }
    Ok(value)
}

fn resume_cursor(value: Option<i64>) -> Result<i64, Status> {
    match value {
        None => Ok(0),
        Some(value) if value >= 0 => Ok(value),
        Some(_) => Err(status(
            StatusCode::InvalidArgument,
            "Workspace event cursor must not be negative",
        )),
    }
}

fn page_size(value: Option<u32>) -> Result<usize, Status> {
    let value = value.unwrap_or(DEFAULT_PAGE_SIZE);
    if value == 0 || value > MAX_PAGE_SIZE {
        return Err(status(
            StatusCode::InvalidArgument,
            "Workspace event page size must be 1 through 500",
        ));
    }
    Ok(value as usize)
}

fn list_status(error: WorkspaceJournalError) -> Status {
    match error {
        WorkspaceJournalError::WorkerUnavailable => {
            status(StatusCode::Unavailable, "Workspace journal is unavailable")
        }
        _ => status(StatusCode::Internal, "Workspace event lookup failed"),
    }
}

fn required_project_id(value: &str) -> Result<&str, Status> {
    let value = ecmascript::trim(value);
    if value.is_empty()
        || value.encode_utf16().count() > MAX_PROJECT_ID_CODE_UNITS
        || value.contains('\0')
    {
        return Err(status(
            StatusCode::InvalidArgument,
            "Project identifier must contain 1 through 4096 UTF-16 code units",
        ));
    }
    Ok(value)
}

fn project_status(error: ProjectCatalogError) -> Status {
    match error {
        ProjectCatalogError::NotFound => {
            status(StatusCode::NotFound, "Project identifier was not found")
        }
        ProjectCatalogError::AmbiguousSelector => status(
            StatusCode::FailedPrecondition,
            "Project identifier is not unique in this runtime",
        ),
        ProjectCatalogError::WorkerUnavailable => {
            status(StatusCode::Unavailable, "Project catalog is unavailable")
        }
        _ => status(StatusCode::Internal, "Project catalog lookup failed"),
    }
}

fn journal_status(error: WorkspaceJournalError) -> Status {
    match error {
        WorkspaceJournalError::WorkerUnavailable | WorkspaceJournalError::RevisionUnavailable => {
            status(
                StatusCode::Unavailable,
                "Project workspace revision is unavailable",
            )
        }
        _ => status(
            StatusCode::Internal,
            "Project workspace revision lookup failed",
        ),
    }
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
