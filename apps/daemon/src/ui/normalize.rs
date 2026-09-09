mod feature;
mod lists;
pub(super) mod workspace;

use serde_json::{Map, Number, Value};

use super::defaults;

pub(crate) use feature::BucketEvent;
pub(crate) use feature::IDS as FEATURE_INTERACTION_IDS;

const RESERVED_KEYS: &[&str] = &[
    "featureInteractionTelemetryBuckets",
    "_worktreeCardModeDefaulted",
    "trayMinimizeNoticeShown",
    "windowBounds",
    "windowMaximized",
];

pub(super) fn read(raw: Option<&Value>) -> Map<String, Value> {
    let raw = stripped(raw);
    let mut ui = defaults::ui();
    ui.extend(raw.clone());
    normalize_fields(&mut ui, &raw, None);
    ui
}

pub(super) fn apply(
    current: Option<&Value>,
    updates: &Map<String, Value>,
) -> (Map<String, Value>, bool) {
    let previous = read(current);
    let current_raw = stripped(current);
    let updates = stripped(Some(&Value::Object(updates.clone())));
    let mut ui = defaults::ui();
    ui.extend(current_raw.clone());
    ui.extend(updates.clone());
    normalize_fields(&mut ui, &current_raw, Some(&updates));
    let changed = ui != previous;
    (ui, changed)
}

pub(super) fn record_interaction(
    current: Option<&Value>,
    telemetry: Option<&Value>,
    id: &str,
    now_millis: i64,
) -> (Map<String, Value>, Map<String, Value>, Option<BucketEvent>) {
    let mut ui = read(current);
    let (interactions, telemetry, event) =
        feature::record_interaction(ui.get("featureInteractions"), telemetry, id, now_millis);
    ui.insert("featureInteractions".to_owned(), interactions);
    (
        ui,
        telemetry.as_object().cloned().unwrap_or_default(),
        event,
    )
}

fn normalize_fields(
    ui: &mut Map<String, Value>,
    current: &Map<String, Value>,
    updates: Option<&Map<String, Value>>,
) {
    let source = |field: &str| {
        updates
            .and_then(|updates| updates.get(field))
            .or_else(|| current.get(field))
    };
    set(ui, "groupBy", group_by(source("groupBy")));
    set(
        ui,
        "sortBy",
        enum_value(
            source("sortBy"),
            &["smart", "recent", "repo", "name", "manual"],
            "recent",
        ),
    );
    set(
        ui,
        "projectOrderBy",
        enum_value(source("projectOrderBy"), &["manual", "recent"], "manual"),
    );
    let right_tab = right_sidebar_tab(source("rightSidebarTab"));
    set(ui, "rightSidebarTab", Value::String(right_tab.to_owned()));
    let right_view = if let Some(updates) = updates {
        if updates.contains_key("rightSidebarExplorerView") {
            right_sidebar_view(updates.get("rightSidebarExplorerView"), right_tab)
        } else if updates.get("rightSidebarTab").and_then(Value::as_str) == Some("search") {
            "search"
        } else {
            right_sidebar_view(current.get("rightSidebarExplorerView"), right_tab)
        }
    } else {
        right_sidebar_view(current.get("rightSidebarExplorerView"), right_tab)
    };
    set(
        ui,
        "rightSidebarExplorerView",
        Value::String(right_view.to_owned()),
    );
    set(
        ui,
        "worktreeCardProperties",
        lists::card_properties(source("worktreeCardProperties")),
    );
    set(
        ui,
        "workspacePanelTitlebarPinnedIds",
        lists::pinned_ids(source("workspacePanelTitlebarPinnedIds")),
    );
    set(
        ui,
        "agentActivityDisplayMode",
        enum_value(
            source("agentActivityDisplayMode"),
            &["compact", "full"],
            "compact",
        ),
    );
    set(
        ui,
        "workspaceStatuses",
        workspace::statuses(source("workspaceStatuses")),
    );
    set(
        ui,
        "usagePercentageDisplay",
        enum_value(
            source("usagePercentageDisplay"),
            &["used", "remaining"],
            "used",
        ),
    );
    set(
        ui,
        "statusBarUsageMode",
        enum_value(
            source("statusBarUsageMode"),
            &["verbose", "compact"],
            "verbose",
        ),
    );
    set(
        ui,
        "markdownTocPanelWidth",
        bounded_number(source("markdownTocPanelWidth"), 200.0, 600.0, 240.0),
    );
    set(
        ui,
        "visibleWorkspaceHostIds",
        lists::visible_host_ids(source("visibleWorkspaceHostIds")),
    );
    set(
        ui,
        "workspaceHostOrder",
        lists::host_order(source("workspaceHostOrder")),
    );
    set(
        ui,
        "manualRepoOrder",
        lists::manual_repo_order(source("manualRepoOrder")),
    );
    set(
        ui,
        "browserDefaultZoomLevel",
        browser_zoom(source("browserDefaultZoomLevel")),
    );
    set(
        ui,
        "showDotfilesByWorktree",
        lists::show_dotfiles(source("showDotfilesByWorktree")),
    );
    set(
        ui,
        "featureTipsSeenIds",
        lists::feature_tip_ids(source("featureTipsSeenIds")),
    );
    let tours = updates
        .filter(|updates| updates.contains_key("contextualToursSeenIds"))
        .map_or_else(
            || lists::contextual_tour_ids(current.get("contextualToursSeenIds")),
            |updates| {
                lists::merge_contextual_tours(
                    current.get("contextualToursSeenIds"),
                    updates.get("contextualToursSeenIds"),
                )
            },
        );
    set(ui, "contextualToursSeenIds", tours);
    let interactions = updates
        .filter(|updates| updates.contains_key("featureInteractions"))
        .map_or_else(
            || feature::interactions(current.get("featureInteractions")),
            |updates| {
                feature::merge(
                    current.get("featureInteractions"),
                    updates.get("featureInteractions"),
                )
            },
        );
    set(ui, "featureInteractions", interactions);
}

fn stripped(value: Option<&Value>) -> Map<String, Value> {
    value
        .and_then(Value::as_object)
        .map(|value| {
            value
                .iter()
                .filter(|(key, _)| !RESERVED_KEYS.contains(&key.as_str()))
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect()
        })
        .unwrap_or_default()
}

fn right_sidebar_tab(value: Option<&Value>) -> &'static str {
    match value.and_then(Value::as_str) {
        Some("checks" | "source-control") => "source-control",
        Some("explorer") => "explorer",
        Some("search") => "search",
        Some("vault") => "vault",
        Some("workspaces") => "workspaces",
        Some("ports") => "ports",
        _ => "explorer",
    }
}

fn right_sidebar_view(value: Option<&Value>, tab: &str) -> &'static str {
    if tab == "search" || value.and_then(Value::as_str) == Some("search") {
        "search"
    } else {
        "files"
    }
}

fn enum_value(value: Option<&Value>, allowed: &[&str], fallback: &str) -> Value {
    Value::String(
        value
            .and_then(Value::as_str)
            .filter(|value| allowed.contains(value))
            .unwrap_or(fallback)
            .to_owned(),
    )
}

fn group_by(value: Option<&Value>) -> Value {
    if value.and_then(Value::as_str) == Some("flat") {
        Value::String("none".to_owned())
    } else {
        enum_value(
            value,
            &["none", "workspace-status", "repo", "pr-status"],
            "repo",
        )
    }
}

fn bounded_number(value: Option<&Value>, minimum: f64, maximum: f64, fallback: f64) -> Value {
    number_value(
        value
            .and_then(Value::as_f64)
            .map_or(fallback, |value| value.clamp(minimum, maximum)),
    )
}

fn browser_zoom(value: Option<&Value>) -> Value {
    let raw = value.and_then(Value::as_f64).unwrap_or(0.0);
    number_value(
        ((raw / 0.5) + 0.5)
            .floor()
            .mul_add(0.5, 0.0)
            .clamp(-3.0, 5.0),
    )
}

fn number_value(value: f64) -> Value {
    Number::from_f64(value)
        .map(Value::Number)
        .expect("normalized UI number is finite")
}

fn set(ui: &mut Map<String, Value>, field: &str, value: Value) {
    ui.insert(field.to_owned(), value);
}

pub(super) fn is_ecmascript_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{0009}'..='\u{000d}'
            | '\u{0020}'
            | '\u{00a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
            | '\u{feff}'
    )
}
