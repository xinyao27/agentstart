use super::*;

pub(super) fn create(body: &Value) -> Result<ShellHostTerminalCreate> {
    Ok(ShellHostTerminalCreate {
        worktree_id: optional(body, "worktreeId"),
        after_tab_id: optional(body, "afterTabId"),
        target_group_id: optional(body, "targetGroupId"),
        command: optional(body, "command"),
        cwd: optional(body, "cwd"),
        env: map(body, "env")?,
        env_to_delete: strings(body, "envToDelete")?,
        launch_config: launch(body)?,
        launch_token: optional(body, "launchToken"),
        launch_agent: optional(body, "launchAgent"),
        startup_command_delivery: optional(body, "startupCommandDelivery"),
        title: optional(body, "title"),
        activate: flag(body, "activate"),
        presentation: optional(body, "presentation"),
        source: optional(body, "source"),
    })
}
pub(super) fn reveal(body: &Value) -> Result<ShellHostTerminalReveal> {
    Ok(ShellHostTerminalReveal {
        worktree_id: required(body, "worktreeId")?,
        pty_id: required(body, "ptyId")?,
        durable_pty_id: optional(body, "durablePtyId"),
        title: optional(body, "title"),
        cwd: optional(body, "cwd"),
        launch_config: launch(body)?,
        launch_token: optional(body, "launchToken"),
        launch_agent: optional(body, "launchAgent"),
        activate: flag(body, "activate"),
        presentation: optional(body, "presentation"),
        tab_id: optional(body, "tabId"),
        leaf_id: optional(body, "leafId"),
        split_from_leaf_id: optional(body, "splitFromLeafId"),
        split_direction: optional(body, "splitDirection"),
        split_telemetry_source: optional(body, "splitTelemetrySource"),
        source: optional(body, "source"),
    })
}
