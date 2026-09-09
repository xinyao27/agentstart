use std::ffi::OsString;
use std::io;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use super::install::EXTENSION_ORIGIN;

#[derive(Debug, Deserialize)]
struct NativeRequest {
    id: String,
    #[serde(rename = "type")]
    kind: NativeRequestKind,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum NativeRequestKind {
    Bootstrap,
    PickDirectory,
}

#[derive(Serialize)]
#[serde(untagged)]
enum NativeResponse<'a> {
    Bootstrap(NativeBootstrapResponse<'a>),
    Error(NativeErrorResponse<'a>),
    PickDirectory(NativePickDirectoryResponse<'a>),
}

#[derive(Serialize)]
struct NativeErrorResponse<'a> {
    id: &'a str,
    ok: bool,
    error: NativeErrorBody,
}

#[derive(Serialize)]
struct NativeErrorBody {
    code: &'static str,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeBootstrapResponse<'a> {
    id: &'a str,
    ok: bool,
    result: NativeBootstrapResult,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeBootstrapResult {
    auth_token: String,
    daemon_started: bool,
    endpoint: String,
    extension_origin: &'static str,
    protocol_version: serde_json::Number,
    rpc_protocol: String,
    runtime_id: String,
}

#[derive(Serialize)]
struct NativePickDirectoryResponse<'a> {
    id: &'a str,
    ok: bool,
    result: NativePickDirectoryResult,
}

#[derive(Serialize)]
struct NativePickDirectoryResult {
    path: Option<String>,
}

#[derive(Debug, Error)]
pub(crate) enum NativeMessagingError {
    #[error("native_messaging_origin_denied")]
    OriginDenied,
    #[error("native_messaging_invalid_request")]
    InvalidRequest,
    #[error(transparent)]
    Frame(#[from] super::frame::NativeFrameError),
    #[error("native messaging response serialization failed: {0}")]
    Json(#[from] serde_json::Error),
}

pub(crate) fn run(args: &[OsString]) -> Result<(), NativeMessagingError> {
    validate_origin(args)?;
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut input = stdin.lock();
    let mut output = stdout.lock();

    while let Some(message) = super::frame::read_message(&mut input)? {
        let message_text = String::from_utf8_lossy(&message);
        let request = serde_json::from_str::<NativeRequest>(&message_text)
            .map_err(|_| NativeMessagingError::InvalidRequest)?;
        let response = match request.kind {
            NativeRequestKind::Bootstrap => bootstrap_response(&request.id),
            NativeRequestKind::PickDirectory => match super::picker::pick_project_directory() {
                Ok(path) => NativeResponse::PickDirectory(NativePickDirectoryResponse {
                    id: &request.id,
                    ok: true,
                    result: NativePickDirectoryResult { path },
                }),
                Err(message) => error_response(&request.id, message),
            },
        };
        let body = serde_json::to_vec(&response)?;
        super::frame::write_message(&mut output, &body)?;
    }
    Ok(())
}

fn bootstrap_response(id: &str) -> NativeResponse<'_> {
    match super::bootstrap::read_or_start() {
        Ok(live) => NativeResponse::Bootstrap(NativeBootstrapResponse {
            id,
            ok: true,
            result: NativeBootstrapResult {
                auth_token: live.bootstrap.auth_token,
                daemon_started: live.daemon_started,
                endpoint: live.bootstrap.endpoint,
                extension_origin: super::bootstrap::extension_origin(),
                protocol_version: live.bootstrap.protocol_version,
                rpc_protocol: live.bootstrap.rpc_protocol,
                runtime_id: live.bootstrap.runtime_id,
            },
        }),
        Err(error) => error_response(id, error.to_string()),
    }
}

fn error_response<'a>(id: &'a str, message: impl Into<String>) -> NativeResponse<'a> {
    NativeResponse::Error(NativeErrorResponse {
        id,
        ok: false,
        error: NativeErrorBody {
            code: "native_bootstrap_failed",
            message: message.into(),
        },
    })
}

fn validate_origin(args: &[OsString]) -> Result<(), NativeMessagingError> {
    let caller_origin = args
        .iter()
        .filter_map(|argument| argument.to_str())
        .find(|argument| argument.starts_with("chrome-extension://"));
    if caller_origin
        .map(|origin| origin.strip_suffix('/').unwrap_or(origin))
        .is_some_and(|origin| origin != EXTENSION_ORIGIN)
    {
        return Err(NativeMessagingError::OriginDenied);
    }
    Ok(())
}
