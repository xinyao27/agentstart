use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

use crate::hosts::HostPlatform;

use super::super::footprint;
use super::super::model::{AiVaultSession, SessionCandidate};
use super::super::parser::LineFold;

// Sized past the default recency cap (1000) plus the in-scope cap (2000) so a
// full steady-state result set stays resident between forced rescans.
const ENTRY_LIMIT: usize = 4_096;
// Why: entry count alone does not bound memory — one long transcript retains a
// token-usage record per assistant turn in both its session and its fold, so a
// few of them could pin far more than a full result set of ordinary sessions.
const RETAINED_BYTES_LIMIT: usize = 64 * 1024 * 1024;
const HASH_MAP_ENTRY_OVERHEAD_BYTES: usize = size_of::<Entry>() + size_of::<String>() + 32;

pub(in crate::ai_vault) struct SessionParseCache {
    entries: Mutex<Entries>,
}

pub(super) enum CacheHit {
    /// The file is provably unchanged, so its parsed session stands as is.
    Reusable(Option<AiVaultSession>),
    /// The file only grew, so the fold resumes from this byte offset.
    Resumable(LineFold, u64),
    Miss,
}

pub(super) struct ResumePoint {
    pub fold: LineFold,
    /// Byte offset just past the last complete ('\n'-terminated) line folded; a
    /// trailing unterminated line is deliberately left before this point.
    pub byte_offset: u64,
}

#[derive(Default)]
struct Entries {
    by_key: HashMap<String, Entry>,
    retained_bytes: usize,
    sequence: u64,
}

struct Entry {
    modified_at_ms: i64,
    platform: HostPlatform,
    resume: Option<ResumePoint>,
    retained_bytes: usize,
    sequence: u64,
    session: Option<AiVaultSession>,
    size_bytes: u64,
}

impl SessionParseCache {
    pub(in crate::ai_vault) fn new() -> Self {
        Self {
            entries: Mutex::new(Entries::default()),
        }
    }

    pub(super) fn hit(
        &self,
        host_id: &str,
        candidate: &SessionCandidate,
        platform: HostPlatform,
    ) -> CacheHit {
        let mut entries = lock(&self.entries);
        let sequence = entries.next_sequence();
        let Some(entry) = entries.by_key.get_mut(&key(host_id, &candidate.path)) else {
            return CacheHit::Miss;
        };
        if entry.platform != platform {
            return CacheHit::Miss;
        }
        entry.sequence = sequence;
        if entry.modified_at_ms == candidate.modified_at_ms
            && entry.size_bytes == candidate.size_bytes
        {
            return CacheHit::Reusable(entry.session.clone());
        }
        match &entry.resume {
            Some(resume) if candidate.size_bytes >= resume.byte_offset => {
                CacheHit::Resumable(resume.fold.clone(), resume.byte_offset)
            }
            _ => CacheHit::Miss,
        }
    }

    /// A zero-turn transcript usually never changes again, but its sibling
    /// subagents directory can gain files after the parent's last write. The
    /// mtime and size key cannot see that, so the reused session takes a
    /// refreshed count.
    pub(super) fn set_subagent_count(&self, host_id: &str, path: &str, count: u64) {
        let mut entries = lock(&self.entries);
        let Some(entry) = entries.by_key.get_mut(&key(host_id, path)) else {
            return;
        };
        let Some(session) = entry.session.as_mut() else {
            return;
        };
        session.subagent_transcript_count = count;
    }

    pub(super) fn store(
        &self,
        host_id: &str,
        candidate: &SessionCandidate,
        platform: HostPlatform,
        session: Option<AiVaultSession>,
        resume: Option<ResumePoint>,
    ) {
        let mut entries = lock(&self.entries);
        let sequence = entries.next_sequence();
        let stored = key(host_id, &candidate.path);
        let retained_bytes = session
            .as_ref()
            .map_or(0, footprint::session_bytes)
            .saturating_add(
                resume
                    .as_ref()
                    .map_or(0, |resume| resume.fold.retained_bytes()),
            )
            // Why: key/value inline storage, hash-table control bytes, and allocator bookkeeping
            // also consume the cache budget even though they are not part of either parsed value.
            .saturating_add(HASH_MAP_ENTRY_OVERHEAD_BYTES)
            .saturating_add(stored.capacity());
        let previous = entries.by_key.insert(
            stored.clone(),
            Entry {
                modified_at_ms: candidate.modified_at_ms,
                platform,
                resume,
                retained_bytes,
                sequence,
                session,
                size_bytes: candidate.size_bytes,
            },
        );
        entries.retained_bytes = entries
            .retained_bytes
            .saturating_sub(previous.map_or(0, |entry| entry.retained_bytes))
            .saturating_add(retained_bytes);
        entries.enforce_limits();
    }
}

impl Entries {
    fn next_sequence(&mut self) -> u64 {
        self.sequence = self.sequence.saturating_add(1);
        self.sequence
    }

    fn enforce_limits(&mut self) {
        if self.within_limits() {
            return;
        }
        let mut order = self
            .by_key
            .iter()
            .map(|(key, entry)| (entry.sequence, key.clone()))
            .collect::<Vec<_>>();
        order.sort_unstable();
        // Why: dropping a fold only costs the next scan a full re-parse, while
        // dropping the entry also loses unchanged-file reuse, so folds go first.
        for (_, key) in &order {
            if self.retained_bytes <= RETAINED_BYTES_LIMIT {
                break;
            }
            self.release_fold(key);
        }
        for (_, key) in &order {
            if self.within_limits() {
                break;
            }
            if let Some(entry) = self.by_key.remove(key) {
                self.retained_bytes = self.retained_bytes.saturating_sub(entry.retained_bytes);
            }
        }
        debug_assert!(
            self.within_limits(),
            "parse cache must enforce both entry and retained-byte limits"
        );
    }

    fn release_fold(&mut self, key: &str) {
        let Some(entry) = self.by_key.get_mut(key) else {
            return;
        };
        let Some(resume) = entry.resume.take() else {
            return;
        };
        let released = resume.fold.retained_bytes();
        entry.retained_bytes = entry.retained_bytes.saturating_sub(released);
        self.retained_bytes = self.retained_bytes.saturating_sub(released);
    }

    fn within_limits(&self) -> bool {
        self.by_key.len() <= ENTRY_LIMIT && self.retained_bytes <= RETAINED_BYTES_LIMIT
    }
}

fn key(host_id: &str, path: &str) -> String {
    format!("{host_id}\0{path}")
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
