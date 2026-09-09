use super::*;
use shell_host_ui_command::Command;

pub(super) fn encode(body: &Value) -> Result<ShellHostUiCommand> {
    let command = match required(body, "type")?.as_str() {
        "activateWorktree" => Command::ActivateWorktree(ShellHostActivateWorktree {
            repo_id: required(body, "repoId")?,
            worktree_id: required(body, "worktreeId")?,
            setup: body
                .get("setup")
                .filter(|v| !v.is_null())
                .map(setup)
                .transpose()?,
            startup: body
                .get("startup")
                .filter(|v| !v.is_null())
                .map(startup)
                .transpose()?,
            default_tabs: body
                .get("defaultTabs")
                .filter(|v| !v.is_null())
                .map(default_tabs)
                .transpose()?,
        }),
        "splitTerminal" => Command::SplitTerminal(ShellHostSplitTerminal {
            tab_id: required(body, "tabId")?,
            pane_runtime_id: integer(body, "paneRuntimeId")?,
            direction: required(body, "direction")?,
            command: optional(body, "command"),
            telemetry_source: optional(body, "telemetrySource"),
        }),
        "renameTerminal" => Command::RenameTerminal(ShellHostRenameTerminal {
            tab_id: required(body, "tabId")?,
            title: optional(body, "title"),
        }),
        "focusTerminal" => Command::FocusTerminal(ShellHostFocusTerminal {
            tab_id: required(body, "tabId")?,
            worktree_id: required(body, "worktreeId")?,
            leaf_id: optional(body, "leafId"),
            ack_pane_key_on_success: optional(body, "ackPaneKeyOnSuccess"),
            flash_focused_pane: flag(body, "flashFocusedPane"),
            scroll_to_bottom_if_output_since_last_view: flag(
                body,
                "scrollToBottomIfOutputSinceLastView",
            ),
        }),
        "focusEditorTab" => Command::FocusEditorTab(tab_target(body)?),
        "closeSessionTab" => Command::CloseSessionTab(tab_target(body)?),
        "moveSessionTab" => Command::MoveSessionTab(move_tab(body)?),
        "openFile" => Command::OpenFile(ShellHostOpenFile {
            worktree_id: required(body, "worktreeId")?,
            file_path: required(body, "filePath")?,
            relative_path: required(body, "relativePath")?,
            runtime_environment_id: optional(body, "runtimeEnvironmentId"),
        }),
        "openDiff" => Command::OpenDiff(ShellHostOpenDiff {
            worktree_id: required(body, "worktreeId")?,
            file_path: required(body, "filePath")?,
            relative_path: required(body, "relativePath")?,
            runtime_environment_id: optional(body, "runtimeEnvironmentId"),
            staged: flag(body, "staged").unwrap_or(false),
        }),
        "closeTerminal" => Command::CloseTerminal(ShellHostCloseTerminal {
            tab_id: required(body, "tabId")?,
            pane_runtime_id: body
                .get("paneRuntimeId")
                .filter(|v| !v.is_null())
                .map(|_| integer(body, "paneRuntimeId"))
                .transpose()?,
        }),
        "sleepWorktree" => Command::SleepWorktree(worktree_target(body)?),
        "resumeSleepingAgents" => Command::ResumeSleepingAgents(worktree_target(body)?),
        _ => return Err(ShellServicesError::InvalidResponse),
    };
    Ok(ShellHostUiCommand {
        command: Some(command),
    })
}
fn integer(body: &Value, key: &str) -> Result<i32> {
    body.get(key)
        .and_then(Value::as_i64)
        .and_then(|v| i32::try_from(v).ok())
        .ok_or(ShellServicesError::InvalidResponse)
}
fn tab_target(body: &Value) -> Result<ShellHostTabTarget> {
    Ok(ShellHostTabTarget {
        tab_id: required(body, "tabId")?,
        worktree_id: required(body, "worktreeId")?,
    })
}
fn worktree_target(body: &Value) -> Result<ShellHostWorktreeTarget> {
    Ok(ShellHostWorktreeTarget {
        worktree_id: required(body, "worktreeId")?,
    })
}
fn move_tab(body: &Value) -> Result<ShellHostMoveSessionTab> {
    use shell_host_move_session_tab::Move;
    let movement = match required(body, "kind")?.as_str() {
        "reorder" => Move::Reorder(ShellHostTabReorder {
            tab_order: strings(body, "tabOrder")?,
        }),
        "move-to-group" => Move::MoveToGroup(ShellHostTabMoveToGroup {
            index: body
                .get("index")
                .filter(|v| !v.is_null())
                .map(|_| {
                    integer(body, "index").and_then(|v| {
                        u32::try_from(v).map_err(|_| ShellServicesError::InvalidResponse)
                    })
                })
                .transpose()?,
        }),
        "split" => Move::Split(ShellHostTabSplit {
            direction: required(body, "splitDirection")?,
        }),
        _ => return Err(ShellServicesError::InvalidResponse),
    };
    Ok(ShellHostMoveSessionTab {
        tab_id: required(body, "tabId")?,
        worktree_id: required(body, "worktreeId")?,
        target_group_id: required(body, "targetGroupId")?,
        r#move: Some(movement),
    })
}
fn setup(body: &Value) -> Result<WorktreeSetupLaunch> {
    Ok(WorktreeSetupLaunch {
        runner_script_path: required(body, "runnerScriptPath")?,
        env_vars: map(body, "envVars")?,
        command: optional(body, "command"),
        wait_for_agent_startup: flag(body, "waitForAgentStartup"),
    })
}
fn startup(body: &Value) -> Result<ShellHostStartupLaunch> {
    Ok(ShellHostStartupLaunch {
        command: required(body, "command")?,
        env: map(body, "env")?,
        launch_config: launch(body)?,
        launch_token: optional(body, "launchToken"),
        launch_agent: optional(body, "launchAgent"),
        startup_command_delivery: optional(body, "startupCommandDelivery"),
        telemetry: body
            .get("telemetry")
            .filter(|v| !v.is_null())
            .map(|v| -> Result<ShellHostLaunchTelemetry> {
                Ok(ShellHostLaunchTelemetry {
                    agent_kind: required(v, "agent_kind")?,
                    launch_source: required(v, "launch_source")?,
                    request_kind: required(v, "request_kind")?,
                })
            })
            .transpose()?,
    })
}
fn default_tabs(body: &Value) -> Result<WorktreeDefaultTabs> {
    let tabs = body
        .get("tabs")
        .and_then(Value::as_array)
        .ok_or(ShellServicesError::InvalidResponse)?
        .iter()
        .map(|v| WorktreeDefaultTab {
            title: optional(v, "title"),
            color: optional(v, "color"),
            command: optional(v, "command"),
        })
        .collect();
    Ok(WorktreeDefaultTabs {
        tabs,
        run_commands: flag(body, "runCommands").unwrap_or(false),
    })
}
