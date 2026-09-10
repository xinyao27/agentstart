mod matching;
mod runtime;
mod screencast;

use matching::response_matches;
pub(super) use runtime::create_tab;
pub(in crate::rpc) use screencast::screencast;

use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use agentstart_protocol::method_metadata::methods::{
    AgentStartRuntimeV1BrowserHostServiceDownload as DownloadMethod,
    AgentStartRuntimeV1BrowserHostServiceExecute as ExecuteMethod,
};
use agentstart_protocol::protocol::v1::{PeerKind, Status, StatusCode};
use agentstart_protocol::runtime::v1::download_response::Event;
use agentstart_protocol::runtime::v1::execute_mobile_request::Command as MobileRequestCommand;
use agentstart_protocol::runtime::v1::execute_mobile_response::Result as MobileResponseResult;
use agentstart_protocol::runtime::v1::execute_request::Command as RequestCommand;
use agentstart_protocol::runtime::v1::execute_response::Result as ResponseResult;
use agentstart_protocol::runtime::v1::{
    BrowserTarget, DownloadRequest, DownloadResponse, ExecuteMobileRequest, ExecuteMobileResponse,
    ExecuteRequest, ResolveTargetRequest, ResolveTargetResponse, ResolveUploadRequest,
    ResolveUploadResponse,
};
use agentstart_protocol::transport::{decode, encode};
use getrandom::fill;
use prost::Message;
use tokio::io::AsyncWriteExt;
use tokio::time::Instant;

use crate::atomic_file_replace;
use crate::reverse_protocol::{ReverseProtocolError, ReverseProtocolRegistry};
use crate::worktrees::{ResolvedWorktree, WorktreeCatalog, WorktreeCatalogError};

use super::protocol_call::{ProtocolCallContext, status};

const COMMAND_TIMEOUT: Duration = Duration::from_secs(30);
// Why: the legacy dispatch gave browser.grab.awaitSelection a 125s timeout because it waits on a
// human selecting an element in the page, far longer than any other browser command.
const GRAB_AWAIT_SELECTION_TIMEOUT: Duration = Duration::from_secs(125);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const MAX_DOWNLOAD_BYTES: u64 = 1024 * 1024 * 1024;

#[derive(Clone)]
pub(super) struct BrowserProtocolRpc {
    reverse: ReverseProtocolRegistry,
    worktrees: WorktreeCatalog,
}

impl BrowserProtocolRpc {
    pub(super) fn new(reverse: ReverseProtocolRegistry, worktrees: WorktreeCatalog) -> Self {
        Self { reverse, worktrees }
    }
}

pub(super) async fn resolve_target(
    rpc: &BrowserProtocolRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ResolveTargetRequest>(payload)?;
    let target = resolve_requested_target(rpc, &request).await?;
    Ok(encode(&ResolveTargetResponse {
        target: Some(target),
    }))
}

pub(super) async fn resolve_upload(
    rpc: &BrowserProtocolRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ResolveUploadRequest>(payload)?;
    let worktree =
        find_requested_worktree(rpc, request.worktree.as_deref(), &request.current_directory)
            .await?
            .ok_or_else(|| {
                status(
                    StatusCode::FailedPrecondition,
                    "browser_upload_worktree_required",
                )
            })?;
    if worktree.host_id != "local" {
        return Err(status(
            StatusCode::FailedPrecondition,
            "browser_upload_remote_transfer_unsupported",
        ));
    }
    let root = tokio::fs::canonicalize(&worktree.path)
        .await
        .map_err(io_status)?;
    let mut files = Vec::with_capacity(request.files.len());
    for requested in request.files {
        if Path::new(&requested).is_absolute() {
            return Err(status(
                StatusCode::InvalidArgument,
                "browser_upload_path_must_be_worktree_relative",
            ));
        }
        let path = tokio::fs::canonicalize(root.join(requested))
            .await
            .map_err(io_status)?;
        if !is_inside(&root, &path) {
            return Err(status(
                StatusCode::PermissionDenied,
                "browser_upload_path_outside_worktree",
            ));
        }
        files.push(path.to_string_lossy().into_owned());
    }
    let target = resolve_requested_target(
        rpc,
        &ResolveTargetRequest {
            page: request.page,
            worktree: request.worktree,
            current_directory: request.current_directory,
            require_worktree: false,
        },
    )
    .await?;
    Ok(encode(&ResolveUploadResponse {
        target: Some(target),
        files,
    }))
}

pub(super) async fn execute(
    rpc: &BrowserProtocolRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<Vec<u8>, Status> {
    ensure_cli_caller(context)?;
    let mut request = decode::<ExecuteRequest>(payload)?;
    request.authority_id = principal_authority_id(context);
    let command_timeout = if matches!(request.command, Some(RequestCommand::GrabAwaitSelection(_)))
    {
        GRAB_AWAIT_SELECTION_TIMEOUT
    } else {
        COMMAND_TIMEOUT
    };
    let timeout = remaining_timeout(context, command_timeout)?;
    let response = tokio::select! {
        result = rpc.reverse.unary::<ExecuteMethod>(&request, timeout) => {
            result.map_err(reverse_status)?
        }
        () = context.cancelled() => {
            return Err(status(StatusCode::Cancelled, "Browser command cancelled"));
        }
    };
    if !response_matches(&request, &response) {
        return Err(status(
            StatusCode::DataLoss,
            "Browser command response does not match its request",
        ));
    }
    Ok(response.encode_to_vec())
}

fn principal_authority_id(context: &ProtocolCallContext) -> Option<String> {
    let principal_id = context.access().principal_id();
    (!principal_id.is_empty()).then(|| principal_id.to_owned())
}

// Why: shared by execute() and screencast's internal relaying (viewport/tabShow/screenshot/eval
// calls) so both build the exact same request shape and apply the exact same response check.
pub(super) async fn execute_command(
    rpc: &BrowserProtocolRpc,
    authority_id: Option<String>,
    command: RequestCommand,
    context: &ProtocolCallContext,
    timeout: Duration,
) -> Result<ResponseResult, Status> {
    let request = ExecuteRequest {
        authority_id,
        command: Some(command),
    };
    let timeout = remaining_timeout(context, timeout)?;
    let response = tokio::select! {
        result = rpc.reverse.unary::<ExecuteMethod>(&request, timeout) => {
            result.map_err(reverse_status)?
        }
        () = context.cancelled() => {
            return Err(status(StatusCode::Cancelled, "Browser command cancelled"));
        }
    };
    if !response_matches(&request, &response) {
        return Err(status(
            StatusCode::DataLoss,
            "Browser command response does not match its request",
        ));
    }
    response
        .result
        .ok_or_else(|| status(StatusCode::DataLoss, "browser_command_response_invalid"))
}

pub(super) async fn download(
    rpc: &BrowserProtocolRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    ensure_cli_caller(context)?;
    let request = decode::<DownloadRequest>(payload)?;
    let worktree_selector = request
        .target
        .as_ref()
        .and_then(|target| target.worktree.as_deref())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            status(
                StatusCode::FailedPrecondition,
                "browser_download_worktree_required",
            )
        })?;
    if Path::new(&request.path).is_absolute() {
        return Err(status(
            StatusCode::InvalidArgument,
            "browser_download_path_must_be_worktree_relative",
        ));
    }
    let worktree = resolve_worktree(rpc, worktree_selector).await?;
    if worktree.host_id != "local" {
        return Err(status(
            StatusCode::FailedPrecondition,
            "browser_download_remote_transfer_unsupported",
        ));
    }
    let root = tokio::fs::canonicalize(&worktree.path)
        .await
        .map_err(io_status)?;
    let destination = prepare_destination(&root, &request.path).await?;
    let mut staging = StagingFile::create(&destination).await?;
    let timeout = remaining_timeout(context, DOWNLOAD_TIMEOUT)?;
    let mut stream = tokio::select! {
        result = rpc.reverse.server_stream::<DownloadMethod>(&request, timeout) => {
            result.map_err(reverse_status)?
        }
        () = context.cancelled() => return Err(status(StatusCode::Cancelled, "Browser download cancelled")),
    };
    let mut received_bytes = 0_u64;
    let reported_bytes = loop {
        let response = tokio::select! {
            result = stream.receive() => result.map_err(reverse_status)?,
            () = context.cancelled() => return Err(status(StatusCode::Cancelled, "Browser download cancelled")),
        };
        let Some(response) = response else {
            return Err(status(
                StatusCode::DataLoss,
                "browser_download_response_invalid",
            ));
        };
        match response.event {
            Some(Event::Chunk(bytes)) => {
                received_bytes = received_bytes
                    .checked_add(u64::try_from(bytes.len()).map_err(|_| {
                        status(StatusCode::ResourceExhausted, "browser_download_too_large")
                    })?)
                    .filter(|bytes| *bytes <= MAX_DOWNLOAD_BYTES)
                    .ok_or_else(|| {
                        status(StatusCode::ResourceExhausted, "browser_download_too_large")
                    })?;
                staging.file.write_all(&bytes).await.map_err(io_status)?;
            }
            Some(Event::ByteLength(byte_length)) => break u64::from(byte_length),
            None => {
                return Err(status(
                    StatusCode::DataLoss,
                    "browser_download_response_invalid",
                ));
            }
        }
    };
    let terminal = tokio::select! {
        result = stream.receive() => result.map_err(reverse_status)?,
        () = context.cancelled() => {
            return Err(status(StatusCode::Cancelled, "Browser download cancelled"));
        }
    };
    if reported_bytes != received_bytes || terminal.is_some() {
        return Err(status(
            StatusCode::DataLoss,
            "browser_download_response_invalid",
        ));
    }
    staging.commit(&destination).await?;
    context
        .send_stream_payload(encode(&DownloadResponse {
            event: Some(Event::ByteLength(u32::try_from(received_bytes).map_err(
                |_| status(StatusCode::ResourceExhausted, "browser_download_too_large"),
            )?)),
        }))
        .await
}

async fn resolve_requested_target(
    rpc: &BrowserProtocolRpc,
    request: &ResolveTargetRequest,
) -> Result<BrowserTarget, Status> {
    let page = request.page.clone().filter(|value| !value.is_empty());
    let explicit_worktree = request
        .worktree
        .as_deref()
        .filter(|value| !value.is_empty());
    if !request.require_worktree
        && page.is_some()
        && explicit_worktree.is_none_or(|value| value == "all")
    {
        return Ok(target_for_page_and_worktree(page, None));
    }
    let worktree = match explicit_worktree {
        Some("all") => None,
        Some(explicit) if explicit != "active" && explicit != "current" => Some(
            normalize_explicit_worktree(explicit, &request.current_directory)?,
        ),
        _ => find_current_worktree(rpc, &request.current_directory)
            .await?
            .map(|worktree| format!("id:{}", worktree.id)),
    };
    if request.require_worktree && worktree.is_none() {
        return Err(status(
            StatusCode::FailedPrecondition,
            "browser_file_worktree_required",
        ));
    }
    Ok(target_for_page_and_worktree(page, worktree))
}

async fn find_requested_worktree(
    rpc: &BrowserProtocolRpc,
    explicit: Option<&str>,
    current_directory: &str,
) -> Result<Option<ResolvedWorktree>, Status> {
    match explicit.filter(|value| !value.is_empty()) {
        None | Some("active" | "current") => find_current_worktree(rpc, current_directory).await,
        Some("all") => Ok(None),
        Some(selector) => {
            let selector = normalize_explicit_worktree(selector, current_directory)?;
            resolve_worktree(rpc, &selector).await.map(Some)
        }
    }
}

async fn resolve_worktree(
    rpc: &BrowserProtocolRpc,
    selector: &str,
) -> Result<ResolvedWorktree, Status> {
    let normalized = selector.strip_prefix("id:").unwrap_or(selector);
    let mut matches = rpc
        .worktrees
        .list_resolved()
        .await
        .map_err(worktree_status)?
        .into_iter()
        .take(500)
        .filter(|worktree| {
            worktree.id == normalized
                || worktree.path == normalized
                || worktree.branch == normalized
                || worktree.display_name == normalized
                || selector
                    .strip_prefix("path:")
                    .is_some_and(|value| worktree.path == value)
                || selector
                    .strip_prefix("branch:")
                    .is_some_and(|value| worktree.branch == value)
                || selector
                    .strip_prefix("name:")
                    .is_some_and(|value| worktree.display_name == value)
        })
        .collect::<Vec<_>>();
    match matches.len() {
        0 => Err(status(StatusCode::NotFound, "worktree_not_found")),
        1 => Ok(matches.remove(0)),
        _ => Err(status(
            StatusCode::FailedPrecondition,
            "worktree_selector_ambiguous",
        )),
    }
}

async fn find_current_worktree(
    rpc: &BrowserProtocolRpc,
    current_directory: &str,
) -> Result<Option<ResolvedWorktree>, Status> {
    let current = absolute_path(current_directory, current_directory)?;
    Ok(rpc
        .worktrees
        .list_resolved()
        .await
        .map_err(worktree_status)?
        .into_iter()
        .take(500)
        .filter(|worktree| worktree.host_id == "local")
        .filter_map(|worktree| {
            let path = absolute_path(&worktree.path, current_directory).ok()?;
            is_inside(&path, &current).then_some((path.as_os_str().len(), worktree))
        })
        .max_by_key(|(path_length, _)| *path_length)
        .map(|(_, worktree)| worktree))
}

fn normalize_explicit_worktree(value: &str, current_directory: &str) -> Result<String, Status> {
    let Some(path) = value.strip_prefix("path:") else {
        return Ok(value.to_owned());
    };
    Ok(format!(
        "path:{}",
        absolute_path(path, current_directory)?.to_string_lossy()
    ))
}

fn absolute_path(value: &str, current_directory: &str) -> Result<PathBuf, Status> {
    let path = Path::new(value);
    let joined = if path.is_absolute() {
        path.to_path_buf()
    } else {
        Path::new(current_directory).join(path)
    };
    let mut normalized = PathBuf::new();
    for component in joined.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() && !normalized.has_root() {
                    return Err(status(StatusCode::InvalidArgument, "browser_path_invalid"));
                }
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    if !normalized.is_absolute() {
        return Err(status(StatusCode::InvalidArgument, "browser_path_invalid"));
    }
    Ok(normalized)
}

fn target_for_page_and_worktree(page: Option<String>, worktree: Option<String>) -> BrowserTarget {
    BrowserTarget { page, worktree }
}

fn remaining_timeout(context: &ProtocolCallContext, maximum: Duration) -> Result<Duration, Status> {
    let Some(deadline) = context.deadline() else {
        return Ok(maximum);
    };
    deadline
        .checked_duration_since(Instant::now())
        .filter(|remaining| !remaining.is_zero())
        .map(|remaining| remaining.min(maximum))
        .ok_or_else(|| {
            status(
                StatusCode::DeadlineExceeded,
                "Browser call deadline exceeded",
            )
        })
}

fn ensure_cli_caller(context: &ProtocolCallContext) -> Result<(), Status> {
    if context.peer_kind() == PeerKind::Cli {
        Ok(())
    } else {
        Err(status(
            StatusCode::PermissionDenied,
            "Browser host calls must originate from the local CLI",
        ))
    }
}

pub(super) async fn execute_mobile(
    rpc: &BrowserProtocolRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<Vec<u8>, Status> {
    ensure_mobile_caller(context)?;
    let mobile_request = decode::<ExecuteMobileRequest>(payload)?;
    let command = mobile_command_to_execute(
        mobile_request
            .command
            .ok_or_else(|| status(StatusCode::InvalidArgument, "Browser command is missing"))?,
    );
    let result = execute_command(
        rpc,
        principal_authority_id(context),
        command,
        context,
        COMMAND_TIMEOUT,
    )
    .await
    .and_then(|result| {
        execute_result_to_mobile(result)
            .ok_or_else(|| status(StatusCode::DataLoss, "browser_command_response_invalid"))
    })?;
    Ok(ExecuteMobileResponse {
        result: Some(result),
    }
    .encode_to_vec())
}

fn ensure_mobile_caller(context: &ProtocolCallContext) -> Result<(), Status> {
    if context.peer_kind() == PeerKind::IosApp {
        Ok(())
    } else {
        Err(status(
            StatusCode::PermissionDenied,
            "ExecuteMobile calls must originate from the iOS app",
        ))
    }
}

fn mobile_command_to_execute(command: MobileRequestCommand) -> RequestCommand {
    match command {
        MobileRequestCommand::Goto(value) => RequestCommand::Goto(value),
        MobileRequestCommand::Back(value) => RequestCommand::Back(value),
        MobileRequestCommand::Forward(value) => RequestCommand::Forward(value),
        MobileRequestCommand::Reload(value) => RequestCommand::Reload(value),
        MobileRequestCommand::Keypress(value) => RequestCommand::Keypress(value),
        MobileRequestCommand::InsertText(value) => RequestCommand::InsertText(value),
        MobileRequestCommand::MouseClick(value) => RequestCommand::MouseClick(value),
        MobileRequestCommand::MouseMove(value) => RequestCommand::MouseMove(value),
        MobileRequestCommand::MouseDown(value) => RequestCommand::MouseDown(value),
        MobileRequestCommand::MouseUp(value) => RequestCommand::MouseUp(value),
        MobileRequestCommand::MouseWheel(value) => RequestCommand::MouseWheel(value),
        MobileRequestCommand::TabCreate(value) => RequestCommand::TabCreate(value),
        MobileRequestCommand::DialogAccept(value) => RequestCommand::DialogAccept(value),
        MobileRequestCommand::DialogDismiss(value) => RequestCommand::DialogDismiss(value),
        MobileRequestCommand::Viewport(value) => RequestCommand::Viewport(value),
    }
}

fn execute_result_to_mobile(result: ResponseResult) -> Option<MobileResponseResult> {
    Some(match result {
        ResponseResult::Goto(value) => MobileResponseResult::Goto(value),
        ResponseResult::Back(value) => MobileResponseResult::Back(value),
        ResponseResult::Forward(value) => MobileResponseResult::Forward(value),
        ResponseResult::Reload(value) => MobileResponseResult::Reload(value),
        ResponseResult::Keypress(value) => MobileResponseResult::Keypress(value),
        ResponseResult::InsertText(value) => MobileResponseResult::InsertText(value),
        ResponseResult::MouseClick(value) => MobileResponseResult::MouseClick(value),
        ResponseResult::MouseMove(value) => MobileResponseResult::MouseMove(value),
        ResponseResult::MouseDown(value) => MobileResponseResult::MouseDown(value),
        ResponseResult::MouseUp(value) => MobileResponseResult::MouseUp(value),
        ResponseResult::MouseWheel(value) => MobileResponseResult::MouseWheel(value),
        ResponseResult::TabCreate(value) => MobileResponseResult::TabCreate(value),
        ResponseResult::DialogAccept(value) => MobileResponseResult::DialogAccept(value),
        ResponseResult::DialogDismiss(value) => MobileResponseResult::DialogDismiss(value),
        ResponseResult::Viewport(value) => MobileResponseResult::Viewport(value),
        _ => return None,
    })
}

async fn prepare_destination(root: &Path, requested: &str) -> Result<PathBuf, Status> {
    let destination = resolve_inside(root, requested)?;
    let parent = destination.parent().ok_or_else(|| {
        status(
            StatusCode::PermissionDenied,
            "browser_download_path_outside_worktree",
        )
    })?;
    tokio::fs::create_dir_all(parent).await.map_err(io_status)?;
    let parent = tokio::fs::canonicalize(parent).await.map_err(io_status)?;
    if !is_inside(root, &parent) {
        return Err(status(
            StatusCode::PermissionDenied,
            "browser_download_path_outside_worktree",
        ));
    }
    Ok(parent.join(destination.file_name().ok_or_else(|| {
        status(
            StatusCode::PermissionDenied,
            "browser_download_path_outside_worktree",
        )
    })?))
}

fn resolve_inside(root: &Path, requested: &str) -> Result<PathBuf, Status> {
    let mut destination = root.to_path_buf();
    for component in Path::new(requested).components() {
        match component {
            Component::Normal(value) => destination.push(value),
            Component::CurDir => {}
            Component::ParentDir if destination != root => {
                destination.pop();
            }
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return Err(status(
                    StatusCode::PermissionDenied,
                    "browser_download_path_outside_worktree",
                ));
            }
        }
    }
    Ok(destination)
}

fn is_inside(parent: &Path, candidate: &Path) -> bool {
    candidate == parent || candidate.starts_with(parent)
}

struct StagingFile {
    file: tokio::fs::File,
    path: PathBuf,
}

impl StagingFile {
    async fn create(destination: &Path) -> Result<Self, Status> {
        let parent = destination
            .parent()
            .ok_or_else(|| status(StatusCode::InvalidArgument, "browser_download_path_invalid"))?;
        let path = parent.join(format!(".agentstart-download-{}.part", random_uuid()?));
        let file = tokio::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)
            .await
            .map_err(io_status)?;
        Ok(Self { file, path })
    }

    async fn commit(mut self, destination: &Path) -> Result<(), Status> {
        self.file.flush().await.map_err(io_status)?;
        self.file.sync_all().await.map_err(io_status)?;
        atomic_file_replace::replace_async(&self.path, destination)
            .await
            .map_err(io_status)?;
        self.path = PathBuf::new();
        Ok(())
    }
}

impl Drop for StagingFile {
    fn drop(&mut self) {
        if !self.path.as_os_str().is_empty() {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

fn random_uuid() -> Result<String, Status> {
    let mut bytes = [0_u8; 16];
    fill(&mut bytes).map_err(|_| status(StatusCode::Internal, "browser_download_entropy"))?;
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

fn worktree_status(error: WorktreeCatalogError) -> Status {
    match error {
        WorktreeCatalogError::NotFound => status(StatusCode::NotFound, "worktree_not_found"),
        WorktreeCatalogError::AmbiguousSelector => status(
            StatusCode::FailedPrecondition,
            "worktree_selector_ambiguous",
        ),
        _ => status(StatusCode::Internal, &error.to_string()),
    }
}

fn reverse_status(error: ReverseProtocolError) -> Status {
    match error {
        ReverseProtocolError::ConnectionUnavailable => status(
            StatusCode::Unavailable,
            "browser_extension_connection_unavailable",
        ),
        ReverseProtocolError::DeadlineExceeded => status(
            StatusCode::DeadlineExceeded,
            "Browser call deadline exceeded",
        ),
        ReverseProtocolError::Protocol(message) => status(StatusCode::Internal, message),
        ReverseProtocolError::Remote { code, message } => status(code, &message),
    }
}

fn io_status(error: std::io::Error) -> Status {
    status(StatusCode::Internal, &error.to_string())
}
