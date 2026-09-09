use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;
use thiserror::Error;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AppServerInvocation {
    pub(super) args: Vec<String>,
    pub(super) command: String,
    #[serde(default)]
    pub(super) env: HashMap<String, String>,
    #[serde(default)]
    pub(super) env_to_delete: Vec<String>,
    pub(super) timeout_ms: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GrantRequest {
    pub(super) expected_trust_keys: Vec<String>,
    pub(super) hooks_list_cwd: String,
    pub(super) invocation: AppServerInvocation,
    pub(super) managed_command: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TrustMove {
    pub(super) command: String,
    pub(super) new_key: String,
    pub(super) old_key: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CapturedTrustMove {
    pub(super) command: String,
    pub(super) enabled: bool,
    pub(super) new_key: String,
    pub(super) reported_old_key: String,
    pub(super) was_trusted: bool,
}

#[derive(Debug)]
pub(super) enum EntryRequest {
    Grant(GrantRequest),
    Inspect {
        hooks_list_cwd: String,
        invocation: AppServerInvocation,
        moves: Vec<TrustMove>,
    },
    Repair {
        hooks_list_cwd: String,
        invocation: AppServerInvocation,
        moves: Vec<CapturedTrustMove>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RebaseRequest<T> {
    hooks_list_cwd: String,
    invocation: AppServerInvocation,
    moves: Vec<T>,
}

#[derive(Debug, Error)]
pub(super) enum GrantError {
    #[error("codex app-server exited before completing the session")]
    EarlyExit,
    #[error("{0}")]
    Message(String),
    #[error("{0}")]
    OutputLimit(String),
    #[error("{0}")]
    Timeout(String),
    #[error("{0}")]
    Unsupported(String),
}

impl GrantError {
    pub(super) fn error_name(&self) -> &'static str {
        match self {
            Self::EarlyExit | Self::Message(_) | Self::OutputLimit(_) => "Error",
            Self::Timeout(_) => "CodexAppServerTimeoutError",
            Self::Unsupported(_) => "CodexAppServerUnsupportedError",
        }
    }

    pub(super) const fn is_unsupported(&self) -> bool {
        matches!(self, Self::Unsupported(_))
    }
}

impl From<std::io::Error> for GrantError {
    fn from(error: std::io::Error) -> Self {
        Self::Message(error.to_string())
    }
}

impl From<serde_json::Error> for GrantError {
    fn from(error: serde_json::Error) -> Self {
        Self::Message(error.to_string())
    }
}

pub(super) fn parse_request(raw: &[u8]) -> Result<EntryRequest, GrantError> {
    let value = serde_json::from_slice::<Value>(raw).map_err(|error| {
        GrantError::Message(format!(
            "invalid trust-grant request JSON: {}",
            legacy_json_error(raw, &error)
        ))
    })?;
    match value.get("operation").and_then(Value::as_str) {
        Some("inspect-user-hook-trust") => {
            let request = serde_json::from_value::<RebaseRequest<TrustMove>>(value)?;
            Ok(EntryRequest::Inspect {
                hooks_list_cwd: request.hooks_list_cwd,
                invocation: request.invocation,
                moves: request.moves,
            })
        }
        Some("repair-user-hook-trust") => {
            let request = serde_json::from_value::<RebaseRequest<CapturedTrustMove>>(value)?;
            Ok(EntryRequest::Repair {
                hooks_list_cwd: request.hooks_list_cwd,
                invocation: request.invocation,
                moves: request.moves,
            })
        }
        Some(operation) => Err(GrantError::Message(format!(
            "unsupported trust-grant operation: {operation}"
        ))),
        None => Ok(EntryRequest::Grant(serde_json::from_value(value)?)),
    }
}

fn legacy_json_error(raw: &[u8], error: &serde_json::Error) -> String {
    let text = String::from_utf8_lossy(raw);
    let trimmed = text.trim();
    let message = error.to_string();
    let detail = if trimmed.is_empty() {
        "Unexpected EOF".to_owned()
    } else if message.starts_with("EOF while parsing an object") {
        "Expected '}'".to_owned()
    } else if message.starts_with("EOF while parsing") {
        "Unexpected EOF".to_owned()
    } else if message.starts_with("expected `:`") {
        "Expected ':' before value in object property definition".to_owned()
    } else if message.starts_with("trailing comma") && trimmed.starts_with('{') {
        "Property name must be a string literal".to_owned()
    } else if message.starts_with("expected value") || message.starts_with("expected ident") {
        unexpected_identifier(&text, error.line(), error.column()).map_or(message, |identifier| {
            format!("Unexpected identifier \"{identifier}\"")
        })
    } else {
        message
    };
    format!("JSON Parse error: {detail}")
}

fn unexpected_identifier(text: &str, line: usize, column: usize) -> Option<String> {
    let line = text.lines().nth(line.saturating_sub(1))?;
    let prefix = line.chars().take(column.max(1)).collect::<String>();
    let identifier = prefix
        .chars()
        .rev()
        .skip_while(|character| !character.is_ascii_alphabetic())
        .take_while(char::is_ascii_alphabetic)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    (!identifier.is_empty()).then_some(identifier)
}
