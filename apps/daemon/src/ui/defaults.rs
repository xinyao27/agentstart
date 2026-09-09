use serde_json::{Map, Value, json};

pub(super) fn ui() -> Map<String, Value> {
    let mut ui = Map::from_iter(
        [
            ("lastActiveRepoId", Value::Null),
            ("lastActiveWorktreeId", Value::Null),
            ("activeView", json!("terminal")),
            ("sidebarWidth", json!(280)),
            ("rightSidebarOpen", json!(true)),
            ("rightSidebarTab", json!("explorer")),
            ("rightSidebarExplorerView", json!("files")),
            ("rightSidebarWidth", json!(350)),
            ("markdownTocPanelWidth", json!(240)),
            ("groupBy", json!("repo")),
            ("sortBy", json!("recent")),
            ("projectOrderBy", json!("manual")),
            ("showActiveOnly", json!(false)),
            ("hideSleepingWorkspaces", json!(false)),
            ("workspaceHostScope", json!("all")),
            ("visibleWorkspaceHostIds", Value::Null),
            ("workspaceHostOrder", json!([])),
            ("manualRepoOrder", json!([])),
            ("showSleepingWorkspaces", json!(true)),
            ("hideDefaultBranchWorkspace", json!(false)),
            ("showDotfilesByWorktree", json!({})),
            ("filterRepoIds", json!([])),
            ("collapsedGroups", json!([])),
            ("uiZoomLevel", json!(0)),
            ("editorFontZoomLevel", json!(0)),
            (
                "worktreeCardProperties",
                json!(["status", "unread", "comment", "ports", "inline-agents"]),
            ),
            ("agentActivityDisplayMode", json!("compact")),
            (
                "workspaceStatuses",
                json!([
                { "id": "todo", "label": "Todo", "color": "neutral", "icon": "circle" },
                {
                    "id": "in-progress",
                    "label": "In progress",
                    "color": "conductor-progress",
                    "icon": "conductor-progress"
                },
                {
                    "id": "in-review",
                    "label": "In review",
                    "color": "conductor-review",
                    "icon": "conductor-review"
                },
                {
                    "id": "completed",
                    "label": "Done",
                    "color": "conductor-done",
                    "icon": "conductor-done"
                }
                ]),
            ),
            ("_workspaceStatusesDefaultOrderMigrated", json!(true)),
            ("_workspaceStatusesReorderedDefaultRepaired", json!(true)),
            ("_workspaceStatusesDefaultWorkflowMigrated", json!(true)),
            ("_workspaceStatusesDefaultVisualsMigrated", json!(true)),
            (
                "statusBarItems",
                json!([
                    "claude",
                    "codex",
                    "cursor",
                    "gemini",
                    "antigravity",
                    "opencode-go",
                    "kimi",
                    "minimax",
                    "grok",
                    "resource-usage",
                    "ports"
                ]),
            ),
        ]
        .into_iter()
        .map(|(key, value)| (key.to_owned(), value)),
    );
    ui.extend(
        [
            ("statusBarVisible", json!(true)),
            (
                "workspacePanelTitlebarPinnedIds",
                json!(["explorer", "source-control", "vault", "open-in"]),
            ),
            ("usagePercentageDisplay", json!("used")),
            ("statusBarUsageMode", json!("verbose")),
            ("lastUpdateCheckAt", Value::Null),
            ("trustedYiruHooks", json!({})),
            ("setupScriptPromptDismissedRepoIds", json!([])),
            ("acknowledgedAgentsByPaneKey", json!({})),
            ("setupGuideSidebarDismissed", json!(false)),
            ("setupGuideBrowserMilestoneMigrated", json!(true)),
            ("setupGuideBrowserMilestoneLegacyComplete", json!(false)),
            ("browserImportHintHidden", json!(false)),
            ("mobileEmulatorTabIntroDismissed", json!(false)),
            ("mobileEmulatorAgentSetupDismissed", json!(false)),
            ("projectOrderManualDefaultNoticeDismissed", json!(true)),
            ("usagePercentageDisplayChangeNoticeDismissed", json!(true)),
            ("workspaceCleanup", json!({ "dismissals": {} })),
            ("featureTipsSeenIds", json!([])),
            ("featureInteractions", json!({})),
            ("contextualToursSeenIds", json!([])),
            ("browserDefaultZoomLevel", json!(0)),
        ]
        .map(|(key, value)| (key.to_owned(), value)),
    );
    ui
}
