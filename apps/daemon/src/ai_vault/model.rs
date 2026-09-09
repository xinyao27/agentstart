use std::collections::BTreeMap;

use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum AiVaultAgent {
    Antigravity,
    Claude,
    Codex,
    Copilot,
    Cursor,
    Devin,
    Droid,
    Gemini,
    Grok,
    Hermes,
    Kimi,
    Omp,
    Openclaw,
    Opencode,
    Pi,
    Rovo,
}

impl AiVaultAgent {
    pub(super) const ALL: [Self; 16] = [
        Self::Claude,
        Self::Codex,
        Self::Hermes,
        Self::Pi,
        Self::Omp,
        Self::Cursor,
        Self::Gemini,
        Self::Antigravity,
        Self::Rovo,
        Self::Copilot,
        Self::Opencode,
        Self::Grok,
        Self::Openclaw,
        Self::Devin,
        Self::Droid,
        Self::Kimi,
    ];

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Antigravity => "antigravity",
            Self::Claude => "claude",
            Self::Codex => "codex",
            Self::Copilot => "copilot",
            Self::Cursor => "cursor",
            Self::Devin => "devin",
            Self::Droid => "droid",
            Self::Gemini => "gemini",
            Self::Grok => "grok",
            Self::Hermes => "hermes",
            Self::Kimi => "kimi",
            Self::Omp => "omp",
            Self::Openclaw => "openclaw",
            Self::Opencode => "opencode",
            Self::Pi => "pi",
            Self::Rovo => "rovo",
        }
    }

    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Antigravity => "Antigravity",
            Self::Claude => "Claude",
            Self::Codex => "Codex",
            Self::Copilot => "GitHub Copilot",
            Self::Cursor => "Cursor",
            Self::Devin => "Devin",
            Self::Droid => "Droid",
            Self::Gemini => "Gemini",
            Self::Grok => "Grok",
            Self::Hermes => "Hermes",
            Self::Kimi => "Kimi",
            Self::Omp => "OMP",
            Self::Openclaw => "OpenClaw",
            Self::Opencode => "OpenCode",
            Self::Pi => "Pi",
            Self::Rovo => "Rovo Dev",
        }
    }

    pub(crate) fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|agent| agent.as_str() == value)
    }
}

#[derive(Clone, Debug)]
pub(crate) struct AiVaultListInput {
    pub compact: bool,
    pub execution_host_id: Option<String>,
    pub execution_host_scope: Option<String>,
    pub force: bool,
    pub limit: usize,
    pub scope_paths: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiVaultListResult {
    pub sessions: Vec<AiVaultSession>,
    pub issues: Vec<AiVaultScanIssue>,
    pub scanned_at: String,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct AiVaultSubagentListResult {
    pub sessions: Vec<AiVaultSession>,
    pub issues: Vec<AiVaultScanIssue>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiVaultScanIssue {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_host_id: Option<String>,
    pub agent: AiVaultAgent,
    pub path: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiVaultSession {
    pub id: String,
    pub execution_host_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_host_platform: Option<String>,
    pub agent: AiVaultAgent,
    pub session_id: String,
    pub title: String,
    pub cwd: Option<String>,
    pub branch: Option<String>,
    pub model: Option<String>,
    pub file_path: String,
    pub codex_home: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub modified_at: String,
    pub message_count: u64,
    pub total_tokens: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_by_day: Option<Vec<AiVaultSessionDayTokens>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_usage: Option<Vec<AiVaultSessionTokenUsage>>,
    pub preview_messages: Vec<AiVaultSessionPreviewMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_user_prompt: Option<String>,
    pub queued_message_count: u64,
    pub subagent_transcript_count: u64,
    pub resume_command: String,
    pub subagent: Option<AiVaultSessionSubagentInfo>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiVaultSessionDayTokens {
    pub day: String,
    pub tokens: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiVaultSessionTokenUsage {
    pub provider: Option<String>,
    pub model: Option<String>,
    pub timestamp: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub reasoning_output_tokens: u64,
    pub total_tokens: u64,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct AiVaultSessionPreviewMessage {
    pub role: PreviewRole,
    pub text: String,
    pub timestamp: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum PreviewRole {
    Assistant,
    System,
    Tool,
    Unknown,
    User,
}

impl PreviewRole {
    pub(super) fn parse(value: &str) -> Self {
        match value {
            "assistant" => Self::Assistant,
            "system" => Self::System,
            "tool" => Self::Tool,
            "user" => Self::User,
            _ => Self::Unknown,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiVaultSessionSubagentInfo {
    pub parent_session_id: String,
    pub agent_type: Option<String>,
    pub status: Option<AiVaultSubagentRunStatus>,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum AiVaultSubagentRunStatus {
    Completed,
    Failed,
    Running,
    Stopped,
}

#[derive(Clone, Debug)]
pub(super) struct SessionCandidate {
    pub agent: AiVaultAgent,
    pub codex_home: Option<String>,
    pub modified_at: String,
    pub modified_at_ms: i64,
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Clone)]
pub(super) struct SessionAccumulator {
    pub agent: AiVaultAgent,
    pub branch: Option<String>,
    pub codex_home: Option<String>,
    pub created_at_ms: Option<i64>,
    pub cwd: Option<String>,
    pub file_path: String,
    pub last_user_prompt: Option<String>,
    pub message_count: u64,
    pub model: Option<String>,
    pub modified_at: String,
    pub preview_messages: Vec<AiVaultSessionPreviewMessage>,
    pub provider: Option<String>,
    pub queued_message_count: u64,
    pub session_id: String,
    pub subagent_transcript_count: u64,
    pub title: Option<String>,
    pub token_usage: Vec<AiVaultSessionTokenUsage>,
    pub tokens_by_day: BTreeMap<String, u64>,
    pub total_tokens: u64,
    pub updated_at_ms: Option<i64>,
}
