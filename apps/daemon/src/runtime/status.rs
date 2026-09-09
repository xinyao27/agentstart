use std::sync::Arc;

use crate::protocol::ProtocolCompatibility;
use crate::session_tabs::{SessionTabsAuthority, SessionTabsGraphStatus};
use crate::settings::SettingsAuthority;
use crate::updater::{DaemonUpdater, DaemonUpdaterSupport};

use super::RuntimeIdentity;

const ACCOUNTS_PROTOBUF_CAPABILITY: &str = "accounts.protobuf.v1";
const APP_CONTROL_PROTOBUF_CAPABILITY: &str = "appControl.protobuf.v1";
const AI_VAULT_CAPABILITY: &str = "aiVault.v1";
const AI_VAULT_PROTOBUF_CAPABILITY: &str = "aiVault.protobuf.v1";
const BROWSER_SCREENCAST_CAPABILITY: &str = "browser.screencast.v1";
const BROWSER_PROTOBUF_CAPABILITY: &str = "browser.protobuf.v1";
const CLI_PROTOBUF_CAPABILITY: &str = "cli.protobuf.v1";
const CLI_WSL_PROTOBUF_CAPABILITY: &str = "cli.wsl.protobuf.v1";
const COMPUTER_PROTOBUF_CAPABILITY: &str = "computer.protobuf.v1";
const FILES_PROTOBUF_CAPABILITY: &str = "files.protobuf.v1";
const SHELL_FILES_PROTOBUF_CAPABILITY: &str = "shellFiles.protobuf.v1";
const BROWSER_REPLAY_PROTOBUF_CAPABILITY: &str = "browserReplay.protobuf.v1";
const BROWSER_WRITEBACK_PROTOBUF_CAPABILITY: &str = "browserWriteback.protobuf.v1";
const EMULATOR_PROTOBUF_CAPABILITY: &str = "emulator.protobuf.v1";
const GIT_PROTOBUF_CAPABILITY: &str = "git.protobuf.v1";
const GITHUB_PROTOBUF_CAPABILITY: &str = "github.protobuf.v1";
const ORCHESTRATION_PROTOBUF_CAPABILITY: &str = "orchestration.protobuf.v1";
const PROVIDER_USAGE_PROTOBUF_CAPABILITY: &str = "providerUsage.protobuf.v1";
const RATE_LIMIT_RESUME_PROTOBUF_CAPABILITY: &str = "rateLimitResume.protobuf.v1";
const WINDOWS_FIREWALL_PROTOBUF_CAPABILITY: &str = "mobile.windowsFirewall.protobuf.v1";
const DEVELOPER_PERMISSIONS_PROTOBUF_CAPABILITY: &str = "developerPermissions.protobuf.v1";
const DIAGNOSTICS_PROTOBUF_CAPABILITY: &str = "diagnostics.support.protobuf.v1";
const GITHUB_SHELL_PROTOBUF_CAPABILITY: &str = "github.shell.protobuf.v1";
const HOST_PROTOBUF_CAPABILITY: &str = "host.protobuf.v1";
const MARKDOWN_PROTOBUF_CAPABILITY: &str = "markdown.protobuf.v1";
const UI_PROTOBUF_CAPABILITY: &str = "ui.protobuf.v1";
const PREFLIGHT_PROTOBUF_CAPABILITY: &str = "preflight.protobuf.v1";
const TERMINAL_MULTIPLEX_CAPABILITY: &str = "/yiru.runtime.v1.TerminalService/Multiplex";
const TERMINAL_FIT_PROTOBUF_CAPABILITY: &str = "terminal.fit.protobuf.v1";
const TERMINAL_QUICK_COMMANDS_CAPABILITY: &str = "terminal.quick-commands.v1";
const NOTIFICATION_SOUND_PROTOBUF_CAPABILITY: &str = "notifications.customSound.protobuf.v1";
const NOTIFICATIONS_PROTOBUF_CAPABILITY: &str = "notifications.protobuf.v1";
const UPDATER_PROTOBUF_CAPABILITY: &str = "updater.protobuf.v1";
const REPO_HOOKS_PROTOBUF_CAPABILITY: &str = "repo.hooks.protobuf.v1";
const REPO_CATALOG_PROTOBUF_CAPABILITY: &str = "repo.catalog.protobuf.v1";
const REPO_REFS_PROTOBUF_CAPABILITY: &str = "repo.refs.protobuf.v1";
const AGENT_STATUS_PROTOBUF_CAPABILITY: &str = "agentStatus.protobuf.v1";
const SESSION_TABS_PROTOBUF_CAPABILITY: &str = "session.tabs.protobuf.v1";
const PROJECT_GROUP_PROTOBUF_CAPABILITY: &str = "projectGroup.protobuf.v1";
const SHELL_PLATFORM_PROTOBUF_CAPABILITY: &str = "shell.platform.protobuf.v1";
const SKILLS_PROTOBUF_CAPABILITY: &str = "skills.protobuf.v1";
const SETTINGS_PROTOBUF_CAPABILITY: &str = "settings.protobuf.v1";
const SETTINGS_DOCUMENT_PROTOBUF_CAPABILITY: &str = "settings.document.protobuf.v1";
const SHELL_REPO_HOST_PROTOBUF_CAPABILITY: &str = "shell.repoHost.protobuf.v1";
const SHELL_KEYBINDINGS_PROTOBUF_CAPABILITY: &str = "shell.keybindings.protobuf.v1";
const PROJECT_HOST_SETUP_PROTOBUF_CAPABILITY: &str = "projectHostSetup.protobuf.v1";
const ARTIFACT_PROTOBUF_CAPABILITY: &str = "artifact.protobuf.v1";
const DANGEROUS_APPROVAL_PROTOBUF_CAPABILITY: &str = "dangerousApproval.protobuf.v1";
const WORKSPACE_PROJECT_REVISION_PROTOBUF_CAPABILITY: &str =
    "workspaceEvents.projectRevision.protobuf.v1";
const WORKSPACE_JOURNAL_PROTOBUF_CAPABILITY: &str = "workspaceEvents.journal.protobuf.v1";
const WORKSPACE_APPEND_PROTOBUF_CAPABILITY: &str = "workspaceEvents.append.protobuf.v1";
const WORKTREE_PROTOBUF_CAPABILITY: &str = "worktree.lifecycle.protobuf.v1";
const HOST_REGISTRY_PROTOBUF_CAPABILITY: &str = "hostRegistry.protobuf.v1";
const BROWSER_COMMAND_PROTOBUF_CAPABILITY: &str = "browserCommand.protobuf.v1";
const CLIPBOARD_PROTOBUF_CAPABILITY: &str = "clipboard.protobuf.v1";
const FOLDER_WORKSPACE_PROTOBUF_CAPABILITY: &str = "folderWorkspace.protobuf.v1";
const SHELL_YIRU_PROFILES_PROTOBUF_CAPABILITY: &str = "shell.yiruProfiles.protobuf.v1";
const WORKSPACE_CLEANUP_PROTOBUF_CAPABILITY: &str = "workspaceCleanup.protobuf.v1";
const SHELL_SESSION_PROTOBUF_CAPABILITY: &str = "shell.session.cas.protobuf.v1";
const SHELL_TELEMETRY_PROTOBUF_CAPABILITY: &str = "shell.telemetry.protobuf.v1";
const RITUAL_PROTOBUF_CAPABILITY: &str = "ritual.protobuf.v1";
const WORKSPACE_PORTS_PROTOBUF_CAPABILITY: &str = "workspacePorts.protobuf.v1";
const SHELL_CACHE_PROTOBUF_CAPABILITY: &str = "shell.cache.protobuf.v1";
const SHELL_ONBOARDING_PROTOBUF_CAPABILITY: &str = "shell.onboarding.protobuf.v1";
const PROJECT_PROTOBUF_CAPABILITY: &str = "project.protobuf.v1";
const VISUAL_REGRESSION_PROTOBUF_CAPABILITY: &str = "visualRegression.protobuf.v1";
const WORKSPACE_SPACE_PROTOBUF_CAPABILITY: &str = "workspaceSpace.protobuf.v1";
const CLIENT_EVENTS_PROTOBUF_CAPABILITY: &str = "runtime.clientEvents.protobuf.v1";
const PROJECT_CONTEXT_PROTOBUF_CAPABILITY: &str = "projectContext.protobuf.v1";
const NOTEBOOK_PROTOBUF_CAPABILITY: &str = "notebook.protobuf.v1";
const EXTERNAL_EDITOR_PROTOBUF_CAPABILITY: &str = "externalEditor.protobuf.v1";
const SHELL_EVENTS_PROTOBUF_CAPABILITY: &str = "shell.events.protobuf.v1";
const SHELL_RUNTIME_PROTOBUF_CAPABILITY: &str = "shell.runtime.protobuf.v1";
const DRIVER_EVENTS_PROTOBUF_CAPABILITY: &str = "runtime.driverEvents.protobuf.v1";
const PROGRESS_EVENTS_PROTOBUF_CAPABILITY: &str = "runtime.progressEvents.protobuf.v1";
const RUNTIME_CAPABILITIES: [&str; 75] = [
    ACCOUNTS_PROTOBUF_CAPABILITY,
    APP_CONTROL_PROTOBUF_CAPABILITY,
    AI_VAULT_CAPABILITY,
    AI_VAULT_PROTOBUF_CAPABILITY,
    BROWSER_SCREENCAST_CAPABILITY,
    BROWSER_PROTOBUF_CAPABILITY,
    CLI_PROTOBUF_CAPABILITY,
    CLI_WSL_PROTOBUF_CAPABILITY,
    COMPUTER_PROTOBUF_CAPABILITY,
    FILES_PROTOBUF_CAPABILITY,
    SHELL_FILES_PROTOBUF_CAPABILITY,
    BROWSER_REPLAY_PROTOBUF_CAPABILITY,
    BROWSER_WRITEBACK_PROTOBUF_CAPABILITY,
    EMULATOR_PROTOBUF_CAPABILITY,
    GIT_PROTOBUF_CAPABILITY,
    GITHUB_PROTOBUF_CAPABILITY,
    ORCHESTRATION_PROTOBUF_CAPABILITY,
    PROVIDER_USAGE_PROTOBUF_CAPABILITY,
    RATE_LIMIT_RESUME_PROTOBUF_CAPABILITY,
    DIAGNOSTICS_PROTOBUF_CAPABILITY,
    GITHUB_SHELL_PROTOBUF_CAPABILITY,
    HOST_PROTOBUF_CAPABILITY,
    MARKDOWN_PROTOBUF_CAPABILITY,
    UI_PROTOBUF_CAPABILITY,
    PREFLIGHT_PROTOBUF_CAPABILITY,
    TERMINAL_FIT_PROTOBUF_CAPABILITY,
    TERMINAL_MULTIPLEX_CAPABILITY,
    TERMINAL_QUICK_COMMANDS_CAPABILITY,
    NOTIFICATION_SOUND_PROTOBUF_CAPABILITY,
    NOTIFICATIONS_PROTOBUF_CAPABILITY,
    UPDATER_PROTOBUF_CAPABILITY,
    REPO_HOOKS_PROTOBUF_CAPABILITY,
    REPO_CATALOG_PROTOBUF_CAPABILITY,
    REPO_REFS_PROTOBUF_CAPABILITY,
    AGENT_STATUS_PROTOBUF_CAPABILITY,
    SESSION_TABS_PROTOBUF_CAPABILITY,
    PROJECT_GROUP_PROTOBUF_CAPABILITY,
    SHELL_PLATFORM_PROTOBUF_CAPABILITY,
    SKILLS_PROTOBUF_CAPABILITY,
    SETTINGS_PROTOBUF_CAPABILITY,
    SETTINGS_DOCUMENT_PROTOBUF_CAPABILITY,
    SHELL_REPO_HOST_PROTOBUF_CAPABILITY,
    SHELL_KEYBINDINGS_PROTOBUF_CAPABILITY,
    PROJECT_HOST_SETUP_PROTOBUF_CAPABILITY,
    ARTIFACT_PROTOBUF_CAPABILITY,
    DANGEROUS_APPROVAL_PROTOBUF_CAPABILITY,
    WORKSPACE_PROJECT_REVISION_PROTOBUF_CAPABILITY,
    WORKSPACE_JOURNAL_PROTOBUF_CAPABILITY,
    WORKSPACE_APPEND_PROTOBUF_CAPABILITY,
    WORKTREE_PROTOBUF_CAPABILITY,
    WINDOWS_FIREWALL_PROTOBUF_CAPABILITY,
    DEVELOPER_PERMISSIONS_PROTOBUF_CAPABILITY,
    HOST_REGISTRY_PROTOBUF_CAPABILITY,
    BROWSER_COMMAND_PROTOBUF_CAPABILITY,
    CLIPBOARD_PROTOBUF_CAPABILITY,
    FOLDER_WORKSPACE_PROTOBUF_CAPABILITY,
    SHELL_YIRU_PROFILES_PROTOBUF_CAPABILITY,
    WORKSPACE_CLEANUP_PROTOBUF_CAPABILITY,
    SHELL_SESSION_PROTOBUF_CAPABILITY,
    SHELL_TELEMETRY_PROTOBUF_CAPABILITY,
    RITUAL_PROTOBUF_CAPABILITY,
    WORKSPACE_PORTS_PROTOBUF_CAPABILITY,
    SHELL_CACHE_PROTOBUF_CAPABILITY,
    SHELL_ONBOARDING_PROTOBUF_CAPABILITY,
    PROJECT_PROTOBUF_CAPABILITY,
    VISUAL_REGRESSION_PROTOBUF_CAPABILITY,
    WORKSPACE_SPACE_PROTOBUF_CAPABILITY,
    CLIENT_EVENTS_PROTOBUF_CAPABILITY,
    PROJECT_CONTEXT_PROTOBUF_CAPABILITY,
    NOTEBOOK_PROTOBUF_CAPABILITY,
    EXTERNAL_EDITOR_PROTOBUF_CAPABILITY,
    SHELL_EVENTS_PROTOBUF_CAPABILITY,
    SHELL_RUNTIME_PROTOBUF_CAPABILITY,
    DRIVER_EVENTS_PROTOBUF_CAPABILITY,
    PROGRESS_EVENTS_PROTOBUF_CAPABILITY,
];

#[derive(Clone)]
pub(crate) struct RuntimeStatus {
    state: Arc<StatusState>,
}

struct StatusState {
    app_version: String,
    host_platform: &'static str,
    identity: RuntimeIdentity,
    min_compatible_client_version: u32,
    protocol_version: u32,
    session_tabs: SessionTabsAuthority,
    settings: SettingsAuthority,
    updater: DaemonUpdater,
}

pub(crate) struct RuntimeStatusView<'a> {
    pub(crate) app_version: &'a str,
    pub(crate) authoritative_window_id: Option<i64>,
    pub(crate) capabilities: &'static [&'static str],
    pub(crate) graph_is_reloading: bool,
    pub(crate) host_platform: &'static str,
    pub(crate) live_leaf_count: usize,
    pub(crate) live_tab_count: usize,
    pub(crate) min_compatible_runtime_client_version: u32,
    pub(crate) remote_update_support: DaemonUpdaterSupport,
    pub(crate) renderer_graph_epoch: u64,
    pub(crate) runtime_id: &'a str,
    pub(crate) runtime_api_version: u32,
    pub(crate) terminal_windows_shell: Option<String>,
}

impl RuntimeStatus {
    pub(crate) fn new(
        identity: RuntimeIdentity,
        protocol: &ProtocolCompatibility,
        session_tabs: SessionTabsAuthority,
        settings: SettingsAuthority,
        updater: DaemonUpdater,
    ) -> Self {
        let app_version = std::env::var("YIRU_APP_VERSION")
            .unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_owned());
        Self {
            state: Arc::new(StatusState {
                app_version,
                host_platform: host_platform(),
                identity,
                min_compatible_client_version: protocol.min_compatible_client_version,
                protocol_version: protocol.version,
                session_tabs,
                settings,
                updater,
            }),
        }
    }

    pub(crate) fn view(&self) -> RuntimeStatusView<'_> {
        let graph: SessionTabsGraphStatus = self.state.session_tabs.graph_status();
        RuntimeStatusView {
            app_version: &self.state.app_version,
            // Why: Chrome authority is an authenticated connection ID, not the legacy numeric
            // browser-window identifier carried by this compatibility field.
            authoritative_window_id: None,
            capabilities: &RUNTIME_CAPABILITIES,
            // Why: RuntimeStatus is constructed only after the Session Tabs authority opens. It
            // owns a usable headless graph without Chrome; only a requested resync is reloading.
            graph_is_reloading: graph.is_reloading,
            host_platform: self.state.host_platform,
            live_leaf_count: graph.live_leaf_count,
            live_tab_count: graph.live_tab_count,
            min_compatible_runtime_client_version: self.state.min_compatible_client_version,
            remote_update_support: self.state.updater.support(),
            renderer_graph_epoch: graph.renderer_graph_epoch,
            runtime_id: self.state.identity.runtime_id(),
            runtime_api_version: self.state.protocol_version,
            terminal_windows_shell: self.state.settings.terminal_windows_shell(),
        }
    }
}

fn host_platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        platform => platform,
    }
}
