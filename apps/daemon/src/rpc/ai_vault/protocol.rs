use chrono::{DateTime, NaiveDate};
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    AiVaultDayTokens, AiVaultDayTokensList, AiVaultHostPlatform, AiVaultPreviewMessage,
    AiVaultPreviewRole, AiVaultScanIssue, AiVaultServiceListSessionsRequest,
    AiVaultServiceListSessionsResponse, AiVaultServiceListSubagentSessionsRequest,
    AiVaultServiceListSubagentSessionsResponse, AiVaultSession, AiVaultSubagentInfo,
    AiVaultSubagentStatus, AiVaultTokenUsage, AiVaultTokenUsageList,
};
use yiru_protocol::transport::{decode, encode};

use crate::ai_vault::AiVaultAuthority;
use crate::ai_vault::model::{
    AiVaultAgent, AiVaultListInput, AiVaultListResult, AiVaultScanIssue as AuthorityIssue,
    AiVaultSession as AuthoritySession, AiVaultSessionDayTokens as AuthorityDayTokens,
    AiVaultSessionPreviewMessage as AuthorityPreviewMessage,
    AiVaultSessionSubagentInfo as AuthoritySubagentInfo,
    AiVaultSessionTokenUsage as AuthorityTokenUsage,
    AiVaultSubagentRunStatus as AuthoritySubagentStatus, PreviewRole,
};

const DEFAULT_LIMIT: usize = 1_000;
const MAX_LIMIT: u32 = 2_000;
const MAX_SCOPE_PATH_CODE_UNITS: usize = 4_096;
const MAX_SCOPE_PATHS: usize = 64;

pub(in crate::rpc) async fn list_sessions(
    authority: &AiVaultAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<AiVaultServiceListSessionsRequest>(payload)?;
    let input = list_input(request)?;
    let result = authority.list(input).await;
    Ok(encode(&protocol_result(result)?))
}

pub(in crate::rpc) async fn list_subagent_sessions(
    authority: &AiVaultAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<AiVaultServiceListSubagentSessionsRequest>(payload)?;
    // Why: the legacy subagent list accepted unknown agent names and blank
    // selectors by returning an empty scan instead of failing, so trimming and
    // the lenient parse mirror that instead of raising InvalidArgument.
    let agent =
        optional_value(request.agent.as_deref()).and_then(|value| AiVaultAgent::parse(&value));
    let parent_path = optional_value(request.parent_file_path.as_deref());
    let execution_host_id = optional_value(request.execution_host_id.as_deref());
    let result = authority
        .list_subagents(agent, parent_path, execution_host_id)
        .await;
    let sessions = result
        .sessions
        .into_iter()
        .map(protocol_session)
        .collect::<Result<Vec<_>, _>>()?;
    let issues = result
        .issues
        .into_iter()
        .map(protocol_issue)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(encode(&AiVaultServiceListSubagentSessionsResponse {
        sessions,
        issues,
    }))
}

fn optional_value(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn list_input(request: AiVaultServiceListSessionsRequest) -> Result<AiVaultListInput, Status> {
    let limit = match request.limit {
        None | Some(0) => DEFAULT_LIMIT,
        Some(limit) if limit <= MAX_LIMIT => usize::try_from(limit).map_err(|_| {
            invalid_argument("AI Vault session limit cannot be represented on this host")
        })?,
        Some(_) => {
            return Err(invalid_argument(
                "AI Vault session limit must be at most 2000",
            ));
        }
    };
    if request.scope_paths.len() > MAX_SCOPE_PATHS {
        return Err(invalid_argument(
            "AI Vault scope contains more than 64 paths",
        ));
    }
    if request.scope_paths.iter().any(|path| {
        path.is_empty()
            || path.encode_utf16().count() > MAX_SCOPE_PATH_CODE_UNITS
            || path.contains('\0')
    }) {
        return Err(invalid_argument(
            "AI Vault scope paths must contain 1 through 4096 UTF-16 code units",
        ));
    }
    let execution_host_scope = request
        .execution_host_scope
        .map(|value| required_host_scope(&value))
        .transpose()?;
    let execution_host_id = request
        .execution_host_id
        .map(|value| required_runtime_host_id(&value))
        .transpose()?;
    Ok(AiVaultListInput {
        compact: request.compact,
        execution_host_id,
        execution_host_scope,
        force: request.force,
        limit,
        scope_paths: request.scope_paths,
    })
}

fn protocol_result(
    result: AiVaultListResult,
) -> Result<AiVaultServiceListSessionsResponse, Status> {
    required_timestamp(&result.scanned_at, "AI Vault scan timestamp")?;
    Ok(AiVaultServiceListSessionsResponse {
        sessions: result
            .sessions
            .into_iter()
            .map(protocol_session)
            .collect::<Result<Vec<_>, _>>()?,
        issues: result
            .issues
            .into_iter()
            .map(protocol_issue)
            .collect::<Result<Vec<_>, _>>()?,
        scanned_at: result.scanned_at,
    })
}

fn protocol_session(session: AuthoritySession) -> Result<AiVaultSession, Status> {
    required_non_empty(&session.id, "AI Vault session identifier")?;
    required_non_empty(
        &session.execution_host_id,
        "AI Vault execution host identifier",
    )?;
    required_non_empty(&session.session_id, "AI Vault provider session identifier")?;
    required_non_empty(&session.file_path, "AI Vault transcript path")?;
    required_timestamp(&session.modified_at, "AI Vault modified timestamp")?;
    optional_timestamp(session.created_at.as_deref(), "AI Vault creation timestamp")?;
    optional_timestamp(session.updated_at.as_deref(), "AI Vault update timestamp")?;
    Ok(AiVaultSession {
        id: session.id,
        execution_host_id: session.execution_host_id,
        execution_host_platform: session
            .execution_host_platform
            .as_deref()
            .map(protocol_platform)
            .transpose()?
            .map(i32::from),
        agent: protocol_agent(session.agent)?,
        session_id: session.session_id,
        title: session.title,
        cwd: session.cwd,
        branch: session.branch,
        model: session.model,
        file_path: session.file_path,
        codex_home: session.codex_home,
        created_at: session.created_at,
        updated_at: session.updated_at,
        modified_at: session.modified_at,
        message_count: session.message_count,
        total_tokens: session.total_tokens,
        tokens_by_day: session.tokens_by_day.map(protocol_day_tokens).transpose()?,
        token_usage: session.token_usage.map(protocol_token_usage).transpose()?,
        preview_messages: session
            .preview_messages
            .into_iter()
            .map(protocol_preview)
            .collect::<Result<Vec<_>, _>>()?,
        last_user_prompt: session.last_user_prompt,
        queued_message_count: session.queued_message_count,
        subagent_transcript_count: session.subagent_transcript_count,
        resume_command: session.resume_command,
        subagent: session.subagent.map(protocol_subagent).transpose()?,
    })
}

fn protocol_day_tokens(values: Vec<AuthorityDayTokens>) -> Result<AiVaultDayTokensList, Status> {
    Ok(AiVaultDayTokensList {
        values: values
            .into_iter()
            .map(|value| {
                NaiveDate::parse_from_str(&value.day, "%Y-%m-%d").map_err(|_| {
                    data_loss("AI Vault daily token usage has an invalid calendar day")
                })?;
                Ok(AiVaultDayTokens {
                    day: value.day,
                    tokens: value.tokens,
                })
            })
            .collect::<Result<Vec<_>, Status>>()?,
    })
}

fn protocol_token_usage(values: Vec<AuthorityTokenUsage>) -> Result<AiVaultTokenUsageList, Status> {
    Ok(AiVaultTokenUsageList {
        values: values
            .into_iter()
            .map(|value| {
                optional_timestamp(value.timestamp.as_deref(), "AI Vault token timestamp")?;
                Ok(AiVaultTokenUsage {
                    provider: value.provider,
                    model: value.model,
                    timestamp: value.timestamp,
                    input_tokens: value.input_tokens,
                    output_tokens: value.output_tokens,
                    cache_read_tokens: value.cache_read_tokens,
                    cache_write_tokens: value.cache_write_tokens,
                    reasoning_output_tokens: value.reasoning_output_tokens,
                    total_tokens: value.total_tokens,
                })
            })
            .collect::<Result<Vec<_>, Status>>()?,
    })
}

fn protocol_preview(message: AuthorityPreviewMessage) -> Result<AiVaultPreviewMessage, Status> {
    optional_timestamp(
        message.timestamp.as_deref(),
        "AI Vault preview message timestamp",
    )?;
    Ok(AiVaultPreviewMessage {
        role: i32::from(match message.role {
            PreviewRole::Assistant => AiVaultPreviewRole::Assistant,
            PreviewRole::System => AiVaultPreviewRole::System,
            PreviewRole::Tool => AiVaultPreviewRole::Tool,
            PreviewRole::Unknown => AiVaultPreviewRole::Unknown,
            PreviewRole::User => AiVaultPreviewRole::User,
        }),
        text: message.text,
        timestamp: message.timestamp,
    })
}

fn protocol_subagent(info: AuthoritySubagentInfo) -> Result<AiVaultSubagentInfo, Status> {
    required_non_empty(
        &info.parent_session_id,
        "AI Vault subagent parent session identifier",
    )?;
    Ok(AiVaultSubagentInfo {
        parent_session_id: info.parent_session_id,
        agent_type: info.agent_type,
        status: info.status.map(protocol_subagent_status).map(i32::from),
    })
}

fn protocol_issue(issue: AuthorityIssue) -> Result<AiVaultScanIssue, Status> {
    if issue.message.trim().is_empty() {
        return Err(data_loss("AI Vault scan issue has no diagnostic message"));
    }
    Ok(AiVaultScanIssue {
        execution_host_id: issue.execution_host_id,
        agent: protocol_agent(issue.agent)?,
        path: issue.path,
        message: issue.message,
    })
}

fn protocol_agent(agent: AiVaultAgent) -> Result<String, Status> {
    let value = agent.as_str();
    required_bounded(value, 64, "AI Vault agent")?;
    Ok(value.to_owned())
}

fn protocol_platform(value: &str) -> Result<AiVaultHostPlatform, Status> {
    match value {
        "darwin" => Ok(AiVaultHostPlatform::Darwin),
        "linux" => Ok(AiVaultHostPlatform::Linux),
        "win32" => Ok(AiVaultHostPlatform::Windows),
        "unknown" => Ok(AiVaultHostPlatform::Unknown),
        _ => Err(data_loss("AI Vault session has an unknown host platform")),
    }
}

fn protocol_subagent_status(value: AuthoritySubagentStatus) -> AiVaultSubagentStatus {
    match value {
        AuthoritySubagentStatus::Completed => AiVaultSubagentStatus::Completed,
        AuthoritySubagentStatus::Failed => AiVaultSubagentStatus::Failed,
        AuthoritySubagentStatus::Running => AiVaultSubagentStatus::Running,
        AuthoritySubagentStatus::Stopped => AiVaultSubagentStatus::Stopped,
    }
}

fn required_host_scope(value: &str) -> Result<String, Status> {
    let value = value.trim();
    if matches!(value, "all" | "local")
        || ["runtime:", "ssh:", "wsl:"]
            .iter()
            .any(|prefix| valid_host_id(value, prefix))
    {
        return Ok(value.to_owned());
    }
    Err(invalid_argument("AI Vault execution host scope is invalid"))
}

fn required_runtime_host_id(value: &str) -> Result<String, Status> {
    let value = value.trim();
    if valid_host_id(value, "runtime:") {
        Ok(value.to_owned())
    } else {
        Err(invalid_argument(
            "AI Vault execution host identifier must identify a runtime",
        ))
    }
}

fn valid_host_id(value: &str, prefix: &str) -> bool {
    let Some(encoded) = value.strip_prefix(prefix).filter(|value| !value.is_empty()) else {
        return false;
    };
    let bytes = encoded.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let Some(high) = bytes.get(index + 1).and_then(|value| hex(*value)) else {
                return false;
            };
            let Some(low) = bytes.get(index + 2).and_then(|value| hex(*value)) else {
                return false;
            };
            decoded.push((high << 4) | low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    std::str::from_utf8(&decoded).is_ok_and(|value| !value.trim().is_empty())
}

fn hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn optional_timestamp(value: Option<&str>, field: &str) -> Result<(), Status> {
    if let Some(value) = value {
        required_timestamp(value, field)?;
    }
    Ok(())
}

fn required_timestamp(value: &str, field: &str) -> Result<(), Status> {
    DateTime::parse_from_rfc3339(value)
        .map(|_| ())
        .map_err(|_| data_loss(&format!("{field} is not RFC 3339")))
}

fn required_non_empty(value: &str, field: &str) -> Result<(), Status> {
    if value.trim().is_empty() {
        Err(data_loss(&format!("{field} is empty")))
    } else {
        Ok(())
    }
}

fn required_bounded(value: &str, maximum: usize, field: &str) -> Result<(), Status> {
    required_non_empty(value, field)?;
    if value.encode_utf16().count() > maximum || value.contains('\0') {
        return Err(data_loss(&format!(
            "{field} exceeds {maximum} UTF-16 code units or contains a null character"
        )));
    }
    Ok(())
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn data_loss(message: &str) -> Status {
    status(StatusCode::DataLoss, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
