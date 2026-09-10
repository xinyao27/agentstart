// Reads and writes the same `ui` document the legacy Bun `Store.getUI()`/`updateUI()` persisted
// (now owned by `UiAuthority`). Star-nag fields are opaque to `crate::ui::normalize` — they pass
// through unchanged — so this module is the only place that knows their names and defaults.

use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value};

use super::session::PromptSource;

// Why not `enum`: proto-generated policy constants aside, this file mirrors plain numeric Bun
// constants (`STAR_NAG_INITIAL_THRESHOLD`, `STAR_NAG_COOLDOWN_DAYS`).
pub(super) const STAR_NAG_INITIAL_THRESHOLD: u64 = 35;
pub(super) const STAR_NAG_COOLDOWN_DAYS: u64 = 3;
const STAR_NAG_COOLDOWN_MS: i64 = STAR_NAG_COOLDOWN_DAYS as i64 * 24 * 60 * 60 * 1000;

/// Why: matches the fallback every other Rust call site uses for "current app version" — there is
/// no shared helper for it in this codebase, each authority reads the same two sources inline.
pub(super) fn app_version() -> String {
    std::env::var("AGENTSTART_APP_VERSION").unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_owned())
}

pub(super) fn now_millis() -> i64 {
    i64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0),
    )
    .unwrap_or(i64::MAX)
}

pub(super) fn is_completed(ui: &Value) -> bool {
    ui.get("starNagCompleted")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

pub(super) fn deferred_until(ui: &Value) -> Option<i64> {
    ui.get("starNagDeferredUntil").and_then(Value::as_i64)
}

pub(super) fn is_cooldown_active(deferred_until: Option<i64>, now: i64) -> bool {
    deferred_until.is_some_and(|until| until > now)
}

pub(super) fn next_threshold(ui: &Value) -> u64 {
    ui.get("starNagNextThreshold")
        .and_then(Value::as_u64)
        .unwrap_or(STAR_NAG_INITIAL_THRESHOLD)
}

pub(super) fn baseline_agents(ui: &Value) -> Option<u64> {
    ui.get("starNagBaselineAgents").and_then(Value::as_u64)
}

pub(super) fn app_version_current(ui: &Value) -> bool {
    ui.get("starNagAppVersion").and_then(Value::as_str) == Some(app_version().as_str())
}

pub(super) fn agent_value_moment_consumed(ui: &Value) -> bool {
    ui.get("starNagAgentValueMomentAppVersion")
        .and_then(Value::as_str)
        == Some(app_version().as_str())
}

// Why `baseline_agents` returns `Option<u64>` rather than applying a default itself: Bun's
// `?? 0` fallback in `createStarNagPromptSession` is specific to that one call site — a future
// caller (e.g. a ported `hasReachedStarNagThreshold`) may need a different fallback, so the
// default is left to each caller rather than baked in here.

pub(super) fn baseline_update(total_agents_spawned: u64) -> Map<String, Value> {
    Map::from_iter([
        ("starNagAppVersion".to_owned(), Value::String(app_version())),
        (
            "starNagBaselineAgents".to_owned(),
            Value::from(total_agents_spawned),
        ),
        (
            "starNagNextThreshold".to_owned(),
            Value::from(STAR_NAG_INITIAL_THRESHOLD),
        ),
    ])
}

pub(super) fn completed_update() -> Map<String, Value> {
    Map::from_iter([
        ("starNagCompleted".to_owned(), Value::Bool(true)),
        ("starNagDeferredUntil".to_owned(), Value::Null),
    ])
}

pub(super) fn defer_update(next_threshold: u64, total_agents_spawned: u64) -> Map<String, Value> {
    Map::from_iter([
        (
            "starNagNextThreshold".to_owned(),
            Value::from(next_threshold),
        ),
        (
            "starNagBaselineAgents".to_owned(),
            Value::from(total_agents_spawned),
        ),
        (
            "starNagDeferredUntil".to_owned(),
            Value::from(now_millis().saturating_add(STAR_NAG_COOLDOWN_MS)),
        ),
    ])
}

pub(super) fn agent_value_moment_consumed_update() -> Map<String, Value> {
    Map::from_iter([(
        "starNagAgentValueMomentAppVersion".to_owned(),
        Value::String(app_version()),
    )])
}

/// Why: `logStarNagEvent` is a pure `console.info` debug breadcrumb in Bun (never wired, never
/// persisted, never transmitted) — ported as a structured `eprintln!` since Rust has no direct
/// equivalent. The `agents_since_baseline` value is the session's own cached figure rather than a
/// fresh stats re-read, which only matters if an agent starts in the instant between showing the
/// prompt and the user dismissing it.
pub(super) fn log_event(
    event: &str,
    threshold: u64,
    agents_since_baseline: u64,
    source: PromptSource,
    next_threshold: Option<u64>,
) {
    let app_version = app_version();
    let source = source.as_str();
    match next_threshold {
        Some(next_threshold) => eprintln!(
            "[star-nag] event={event} app_version={app_version} threshold={threshold} \
             agents_since_baseline={agents_since_baseline} source={source} \
             next_threshold={next_threshold}"
        ),
        None => eprintln!(
            "[star-nag] event={event} app_version={app_version} threshold={threshold} \
             agents_since_baseline={agents_since_baseline} source={source}"
        ),
    }
}
