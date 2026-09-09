use crate::hosts::HostFilesystem;

use super::super::parser::ParseError;

const NEWLINE: u8 = b'\n';

pub(super) enum Appended {
    /// The resume point still sits just past a line break, so only the bytes
    /// written after it were read.
    Lines(AppendedLines),
    /// The byte before the resume point is no longer a newline, so the file was
    /// rewritten rather than appended to and the fold has to start over.
    Rewritten,
    Missing,
}

pub(super) struct AppendedLines {
    /// Transcript bytes this scan actually read, excluding the newline probe.
    pub bytes_read: u64,
    /// Byte offset just past the last complete ('\n'-terminated) line, which a
    /// later scan resumes from.
    pub consumed_through: u64,
    /// The complete lines, ready to fold.
    pub content: String,
    /// A final unterminated line. It is displayed but stays out of the fold, so
    /// the still-growing line is re-read once complete instead of being
    /// half-counted.
    pub trailing_partial: Option<String>,
}

/// Read a transcript from `start` to at most `max_bytes` further, keeping byte
/// offsets exact so a resumed read begins precisely where the last complete
/// line ended.
///
/// A resume point is only valid if it still sits just past a line break;
/// anything else means the file was rewritten. Heuristic: a rewrite that grew
/// and kept '\n' at exactly this byte would slip through, but agent transcripts
/// are append-only so that trade is accepted — the worst case is a stale vault
/// row until the file is next truncated or the daemon restarts.
pub(super) async fn read(
    filesystem: &HostFilesystem,
    path: &str,
    start: u64,
    max_bytes: usize,
) -> Result<Appended, ParseError> {
    // Why: the newline check and the append read are one range read, so a remote
    // host pays a single round trip per resumed transcript. The probe byte is
    // not transcript content and is not charged to bytes_read.
    let resumes = start > 0;
    let offset = start.saturating_sub(u64::from(resumes));
    let limit = max_bytes.saturating_add(usize::from(resumes));
    let Some(bytes) = filesystem.read_range(path, offset, limit).await? else {
        return Ok(Appended::Missing);
    };
    let region = if resumes {
        match bytes.split_first() {
            Some((&NEWLINE, rest)) => rest,
            _ => return Ok(Appended::Rewritten),
        }
    } else {
        &bytes[..]
    };
    let complete = region
        .iter()
        .rposition(|byte| *byte == NEWLINE)
        .map_or(0, |index| index.saturating_add(1));
    let (folded, partial) = region.split_at(complete);
    Ok(Appended::Lines(AppendedLines {
        bytes_read: region.len() as u64,
        consumed_through: start.saturating_add(complete as u64),
        content: String::from_utf8_lossy(folded).into_owned(),
        trailing_partial: (!partial.is_empty())
            .then(|| String::from_utf8_lossy(partial).into_owned()),
    }))
}
