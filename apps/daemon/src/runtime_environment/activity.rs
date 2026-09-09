use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

use super::records::StoredEnvironment;

// Why: activity is stored at one-minute granularity so routed traffic cannot rewrite the
// authority document on every call.
pub(super) const LAST_ACTIVITY_GRANULARITY_MS: i64 = 60_000;

/// The activity an environment record already carries, mirrored in memory so the decision to
/// persist is answered without touching the authority document.
#[derive(Clone)]
pub(super) struct EnvironmentActivityRecord {
    last_used_at_unix_ms: Option<i64>,
    runtime_id: Option<String>,
}

impl EnvironmentActivityRecord {
    pub(super) fn is_stale(&self, runtime_id: &str, now: i64) -> bool {
        self.runtime_id.as_deref() != Some(runtime_id)
            || self.last_used_at_unix_ms.is_none_or(|last_used| {
                now.saturating_sub(last_used) >= LAST_ACTIVITY_GRANULARITY_MS
            })
    }
}

/// Owns which caller persists an environment's activity. A claim is granted only when the
/// mirrored record is stale, and holding it makes every concurrent caller observe the pending
/// value, so a burst of routed calls collapses into a single write.
pub(super) struct EnvironmentActivity {
    state: Mutex<ActivityState>,
}

struct ActivityState {
    next_sequence: u64,
    records: HashMap<String, ClaimedRecord>,
}

struct ClaimedRecord {
    record: EnvironmentActivityRecord,
    sequence: u64,
}

pub(super) struct EnvironmentActivityClaim<'a> {
    activity: &'a EnvironmentActivity,
    environment_id: String,
    previous: Option<EnvironmentActivityRecord>,
    sequence: u64,
}

impl EnvironmentActivity {
    pub(super) fn seeded(environments: &[StoredEnvironment]) -> Self {
        let records = environments
            .iter()
            .map(|environment| {
                (
                    environment.id.clone(),
                    ClaimedRecord {
                        record: observed(environment),
                        sequence: 0,
                    },
                )
            })
            .collect();
        Self {
            state: Mutex::new(ActivityState {
                next_sequence: 1,
                records,
            }),
        }
    }

    /// `None` means the mirrored activity is still current and nothing has to be written.
    pub(super) fn claim(
        &self,
        environment_id: &str,
        runtime_id: &str,
        now: i64,
    ) -> Option<EnvironmentActivityClaim<'_>> {
        let mut state = lock(&self.state);
        // Why: the still-current answer is the hot path, so it reads the mirrored record without
        // allocating; only a genuine transition pays for the rollback copy.
        if state
            .records
            .get(environment_id)
            .is_some_and(|claimed| !claimed.record.is_stale(runtime_id, now))
        {
            return None;
        }
        let previous = state
            .records
            .get(environment_id)
            .map(|claimed| claimed.record.clone());
        let sequence = state.next_sequence;
        state.next_sequence = sequence.wrapping_add(1);
        // Why: the pending value is the unclamped `now`, a lower bound on what the document will
        // record, so a coalesced caller can never look fresher than the write it stands in for.
        state.records.insert(
            environment_id.to_owned(),
            ClaimedRecord {
                record: EnvironmentActivityRecord {
                    last_used_at_unix_ms: Some(now),
                    runtime_id: Some(runtime_id.to_owned()),
                },
                sequence,
            },
        );
        Some(EnvironmentActivityClaim {
            activity: self,
            environment_id: environment_id.to_owned(),
            previous,
            sequence,
        })
    }

    pub(super) fn forget(&self, environment_id: &str) {
        lock(&self.state).records.remove(environment_id);
    }

    fn resolve_claim(
        &self,
        environment_id: &str,
        sequence: u64,
        record: Option<EnvironmentActivityRecord>,
    ) {
        let mut state = lock(&self.state);
        // Why: a newer claim already owns this environment, so a late settle or rollback must not
        // resurrect the activity it observed.
        if state
            .records
            .get(environment_id)
            .is_none_or(|claimed| claimed.sequence != sequence)
        {
            return;
        }
        match record {
            Some(record) => {
                state.records.insert(
                    environment_id.to_owned(),
                    ClaimedRecord { record, sequence },
                );
            }
            None => {
                state.records.remove(environment_id);
            }
        }
    }
}

impl EnvironmentActivityClaim<'_> {
    pub(super) fn settle(self, record: EnvironmentActivityRecord) {
        self.activity
            .resolve_claim(&self.environment_id, self.sequence, Some(record));
    }

    pub(super) fn rollback(self) {
        let Self {
            activity,
            environment_id,
            previous,
            sequence,
        } = self;
        activity.resolve_claim(&environment_id, sequence, previous);
    }
}

pub(super) fn observed(environment: &StoredEnvironment) -> EnvironmentActivityRecord {
    EnvironmentActivityRecord {
        last_used_at_unix_ms: environment.last_used_at_unix_ms,
        runtime_id: environment.runtime_id.clone(),
    }
}

pub(super) fn record(
    environment: &mut StoredEnvironment,
    runtime_id: &str,
    now: i64,
) -> EnvironmentActivityRecord {
    // Why: recorded activity never moves behind the document's own timestamps, so a skewed clock
    // cannot make an environment look older than the moment it was created or last updated.
    let recorded_at = now
        .max(environment.created_at_unix_ms)
        .max(environment.updated_at_unix_ms);
    environment.runtime_id = Some(runtime_id.to_owned());
    environment.last_used_at_unix_ms = Some(recorded_at);
    environment.updated_at_unix_ms = recorded_at;
    observed(environment)
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
