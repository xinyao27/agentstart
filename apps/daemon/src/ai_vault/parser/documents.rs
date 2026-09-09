mod grok_rovo;
mod read;
mod standard;
mod storage;

use serde_json::Value;

use crate::hosts::{HostFilesystem, HostPlatform};

use super::super::accumulator;
use super::super::model::{AiVaultAgent, AiVaultSession, SessionCandidate};
use super::ParseError;

pub(super) async fn parse(
    candidate: &SessionCandidate,
    content: &str,
    filesystem: &HostFilesystem,
    execution_host_id: &str,
    platform: HostPlatform,
) -> Result<Option<AiVaultSession>, ParseError> {
    if candidate.agent == AiVaultAgent::Gemini && super::is_json_lines(candidate) {
        return super::lines::parse(candidate, content, filesystem, execution_host_id, platform)
            .await;
    }
    let value: Value = serde_json::from_str(content)?;
    let Some(record) = value.as_object() else {
        return Ok(None);
    };
    let mut state = accumulator::create(candidate);
    match candidate.agent {
        AiVaultAgent::Devin => standard::consume_devin(&mut state, record),
        AiVaultAgent::Gemini => standard::consume_gemini(&mut state, record),
        AiVaultAgent::Grok => grok_rovo::consume_grok(&mut state, record, filesystem).await?,
        AiVaultAgent::Hermes => standard::consume_hermes(&mut state, record),
        AiVaultAgent::Kimi => storage::consume_kimi(&mut state, record, filesystem).await?,
        AiVaultAgent::Opencode => storage::consume_opencode(&mut state, record, filesystem).await?,
        AiVaultAgent::Rovo => grok_rovo::consume_rovo(&mut state, record, filesystem).await?,
        _ => {
            return super::lines::parse(
                candidate,
                content,
                filesystem,
                execution_host_id,
                platform,
            )
            .await;
        }
    }
    Ok(accumulator::finalize(state, execution_host_id, platform))
}
