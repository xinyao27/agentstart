mod claude_codex;
mod graph;
mod standard;

use crate::hosts::{HostFilesystem, HostPlatform};

use super::super::model::{AiVaultAgent, AiVaultSession, SessionAccumulator, SessionCandidate};
use super::super::{accumulator, footprint, text};
use super::ParseError;

/// One in-progress fold of an append-only JSONL transcript, resumable across
/// scans. The parse cache keeps a fold per file and feeds it only newly
/// appended lines, so the workbench's forced rescans stop re-reading
/// transcripts that only grew by a few records.
#[derive(Clone)]
pub(in crate::ai_vault) struct LineFold {
    agent: AiVaultAgent,
    // Why: a Codex worker rollout is rejected the moment its session_meta says
    // so. Later records must not resurrect it, and a resumed fold has to stay
    // rejected without re-reading the file that rejected it.
    aborted: bool,
    codex_previous_tokens: u64,
    pending_kimi: String,
    state: SessionAccumulator,
}

impl LineFold {
    pub(in crate::ai_vault) fn new(candidate: &SessionCandidate) -> Self {
        let mut state = accumulator::create(candidate);
        if candidate.agent == AiVaultAgent::Antigravity {
            state.session_id = graph::antigravity_id(&candidate.path).unwrap_or_default();
        }
        Self {
            agent: candidate.agent,
            aborted: false,
            codex_previous_tokens: 0,
            pending_kimi: String::new(),
            state,
        }
    }

    pub(in crate::ai_vault) fn consume(&mut self, content: &str) {
        for line in content.lines() {
            self.consume_line(line);
        }
    }

    pub(in crate::ai_vault) fn consume_line(&mut self, line: &str) {
        if self.aborted {
            return;
        }
        let Some(value) = text::parse_json_line(line) else {
            return;
        };
        let Some(record) = value.as_object() else {
            return;
        };
        match self.agent {
            AiVaultAgent::Claude => claude_codex::consume_claude(&mut self.state, record),
            AiVaultAgent::Codex => claude_codex::consume_codex(
                &mut self.state,
                record,
                &mut self.codex_previous_tokens,
                &mut self.aborted,
            ),
            AiVaultAgent::Copilot => standard::consume_copilot(&mut self.state, record),
            AiVaultAgent::Cursor => standard::consume_cursor(&mut self.state, record),
            AiVaultAgent::Droid => standard::consume_droid(&mut self.state, record),
            AiVaultAgent::Gemini => standard::consume_gemini(&mut self.state, record),
            AiVaultAgent::Openclaw | AiVaultAgent::Pi | AiVaultAgent::Omp => {
                graph::consume_graph(&mut self.state, record)
            }
            AiVaultAgent::Antigravity => graph::consume_antigravity(&mut self.state, record),
            AiVaultAgent::Kimi => {
                graph::consume_kimi(&mut self.state, record, &mut self.pending_kimi)
            }
            _ => standard::consume_generic(&mut self.state, record),
        }
    }

    /// Refresh the file metadata this scan displays without re-parsing, so a
    /// resumed fold still reports the current modification time.
    pub(in crate::ai_vault) fn touch(&mut self, candidate: &SessionCandidate) {
        self.state.modified_at.clone_from(&candidate.modified_at);
    }

    pub(in crate::ai_vault) fn retained_bytes(&self) -> usize {
        footprint::accumulator_bytes(&self.state).saturating_add(self.pending_kimi.capacity())
    }

    /// Finalize a snapshot: the fold keeps folding appended lines after this
    /// session object is handed out, and the trailing Kimi chunk must not be
    /// flushed into the state a later scan resumes from.
    pub(in crate::ai_vault) async fn finalize(
        &self,
        filesystem: &HostFilesystem,
        execution_host_id: &str,
        platform: HostPlatform,
    ) -> Result<Option<AiVaultSession>, ParseError> {
        if self.aborted {
            return Ok(None);
        }
        let mut state = self.state.clone();
        let mut pending = self.pending_kimi.clone();
        graph::flush_kimi(&mut state, &mut pending);
        if self.agent == AiVaultAgent::Claude {
            state.subagent_transcript_count =
                super::super::subagents::count(filesystem, &state.file_path).await?;
        }
        Ok(accumulator::finalize(state, execution_host_id, platform))
    }
}

pub(super) async fn parse(
    candidate: &SessionCandidate,
    content: &str,
    filesystem: &HostFilesystem,
    execution_host_id: &str,
    platform: HostPlatform,
) -> Result<Option<AiVaultSession>, ParseError> {
    let mut fold = LineFold::new(candidate);
    fold.consume(content);
    fold.finalize(filesystem, execution_host_id, platform).await
}
