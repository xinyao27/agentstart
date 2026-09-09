mod statuses;

use serde_json::{Map, Value};

use super::normalize;

const FLAGS: &[&str] = &[
    "_workspaceStatusesDefaultOrderMigrated",
    "_workspaceStatusesReorderedDefaultRepaired",
    "_workspaceStatusesDefaultWorkflowMigrated",
    "_workspaceStatusesDefaultVisualsMigrated",
    "_sortBySmartMigrated",
    "_inlineAgentsDefaultedForExperiment",
    "_inlineAgentsDefaultedForAllUsers",
    "_expandedWorktreeCardPropertiesDefaulted",
];

pub(super) fn migrate(
    document: &Map<String, Value>,
    settings: &Value,
    has_repositories: bool,
) -> Map<String, Value> {
    let raw = document
        .get("ui")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut migrated = raw.clone();
    if !enabled(&raw, "_sortBySmartMigrated")
        && raw.get("sortBy").and_then(Value::as_str) == Some("recent")
    {
        migrated.insert("sortBy".to_owned(), Value::String("smart".to_owned()));
    }
    if !raw.get("rightSidebarOpen").is_some_and(Value::is_boolean) {
        let open = settings
            .get("rightSidebarOpenByDefault")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        migrated.insert("rightSidebarOpen".to_owned(), Value::Bool(open));
    }
    migrate_cards(&raw, &mut migrated, settings);
    migrated.insert("workspaceStatuses".to_owned(), statuses::migrate(&raw));
    let onboarding = crate::shell_state::onboarding::read(document.get("onboarding"));
    let closed = onboarding
        .get("closedAt")
        .is_some_and(|value| !value.is_null());
    migrated.insert(
        "setupGuideSidebarDismissed".to_owned(),
        Value::Bool(closed || enabled(&raw, "setupGuideSidebarDismissed")),
    );
    let existing = has_repositories || closed || !raw.is_empty();
    let notice = enabled(&raw, "usagePercentageDisplayChangeNoticeDismissed")
        || !existing
        || raw.get("usagePercentageDisplay").and_then(Value::as_str) == Some("remaining");
    migrated.insert(
        "usagePercentageDisplayChangeNoticeDismissed".to_owned(),
        Value::Bool(notice),
    );
    for key in [
        "setupGuideBrowserMilestoneMigrated",
        "setupGuideBrowserMilestoneLegacyComplete",
    ] {
        migrated.insert(key.to_owned(), Value::Bool(enabled(&raw, key)));
    }
    for key in FLAGS {
        migrated.insert((*key).to_owned(), Value::Bool(true));
    }
    normalize::read(Some(&Value::Object(migrated)))
}

fn migrate_cards(raw: &Map<String, Value>, migrated: &mut Map<String, Value>, settings: &Value) {
    let Some(cards) = raw.get("worktreeCardProperties").and_then(Value::as_array) else {
        return;
    };
    let mut cards = cards.clone();
    let has_inline = cards
        .iter()
        .any(|value| value.as_str() == Some("inline-agents"));
    let experiment = settings
        .get("experimentalAgentDashboard")
        .and_then(Value::as_bool)
        == Some(true);
    if !enabled(raw, "_inlineAgentsDefaultedForAllUsers") && !has_inline && !experiment {
        cards.push(Value::String("inline-agents".to_owned()));
    }
    if !enabled(raw, "_expandedWorktreeCardPropertiesDefaulted")
        && !cards.iter().any(|value| value.as_str() == Some("ports"))
    {
        cards.push(Value::String("ports".to_owned()));
    }
    migrated.insert("worktreeCardProperties".to_owned(), Value::Array(cards));
}

fn enabled(raw: &Map<String, Value>, key: &str) -> bool {
    raw.get(key).and_then(Value::as_bool) == Some(true)
}
