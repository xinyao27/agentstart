use crate::account_usage::{AccountsAuthority, RateLimitResumeAuthority, StatsAuthority};
use crate::agent_trust::AgentTrustService;
use crate::ai_vault::AiVaultAuthority;
use crate::app_control::AppControlAuthority;
use crate::cli_installer::CliInstaller;
use crate::client_events::ClientEventsAuthority;
use crate::clipboard::{ClipboardImageFiles, ClipboardImageUploads};
use crate::computer::ComputerAuthority;
use crate::dangerous_approval::DangerousApprovalAuthority;
use crate::developer_permissions::DeveloperPermissionsAuthority;
use crate::diagnostics::MemoryDiagnostics;
use crate::emulator::EmulatorAuthority;
use crate::external_paths::ExternalPathAuthority;
use crate::files::FilesAuthority;
use crate::folder_workspaces::FolderWorkspaceAuthority;
use crate::git::GitCommandTrace;
use crate::github::GitHubAuthority;
use crate::host_progress::HostProgressAuthority;
use crate::host_registry::HostRegistry;
use crate::keybindings::KeybindingsAuthority;
use crate::local_download::LocalDownloadAuthority;
use crate::mobile::MobilePairingManager;
use crate::mobile::windows_firewall::WindowsFirewall;
use crate::notebook::NotebookRunner;
use crate::notifications::NotificationAuthority;
use crate::orchestration::OrchestrationAuthority;
use crate::persistence::visual_regression::VisualRegressionStore;
use crate::persistence::{ArtifactStore, BrowserReplayStore, WorkspaceJournal};
use crate::preflight::Preflight;
use crate::profiles::ProfilesAuthority;
use crate::project_groups::ProjectGroupAuthority;
use crate::project_host_setups::ProjectHostSetupAuthority;
use crate::projects::{ProjectCatalog, RemoteProjectResolver};
use crate::provider_usage::ProviderUsageAuthority;
use crate::repo_host::RepoHostAuthority;
use crate::repositories::RepositoryAuthority;
use crate::repository_refs::RepositoryRefs;
use crate::reverse_protocol::ReverseProtocolRegistry;
use crate::ritual::RitualAuthority;
use crate::runtime::RuntimeStatus;
use crate::runtime_environment::RuntimeEnvironmentAuthority;
use crate::session_tabs::SessionTabsAuthority;
use crate::settings::SettingsAuthority;
use crate::shell_events::ShellEventAuthority;
use crate::shell_platform::ShellPlatformAuthority;
use crate::shell_services::ShellServicesRegistry;
use crate::shell_state::ShellStateAuthority;
use crate::skills::SkillsAuthority;
use crate::telemetry::TelemetryAuthority;
use crate::terminal_session::TerminalSessionAuthority;
use crate::ui::UiAuthority;
use crate::updater::DaemonUpdater;
use crate::workspace_cleanup::WorkspaceCleanupAuthority;
use crate::workspace_paths::WorkspacePathAuthority;
use crate::workspace_ports::WorkspacePortsRegistry;
use crate::workspace_session::WorkspaceSessionAuthority;
use crate::workspace_space::WorkspaceSpaceAuthority;
use crate::worktrees::WorktreeArchiveAuthority;
use crate::worktrees::WorktreeCatalog;

use super::accounts::AccountsRpc;
use super::agent_session::{AgentSessionAuthority, AgentSessionRpc};
use super::agent_status::AgentStatusAuthority;
use super::agent_trust::AgentTrustRpc;
use super::app_control::AppControlRpc;
use super::artifact::ArtifactRpc;
use super::browser_command::BrowserCommandRpc;
use super::browser_protocol::BrowserProtocolRpc;
use super::browser_replay::BrowserReplayRpc;
use super::browser_writeback::BrowserWritebackRpc;
use super::cli::CliRpc;
use super::client_events::ClientEventsRpc;
use super::clipboard::ClipboardRpc;
use super::computer::ComputerRpc;
use super::crash_reports::CrashReportsRpc;
use super::dangerous_approval::DangerousApprovalRpc;
use super::developer_permissions::DeveloperPermissionsRpc;
use super::diagnostics::DiagnosticsRpc;
use super::emulator::EmulatorRpc;
use super::external_editor::ExternalEditorRpc;
use super::feedback::FeedbackRpc;
use super::files::FilesRpc;
use super::folder_workspace::FolderWorkspaceRpc;
use super::git::GitRpc;
use super::github::GitHubRpc;
use super::host_progress::HostProgressRpc;
use super::host_registry::HostRegistryRpc;
use super::keybindings::KeybindingsRpc;
use super::layout::LayoutRpc;
use super::local_download::LocalDownloadRpc;
use super::markdown::MarkdownRpc;
use super::mobile::MobileRpc;
use super::notebook::NotebookRpc;
use super::notifications::NotificationsRpc;
use super::orchestration::OrchestrationRpc;
use super::preflight::PreflightRpc;
use super::profiles::ProfilesRpc;
use super::project::ProjectRpc;
use super::project_context::ProjectContextRpc;
use super::project_group::ProjectGroupRpc;
use super::project_host_setup::ProjectHostSetupRpc;
use super::provider_usage::ProviderUsageRpc;
use super::rate_limit_resume::RateLimitResumeRpc;
use super::repo::RepoRpc;
use super::repo_host::RepoHostRpc;
use super::repository_refs::RepositoryRefsRpc;
use super::ritual::RitualRpc;
use super::runtime_environment::RuntimeEnvironmentRpc;
use super::session_tabs::SessionTabsRpc;
use super::settings::SettingsRpc;
use super::shell_events::ShellEventsRpc;
use super::shell_files::ShellFilesRpc;
use super::shell_platform::ShellPlatformRpc;
use super::shell_runtime::ShellRuntimeRpc;
use super::shell_state::ShellStateRpc;
use super::shell_telemetry::ShellTelemetryRpc;
use super::skills::SkillsRpc;
use super::star_nag::StarNagRpc;
use super::stats::StatsRpc;
use super::status::StatusRpc;
use super::terminal::TerminalRpc;
use super::ui::UiRpc;
use super::updater::UpdaterRpc;
use super::visual_regression::VisualRegressionRpc;
use super::windows_firewall::WindowsFirewallRpc;
use super::workspace_cleanup::WorkspaceCleanupRpc;
use super::workspace_events::WorkspaceEventsRpc;
use super::workspace_ports::WorkspacePortsRpc;
use super::workspace_session::WorkspaceSessionRpc;
use super::workspace_space::WorkspaceSpaceRpc;
use super::worktree::{WorktreeRpc, WorktreeRpcInputs};
use super::worktree_labels::WorktreeLabelsRpc;

#[derive(Clone)]
pub(crate) struct SessionServices {
    accounts: AccountsRpc,
    app_control: AppControlRpc,
    ai_vault_authority: AiVaultAuthority,
    agent_trust: AgentTrustRpc,
    agent_session: AgentSessionRpc,
    agent_status_authority: AgentStatusAuthority,
    crash_reports: CrashReportsRpc,
    feedback: FeedbackRpc,
    layout: LayoutRpc,
    star_nag: StarNagRpc,
    worktree_labels: WorktreeLabelsRpc,
    artifact: ArtifactRpc,
    browser_command: BrowserCommandRpc,
    browser_protocol: BrowserProtocolRpc,
    browser_replay: BrowserReplayRpc,
    browser_writeback: BrowserWritebackRpc,
    shell_services: ShellServicesRegistry,
    clipboard: ClipboardRpc,
    computer: ComputerRpc,
    cli: CliRpc,
    client_events: ClientEventsRpc,
    diagnostics: DiagnosticsRpc,
    emulator: EmulatorRpc,
    dangerous_approval: DangerousApprovalRpc,
    external_editor: ExternalEditorRpc,
    files: FilesRpc,
    folder_workspace: FolderWorkspaceRpc,
    git: GitRpc,
    github: GitHubRpc,
    host_registry: HostRegistryRpc,
    host_progress: HostProgressRpc,
    keybindings: KeybindingsRpc,
    local_downloads: LocalDownloadRpc,
    markdown: MarkdownRpc,
    mobile: MobileRpc,
    notebook: NotebookRpc,
    notifications: NotificationsRpc,
    orchestration: OrchestrationRpc,
    preflight: PreflightRpc,
    profiles: ProfilesRpc,
    provider_usage: ProviderUsageRpc,
    rate_limit_resume: RateLimitResumeRpc,
    reverse_protocol: ReverseProtocolRegistry,
    project: ProjectRpc,
    project_context: ProjectContextRpc,
    project_group: ProjectGroupRpc,
    project_host_setup: ProjectHostSetupRpc,
    repo: RepoRpc,
    repo_host: RepoHostRpc,
    repository_refs: RepositoryRefsRpc,
    ritual: RitualRpc,
    runtime_environments: RuntimeEnvironmentRpc,
    session_tabs: SessionTabsRpc,
    settings: SettingsRpc,
    shell_events: ShellEventsRpc,
    shell_files: ShellFilesRpc,
    shell_runtime: ShellRuntimeRpc,
    shell_state: ShellStateRpc,
    shell_platform: ShellPlatformRpc,
    shell_telemetry: ShellTelemetryRpc,
    skills: SkillsRpc,
    status: StatusRpc,
    stats: StatsRpc,
    terminal: TerminalRpc,
    updater: UpdaterRpc,
    ui: UiRpc,
    visual_regression: VisualRegressionRpc,
    workspace_events: WorkspaceEventsRpc,
    workspace_ports: WorkspacePortsRpc,
    workspace_session: WorkspaceSessionRpc,
    workspace_space: WorkspaceSpaceRpc,
    workspace_cleanup: WorkspaceCleanupRpc,
    worktree: WorktreeRpc,
    windows_firewall: WindowsFirewallRpc,
    developer_permissions: DeveloperPermissionsRpc,
}

pub(crate) struct SessionServiceInputs {
    pub(crate) accounts: AccountsAuthority,
    pub(crate) app_control: AppControlAuthority,
    pub(crate) ai_vault: AiVaultAuthority,
    pub(crate) agent_trust: AgentTrustService,
    pub(crate) agent_sessions: AgentSessionAuthority,
    pub(crate) agent_status: AgentStatusAuthority,
    pub(crate) artifacts: ArtifactStore,
    pub(crate) browser_replays: BrowserReplayStore,
    pub(crate) shell_services: ShellServicesRegistry,
    pub(crate) clipboard_uploads: ClipboardImageUploads,
    pub(crate) computer: ComputerAuthority,
    pub(crate) client_events: ClientEventsAuthority,
    pub(crate) crash_reports: crate::crash_reports::CrashReportAuthority,
    pub(crate) feedback: crate::feedback::FeedbackAuthority,
    pub(crate) star_nag: crate::star_nag::StarNagAuthority,
    pub(crate) worktree_labels: crate::worktree_labels::WorktreeLabelAuthority,
    pub(crate) diagnostics: MemoryDiagnostics,
    pub(crate) emulator: EmulatorAuthority,
    pub(crate) dangerous_approval: DangerousApprovalAuthority,
    pub(crate) external_paths: ExternalPathAuthority,
    pub(crate) files: FilesAuthority,
    pub(crate) folder_workspaces: FolderWorkspaceAuthority,
    pub(crate) github: GitHubAuthority,
    pub(crate) git_command_trace: GitCommandTrace,
    pub(crate) host_registry: HostRegistry,
    pub(crate) host_progress: HostProgressAuthority,
    pub(crate) keybindings: KeybindingsAuthority,
    pub(crate) local_downloads: LocalDownloadAuthority,
    pub(crate) journal: WorkspaceJournal,
    pub(crate) mobile_pairing: MobilePairingManager,
    pub(crate) notebook: NotebookRunner,
    pub(crate) notifications: NotificationAuthority,
    pub(crate) orchestration: OrchestrationAuthority,
    pub(crate) preflight: Preflight,
    pub(crate) profiles: ProfilesAuthority,
    pub(crate) provider_usage: ProviderUsageAuthority,
    pub(crate) rate_limit_resume: RateLimitResumeAuthority,
    pub(crate) reverse_protocol: ReverseProtocolRegistry,
    pub(crate) project_catalog: ProjectCatalog,
    pub(crate) project_context: RemoteProjectResolver,
    pub(crate) project_groups: ProjectGroupAuthority,
    pub(crate) project_host_setups: ProjectHostSetupAuthority,
    pub(crate) repositories: RepositoryAuthority,
    pub(crate) ritual: RitualAuthority,
    pub(crate) runtime_environments: RuntimeEnvironmentAuthority,
    pub(crate) session_tabs: SessionTabsAuthority,
    pub(crate) settings: SettingsAuthority,
    pub(crate) shell_events: ShellEventAuthority,
    pub(crate) shell_state: ShellStateAuthority,
    pub(crate) skills: SkillsAuthority,
    pub(crate) status: RuntimeStatus,
    pub(crate) stats: StatsAuthority,
    pub(crate) telemetry: TelemetryAuthority,
    pub(crate) terminal_sessions: TerminalSessionAuthority,
    pub(crate) updater: DaemonUpdater,
    pub(crate) ui: UiAuthority,
    pub(crate) visual_regressions: VisualRegressionStore,
    pub(crate) workspace_ports: WorkspacePortsRegistry,
    pub(crate) workspace_session: WorkspaceSessionAuthority,
    pub(crate) workspace_space: WorkspaceSpaceAuthority,
    pub(crate) workspace_cleanup: WorkspaceCleanupAuthority,
    pub(crate) worktree_archives: WorktreeArchiveAuthority,
    pub(crate) worktrees: WorktreeCatalog,
}

impl SessionServices {
    pub(super) fn protocol_accounts(&self) -> AccountsRpc {
        self.accounts.clone()
    }

    pub(super) fn protocol_app_control(&self) -> AppControlRpc {
        self.app_control.clone()
    }

    pub(super) fn protocol_ai_vault(&self) -> AiVaultAuthority {
        self.ai_vault_authority.clone()
    }

    pub(super) fn protocol_agent_trust(&self) -> AgentTrustRpc {
        self.agent_trust.clone()
    }

    pub(super) fn protocol_markdown(&self) -> MarkdownRpc {
        self.markdown.clone()
    }

    pub(super) fn protocol_preflight(&self) -> PreflightRpc {
        self.preflight.clone()
    }

    pub(super) fn protocol_ui(&self) -> UiRpc {
        self.ui.clone()
    }

    pub(super) fn protocol_agent_status(&self) -> AgentStatusAuthority {
        self.agent_status_authority.clone()
    }

    pub(super) fn protocol_diagnostics(&self) -> DiagnosticsRpc {
        self.diagnostics.clone()
    }

    pub(super) fn protocol_cli(&self) -> CliRpc {
        self.cli.clone()
    }

    pub(super) fn protocol_browser(&self) -> BrowserProtocolRpc {
        self.browser_protocol.clone()
    }

    pub(super) fn protocol_status(&self) -> StatusRpc {
        self.status.clone()
    }

    pub(super) fn protocol_stats(&self) -> StatsRpc {
        self.stats.clone()
    }

    pub(super) fn protocol_host_registry(&self) -> HostRegistryRpc {
        self.host_registry.clone()
    }

    pub(super) fn protocol_github(&self) -> GitHubRpc {
        self.github.clone()
    }

    pub(super) fn protocol_notifications(&self) -> NotificationsRpc {
        self.notifications.clone()
    }

    pub(super) fn protocol_repo(&self) -> RepoRpc {
        self.repo.clone()
    }

    pub(super) fn protocol_repository_refs(&self) -> RepositoryRefs {
        self.repository_refs.authority()
    }

    pub(super) fn protocol_session_tabs(&self) -> SessionTabsRpc {
        self.session_tabs.clone()
    }

    pub(super) fn protocol_project_group(&self) -> ProjectGroupRpc {
        self.project_group.clone()
    }

    pub(super) fn protocol_shell_platform(&self) -> ShellPlatformRpc {
        self.shell_platform
    }

    pub(super) fn protocol_skills(&self) -> SkillsRpc {
        self.skills.clone()
    }

    pub(super) fn protocol_settings(&self) -> SettingsRpc {
        self.settings.clone()
    }

    pub(super) fn protocol_clipboard(&self) -> ClipboardRpc {
        self.clipboard.clone()
    }

    pub(super) fn protocol_folder_workspace(&self) -> FolderWorkspaceRpc {
        self.folder_workspace.clone()
    }

    pub(super) fn protocol_profiles(&self) -> ProfilesRpc {
        self.profiles.clone()
    }

    pub(super) fn protocol_workspace_cleanup(&self) -> WorkspaceCleanupRpc {
        self.workspace_cleanup.clone()
    }

    pub(super) fn protocol_workspace_session(&self) -> WorkspaceSessionRpc {
        self.workspace_session.clone()
    }

    pub(super) fn protocol_shell_telemetry(&self) -> ShellTelemetryRpc {
        self.shell_telemetry.clone()
    }

    pub(super) fn protocol_ritual(&self) -> RitualRpc {
        self.ritual.clone()
    }

    pub(super) fn protocol_workspace_ports(&self) -> WorkspacePortsRpc {
        self.workspace_ports.clone()
    }

    pub(super) fn protocol_shell_state(&self) -> ShellStateRpc {
        self.shell_state.clone()
    }

    pub(super) fn protocol_project(&self) -> ProjectRpc {
        self.project.clone()
    }

    pub(super) fn protocol_visual_regression(&self) -> VisualRegressionRpc {
        self.visual_regression.clone()
    }

    pub(super) fn protocol_workspace_space(&self) -> WorkspaceSpaceRpc {
        self.workspace_space.clone()
    }

    pub(super) fn protocol_client_events(&self) -> ClientEventsRpc {
        self.client_events.clone()
    }

    pub(super) fn protocol_project_context(&self) -> ProjectContextRpc {
        self.project_context.clone()
    }

    pub(super) fn protocol_notebook(&self) -> NotebookRpc {
        self.notebook.clone()
    }

    pub(super) fn protocol_external_editor(&self) -> ExternalEditorRpc {
        self.external_editor
    }

    pub(super) fn protocol_shell_events(&self) -> ShellEventsRpc {
        self.shell_events.clone()
    }

    pub(super) fn protocol_shell_runtime(&self) -> ShellRuntimeRpc {
        self.shell_runtime.clone()
    }

    pub(super) fn protocol_host_progress(&self) -> HostProgressRpc {
        self.host_progress.clone()
    }

    pub(super) fn protocol_repo_host(&self) -> RepoHostRpc {
        self.repo_host.clone()
    }

    pub(super) fn protocol_keybindings(&self) -> KeybindingsRpc {
        self.keybindings.clone()
    }

    pub(super) fn protocol_artifact(&self) -> ArtifactRpc {
        self.artifact.clone()
    }

    pub(super) fn protocol_dangerous_approval(&self) -> DangerousApprovalRpc {
        self.dangerous_approval.clone()
    }

    pub(super) fn protocol_project_host_setup(&self) -> ProjectHostSetupRpc {
        self.project_host_setup.clone()
    }

    pub(super) fn protocol_local_downloads(&self) -> LocalDownloadRpc {
        self.local_downloads.clone()
    }

    pub(super) fn protocol_mobile(&self) -> MobileRpc {
        self.mobile.clone()
    }

    pub(super) fn protocol_runtime_environments(&self) -> RuntimeEnvironmentRpc {
        self.runtime_environments.clone()
    }

    pub(super) fn protocol_terminal(&self) -> TerminalRpc {
        self.terminal.clone()
    }

    pub(super) fn protocol_updater(&self) -> UpdaterRpc {
        self.updater.clone()
    }

    pub(super) fn protocol_workspace_events(&self) -> WorkspaceEventsRpc {
        self.workspace_events.clone()
    }

    pub(super) fn protocol_worktree(&self) -> WorktreeRpc {
        self.worktree.clone()
    }

    pub(super) fn protocol_windows_firewall(&self) -> WindowsFirewallRpc {
        self.windows_firewall.clone()
    }

    pub(super) fn protocol_developer_permissions(&self) -> DeveloperPermissionsRpc {
        self.developer_permissions.clone()
    }

    pub(super) fn protocol_crash_reports(&self) -> CrashReportsRpc {
        self.crash_reports.clone()
    }

    pub(super) fn protocol_computer(&self) -> ComputerRpc {
        self.computer.clone()
    }

    pub(super) fn protocol_files(&self) -> FilesRpc {
        self.files.clone()
    }

    pub(super) fn protocol_git(&self) -> GitRpc {
        self.git.clone()
    }

    pub(super) fn protocol_emulator(&self) -> EmulatorRpc {
        self.emulator.clone()
    }

    pub(super) fn protocol_shell_files(&self) -> ShellFilesRpc {
        self.shell_files.clone()
    }

    pub(super) fn protocol_browser_command(&self) -> BrowserCommandRpc {
        self.browser_command.clone()
    }

    pub(super) fn protocol_browser_replay(&self) -> BrowserReplayRpc {
        self.browser_replay.clone()
    }

    pub(super) fn protocol_browser_writeback(&self) -> BrowserWritebackRpc {
        self.browser_writeback.clone()
    }

    pub(super) fn protocol_orchestration(&self) -> OrchestrationRpc {
        self.orchestration.clone()
    }

    pub(super) fn protocol_provider_usage(&self) -> ProviderUsageRpc {
        self.provider_usage.clone()
    }

    pub(super) fn protocol_rate_limit_resume(&self) -> RateLimitResumeRpc {
        self.rate_limit_resume.clone()
    }

    pub(super) fn protocol_feedback(&self) -> FeedbackRpc {
        self.feedback.clone()
    }

    pub(super) fn protocol_layout(&self) -> LayoutRpc {
        self.layout.clone()
    }

    pub(super) fn protocol_agent_session(&self) -> AgentSessionRpc {
        self.agent_session.clone()
    }

    pub(super) fn protocol_star_nag(&self) -> StarNagRpc {
        self.star_nag.clone()
    }

    pub(super) fn protocol_worktree_labels(&self) -> WorktreeLabelsRpc {
        self.worktree_labels.clone()
    }

    pub(super) fn register_terminal_connection(
        &self,
        connection_id: String,
    ) -> tokio::sync::watch::Receiver<Option<crate::terminal_session::TerminalMultiplexClose>> {
        self.terminal.register_connection(connection_id)
    }

    pub(super) fn close_terminal_connection(&self, connection_id: &str) {
        self.terminal.close_connection(connection_id);
    }

    pub(super) fn close_github_connection(&self, connection_id: &str) {
        self.github.close_connection(connection_id);
    }

    pub(super) fn close_session_tabs_connection(&self, connection_id: &str) {
        self.session_tabs.close_connection(connection_id);
    }

    pub(super) fn close_local_download_connection(&self, connection_id: &str) {
        self.local_downloads
            .authority()
            .close_connection(connection_id);
    }

    pub(super) fn revoke_file_grants(&self, client_id: &str) {
        self.files
            .authority()
            .revoke_terminal_grants_for_client(client_id);
    }

    pub(super) fn shell_services(&self) -> ShellServicesRegistry {
        self.shell_services.clone()
    }

    pub(super) fn reverse_protocol(&self) -> ReverseProtocolRegistry {
        self.reverse_protocol.clone()
    }

    pub(crate) fn new(inputs: SessionServiceInputs) -> Self {
        let SessionServiceInputs {
            accounts,
            app_control,
            ai_vault,
            agent_trust,
            agent_sessions,
            agent_status,
            artifacts,
            browser_replays,
            shell_services,
            clipboard_uploads,
            computer,
            client_events,
            crash_reports,
            feedback,
            star_nag,
            worktree_labels,
            diagnostics,
            emulator,
            dangerous_approval,
            external_paths,
            files,
            folder_workspaces,
            github,
            git_command_trace,
            host_registry,
            host_progress,
            keybindings,
            local_downloads,
            journal,
            mobile_pairing,
            notebook,
            notifications,
            orchestration,
            preflight,
            profiles,
            provider_usage,
            rate_limit_resume,
            reverse_protocol,
            project_catalog,
            project_context,
            project_groups,
            project_host_setups,
            repositories,
            ritual,
            runtime_environments,
            session_tabs,
            settings,
            shell_events,
            shell_state,
            skills,
            status,
            stats,
            telemetry,
            terminal_sessions,
            updater,
            ui,
            visual_regressions,
            workspace_ports,
            workspace_session,
            workspace_space,
            workspace_cleanup,
            worktree_archives,
            worktrees,
        } = inputs;
        let repo_host = RepoHostRpc::new(RepoHostAuthority::new(
            project_catalog.clone(),
            project_host_setups.clone(),
        ));
        let git = GitRpc::new(
            project_catalog.clone(),
            worktrees.clone(),
            host_registry.clone(),
            settings.clone(),
            git_command_trace,
        );
        let workspace_paths = WorkspacePathAuthority::new(
            project_catalog.clone(),
            worktrees.clone(),
            host_registry.clone(),
            external_paths,
        );
        let files = FilesRpc::new(files);
        let browser_writeback = BrowserWritebackRpc::new(
            agent_trust.clone(),
            host_registry.clone(),
            journal.clone(),
            workspace_ports.clone(),
            settings.clone(),
            terminal_sessions.clone(),
            worktrees.clone(),
        );
        let session_tabs_rpc = SessionTabsRpc::new(session_tabs.clone());
        let worktree = WorktreeRpc::new(WorktreeRpcInputs {
            archives: worktree_archives,
            worktrees: worktrees.clone(),
            client_events: client_events.clone(),
            journal: journal.clone(),
            terminals: terminal_sessions.clone(),
            workspace_session: workspace_session.clone(),
            repositories: repositories.clone(),
            agent_status: agent_status.clone(),
            orchestration: orchestration.clone(),
        });
        let accounts = AccountsRpc::new(accounts);
        let stats = StatsRpc::new(stats);
        let rate_limit_resume = RateLimitResumeRpc::new(rate_limit_resume, accounts.clone());
        Self {
            accounts,
            app_control: AppControlRpc::new(app_control),
            ai_vault_authority: ai_vault,
            agent_trust: AgentTrustRpc::new(agent_trust),
            agent_session: AgentSessionRpc::new(agent_sessions.clone()),
            agent_status_authority: agent_status,
            artifact: ArtifactRpc::new(artifacts.clone()),
            browser_command: BrowserCommandRpc::new(journal.clone()),
            browser_protocol: BrowserProtocolRpc::new(reverse_protocol.clone(), worktrees.clone()),
            browser_replay: BrowserReplayRpc::new(browser_replays, journal.clone()),
            browser_writeback,
            shell_services: shell_services.clone(),
            clipboard: ClipboardRpc::new(ClipboardImageFiles::new(), clipboard_uploads),
            computer: ComputerRpc::new(computer.clone()),
            cli: CliRpc::new(CliInstaller::new(host_registry.system_capabilities())),
            client_events: ClientEventsRpc::new(client_events),
            crash_reports: CrashReportsRpc::new(crash_reports),
            feedback: FeedbackRpc::new(feedback),
            layout: LayoutRpc::new(
                worktrees.clone(),
                host_registry.clone(),
                terminal_sessions.clone(),
                journal.clone(),
                agent_sessions,
            ),
            star_nag: StarNagRpc::new(star_nag),
            worktree_labels: WorktreeLabelsRpc::new(worktree_labels),
            diagnostics: DiagnosticsRpc::new(diagnostics),
            emulator: EmulatorRpc::new(emulator),
            dangerous_approval: DangerousApprovalRpc::new(dangerous_approval.clone()),
            external_editor: ExternalEditorRpc::new(),
            files,
            folder_workspace: FolderWorkspaceRpc::new(folder_workspaces),
            git,
            github: GitHubRpc::new(github, telemetry.clone()),
            host_registry: HostRegistryRpc::new(host_registry.clone()),
            host_progress: HostProgressRpc::new(host_progress),
            keybindings: KeybindingsRpc::new(keybindings, shell_events.clone()),
            local_downloads: LocalDownloadRpc::new(local_downloads),
            markdown: MarkdownRpc::new(session_tabs.clone(), shell_services.clone()),
            mobile: MobileRpc::new(mobile_pairing.clone()),
            notebook: NotebookRpc::new(notebook),
            notifications: NotificationsRpc::new(
                notifications,
                settings.clone(),
                shell_services.clone(),
            ),
            orchestration: OrchestrationRpc::new(orchestration),
            preflight: PreflightRpc::new(preflight),
            profiles: ProfilesRpc::new(profiles.clone(), settings.clone()),
            provider_usage: ProviderUsageRpc::new(provider_usage),
            rate_limit_resume,
            reverse_protocol,
            project: ProjectRpc::new(project_catalog.clone()),
            project_context: ProjectContextRpc::new(project_context),
            project_group: ProjectGroupRpc::new(project_groups),
            project_host_setup: ProjectHostSetupRpc::new(project_host_setups.clone()),
            repo: RepoRpc::new(repositories),
            repo_host,
            repository_refs: RepositoryRefsRpc::new(RepositoryRefs::new(
                project_catalog.clone(),
                host_registry.clone(),
            )),
            ritual: RitualRpc::new(ritual, dangerous_approval.clone()),
            runtime_environments: RuntimeEnvironmentRpc::new(
                runtime_environments,
                settings.clone(),
                profiles,
            ),
            session_tabs: session_tabs_rpc,
            settings: SettingsRpc::new(settings.clone()),
            shell_events: ShellEventsRpc::new(shell_events),
            shell_files: ShellFilesRpc::new(workspace_paths),
            shell_runtime: ShellRuntimeRpc::new(session_tabs.clone(), status.clone()),
            shell_state: ShellStateRpc::new(shell_state),
            shell_platform: ShellPlatformRpc::new(ShellPlatformAuthority::new()),
            shell_telemetry: ShellTelemetryRpc::new(telemetry),
            skills: SkillsRpc::new(skills),
            status: StatusRpc::new(status),
            stats,
            terminal: TerminalRpc::new(
                terminal_sessions.clone(),
                dangerous_approval.clone(),
                session_tabs,
            ),
            updater: UpdaterRpc::new(updater),
            ui: UiRpc::new(ui),
            visual_regression: VisualRegressionRpc::new(
                journal.clone(),
                workspace_ports.clone(),
                visual_regressions,
                worktrees.clone(),
            ),
            workspace_events: WorkspaceEventsRpc::new(
                artifacts,
                journal,
                workspace_ports.clone(),
                project_catalog.clone(),
                terminal_sessions.clone(),
                worktrees.clone(),
            ),
            workspace_ports: WorkspacePortsRpc::new(workspace_ports, project_catalog, worktrees),
            workspace_session: WorkspaceSessionRpc::new(workspace_session),
            workspace_space: WorkspaceSpaceRpc::new(workspace_space),
            workspace_cleanup: WorkspaceCleanupRpc::new(workspace_cleanup),
            worktree,
            windows_firewall: WindowsFirewallRpc::new(WindowsFirewall::new(mobile_pairing)),
            developer_permissions: DeveloperPermissionsRpc::new(
                DeveloperPermissionsAuthority::new(computer),
            ),
        }
    }
}
