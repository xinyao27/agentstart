// Why: Repeated renderer errors share a ten-minute deduplication window and the current breadcrumb snapshot.

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value};

use super::breadcrumb_ring::BreadcrumbRing;
use super::host_info;
use super::model::{
    CrashReportCreateInput, CrashReportSource, RendererErrorReportArgs, RendererErrorReportKind,
    RendererErrorReportResult, RendererErrorSurface, string_field,
};
use super::ordered_cache::BoundedOrderedMap;
use super::store::CrashReportStore;

const DEDUPE_MS: i64 = 10 * 60 * 1_000;
const MAX_KEY_AGE_MS: i64 = DEDUPE_MS * 2;
const MAX_RECENT_KEYS: usize = 256;
const REPORT_KEY_MAX_LENGTH: usize = 12_000;

pub(super) struct RendererErrorDedupe {
    recent: Mutex<BoundedOrderedMap<i64>>,
}

impl RendererErrorDedupe {
    pub(super) fn new() -> Self {
        Self {
            recent: Mutex::new(BoundedOrderedMap::new(MAX_RECENT_KEYS)),
        }
    }
}

struct Normalized {
    kind: RendererErrorReportKind,
    origin_id: String,
    surface: RendererErrorSurface,
    error_name: String,
    error_message: String,
    error_stack: Option<String>,
    component_stack: Option<String>,
    active_view: Option<String>,
    active_modal: Option<Option<String>>,
    active_tab_type: Option<Option<String>>,
    active_right_sidebar_tab: Option<Option<String>>,
    has_active_worktree: Option<bool>,
    chrome_version: Option<String>,
}

fn normalize(args: RendererErrorReportArgs) -> Option<Normalized> {
    let origin_id = string_field(&args.origin_id, 120)?;
    let surface = args.surface?;
    Some(Normalized {
        kind: args.kind,
        origin_id,
        surface,
        error_name: args
            .error_name
            .as_deref()
            .and_then(|value| string_field(value, 120))
            .unwrap_or_else(|| "Error".to_owned()),
        error_message: args
            .error_message
            .as_deref()
            .and_then(|value| string_field(value, 1_000))
            .unwrap_or_else(|| "Unknown render error".to_owned()),
        error_stack: args
            .error_stack
            .as_deref()
            .and_then(|value| string_field(value, 8_000)),
        component_stack: args
            .component_stack
            .as_deref()
            .and_then(|value| string_field(value, 8_000)),
        active_view: args
            .active_view
            .as_deref()
            .and_then(|value| string_field(value, 80)),
        active_modal: args.active_modal,
        active_tab_type: args.active_tab_type,
        active_right_sidebar_tab: args.active_right_sidebar_tab,
        has_active_worktree: args.has_active_worktree,
        chrome_version: args
            .chrome_version
            .as_deref()
            .and_then(|value| string_field(value, 120)),
    })
}

pub(super) async fn record(
    store: &CrashReportStore,
    ring: &BreadcrumbRing,
    dedupe: &RendererErrorDedupe,
    app_version: &str,
    args: RendererErrorReportArgs,
) -> RendererErrorReportResult {
    let Some(args) = normalize(args) else {
        return RendererErrorReportResult::Err {
            error: "Invalid renderer error report.".to_owned(),
        };
    };

    let now = now_millis();
    let key = report_key(&args);
    {
        let mut recent = lock(&dedupe.recent);
        prune_keys(&mut recent, now);
        if now - recent.get(&key).copied().unwrap_or(0) < DEDUPE_MS {
            return RendererErrorReportResult::Ok {
                report: None,
                deduped: true,
            };
        }
        recent.set_or_insert(key, now);
        prune_keys(&mut recent, now);
    }

    let process_type = match args.kind {
        RendererErrorReportKind::ReactErrorBoundary => "react-render",
        RendererErrorReportKind::TerminalError => "terminal",
        RendererErrorReportKind::RendererUnhandledError => "renderer",
    };
    let mut details = Map::new();
    details.insert(
        if args.kind == RendererErrorReportKind::ReactErrorBoundary {
            "boundary_id".to_owned()
        } else {
            "error_origin".to_owned()
        },
        Value::String(args.origin_id.clone()),
    );
    details.insert(
        "surface".to_owned(),
        Value::String(args.surface.as_str().to_owned()),
    );
    details.insert(
        "error_name".to_owned(),
        Value::String(args.error_name.clone()),
    );
    details.insert(
        "error_message".to_owned(),
        Value::String(args.error_message.clone()),
    );
    if let Some(stack) = &args.error_stack {
        details.insert("error_stack".to_owned(), Value::String(stack.clone()));
    }
    if let Some(stack) = &args.component_stack {
        details.insert("component_stack".to_owned(), Value::String(stack.clone()));
    }
    if let Some(view) = &args.active_view {
        details.insert("active_view".to_owned(), Value::String(view.clone()));
    }
    if let Some(modal) = &args.active_modal {
        details.insert(
            "active_modal".to_owned(),
            modal.clone().map(Value::String).unwrap_or(Value::Null),
        );
    }
    if let Some(tab_type) = &args.active_tab_type {
        details.insert(
            "active_tab_type".to_owned(),
            tab_type.clone().map(Value::String).unwrap_or(Value::Null),
        );
    }
    if let Some(sidebar_tab) = &args.active_right_sidebar_tab {
        // Why: Stored reports and their formatters depend on the persisted right_sidebar_tab key.
        details.insert(
            "right_sidebar_tab".to_owned(),
            sidebar_tab
                .clone()
                .map(Value::String)
                .unwrap_or(Value::Null),
        );
    }
    if let Some(has_active_worktree) = args.has_active_worktree {
        details.insert(
            "has_active_worktree".to_owned(),
            Value::Bool(has_active_worktree),
        );
    }

    let report = store
        .record(CrashReportCreateInput {
            source: CrashReportSource::Renderer,
            process_type: process_type.to_owned(),
            reason: args.kind.as_str().to_owned(),
            exit_code: None,
            app_version: app_version.to_owned(),
            platform: host_info::platform().to_owned(),
            os_release: host_info::os_release().await,
            arch: host_info::architecture().to_owned(),
            chrome_version: args.chrome_version.unwrap_or_else(|| "unknown".to_owned()),
            details,
            breadcrumbs: ring.snapshot(),
        })
        .await;

    match report {
        Ok(report) => RendererErrorReportResult::Ok {
            report: Some(Box::new(report)),
            deduped: false,
        },
        Err(error) => {
            eprintln!("[crash-reports] failed to record renderer error report: {error}");
            RendererErrorReportResult::Err {
                error: "Failed to record renderer error report.".to_owned(),
            }
        }
    }
}

// Why: absent componentStack stays omitted, preserving the renderer dedupe key.
fn report_key(args: &Normalized) -> String {
    let mut map = Map::new();
    map.insert(
        "kind".to_owned(),
        Value::String(args.kind.as_str().to_owned()),
    );
    map.insert("originId".to_owned(), Value::String(args.origin_id.clone()));
    map.insert(
        "surface".to_owned(),
        Value::String(args.surface.as_str().to_owned()),
    );
    map.insert(
        "errorName".to_owned(),
        Value::String(args.error_name.clone()),
    );
    map.insert(
        "errorMessage".to_owned(),
        Value::String(args.error_message.clone()),
    );
    if let Some(stack) = &args.component_stack {
        map.insert("componentStack".to_owned(), Value::String(stack.clone()));
    }
    let json = serde_json::to_string(&Value::Object(map)).unwrap_or_default();
    super::model::utf16_prefix(&json, REPORT_KEY_MAX_LENGTH).to_owned()
}

fn prune_keys(recent: &mut BoundedOrderedMap<i64>, now: i64) {
    recent.retain(|seen_at| now - *seen_at <= MAX_KEY_AGE_MS);
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

fn lock(
    mutex: &Mutex<BoundedOrderedMap<i64>>,
) -> std::sync::MutexGuard<'_, BoundedOrderedMap<i64>> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
