// Why: One process-wide ring preserves context across all crash report entrypoints.

use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use super::model::{CrashReportBreadcrumb, CrashReportDetails};
use super::ordered_cache::BoundedOrderedMap;
use super::redaction::sanitize_breadcrumbs;

const MAX_BREADCRUMBS: usize = 30;
// Why: retain both heap thresholds for each renderer surface without growing the ring.
const MAX_RETAINED_BREADCRUMBS: usize = 4;
// Why: a coalesce key embeds an open-string agent type, so the key space is unbounded
// over a long multi-agent/SSH session. Bound the map the same way the ring itself is
// bounded.
const MAX_COALESCE_KEYS: usize = 128;

pub(super) struct BreadcrumbRing {
    inner: Mutex<RingState>,
}

struct RingState {
    breadcrumbs: VecDeque<CrashReportBreadcrumb>,
    retained: BoundedOrderedMap<CrashReportBreadcrumb>,
    coalesced: BoundedOrderedMap<CoalesceEntry>,
}

#[derive(Clone, Copy)]
struct CoalesceEntry {
    recorded_at_ms: i64,
    suppressed: u32,
}

pub(super) struct CoalesceOutcome {
    pub(super) suppressed_since_last: u32,
}

impl BreadcrumbRing {
    pub(super) fn new() -> Self {
        Self {
            inner: Mutex::new(RingState {
                breadcrumbs: VecDeque::new(),
                retained: BoundedOrderedMap::new(MAX_RETAINED_BREADCRUMBS),
                coalesced: BoundedOrderedMap::new(MAX_COALESCE_KEYS),
            }),
        }
    }

    pub(super) fn record(&self, name: &str, data: Option<CrashReportDetails>) {
        let Some(breadcrumb) = sanitize_one(name, data) else {
            return;
        };
        let mut state = lock(&self.inner);
        if let Some(retained_key) = retained_key(&breadcrumb) {
            state.retained.insert_most_recent(retained_key, breadcrumb);
            return;
        }
        state.breadcrumbs.push_back(breadcrumb);
        if state.breadcrumbs.len() > MAX_BREADCRUMBS {
            state.breadcrumbs.pop_front();
        }
    }

    /// Returns `None` when the event was suppressed as a duplicate within
    /// `min_interval_ms` of the last one sharing `coalesce_key`; otherwise records the
    /// breadcrumb (folding in how many prior occurrences were suppressed) and returns
    /// that count.
    pub(super) fn record_coalesced(
        &self,
        name: &str,
        data: Option<CrashReportDetails>,
        coalesce_key: &str,
        min_interval_ms: i64,
    ) -> Option<CoalesceOutcome> {
        let now = now_millis();
        let suppressed_since_last = {
            let mut state = lock(&self.inner);
            if let Some(entry) = state.coalesced.get_mut(coalesce_key)
                && now - entry.recorded_at_ms < min_interval_ms
            {
                entry.suppressed += 1;
                return None;
            }
            // Why: captured before pruning/eviction below, matching the TS source's
            // `previous` reference (read once, before the map is mutated further).
            let suppressed_since_last = state
                .coalesced
                .get(coalesce_key)
                .map(|entry| entry.suppressed)
                .unwrap_or(0);
            state
                .coalesced
                .retain(|entry| now - entry.recorded_at_ms < min_interval_ms);
            state.coalesced.insert_most_recent(
                coalesce_key.to_owned(),
                CoalesceEntry {
                    recorded_at_ms: now,
                    suppressed: 0,
                },
            );
            suppressed_since_last
        };
        let data = if suppressed_since_last > 0 {
            Some(with_suppressed_count(data, suppressed_since_last))
        } else {
            data
        };
        self.record(name, data);
        Some(CoalesceOutcome {
            suppressed_since_last,
        })
    }

    pub(super) fn snapshot(&self) -> Vec<CrashReportBreadcrumb> {
        let state = lock(&self.inner);
        let retained_count = state.retained.len();
        let recent_start = state
            .breadcrumbs
            .len()
            .saturating_sub(MAX_BREADCRUMBS - retained_count);
        let mut combined: Vec<CrashReportBreadcrumb> = state
            .retained
            .values()
            .cloned()
            .chain(state.breadcrumbs.iter().skip(recent_start).cloned())
            .collect();
        combined.sort_by(|left, right| left.created_at.cmp(&right.created_at));
        combined
    }
}

fn sanitize_one(name: &str, data: Option<CrashReportDetails>) -> Option<CrashReportBreadcrumb> {
    let candidate = CrashReportBreadcrumb {
        created_at: super::now_iso8601(),
        name: name.to_owned(),
        data,
    };
    sanitize_breadcrumbs(std::slice::from_ref(&candidate)).map(|mut sanitized| sanitized.remove(0))
}

fn retained_key(breadcrumb: &CrashReportBreadcrumb) -> Option<String> {
    if breadcrumb.name != "renderer_memory_highwater" {
        return None;
    }
    let surface = js_string(
        breadcrumb
            .data
            .as_ref()
            .and_then(|data| data.get("rendererSurface")),
    );
    let threshold = js_string(
        breadcrumb
            .data
            .as_ref()
            .and_then(|data| data.get("thresholdPct")),
    );
    Some(format!("{}:{surface}:{threshold}", breadcrumb.name))
}

/// `String(value)` for a possibly-absent field: JS reads a missing object property as
/// `undefined`, and `String(undefined)` is the literal text `"undefined"`.
fn js_string(value: Option<&serde_json::Value>) -> String {
    value.map_or_else(|| "undefined".to_owned(), super::model::js_string_scalar)
}

pub(super) fn with_suppressed_count(
    data: Option<CrashReportDetails>,
    suppressed_since_last: u32,
) -> CrashReportDetails {
    let mut data = data.unwrap_or_default();
    data.insert(
        "suppressedSinceLast".to_owned(),
        serde_json::Value::from(suppressed_since_last),
    );
    data
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

fn lock(mutex: &Mutex<RingState>) -> std::sync::MutexGuard<'_, RingState> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
