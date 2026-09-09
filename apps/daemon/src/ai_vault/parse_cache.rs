mod appended;
mod store;

use crate::hosts::{ExecutionHost, HostFilesystem, HostPlatform};

use super::model::{AiVaultAgent, AiVaultSession, SessionCandidate};
use super::parser::{self, LineFold, ParseError, TRANSCRIPT_MAX_BYTES};
use super::subagents;
use appended::Appended;
use store::{CacheHit, ResumePoint};

pub(in crate::ai_vault) use store::SessionParseCache;

#[derive(Clone, Copy)]
pub(super) enum ParseKind {
    Full,
    Incremental,
    Reused,
}

#[derive(Clone, Copy)]
pub(super) struct ParseAccounting {
    pub bytes_read: u64,
    pub kind: ParseKind,
}

pub(super) struct ParsedCandidate {
    pub accounting: ParseAccounting,
    pub session: Option<AiVaultSession>,
}

pub(super) struct ParseFailure {
    pub accounting: ParseAccounting,
    pub error: ParseError,
}

/// Parse a transcript, reusing prior work where the file is provably unchanged
/// (modification time plus size) and, for append-only JSONL transcripts,
/// resuming the fold from the last consumed byte when the file only grew. This
/// is what keeps the workbench's forced rescans from re-reading gigabytes of
/// transcripts on every pass.
pub(super) async fn parse_cached(
    cache: &SessionParseCache,
    candidate: &SessionCandidate,
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    execution_host_id: &str,
) -> Result<ParsedCandidate, ParseFailure> {
    let platform = host.platform();
    let resume = match cache.hit(execution_host_id, candidate, platform) {
        CacheHit::Reusable(session) => {
            let accounting = ParseAccounting {
                bytes_read: 0,
                kind: ParseKind::Reused,
            };
            let session = refreshed(cache, candidate, filesystem, execution_host_id, session)
                .await
                .map_err(|error| ParseFailure { accounting, error })?;
            return Ok(ParsedCandidate {
                accounting,
                session,
            });
        }
        CacheHit::Resumable(fold, byte_offset) => Some((fold, byte_offset)),
        CacheHit::Miss => None,
    };
    if parser::is_line_folded(candidate) {
        fold_transcript(
            cache,
            candidate,
            filesystem,
            execution_host_id,
            platform,
            resume,
        )
        .await
    } else {
        parse_document(
            cache,
            candidate,
            filesystem,
            host,
            execution_host_id,
            platform,
        )
        .await
    }
}

async fn fold_transcript(
    cache: &SessionParseCache,
    candidate: &SessionCandidate,
    filesystem: &HostFilesystem,
    execution_host_id: &str,
    platform: HostPlatform,
    resume: Option<(LineFold, u64)>,
) -> Result<ParsedCandidate, ParseFailure> {
    if candidate.size_bytes > TRANSCRIPT_MAX_BYTES as u64 {
        return Err(failure(ParseKind::Full, 0, ParseError::TooLarge));
    }
    let (mut fold, mut start) = resume.unwrap_or_else(|| (LineFold::new(candidate), 0));
    let mut read = appended::read(filesystem, &candidate.path, start, TRANSCRIPT_MAX_BYTES)
        .await
        .map_err(|error| failure(started(start), 0, error))?;
    if matches!(read, Appended::Rewritten) {
        fold = LineFold::new(candidate);
        start = 0;
        read = appended::read(filesystem, &candidate.path, 0, TRANSCRIPT_MAX_BYTES)
            .await
            .map_err(|error| failure(ParseKind::Full, 0, error))?;
    }
    let Appended::Lines(lines) = read else {
        return Err(failure(started(start), 0, ParseError::Missing));
    };
    let accounting = ParseAccounting {
        bytes_read: lines.bytes_read,
        kind: started(start),
    };
    fold.consume(&lines.content);
    fold.touch(candidate);
    // Keep parity with a whole-file parse: the final unterminated line is
    // displayed, but stays out of the fold a later scan resumes from.
    let session = match &lines.trailing_partial {
        Some(partial) => {
            let mut display = fold.clone();
            display.consume_line(partial);
            display
                .finalize(filesystem, execution_host_id, platform)
                .await
        }
        None => fold.finalize(filesystem, execution_host_id, platform).await,
    }
    .map_err(|error| ParseFailure { accounting, error })?;
    cache.store(
        execution_host_id,
        candidate,
        platform,
        session.clone(),
        Some(ResumePoint {
            fold,
            byte_offset: lines.consumed_through,
        }),
    );
    Ok(ParsedCandidate {
        accounting,
        session,
    })
}

async fn parse_document(
    cache: &SessionParseCache,
    candidate: &SessionCandidate,
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    execution_host_id: &str,
    platform: HostPlatform,
) -> Result<ParsedCandidate, ParseFailure> {
    // Why: a whole-document transcript is re-read in full whenever it changes,
    // and its sibling reads are not transcript bytes, so the scan charges the
    // stat size exactly as the retained Bun cache does.
    let accounting = ParseAccounting {
        bytes_read: candidate.size_bytes,
        kind: ParseKind::Full,
    };
    let session = parser::parse(candidate, filesystem, host, execution_host_id)
        .await
        .map_err(|error| ParseFailure { accounting, error })?;
    cache.store(
        execution_host_id,
        candidate,
        platform,
        session.clone(),
        None,
    );
    Ok(ParsedCandidate {
        accounting,
        session,
    })
}

async fn refreshed(
    cache: &SessionParseCache,
    candidate: &SessionCandidate,
    filesystem: &HostFilesystem,
    execution_host_id: &str,
    session: Option<AiVaultSession>,
) -> Result<Option<AiVaultSession>, ParseError> {
    let Some(mut session) = session else {
        return Ok(None);
    };
    if candidate.agent != AiVaultAgent::Claude || session.message_count != 0 {
        return Ok(Some(session));
    }
    let count = subagents::count(filesystem, &candidate.path).await?;
    if count != session.subagent_transcript_count {
        session.subagent_transcript_count = count;
        cache.set_subagent_count(execution_host_id, &candidate.path, count);
    }
    Ok(Some(session))
}

fn started(offset: u64) -> ParseKind {
    if offset > 0 {
        ParseKind::Incremental
    } else {
        ParseKind::Full
    }
}

fn failure(kind: ParseKind, bytes_read: u64, error: ParseError) -> ParseFailure {
    ParseFailure {
        accounting: ParseAccounting { bytes_read, kind },
        error,
    }
}
