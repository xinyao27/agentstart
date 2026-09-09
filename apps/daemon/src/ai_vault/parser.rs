mod documents;
mod lines;
pub(super) mod opencode;

use thiserror::Error;

use crate::hosts::{ExecutionHost, HostFilesystem};

use super::model::{AiVaultAgent, AiVaultSession, SessionCandidate};

pub(in crate::ai_vault) use lines::LineFold;

pub(super) const TRANSCRIPT_MAX_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug, Error)]
pub(super) enum ParseError {
    #[error("AI Vault transcript is not available")]
    Missing,
    #[error("AI Vault transcript exceeds the {TRANSCRIPT_MAX_BYTES}-byte scan bound")]
    TooLarge,
    #[error("AI Vault transcript contains invalid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Filesystem(#[from] crate::hosts::HostFilesystemError),
    #[error("OpenCode database scan failed: {0}")]
    OpenCode(String),
}

pub(super) async fn parse(
    candidate: &SessionCandidate,
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    execution_host_id: &str,
) -> Result<Option<AiVaultSession>, ParseError> {
    if candidate.agent == AiVaultAgent::Opencode && candidate.path.contains("#session:") {
        return opencode::parse_sqlite(candidate, host, execution_host_id).await;
    }
    if candidate.size_bytes > TRANSCRIPT_MAX_BYTES as u64 {
        return Err(ParseError::TooLarge);
    }
    let bytes = filesystem
        .read(&candidate.path, TRANSCRIPT_MAX_BYTES)
        .await?
        .ok_or(ParseError::Missing)?;
    let content = String::from_utf8_lossy(&bytes);
    match candidate.agent {
        AiVaultAgent::Devin
        | AiVaultAgent::Gemini
        | AiVaultAgent::Grok
        | AiVaultAgent::Hermes
        | AiVaultAgent::Kimi
        | AiVaultAgent::Opencode
        | AiVaultAgent::Rovo => {
            documents::parse(
                candidate,
                &content,
                filesystem,
                execution_host_id,
                host.platform(),
            )
            .await
        }
        _ => {
            lines::parse(
                candidate,
                &content,
                filesystem,
                execution_host_id,
                host.platform(),
            )
            .await
        }
    }
}

/// Whether this transcript is folded line by line, and so can resume from the
/// last complete line instead of being re-read whole. Whole-JSON documents are
/// rewritten in place, Kimi reads a state doc plus a sibling wire file, and
/// OpenCode reads SQLite rows or a doc plus a message directory — those keep
/// unchanged-file reuse only and re-parse whole when they change.
pub(super) fn is_line_folded(candidate: &SessionCandidate) -> bool {
    match candidate.agent {
        AiVaultAgent::Antigravity
        | AiVaultAgent::Claude
        | AiVaultAgent::Codex
        | AiVaultAgent::Copilot
        | AiVaultAgent::Cursor
        | AiVaultAgent::Droid
        | AiVaultAgent::Omp
        | AiVaultAgent::Openclaw
        | AiVaultAgent::Pi => true,
        AiVaultAgent::Gemini => is_json_lines(candidate),
        AiVaultAgent::Devin
        | AiVaultAgent::Grok
        | AiVaultAgent::Hermes
        | AiVaultAgent::Kimi
        | AiVaultAgent::Opencode
        | AiVaultAgent::Rovo => false,
    }
}

pub(super) fn token_total(value: Option<&serde_json::Value>) -> u64 {
    let Some(record) = value.and_then(serde_json::Value::as_object) else {
        return 0;
    };
    for key in [
        "total",
        "totalTokens",
        "total_tokens",
        "tokenCount",
        "token_count",
        "tokens",
    ] {
        let count = super::text::number(record.get(key));
        if count > 0 {
            return count;
        }
    }
    [
        "input",
        "inputTokens",
        "input_tokens",
        "promptTokens",
        "prompt_tokens",
        "output",
        "outputTokens",
        "output_tokens",
        "completionTokens",
        "completion_tokens",
        "cacheRead",
        "cacheReadTokens",
        "cache_read",
        "cache_read_tokens",
        "cacheReadInputTokens",
        "cache_read_input_tokens",
        "cached",
        "cachedInputTokens",
        "cached_input_tokens",
        "cacheWrite",
        "cacheWriteTokens",
        "cache_write",
        "cache_write_tokens",
        "cacheCreationTokens",
        "cache_creation_input_tokens",
        "cache_creation_tokens",
        "cacheCreationInputTokens",
    ]
    .into_iter()
    .fold(0_u64, |total, key| {
        total.saturating_add(super::text::number(record.get(key)))
    })
}

pub(super) fn normalized_usage(
    value: Option<&serde_json::Value>,
    provider: Option<String>,
    model: Option<String>,
    timestamp: Option<String>,
) -> Option<super::model::AiVaultSessionTokenUsage> {
    let record = value?.as_object()?;
    let first = |keys: &[&str]| -> u64 {
        keys.iter()
            .find_map(|key| {
                let value = super::text::number(record.get(*key));
                (value > 0).then_some(value)
            })
            .unwrap_or(0)
    };
    let input_tokens = first(&[
        "input",
        "inputTokens",
        "input_tokens",
        "promptTokens",
        "prompt_tokens",
    ]);
    let output_tokens = first(&[
        "output",
        "outputTokens",
        "output_tokens",
        "completionTokens",
        "completion_tokens",
    ]);
    let cache_read_tokens = first(&[
        "cacheRead",
        "cacheReadTokens",
        "cache_read",
        "cache_read_tokens",
        "cacheReadInputTokens",
        "cache_read_input_tokens",
        "cached",
        "cachedInputTokens",
        "cached_input_tokens",
    ]);
    let cache_write_tokens = first(&[
        "cacheWrite",
        "cacheWriteTokens",
        "cache_write",
        "cache_write_tokens",
        "cacheCreationTokens",
        "cache_creation_input_tokens",
        "cache_creation_tokens",
        "cacheCreationInputTokens",
    ]);
    let reasoning_output_tokens = first(&[
        "reasoning",
        "reasoningOutputTokens",
        "reasoning_output_tokens",
    ]);
    let explicit = first(&[
        "total",
        "totalTokens",
        "total_tokens",
        "tokenCount",
        "token_count",
        "tokens",
    ]);
    let total_tokens = explicit.max(
        input_tokens
            .saturating_add(output_tokens)
            .saturating_add(cache_read_tokens)
            .saturating_add(cache_write_tokens),
    );
    (total_tokens > 0).then_some(super::model::AiVaultSessionTokenUsage {
        provider,
        model,
        timestamp,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_write_tokens,
        reasoning_output_tokens,
        total_tokens,
    })
}

pub(super) fn is_json_lines(candidate: &SessionCandidate) -> bool {
    candidate.path.to_ascii_lowercase().ends_with(".jsonl")
}
