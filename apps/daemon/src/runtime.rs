use std::collections::HashSet;
use std::error::Error;
use std::fmt;
use std::path::PathBuf;
use std::sync::Arc;

use crate::account_usage::{
    AccountsAuthority, CodexRuntimeHome, RateLimitResumeAuthority, RateLimitResumeWorker,
    StatsAuthority,
};
use crate::agent_status_hooks::AgentStatusHooksAuthority;
use crate::agent_trust::AgentTrustService;
use crate::ai_vault::AiVaultAuthority;
use crate::app_control::AppControlAuthority;
use crate::client_events::ClientEventsAuthority;
use crate::clipboard::ClipboardImageUploads;
use crate::computer::ComputerAuthority;
use crate::crash_reports::CrashReportAuthority;
use crate::dangerous_approval::DangerousApprovalAuthority;
use crate::diagnostics::{DiagnosticsTrace, MemoryDiagnostics};
use crate::emulator::EmulatorAuthority;
use crate::external_paths::ExternalPathAuthority;
use crate::feedback::FeedbackAuthority;
use crate::files::FilesAuthority;
use crate::folder_workspaces::FolderWorkspaceAuthority;
use crate::git::GitCommandTrace;
use crate::github::GitHubAuthority;
use crate::host_progress::HostProgressAuthority;
use crate::host_registry::HostRegistry;
use crate::keybindings::{KeybindingsAuthority, KeybindingsError};
use crate::local_download::LocalDownloadAuthority;
use crate::mobile::{
    MobilePairingOffer, MobilePairingOfferError, MobileServerConfig, load_or_create_keypair,
    migrate_keypair_to_installation,
};
use crate::notebook::NotebookRunner;
use crate::notifications::{AgentPhaseWorker, agent_phase_channel, start_agent_phase_worker};
use crate::orchestration::{OrchestrationAuthority, OrchestrationDatabase};
use crate::persistence::{
    ArtifactStore, BrowserReplayStore, DaemonDatabase, InstallationDatabase, WorkspaceJournal,
};
use crate::preflight::Preflight;
use crate::profiles::ProfilesAuthority;
use crate::project_groups::ProjectGroupAuthority;
use crate::project_host_setups::ProjectHostSetupAuthority;
use crate::projects::RemoteProjectResolver;
use crate::provider_usage::ProviderUsageAuthority;
use crate::repositories::RepositoryAuthority;
use crate::reverse_protocol::ReverseProtocolRegistry;
use crate::ritual::{DaemonRitualRunner, RitualAuthority, RitualScheduler};
pub use crate::rpc::AuthenticatedChannel;
use crate::rpc::{
    AgentSessionAuthority, AgentStatusAuthority, AgentStatusFlushError, SessionServiceInputs,
    SessionServices,
};
use crate::runtime_environment::RuntimeEnvironmentAuthority;
use crate::session_tabs::SessionTabsAuthority;
use crate::settings::SettingsAuthority;
use crate::shell_events::ShellEventAuthority;
use crate::shell_services::ShellServicesRegistry;
use crate::shell_state::ShellStateAuthority;
use crate::skills::SkillsAuthority;
use crate::star_nag::StarNagAuthority;
use crate::telemetry::TelemetryAuthority;
use crate::terminal_session::{TerminalRuntimeContext, TerminalSessionAuthority};
use crate::ui::UiAuthority;
use crate::update::UpdateChecker;
use crate::updater::DaemonUpdater;
use crate::workspace_cleanup::WorkspaceCleanupAuthority;
use crate::workspace_ports::WorkspacePortsRegistry;
use crate::workspace_session::WorkspaceSessionAuthority;
use crate::workspace_space::WorkspaceSpaceAuthority;
use crate::worktree_labels::WorktreeLabelAuthority;
use crate::worktrees::WorktreeArchiveAuthority;
use crate::worktrees::WorktreeCatalog;

mod identity;
mod mobile;
mod sessions;
mod status;

pub use identity::RuntimeIdentity;
use mobile::RuntimeMobile;
use sessions::RuntimeSessions;
pub use sessions::SessionHandle;
pub(crate) use status::RuntimeStatus;

pub struct RuntimeConfig {
    pub allowed_extension_origins: HashSet<String>,
    pub diagnostics_trace: DiagnosticsTrace,
    pub user_data_path: PathBuf,
}

pub struct RuntimeReady;

pub struct ShutdownReport;

pub enum ShutdownReason {
    Requested,
    Restart,
    Signal,
    StartupFailure,
}

pub struct Runtime {
    accounts: AccountsAuthority,
    ai_vault: AiVaultAuthority,
    agent_trust: AgentTrustService,
    agent_sessions: AgentSessionAuthority,
    agent_status: AgentStatusAuthority,
    agent_phase_worker: AgentPhaseWorker,
    app_control: AppControlAuthority,
    artifacts: ArtifactStore,
    browser_replays: BrowserReplayStore,
    shell_services: ShellServicesRegistry,
    clipboard_uploads: ClipboardImageUploads,
    computer: ComputerAuthority,
    client_events: ClientEventsAuthority,
    crash_reports: CrashReportAuthority,
    dangerous_approval: DangerousApprovalAuthority,
    ritual: RitualAuthority,
    ritual_scheduler: RitualScheduler,
    runtime_environments: RuntimeEnvironmentAuthority,
    database: DaemonDatabase,
    installation_database: InstallationDatabase,
    diagnostics: MemoryDiagnostics,
    emulator: EmulatorAuthority,
    external_paths: ExternalPathAuthority,
    files: FilesAuthority,
    feedback: FeedbackAuthority,
    folder_workspaces: FolderWorkspaceAuthority,
    github: GitHubAuthority,
    git_command_trace: GitCommandTrace,
    host_registry: HostRegistry,
    host_progress: HostProgressAuthority,
    identity: RuntimeIdentity,
    keybindings: KeybindingsAuthority,
    local_downloads: LocalDownloadAuthority,
    mobile: RuntimeMobile,
    notebook: NotebookRunner,
    orchestration: OrchestrationAuthority,
    orchestration_database: OrchestrationDatabase,
    preflight: Preflight,
    profiles: ProfilesAuthority,
    provider_usage: ProviderUsageAuthority,
    rate_limit_resume: RateLimitResumeAuthority,
    rate_limit_resume_worker: RateLimitResumeWorker,
    reverse_protocol: ReverseProtocolRegistry,
    project_groups: ProjectGroupAuthority,
    project_host_setups: ProjectHostSetupAuthority,
    repositories: RepositoryAuthority,
    project_context: RemoteProjectResolver,
    session_tabs: SessionTabsAuthority,
    settings: SettingsAuthority,
    shell_events: ShellEventAuthority,
    shell_state: ShellStateAuthority,
    worktree_labels: WorktreeLabelAuthority,
    skills: SkillsAuthority,
    sessions: RuntimeSessions,
    star_nag: StarNagAuthority,
    status: RuntimeStatus,
    stats: StatsAuthority,
    telemetry: TelemetryAuthority,
    terminal_sessions: TerminalSessionAuthority,
    updater: DaemonUpdater,
    ui: UiAuthority,
    worktrees: WorktreeCatalog,
    workspace_ports: WorkspacePortsRegistry,
    workspace_journal: WorkspaceJournal,
    workspace_session: WorkspaceSessionAuthority,
    worktree_archives: WorktreeArchiveAuthority,
    workspace_space: WorkspaceSpaceAuthority,
    workspace_cleanup: WorkspaceCleanupAuthority,
}

#[derive(Debug)]
pub struct RuntimeFault {
    source: Box<dyn Error + Send + Sync>,
}

impl Runtime {
    pub async fn open(config: RuntimeConfig) -> Result<(Self, RuntimeReady), RuntimeFault> {
        let manifest = crate::protocol::embedded_metadata().map_err(RuntimeFault::new)?;
        let identity = RuntimeIdentity::generate()?;
        let RuntimeConfig {
            allowed_extension_origins,
            diagnostics_trace,
            user_data_path,
        } = config;
        let installation_data_path = user_data_path;
        let profile_root = installation_data_path.clone();
        let (profiles, user_data_path) =
            tokio::task::spawn_blocking(move || ProfilesAuthority::open(profile_root))
                .await
                .map_err(RuntimeFault::new)?
                .map_err(RuntimeFault::new)?;
        let runtime_environments = RuntimeEnvironmentAuthority::open(&installation_data_path)
            .await
            .map_err(RuntimeFault::new)?;
        let keypair_migration_path = installation_data_path.clone();
        tokio::task::spawn_blocking(move || {
            migrate_keypair_to_installation(&keypair_migration_path)
        })
        .await
        .map_err(RuntimeFault::new)?
        .map_err(RuntimeFault::new)?;
        let updates = UpdateChecker::new().map_err(RuntimeFault::new)?;
        let home_path = crate::paths::resolve_local_home_path()
            .ok_or_else(|| RuntimeFault::new(KeybindingsError::HomeUnavailable))?;
        let local_downloads = LocalDownloadAuthority::new(&home_path);
        let installation_path = installation_data_path.clone();
        let installation_database =
            tokio::task::spawn_blocking(move || InstallationDatabase::open(&installation_path))
                .await
                .map_err(RuntimeFault::new)?
                .map_err(RuntimeFault::new)?;
        let ui_path = user_data_path.clone();
        let database_path = user_data_path.clone();
        let keypair_path = installation_data_path.clone();
        let agent_status_hooks = AgentStatusHooksAuthority::local(&user_data_path);
        let settings_path = user_data_path.clone();
        let (ui_result, database_result, keypair_result, settings_result) = tokio::join!(
            async move { UiAuthority::open(&ui_path).await.map_err(RuntimeFault::new) },
            async move {
                tokio::task::spawn_blocking(move || DaemonDatabase::open(&database_path))
                    .await
                    .map_err(RuntimeFault::new)?
                    .map_err(RuntimeFault::new)
            },
            async move {
                tokio::task::spawn_blocking(move || load_or_create_keypair(&keypair_path))
                    .await
                    .map_err(RuntimeFault::new)?
                    .map_err(RuntimeFault::new)
            },
            async move {
                SettingsAuthority::open(&settings_path, agent_status_hooks)
                    .await
                    .map_err(RuntimeFault::new)
            }
        );
        let (ui, ui_error) = result_parts(ui_result);
        let (database, database_error) = result_parts(database_result);
        let (mobile_keypair, keypair_error) = result_parts(keypair_result);
        let (settings, settings_error) = result_parts(settings_result);
        if let Some(error) = ui_error
            .or(database_error)
            .or(keypair_error)
            .or(settings_error)
        {
            cleanup_failed_startup(
                database,
                Some(installation_database),
                None,
                ui,
                settings,
                None,
                None,
            )
            .await;
            return Err(error);
        }
        let (Some(ui), Some(database), Some(mobile_keypair), Some(settings)) =
            (ui, database, mobile_keypair, settings)
        else {
            unreachable!("successful startup branches return their resources")
        };
        let ui_migration = async {
            let has_repositories = !database
                .project_catalog()
                .list()
                .await
                .map_err(RuntimeFault::new)?
                .is_empty();
            ui.migrate_startup(&settings.get(), has_repositories)
                .await
                .map_err(RuntimeFault::new)
        }
        .await;
        if let Err(error) = ui_migration {
            cleanup_failed_startup(
                Some(database),
                Some(installation_database),
                None,
                Some(ui),
                Some(settings),
                None,
                None,
            )
            .await;
            return Err(error);
        }
        if let Err(error) = runtime_environments
            .recover_settings_cleanup(&settings, &profiles)
            .await
        {
            cleanup_failed_startup(
                Some(database),
                Some(installation_database),
                None,
                Some(ui),
                Some(settings),
                None,
                None,
            )
            .await;
            return Err(RuntimeFault::new(error));
        }
        if let Err(error) = database
            .project_catalog()
            .import_independent(&user_data_path)
            .await
        {
            cleanup_failed_startup(
                Some(database),
                Some(installation_database),
                None,
                Some(ui),
                Some(settings),
                None,
                None,
            )
            .await;
            return Err(RuntimeFault::new(error));
        }
        let shell_state = match ShellStateAuthority::open(&user_data_path, ui.clone()).await {
            Ok(shell_state) => shell_state,
            Err(error) => {
                cleanup_failed_startup(
                    Some(database),
                    Some(installation_database),
                    None,
                    Some(ui),
                    Some(settings),
                    None,
                    None,
                )
                .await;
                return Err(RuntimeFault::new(error));
            }
        };
        let artifacts = database.artifact_store();
        let keybindings_definitions = manifest.keybindings;
        let legacy_keybindings = settings.legacy_keybindings();
        let telemetry_projects = database.project_catalog();
        let telemetry_preferences = settings.telemetry_preferences();
        let workspace_projects = database.project_catalog();
        let workspace_path = user_data_path.clone();
        let keybindings_path = user_data_path.clone();
        let telemetry_path = user_data_path.clone();
        let (artifacts_result, keybindings_result, telemetry_result, workspace_session_result) = tokio::join!(
            async { artifacts.initialize().await.map_err(RuntimeFault::new) },
            async move {
                KeybindingsAuthority::open(
                    &keybindings_path,
                    keybindings_definitions,
                    legacy_keybindings,
                )
                .await
                .map_err(RuntimeFault::new)
            },
            async move {
                TelemetryAuthority::open(&telemetry_path, telemetry_projects, telemetry_preferences)
                    .await
                    .map_err(RuntimeFault::new)
            },
            async move {
                WorkspaceSessionAuthority::open(&workspace_path, workspace_projects)
                    .await
                    .map_err(RuntimeFault::new)
            }
        );
        let (_, artifacts_error) = result_parts(artifacts_result);
        let (keybindings, keybindings_error) = result_parts(keybindings_result);
        let (telemetry, telemetry_error) = result_parts(telemetry_result);
        let (workspace_session, workspace_session_error) = result_parts(workspace_session_result);
        if let Some(error) = artifacts_error
            .or(keybindings_error)
            .or(telemetry_error)
            .or(workspace_session_error)
        {
            cleanup_failed_startup(
                Some(database),
                Some(installation_database),
                Some(artifacts),
                Some(ui),
                Some(settings),
                telemetry,
                workspace_session,
            )
            .await;
            return Err(error);
        }
        let (Some(keybindings), Some(telemetry), Some(workspace_session)) =
            (keybindings, telemetry, workspace_session)
        else {
            unreachable!("successful startup branches return their authorities")
        };
        let browser_replays = database.browser_replays();
        let dangerous_approval = DangerousApprovalAuthority::new(
            installation_database.dangerous_credentials(),
            allowed_extension_origins,
        );
        let reverse_protocol = ReverseProtocolRegistry::default();
        let shell_services = ShellServicesRegistry::new(reverse_protocol.clone());
        let codex_runtime = CodexRuntimeHome::new(user_data_path.clone(), settings.clone());
        codex_runtime.initialize().await;
        ui.connect_feature_interaction_telemetry(telemetry.feature_interactions());
        let clipboard_uploads = ClipboardImageUploads::new();
        let agent_trust = AgentTrustService::local(&user_data_path);
        // Why: Diagnostic logs are installation-scoped and must survive
        // profile switches so a collected bundle reads the same family the startup sink writes.
        let git_command_trace = GitCommandTrace::new(diagnostics_trace.clone());
        let diagnostics = MemoryDiagnostics::new(
            &installation_data_path,
            telemetry.clone(),
            diagnostics_trace.clone(),
        );
        let crash_reports = CrashReportAuthority::new(
            &installation_data_path,
            telemetry.clone(),
            diagnostics.clone(),
        );
        let feedback = FeedbackAuthority::new(telemetry.clone());
        let external_paths = ExternalPathAuthority::default();
        let host_registry = HostRegistry::new(database.host_store(), &installation_data_path);
        let ai_vault = AiVaultAuthority::new(
            host_registry.clone(),
            user_data_path.clone(),
            diagnostics_trace.clone(),
        );
        let host_progress = HostProgressAuthority::new();
        let client_events = ClientEventsAuthority::new();
        let project_groups =
            ProjectGroupAuthority::new(database.project_catalog(), host_registry.clone());
        let folder_workspaces = FolderWorkspaceAuthority::new(
            project_groups.clone(),
            host_registry.clone(),
            database.project_catalog(),
        );
        let mobile = RuntimeMobile::new(installation_database.mobile_devices(), mobile_keypair);
        let preflight = Preflight::new(host_registry.clone());
        let project_context =
            RemoteProjectResolver::new(database.project_catalog(), host_registry.clone());
        let worktrees = WorktreeCatalog::new(
            database.project_catalog(),
            host_registry.clone(),
            database.worktree_metadata(),
        );
        let computer = ComputerAuthority::new(installation_data_path.clone());
        let emulator = EmulatorAuthority::new(settings.clone(), worktrees.clone());
        let github = GitHubAuthority::new(
            database.project_catalog(),
            worktrees.clone(),
            host_registry.clone(),
        );
        let notebook = NotebookRunner::new(
            database.project_catalog(),
            worktrees.clone(),
            host_registry.clone(),
            external_paths.clone(),
        );
        let workspace_ports = WorkspacePortsRegistry::new(host_registry.clone());
        // Why: the label proxy owns a bound port and a shared route table, so it
        // lives for the daemon rather than per connection like `SessionServices`.
        let worktree_labels = WorktreeLabelAuthority::new(
            workspace_ports.clone(),
            database.project_catalog(),
            worktrees.clone(),
        );
        let terminal_sessions = TerminalSessionAuthority::new(
            &user_data_path,
            worktrees.clone(),
            host_registry.clone(),
            workspace_session.clone(),
            workspace_ports.clone(),
            shell_services.clone(),
            TerminalRuntimeContext {
                codex_runtime: codex_runtime.clone(),
                diagnostics: diagnostics_trace,
                settings: settings.clone(),
            },
        );
        let agent_sessions = AgentSessionAuthority::new(
            database.agent_sessions(),
            terminal_sessions.clone(),
            host_registry.clone(),
            worktrees.clone(),
        );
        let (agent_phase_publisher, agent_phase_receiver) = agent_phase_channel();
        let agent_status =
            AgentStatusAuthority::new(terminal_sessions.clone(), agent_phase_publisher);
        agent_status.configure_persistence(&user_data_path);
        terminal_sessions.set_agent_hook_environment(agent_status.hook_environment());
        let session_tabs = SessionTabsAuthority::new(
            workspace_session.clone(),
            terminal_sessions.clone(),
            worktrees.clone(),
            shell_services.clone(),
        );
        let updater = DaemonUpdater::new(
            identity.runtime_id().to_owned(),
            updates,
            &installation_data_path,
        );
        let app_control = AppControlAuthority::new(&installation_data_path);
        let status = RuntimeStatus::new(
            identity.clone(),
            &manifest.protocol,
            session_tabs.clone(),
            settings.clone(),
            updater.clone(),
        );
        let files = FilesAuthority::new(
            worktrees.clone(),
            host_registry.clone(),
            crate::workspace_paths::WorkspacePathAuthority::new(
                database.project_catalog(),
                worktrees.clone(),
                host_registry.clone(),
                external_paths.clone(),
            ),
            terminal_sessions.clone(),
            shell_services.clone(),
        );
        let project_host_setups = ProjectHostSetupAuthority::new(
            &user_data_path,
            database.project_catalog(),
            host_registry.clone(),
            host_progress.clone(),
            workspace_session.clone(),
        );
        if let Err(error) = project_host_setups.replay_cleanups().await {
            terminal_sessions.shutdown().await;
            workspace_ports.close();
            cleanup_failed_startup(
                Some(database),
                Some(installation_database),
                Some(artifacts),
                Some(ui),
                Some(settings),
                Some(telemetry),
                Some(workspace_session),
            )
            .await;
            return Err(RuntimeFault::new(error));
        }
        let shell_events = ShellEventAuthority::new();
        let repositories = RepositoryAuthority::new(
            database.project_catalog(),
            host_registry.clone(),
            project_host_setups.clone(),
            client_events.clone(),
        );
        let skills = SkillsAuthority::new(host_registry.clone(), repositories.clone());
        let workspace_journal = database.workspace_journal();
        let worktree_archives = WorktreeArchiveAuthority::new(
            database.worktree_archives(),
            client_events.clone(),
            host_registry.clone(),
            workspace_journal.clone(),
            database.project_catalog(),
            terminal_sessions.clone(),
            worktrees.clone(),
        );
        let ritual = RitualAuthority::new(
            workspace_journal.clone(),
            database.ritual_schedule(),
            Arc::new(DaemonRitualRunner::new(
                worktree_archives.clone(),
                host_registry.clone(),
                workspace_journal.clone(),
                database.project_catalog(),
                terminal_sessions.clone(),
                worktrees.clone(),
            )),
        );
        let workspace_space =
            WorkspaceSpaceAuthority::new(host_registry.clone(), worktrees.clone());
        let workspace_cleanup =
            WorkspaceCleanupAuthority::new(host_registry.clone(), ui.clone(), worktrees.clone());
        let provider_usage = ProviderUsageAuthority::new(user_data_path.clone())
            .with_worktree_sources(database.project_catalog(), database.worktree_metadata());
        let accounts = match AccountsAuthority::new(
            user_data_path.clone(),
            settings.clone(),
            codex_runtime,
            host_registry.clone(),
        ) {
            Ok(accounts) => accounts,
            Err(error) => {
                terminal_sessions.shutdown().await;
                workspace_ports.close();
                cleanup_failed_startup(
                    Some(database),
                    Some(installation_database),
                    Some(artifacts),
                    Some(ui),
                    Some(settings),
                    Some(telemetry),
                    Some(workspace_session),
                )
                .await;
                return Err(RuntimeFault::new(error));
            }
        };
        let stats = match StatsAuthority::open(user_data_path.clone(), provider_usage.clone()).await
        {
            Ok(stats) => stats.with_ai_vault(ai_vault.clone()),
            Err(error) => {
                terminal_sessions.shutdown().await;
                workspace_ports.close();
                cleanup_failed_startup(
                    Some(database),
                    Some(installation_database),
                    Some(artifacts),
                    Some(ui),
                    Some(settings),
                    Some(telemetry),
                    Some(workspace_session),
                )
                .await;
                return Err(RuntimeFault::new(error));
            }
        };
        terminal_sessions.configure_stats(stats.clone());
        github.configure_stats(stats.clone());
        let star_nag = StarNagAuthority::new(
            ui.clone(),
            github.clone(),
            telemetry.clone(),
            stats.clone(),
            shell_events.clone(),
        );
        star_nag.start().await;
        let rate_limit_resume =
            match RateLimitResumeAuthority::open(&user_data_path, shell_services.clone()).await {
                Ok(rate_limit_resume) => rate_limit_resume,
                Err(error) => {
                    terminal_sessions.shutdown().await;
                    workspace_ports.close();
                    cleanup_failed_startup(
                        Some(database),
                        Some(installation_database),
                        Some(artifacts),
                        Some(ui),
                        Some(settings),
                        Some(telemetry),
                        Some(workspace_session),
                    )
                    .await;
                    return Err(RuntimeFault::new(error));
                }
            };
        let orchestration_database = match OrchestrationDatabase::open(&user_data_path) {
            Ok(orchestration_database) => orchestration_database,
            Err(error) => {
                terminal_sessions.shutdown().await;
                workspace_ports.close();
                cleanup_failed_startup(
                    Some(database),
                    Some(installation_database),
                    Some(artifacts),
                    Some(ui),
                    Some(settings),
                    Some(telemetry),
                    Some(workspace_session),
                )
                .await;
                return Err(RuntimeFault::new(error));
            }
        };
        let orchestration = OrchestrationAuthority::new(
            orchestration_database.store(),
            terminal_sessions.clone(),
            worktrees.clone(),
            identity.runtime_id().to_owned(),
        );
        let agent_phase_worker = start_agent_phase_worker(
            agent_phase_receiver,
            installation_database.notifications(),
            settings.clone(),
            shell_services.clone(),
            database.workspace_journal(),
        );
        let ritual_scheduler = RitualScheduler::start(ritual.clone());
        let rate_limit_resume_worker = rate_limit_resume.start_scheduler();
        Ok((
            Self {
                accounts,
                ai_vault,
                agent_trust,
                agent_sessions,
                agent_status,
                agent_phase_worker,
                app_control,
                artifacts,
                browser_replays,
                shell_services,
                clipboard_uploads,
                computer,
                client_events,
                crash_reports,
                dangerous_approval,
                ritual,
                ritual_scheduler,
                runtime_environments,
                database,
                installation_database,
                diagnostics,
                emulator,
                external_paths,
                feedback,
                files,
                folder_workspaces,
                github,
                git_command_trace,
                host_registry,
                host_progress,
                identity,
                keybindings,
                local_downloads,
                mobile,
                notebook,
                orchestration,
                orchestration_database,
                preflight,
                profiles,
                provider_usage,
                rate_limit_resume,
                rate_limit_resume_worker,
                reverse_protocol,
                project_groups,
                project_host_setups,
                repositories,
                project_context,
                session_tabs,
                settings,
                shell_events,
                worktree_labels,
                shell_state,
                skills,
                sessions: RuntimeSessions::new(),
                status,
                star_nag,
                stats,
                telemetry,
                terminal_sessions,
                updater,
                ui,
                worktrees,
                workspace_ports,
                workspace_journal,
                workspace_session,
                worktree_archives,
                workspace_space,
                workspace_cleanup,
            },
            RuntimeReady,
        ))
    }

    pub fn identity(&self) -> &RuntimeIdentity {
        &self.identity
    }

    pub fn reverse_protocol(&self) -> ReverseProtocolRegistry {
        self.reverse_protocol.clone()
    }

    pub(crate) fn artifact_store(&self) -> ArtifactStore {
        self.artifacts.clone()
    }

    pub(crate) fn mobile_server_config(&self, port: u16) -> MobileServerConfig {
        self.mobile.server_config(
            port,
            self.identity.runtime_id().to_owned(),
            self.runtime_environments.clone(),
        )
    }

    pub(crate) fn runtime_environment_authority(&self) -> RuntimeEnvironmentAuthority {
        self.runtime_environments.clone()
    }

    pub(crate) fn activate_mobile_endpoint(&self, endpoint: String) {
        self.mobile.activate_endpoint(endpoint);
    }

    pub(crate) async fn create_mobile_pairing_offer(
        &self,
        endpoint: &str,
        address: &str,
        device_name: String,
    ) -> Result<MobilePairingOffer, MobilePairingOfferError> {
        self.mobile
            .create_pairing_offer(endpoint, address, device_name)
            .await
    }

    pub fn attach(&self, channel: AuthenticatedChannel) -> Result<SessionHandle, RuntimeFault> {
        let Some(session_permit) = self.sessions.try_reserve() else {
            channel.close(1013, "Too many active runtime sessions");
            return self.sessions.completed().map_err(RuntimeFault::new);
        };
        let services = SessionServices::new(SessionServiceInputs {
            accounts: self.accounts.clone(),
            ai_vault: self.ai_vault.clone(),
            agent_trust: self.agent_trust.clone(),
            agent_sessions: self.agent_sessions.clone(),
            agent_status: self.agent_status.clone(),
            app_control: self.app_control.clone(),
            artifacts: self.artifacts.clone(),
            browser_replays: self.browser_replays.clone(),
            shell_services: self.shell_services.clone(),
            clipboard_uploads: self.clipboard_uploads.clone(),
            computer: self.computer.clone(),
            client_events: self.client_events.clone(),
            crash_reports: self.crash_reports.clone(),
            dangerous_approval: self.dangerous_approval.clone(),
            ritual: self.ritual.clone(),
            runtime_environments: self.runtime_environments.clone(),
            diagnostics: self.diagnostics.clone(),
            emulator: self.emulator.clone(),
            external_paths: self.external_paths.clone(),
            feedback: self.feedback.clone(),
            files: self.files.clone(),
            folder_workspaces: self.folder_workspaces.clone(),
            github: self.github.clone(),

            star_nag: self.star_nag.clone(),
            worktree_labels: self.worktree_labels.clone(),
            git_command_trace: self.git_command_trace.clone(),
            host_registry: self.host_registry.clone(),
            host_progress: self.host_progress.clone(),
            keybindings: self.keybindings.clone(),
            local_downloads: self.local_downloads.clone(),
            journal: self.workspace_journal.clone(),
            mobile_pairing: self.mobile.pairing(),
            notebook: self.notebook.clone(),
            notifications: self.installation_database.notifications(),
            orchestration: self.orchestration.clone(),
            preflight: self.preflight.clone(),
            profiles: self.profiles.clone(),
            provider_usage: self.provider_usage.clone(),
            rate_limit_resume: self.rate_limit_resume.clone(),
            reverse_protocol: self.reverse_protocol.clone(),
            project_groups: self.project_groups.clone(),
            project_host_setups: self.project_host_setups.clone(),
            repositories: self.repositories.clone(),
            project_catalog: self.database.project_catalog(),
            project_context: self.project_context.clone(),
            session_tabs: self.session_tabs.clone(),
            settings: self.settings.clone(),
            shell_events: self.shell_events.clone(),
            shell_state: self.shell_state.clone(),
            skills: self.skills.clone(),
            status: self.status.clone(),
            stats: self.stats.clone(),
            telemetry: self.telemetry.clone(),
            terminal_sessions: self.terminal_sessions.clone(),
            updater: self.updater.clone(),
            ui: self.ui.clone(),
            visual_regressions: self.database.visual_regressions(),
            workspace_ports: self.workspace_ports.clone(),
            workspace_session: self.workspace_session.clone(),
            worktree_archives: self.worktree_archives.clone(),
            workspace_space: self.workspace_space.clone(),
            workspace_cleanup: self.workspace_cleanup.clone(),
            worktrees: self.worktrees.clone(),
        });
        self.sessions
            .spawn(session_permit, crate::rpc::run_session(channel, services))
            .map_err(RuntimeFault::new)
    }

    pub fn attach_mobile(
        &self,
        channel: crate::mobile::MobileAuthenticatedChannel,
    ) -> Result<SessionHandle, RuntimeFault> {
        self.attach(AuthenticatedChannel::mobile(channel))
    }

    pub(crate) fn attach_runtime(
        &self,
        channel: crate::runtime_environment::server::RuntimeAuthenticatedChannel,
    ) -> Result<SessionHandle, RuntimeFault> {
        self.attach(AuthenticatedChannel::runtime(channel))
    }

    pub async fn shutdown(self, _reason: ShutdownReason) -> Result<ShutdownReport, RuntimeFault> {
        let Self {
            accounts,
            ai_vault: _,
            agent_trust,
            agent_sessions,
            agent_status,
            agent_phase_worker,
            app_control: _,
            artifacts,
            browser_replays,
            shell_services,
            clipboard_uploads,
            computer,
            client_events,
            crash_reports: _,
            dangerous_approval,
            ritual,
            ritual_scheduler,
            runtime_environments,
            database,
            installation_database,
            diagnostics,
            emulator,
            external_paths,
            feedback: _,
            files,
            folder_workspaces,
            github,
            git_command_trace: _,
            host_registry,
            host_progress,
            identity,
            keybindings,
            local_downloads: _,
            mobile,
            notebook,
            orchestration,
            orchestration_database,
            preflight,
            profiles: _,
            provider_usage,
            rate_limit_resume,
            rate_limit_resume_worker,
            reverse_protocol,
            project_groups,
            project_host_setups,
            repositories,
            project_context,
            session_tabs,
            settings,
            shell_events,
            worktree_labels: _,
            shell_state: _,
            skills,
            sessions,
            status,
            star_nag: _,
            stats,
            telemetry,
            terminal_sessions,
            updater,
            ui,
            worktrees,
            workspace_ports,
            workspace_journal,
            workspace_session,
            worktree_archives,
            workspace_space,
            workspace_cleanup,
        } = self;
        project_host_setups.abort_clone();
        rate_limit_resume_worker.shutdown().await;
        ritual_scheduler.shutdown().await;
        sessions.shutdown().await;
        computer.shutdown().await;
        emulator.shutdown_all().await;
        terminal_sessions.shutdown().await;
        accounts.codex_runtime().sync_before_shutdown().await;
        repositories.shutdown().await;
        project_host_setups.shutdown().await;
        agent_phase_worker.shutdown().await;
        shell_events.close();
        let (
            ui_flush,
            telemetry_shutdown,
            settings_flush,
            workspace_session_flush,
            agent_status_flush,
        ) = tokio::join!(
            ui.flush(),
            telemetry.shutdown(),
            settings.flush(),
            workspace_session.flush(),
            agent_status.flush()
        );
        // Why: the agent status file is recoverable state, so a write failure is
        // reported with the revision that stayed in memory rather than aborting
        // a shutdown that has already stopped every other authority.
        report_agent_status_flush(agent_status_flush);
        if let Err(error) = stats.flush().await {
            eprintln!("[daemon] Stats shutdown flush failed: {error}");
        }
        drop(artifacts);
        drop(agent_trust);
        drop(agent_sessions);
        drop(agent_status);
        drop(browser_replays);
        drop(shell_services);
        drop(clipboard_uploads);
        drop(client_events);
        drop(dangerous_approval);
        drop(ritual);
        drop(runtime_environments);
        drop(diagnostics);
        drop(external_paths);
        drop(files);
        drop(folder_workspaces);
        drop(github);
        drop(host_registry);
        drop(host_progress);
        drop(identity);
        drop(keybindings);
        drop(mobile);
        drop(notebook);
        drop(orchestration);
        drop(preflight);
        drop(accounts);
        drop(provider_usage);
        drop(rate_limit_resume);
        drop(reverse_protocol);
        drop(project_groups);
        drop(project_host_setups);
        drop(repositories);
        drop(project_context);
        drop(session_tabs);
        drop(terminal_sessions);
        drop(settings);
        drop(shell_events);
        drop(skills);
        drop(status);
        drop(stats);
        drop(updater);
        drop(ui);
        drop(worktrees);
        drop(worktree_archives);
        drop(workspace_space);
        drop(workspace_cleanup);
        workspace_ports.close();
        drop(workspace_ports);
        drop(workspace_journal);
        drop(workspace_session);
        tokio::task::spawn_blocking(move || installation_database.close())
            .await
            .map_err(RuntimeFault::new)?
            .map_err(RuntimeFault::new)?;
        tokio::task::spawn_blocking(move || orchestration_database.close())
            .await
            .map_err(RuntimeFault::new)?
            .map_err(RuntimeFault::new)?;
        tokio::task::spawn_blocking(move || database.close())
            .await
            .map_err(RuntimeFault::new)?
            .map_err(RuntimeFault::new)?;
        ui_flush.map_err(RuntimeFault::new)?;
        telemetry_shutdown.map_err(RuntimeFault::new)?;
        settings_flush.map_err(RuntimeFault::new)?;
        workspace_session_flush.map_err(RuntimeFault::new)?;
        Ok(ShutdownReport)
    }
}

/// Why: an unpersisted agent status revision must be visible in the log, but it
/// is recoverable on the next launch and must not turn an otherwise clean
/// shutdown into a fault.
fn report_agent_status_flush(result: Result<(), AgentStatusFlushError>) {
    if let Err(error) = result {
        eprintln!("[daemon] Agent status shutdown flush failed: {error}");
    }
}

fn result_parts<T>(result: Result<T, RuntimeFault>) -> (Option<T>, Option<RuntimeFault>) {
    match result {
        Ok(value) => (Some(value), None),
        Err(error) => (None, Some(error)),
    }
}

async fn cleanup_failed_startup(
    database: Option<DaemonDatabase>,
    installation_database: Option<InstallationDatabase>,
    artifacts: Option<ArtifactStore>,
    ui: Option<UiAuthority>,
    settings: Option<SettingsAuthority>,
    telemetry: Option<TelemetryAuthority>,
    workspace_session: Option<WorkspaceSessionAuthority>,
) {
    if let Some(ui) = &ui
        && let Err(error) = ui.flush().await
    {
        eprintln!("[daemon] UI startup cleanup failed: {error}");
    }
    if let Some(settings) = &settings
        && let Err(error) = settings.flush().await
    {
        eprintln!("[daemon] Settings startup cleanup failed: {error}");
    }
    if let Some(workspace_session) = &workspace_session
        && let Err(error) = workspace_session.flush().await
    {
        eprintln!("[daemon] Workspace session startup cleanup failed: {error}");
    }
    if let Some(telemetry) = &telemetry
        && let Err(error) = telemetry.shutdown().await
    {
        eprintln!("[daemon] Telemetry startup cleanup failed: {error}");
    }
    drop(workspace_session);
    drop(telemetry);
    drop(settings);
    drop(ui);
    drop(artifacts);
    if let Some(database) = database {
        match tokio::task::spawn_blocking(move || database.close()).await {
            Ok(Ok(())) => {}
            Ok(Err(error)) => eprintln!("[daemon] Database startup cleanup failed: {error}"),
            Err(error) => eprintln!("[daemon] Database cleanup worker failed: {error}"),
        }
    }
    if let Some(database) = installation_database {
        match tokio::task::spawn_blocking(move || database.close()).await {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                eprintln!("[daemon] Installation database startup cleanup failed: {error}")
            }
            Err(error) => {
                eprintln!("[daemon] Installation database cleanup worker failed: {error}")
            }
        }
    }
}

impl SessionHandle {
    pub fn abort(&self) {
        self.task.abort();
    }

    pub async fn wait(self) -> Result<(), RuntimeFault> {
        self.task
            .await
            .map_err(RuntimeFault::new)?
            .map_err(RuntimeFault::new)
    }
}

impl RuntimeFault {
    fn new(source: impl Error + Send + Sync + 'static) -> Self {
        Self {
            source: Box::new(source),
        }
    }
}

impl fmt::Display for RuntimeFault {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "runtime failed: {}", self.source)
    }
}

impl Error for RuntimeFault {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(self.source.as_ref())
    }
}
