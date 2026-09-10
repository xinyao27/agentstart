use std::collections::HashSet;
use std::path::Path;
use std::sync::OnceLock;

use serde_json::{Map, Value, json};

const OPTIONAL_KEYS: &[&str] = &[
    "hostSettingOverrides",
    "workspaceDirHistory",
    "terminalCustomThemes",
    "terminalBackgroundOpacity",
    "terminalColorOverrides",
    "terminalPaddingX",
    "terminalPaddingY",
    "terminalWordSeparator",
    "terminalCursorOpacity",
    "terminalWindowsWslDistro",
    "localAccountWslDistro",
    "localAgentRuntime",
    "localAgentWslDistro",
    "keybindings",
    "activeClaudeManagedAccountIdsByRuntime",
    "terminalSshViewParking",
    "terminalHiddenWorktreeRetentionBudget",
    "codexSessionSourceHome",
    "dismissedSkillFreshnessNudges",
];

const RETIRED_KEYS: &[&str] = &[
    "appIcon",
    "terminalScrollbackBytes",
    "experimentalNewWorktreeCardStyle",
    "compactWorktreeCards",
    "experimentalCompactWorktreeCards",
    "experimentalActivity",
    "experimentalActivityDefaultedOffForAllUsers",
    "floatingTerminalCwd",
    "floatingTerminalCwdMigratedToAppWorkspace",
    "floatingTerminalDefaultedForAllUsers",
    "floatingTerminalEnabled",
    "floatingTerminalTriggerLocation",
    "floatingTerminalTrustedCwds",
    "minimizeToTrayOnClose",
    "showMenuBarIcon",
];

pub(super) fn document(home_path: &Path) -> Map<String, Value> {
    let workspace_dir = home_path.join("agentstart").join("workspaces");
    let terminal_font = if cfg!(target_os = "windows") {
        "Cascadia Mono"
    } else if cfg!(target_os = "linux") {
        "DejaVu Sans Mono"
    } else {
        "SF Mono"
    };
    let source_actions = [
        "commitMessage",
        "pullRequest",
        "branchName",
        "fixCommitFailure",
        "fixPushFailure",
        "fixChecks",
        "resolveConflicts",
        "resolveComments",
    ]
    .into_iter()
    .map(|key| {
        (
            key.to_owned(),
            json!({ "commandInputTemplate": "{basePrompt}" }),
        )
    })
    .collect::<Map<_, _>>();
    let mut value = json!({
        "workspaceDir": workspace_dir.to_string_lossy(),
        "nestWorkspaces": true,
        "workspaceDirHistory": [],
        "refreshLocalBaseRefOnWorktreeCreate": false,
        "localBaseRefSuggestionDismissed": false,
        "autoRenameBranchFromWork": true,
        "autoRenameBranchFromWorkDefaultedOn": true,
        "branchPrefix": "git-username",
        "branchPrefixCustom": "",
        "enableGitHubAttribution": false,
        "theme": "system",
        "leftSidebarAppearanceMode": "default",
        "leftSidebarTintColor": "#18181b",
        "leftSidebarTintOpacity": 0.08,
        "uiLanguage": "system",
        "loaderStyle": "S2",
        "appFontFamily": "system-ui",
        "systemTypographyDefaultsMigrated": true,
        "editorAutoSave": false,
        "editorAutoSaveDelayMs": 1000,
        "editorMinimapEnabled": false,
        "editorFontFamily": "",
        "editorWordWrap": true,
        "richMarkdownSpellcheckEnabled": true,
        "markdownReviewToolsEnabled": true,
        "terminalFontSize": 13,
        "terminalFontFamily": terminal_font,
        "terminalFontWeight": 500,
        "terminalLineHeight": 1,
        "terminalScrollSensitivity": 1.15,
        "terminalFastScrollSensitivity": 5,
        "terminalTuiScrollSensitivity": 1,
        "terminalTuiScrollSensitivityDefaultedToOne": true,
        "terminalGpuAcceleration": "auto",
        "terminalLigatures": "auto",
        "terminalCursorStyle": "block",
        "terminalCursorStyleDefaultedToBlock": true,
        "terminalCursorBlink": true,
        "terminalThemeDark": "Ghostty Default Style Dark",
        "terminalDividerColorDark": "#3f3f46",
        "terminalUseSeparateLightTheme": true,
        "terminalThemeLight": "Builtin Tango Light",
        "terminalCustomThemes": [],
        "terminalDividerColorLight": "#d4d4d8",
        "terminalInactivePaneOpacity": 0.8,
        "terminalActivePaneOpacity": 1,
        "terminalPaneOpacityTransitionMs": 140,
        "terminalDividerThicknessPx": 1,
        "terminalDividerThicknessDefaultedToHairline": true,
        "terminalRightClickToPaste": cfg!(target_os = "windows"),
        "terminalRightClickToPasteDefaultedForPlatform": true,
        "terminalWindowsShell": "powershell.exe",
        "terminalWindowsWslDistro": null,
        "localAccountRuntime": "host",
        "localAccountWslDistro": null,
        "localWindowsRuntimeDefault": { "kind": "windows-host" },
        "terminalWindowsPowerShellImplementation": "auto",
        "terminalMouseHideWhileTyping": false,
        "terminalQuickCommands": [],
        "terminalFocusFollowsMouse": false,
        "showPinnedWorktreesInGroups": false,
        "terminalClipboardOnSelect": false,
        "terminalAllowOsc52Clipboard": false,
        "setupScriptLaunchMode": "new-tab",
        "terminalScrollbackRows": 5000,
        "httpProxyUrl": "",
        "httpProxyBypassRules": "",
        "localhostWorktreeLabelsEnabled": false,
        "openInApplications": [{ "id": "vscode", "label": "VS Code", "command": "code" }],
        "lastOpenInTargetKey": "application:vscode",
        "rightSidebarOpenByDefault": true,
        "showGitIgnoredFiles": true,
        "sourceControlViewMode": "list",
        "sourceControlGroupOrder": "changes-first",
        "sourceControlCompareAgainstUpstream": false,
        "showTitlebarAppName": true,
        "showMobileButton": true,
        "ctrlTabOrderMode": "mru",
        "terminalShortcutPolicy": "agentstart-first",
        "notifications": {
            "enabled": true,
            "agentTaskComplete": true,
            "terminalBell": false,
            "suppressWhenFocused": true,
            "customSoundId": "system",
            "customSoundPath": null,
            "customSoundVolume": 100
        },
        "diffDefaultView": "inline",
        "diffWordWrap": false,
        "prBotAuthorOverrides": [],
        "promptCacheTimerEnabled": false,
        "promptCacheTtlMs": 300000,
        "codexManagedAccounts": [],
        "activeCodexManagedAccountId": null,
        "activeCodexManagedAccountIdsByRuntime": { "host": null, "wsl": {} },
        "claudeManagedAccounts": [],
        "activeClaudeManagedAccountId": null,
        "terminalScopeHistoryByWorktree": true,
        "terminalHiddenViewParking": true,
        "defaultTuiAgent": null,
        "disabledTuiAgents": [],
        "skipDeleteWorktreeConfirm": false,
        "skipCloseTerminalWithRunningProcessConfirm": false,
        "skipCodexRateLimitResetConfirm": false,
        "opencodeSessionCookie": "",
        "opencodeWorkspaceId": "",
        "minimaxGroupId": "",
        "minimaxUsageModels": "general",
        "geminiCliOAuthEnabled": false,
        "agentCmdOverrides": {},
        "agentDefaultArgs": {},
        "agentDefaultEnv": {},
        "agentYoloDefaultsMigrated": false,
        "agentStatusHooksEnabled": true,
        "tabAutoGenerateTitle": false,
        "confirmClosePinnedTab": true,
        "keepComputerAwakeWhileAgentsRun": false,
        "terminalMacOptionAsAlt": "auto",
        "terminalMacOptionAsAltMigrated": false,
        "terminalJISYenToBackslash": false,
        "experimentalMobile": false,
        "mobileEmulatorEnabled": true,
        "mobileEmulatorDefaultDeviceUdid": null,
        "mobileAutoRestoreFitMs": null,
        "experimentalTerminalAttention": false,
        "experimentalAgentHibernation": false,
        "agentHibernationIdleMs": 1800000,
        "activeRuntimeEnvironmentId": null,
        "commitMessageAi": {
            "enabled": true,
            "agentId": null,
            "selectedModelByAgent": {},
            "discoveredModelsByAgent": {},
            "selectedModelByAgentByHost": {},
            "discoveredModelsByAgentByHost": {},
            "selectedThinkingByModel": {},
            "customPrompt": "",
            "customAgentCommand": ""
        },
        "sourceControlAi": {
            "enabled": true,
            "actions": source_actions,
            "agentId": null,
            "selectedModelByAgent": {},
            "selectedModelByAgentByHost": {},
            "discoveredModelsByAgent": {},
            "discoveredModelsByAgentByHost": {},
            "selectedThinkingByModel": {},
            "customAgentCommand": "",
            "instructionsByOperation": {
                "commitMessage": "",
                "pullRequest": "",
                "branchName": ""
            },
            "prCreationDefaults": {
                "draft": false,
                "useTemplate": false,
                "generateDetailsOnOpen": false,
                "openAfterCreate": false
            },
            "launchActionDefaults": {}
        }
    });
    value.as_object_mut().map_or_else(Map::new, std::mem::take)
}

pub(super) fn normalize_updates(updates: Map<String, Value>) -> Map<String, Value> {
    static DEFAULT_KEYS: OnceLock<HashSet<String>> = OnceLock::new();
    let default_keys = DEFAULT_KEYS.get_or_init(|| {
        document(Path::new("."))
            .into_iter()
            .map(|(key, _)| key)
            .collect()
    });
    updates
        .into_iter()
        .filter(|(key, _)| {
            !RETIRED_KEYS.contains(&key.as_str())
                && (default_keys.contains(key) || OPTIONAL_KEYS.contains(&key.as_str()))
        })
        .collect()
}
