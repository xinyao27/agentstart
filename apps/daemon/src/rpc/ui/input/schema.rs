use serde_json::{Map, Value};

use super::collections;
use super::objects;
use super::{Issues, parse_boolean, parse_enum, parse_number, parse_string, unrecognized_keys};

const FIELDS: &[&str] = &[
    "lastActiveRepoId",
    "lastActiveWorktreeId",
    "activeView",
    "sidebarWidth",
    "rightSidebarOpen",
    "rightSidebarTab",
    "rightSidebarExplorerView",
    "rightSidebarWidth",
    "markdownTocPanelWidth",
    "groupBy",
    "showWorkspaceLineage",
    "sortBy",
    "projectOrderBy",
    "showActiveOnly",
    "hideSleepingWorkspaces",
    "showSleepingWorkspaces",
    "showInactiveWorkspaces",
    "workspaceHostScope",
    "visibleWorkspaceHostIds",
    "workspaceHostOrder",
    "manualRepoOrder",
    "hideDefaultBranchWorkspace",
    "showDotfilesByWorktree",
    "filterRepoIds",
    "collapsedGroups",
    "uiZoomLevel",
    "editorFontZoomLevel",
    "worktreeCardProperties",
    "agentActivityDisplayMode",
    "workspaceStatuses",
    "_workspaceStatusesDefaultOrderMigrated",
    "_workspaceStatusesReorderedDefaultRepaired",
    "_workspaceStatusesDefaultWorkflowMigrated",
    "_workspaceStatusesDefaultVisualsMigrated",
    "statusBarItems",
    "_portsStatusBarDefaultAdded",
    "_kimiStatusBarDefaultAdded",
    "_minimaxStatusBarDefaultAdded",
    "_antigravityStatusBarDefaultAdded",
    "_grokStatusBarDefaultAdded",
    "statusBarVisible",
    "workspacePanelTitlebarPinnedIds",
    "usagePercentageDisplay",
    "statusBarUsageMode",
    "lastUpdateCheckAt",
    "pendingUpdateNudgeId",
    "dismissedUpdateNudgeId",
    "notificationPermissionRequested",
    "acknowledgedAgentsByPaneKey",
    "setupGuideSidebarDismissed",
    "setupGuideBrowserMilestoneMigrated",
    "setupGuideBrowserMilestoneLegacyComplete",
    "browserImportHintHidden",
    "mobileEmulatorTabIntroDismissed",
    "mobileEmulatorAgentSetupDismissed",
    "browserDefaultUrl",
    "browserDefaultSearchEngine",
    "browserDefaultZoomLevel",
    "browserKagiSessionLink",
    "_sortBySmartMigrated",
    "_inlineAgentsDefaultedForExperiment",
    "_inlineAgentsDefaultedForAllUsers",
    "_expandedWorktreeCardPropertiesDefaulted",
    "starNagBaselineAgents",
    "starNagAppVersion",
    "starNagNextThreshold",
    "starNagCompleted",
    "starNagDeferredUntil",
    "starNagAgentValueMomentAppVersion",
    "trustedYiruHooks",
    "themeGradientDefault",
    "themeGradientsByWorkspaceId",
    "setupScriptPromptDismissedRepoIds",
    "projectOrderManualDefaultNoticeDismissed",
    "usagePercentageDisplayChangeNoticeDismissed",
    "usageEmptyStateDismissed",
    "workspaceCleanup",
    "featureTipsSeenIds",
    "featureInteractions",
    "contextualToursSeenIds",
    "contextualToursAutoEligible",
];

pub(super) fn parse(object: &Map<String, Value>) -> Result<Map<String, Value>, Issues> {
    let mut issues = Issues::new();
    let mut parsed = Map::new();
    for field in FIELDS {
        let Some(value) = object.get(*field) else {
            continue;
        };
        let path = [Value::String((*field).to_owned())];
        if let Some(value) = parse_field(field, value, &path, &mut issues) {
            parsed.insert((*field).to_owned(), value);
        }
    }
    let unknown = object
        .keys()
        .filter(|key| !FIELDS.contains(&key.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    if !unknown.is_empty() {
        issues.push(unrecognized_keys(&[], unknown));
    }
    if issues.is_empty() {
        Ok(parsed)
    } else {
        Err(issues)
    }
}

fn parse_field(field: &str, value: &Value, path: &[Value], issues: &mut Issues) -> Option<Value> {
    match field {
        "lastActiveRepoId"
        | "lastActiveWorktreeId"
        | "pendingUpdateNudgeId"
        | "dismissedUpdateNudgeId"
        | "browserDefaultUrl"
        | "browserKagiSessionLink"
        | "starNagAppVersion"
        | "starNagAgentValueMomentAppVersion" => {
            nullable(value, |value| parse_string(value, path, issues))
        }
        "workspaceHostScope" => parse_string(value, path, issues),
        "sidebarWidth"
        | "rightSidebarWidth"
        | "markdownTocPanelWidth"
        | "uiZoomLevel"
        | "editorFontZoomLevel"
        | "browserDefaultZoomLevel"
        | "starNagNextThreshold" => parse_number(value, path, issues),
        "lastUpdateCheckAt" | "starNagBaselineAgents" | "starNagDeferredUntil" => {
            nullable(value, |value| parse_number(value, path, issues))
        }
        "rightSidebarOpen"
        | "showWorkspaceLineage"
        | "showActiveOnly"
        | "hideSleepingWorkspaces"
        | "showSleepingWorkspaces"
        | "showInactiveWorkspaces"
        | "hideDefaultBranchWorkspace"
        | "_workspaceStatusesDefaultOrderMigrated"
        | "_workspaceStatusesReorderedDefaultRepaired"
        | "_workspaceStatusesDefaultWorkflowMigrated"
        | "_workspaceStatusesDefaultVisualsMigrated"
        | "_portsStatusBarDefaultAdded"
        | "_kimiStatusBarDefaultAdded"
        | "_minimaxStatusBarDefaultAdded"
        | "_antigravityStatusBarDefaultAdded"
        | "_grokStatusBarDefaultAdded"
        | "statusBarVisible"
        | "notificationPermissionRequested"
        | "setupGuideSidebarDismissed"
        | "setupGuideBrowserMilestoneMigrated"
        | "setupGuideBrowserMilestoneLegacyComplete"
        | "browserImportHintHidden"
        | "mobileEmulatorTabIntroDismissed"
        | "mobileEmulatorAgentSetupDismissed"
        | "_sortBySmartMigrated"
        | "_inlineAgentsDefaultedForExperiment"
        | "_inlineAgentsDefaultedForAllUsers"
        | "_expandedWorktreeCardPropertiesDefaulted"
        | "starNagCompleted"
        | "projectOrderManualDefaultNoticeDismissed"
        | "usagePercentageDisplayChangeNoticeDismissed"
        | "usageEmptyStateDismissed"
        | "contextualToursAutoEligible" => parse_boolean(value, path, issues),
        "activeView" => parse_enum(
            value,
            path,
            &["home", "terminal", "settings", "space", "skills", "mobile"],
            issues,
        ),
        "rightSidebarTab" => {
            let normalized;
            let value = if value.as_str() == Some("checks") {
                normalized = Value::String("source-control".to_owned());
                &normalized
            } else {
                value
            };
            parse_enum(
                value,
                path,
                &[
                    "explorer",
                    "search",
                    "vault",
                    "workspaces",
                    "pr-checks",
                    "source-control",
                    "ports",
                ],
                issues,
            )
        }
        "rightSidebarExplorerView" => parse_enum(value, path, &["files", "search"], issues),
        "groupBy" => parse_enum(
            value,
            path,
            &["none", "workspace-status", "repo", "pr-status"],
            issues,
        ),
        "sortBy" => parse_enum(
            value,
            path,
            &["name", "smart", "recent", "repo", "manual"],
            issues,
        ),
        "projectOrderBy" => parse_enum(value, path, &["manual", "recent"], issues),
        "agentActivityDisplayMode" => parse_enum(value, path, &["compact", "full"], issues),
        "usagePercentageDisplay" => parse_enum(value, path, &["used", "remaining"], issues),
        "statusBarUsageMode" => parse_enum(value, path, &["verbose", "compact"], issues),
        "browserDefaultSearchEngine" => nullable(value, |value| {
            parse_enum(
                value,
                path,
                &["google", "duckduckgo", "bing", "kagi"],
                issues,
            )
        }),
        "visibleWorkspaceHostIds" => collections::nullable_string_array(value, path, issues),
        "workspaceHostOrder"
        | "filterRepoIds"
        | "collapsedGroups"
        | "setupScriptPromptDismissedRepoIds"
        | "contextualToursSeenIds" => collections::string_array(value, path, issues),
        "manualRepoOrder" => collections::manual_repo_order(value, path, issues),
        "showDotfilesByWorktree" => collections::boolean_record(value, path, issues),
        "acknowledgedAgentsByPaneKey" => collections::number_record(value, path, issues),
        "worktreeCardProperties" => collections::worktree_card_properties(value, path, issues),
        "workspacePanelTitlebarPinnedIds" => collections::pinned_ids(value, path, issues),
        "workspaceStatuses" => collections::workspace_statuses(value, path, issues),
        "statusBarItems" => collections::enum_array(
            value,
            path,
            &[
                "claude",
                "codex",
                "cursor",
                "gemini",
                "antigravity",
                "opencode-go",
                "kimi",
                "minimax",
                "grok",
                "ssh",
                "resource-usage",
                "ports",
            ],
            issues,
        ),
        "featureTipsSeenIds" => collections::feature_tip_ids(value, path, issues),
        "trustedYiruHooks" => objects::unknown_record(value, path, issues),
        "themeGradientDefault" => objects::nullable_theme(value, path, issues),
        "themeGradientsByWorkspaceId" => objects::theme_record(value, path, issues),
        "workspaceCleanup" => objects::workspace_cleanup(value, path, issues),
        "featureInteractions" => objects::feature_interactions(value, path, issues),
        _ => None,
    }
}

fn nullable(value: &Value, parse: impl FnOnce(&Value) -> Option<Value>) -> Option<Value> {
    if value.is_null() {
        Some(Value::Null)
    } else {
        parse(value)
    }
}
