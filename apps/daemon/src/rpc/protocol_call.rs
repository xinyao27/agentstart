mod agents;
mod browser;
mod computer;
mod files;
mod git;
mod github;
mod method;
mod orchestration;
mod preferences;
mod projects;
mod runtime;
mod support;
mod terminal;
mod workspaces;

use std::future::pending;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use agentstart_protocol::method_metadata::{MethodId, MethodMetadata, method_metadata};
use agentstart_protocol::protocol::v1::{
    AccessScope, AccessTier, CallerClass as ProtocolCallerClass, PeerKind, RuntimeRoutePolicy,
    Status, StatusCode, StreamReconnectPolicy,
};
use tokio::sync::{Notify, OwnedSemaphorePermit, Semaphore, mpsc};
use tokio::time::{Duration, Instant, sleep_until};

use crate::ai_vault::AiVaultAuthority;
use crate::mobile::MobileAuthorization;
use crate::protocol::CallerClass;
use crate::repository_refs::RepositoryRefs;
use crate::runtime_environment::RuntimeAuthorization;

use super::accounts::{AccountsRpc, protocol as accounts_protocol};
use super::agent_session::AgentSessionRpc;
use super::agent_status::{AgentStatusAuthority, protocol as agent_status_protocol};
use super::agent_trust::AgentTrustRpc;
use super::ai_vault::protocol as ai_vault_protocol;
use super::app_control::{AppControlRpc, protocol as app_control_protocol};
use super::artifact::{ArtifactRpc, protocol as artifact_protocol};
use super::browser_command::{BrowserCommandRpc, protocol as browser_command_protocol};
use super::browser_protocol::{self, BrowserProtocolRpc};
use super::browser_replay::{BrowserReplayRpc, protocol as browser_replay_protocol};
use super::browser_writeback::{BrowserWritebackRpc, protocol as browser_writeback_protocol};
use super::cli::{CliRpc, protocol as cli_protocol};
use super::client_events::{ClientEventsRpc, protocol as client_events_protocol};
use super::clipboard::{ClipboardRpc, protocol as clipboard_protocol};
use super::computer::{ComputerRpc, protocol as computer_protocol};
use super::crash_reports::CrashReportsRpc;
use super::dangerous_approval::{DangerousApprovalRpc, protocol as dangerous_approval_protocol};
use super::developer_permissions::{
    DeveloperPermissionsRpc, protocol as developer_permissions_protocol,
};
use super::diagnostics::DiagnosticsRpc;
use super::driver_events::protocol as driver_events_protocol;
use super::emulator::{EmulatorRpc, protocol as emulator_protocol};
use super::external_editor::{ExternalEditorRpc, protocol as external_editor_protocol};
use super::feedback::{FeedbackRpc, protocol as feedback_protocol};
use super::files::{FilesRpc, protocol as files_protocol};
use super::folder_workspace::{FolderWorkspaceRpc, protocol as folder_workspace_protocol};
use super::git::GitRpc;
use super::git::protocol::{
    branch as git_branch_protocol, generation as git_generation_protocol,
    history as git_history_protocol, remote as git_remote_protocol,
    rewrite as git_rewrite_protocol, staging as git_staging_protocol,
    status as git_status_protocol,
};
use super::github::service as github_service;
use super::github::{GitHubRpc, protocol as github_protocol};
use super::host_progress::{HostProgressRpc, protocol as host_progress_protocol};
use super::host_registry::HostRegistryRpc;
use super::keybindings::{KeybindingsRpc, protocol as keybindings_protocol};
use super::layout::{LayoutRpc, protocol as layout_protocol};
use super::local_download::LocalDownloadRpc;
use super::markdown::{MarkdownRpc, protocol as markdown_protocol};
use super::mobile::{MobileRpc, protocol as mobile_protocol};
use super::notebook::{NotebookRpc, protocol as notebook_protocol};
use super::notifications::{NotificationsRpc, protocol as notification_protocol};
use super::orchestration::OrchestrationRpc;
use super::preflight::{PreflightRpc, protocol as preflight_protocol};
use super::profiles::{ProfilesRpc, protocol as profiles_protocol};
use super::project::{ProjectRpc, protocol as project_protocol};
use super::project_context::{ProjectContextRpc, protocol as project_context_protocol};
use super::project_group::{ProjectGroupRpc, protocol as project_group_protocol};
use super::project_host_setup::{ProjectHostSetupRpc, protocol as project_host_setup_protocol};
use super::provider_usage::ProviderUsageRpc;
use super::rate_limit_resume::RateLimitResumeRpc;
use super::repo::{RepoRpc, protocol as repo_protocol};
use super::repo::{protocol_mutations as repo_mutations, protocol_presets as repo_presets};
use super::repo_host::{RepoHostRpc, protocol as repo_host_protocol};
use super::repository_refs::protocol as repository_refs_protocol;
use super::ritual::{RitualRpc, protocol as ritual_protocol};
use super::runtime_environment::RuntimeEnvironmentRpc;
use super::session_tabs::{SessionTabsRpc, protocol as session_tabs_protocol};
use super::settings::{SettingsRpc, protocol as settings_protocol};
use super::shell_events::{ShellEventsRpc, protocol as shell_events_protocol};
use super::shell_files::{ShellFilesRpc, protocol as shell_files_protocol};
use super::shell_platform::{ShellPlatformRpc, protocol as shell_platform_protocol};
use super::shell_runtime::{ShellRuntimeRpc, protocol as shell_runtime_protocol};
use super::shell_state::{ShellStateRpc, protocol as shell_state_protocol};
use super::shell_telemetry::{ShellTelemetryRpc, protocol as shell_telemetry_protocol};
use super::skills::{SkillsRpc, protocol as skills_protocol};
use super::star_nag::{StarNagRpc, protocol as star_nag_protocol};
use super::stats::StatsRpc;
use super::status::StatusRpc;
use super::terminal::TerminalRpc;
use super::ui::{UiRpc, protocol as ui_protocol};
use super::updater::{UpdaterRpc, protocol as updater_protocol};
use super::visual_regression::{VisualRegressionRpc, protocol as visual_regression_protocol};
use super::windows_firewall::{WindowsFirewallRpc, protocol as windows_firewall_protocol};
use super::workspace_cleanup::{WorkspaceCleanupRpc, protocol as workspace_cleanup_protocol};
use super::workspace_events::{WorkspaceEventsRpc, protocol as workspace_events_protocol};
use super::workspace_ports::{WorkspacePortsRpc, protocol as workspace_ports_protocol};
use super::workspace_session::{WorkspaceSessionRpc, protocol as workspace_session_protocol};
use super::workspace_space::{WorkspaceSpaceRpc, protocol as workspace_space_protocol};
use super::worktree::{WorktreeRpc, protocol as worktree_protocol};
use super::worktree_labels::{WorktreeLabelsRpc, protocol as worktree_labels_protocol};

pub(super) const MAX_CONNECTION_BUFFERED_RESPONSE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Clone)]
pub(super) struct ProtocolAccessContext {
    authorization: Option<MobileAuthorization>,
    principal: CallerClass,
    principal_id: String,
    runtime_authorization: Option<RuntimeAuthorization>,
}

pub(super) struct ProtocolCall {
    pub(super) duplex_input: Option<mpsc::Receiver<Vec<u8>>>,
    pub(super) call_id: u64,
    pub(super) cancellation: ProtocolCancellation,
    pub(super) deadline: Option<Instant>,
    pub(super) destination: Option<String>,
    pub(super) payload: Vec<u8>,
    pub(super) peer_kind: PeerKind,
    pub(super) procedure: String,
}

pub(super) struct ProtocolCallContext {
    duplex_input: tokio::sync::Mutex<Option<mpsc::Receiver<Vec<u8>>>>,
    access: ProtocolAccessContext,
    call_id: u64,
    cancellation: ProtocolCancellation,
    deadline: Option<Instant>,
    events: mpsc::Sender<ProtocolCompletion>,
    peer_kind: PeerKind,
    response_budget: ProtocolResponseBudget,
}

pub(super) struct ProtocolCompletion {
    pub(super) call_id: u64,
    pub(super) outcome: ProtocolOutcome,
}

pub(super) struct ProtocolHandlerResponse {
    delivery: Option<ProtocolDeliveryGuard>,
    payload: Vec<u8>,
}

pub(super) struct ProtocolPayload {
    pub(super) data: Vec<u8>,
    _budget: Option<OwnedSemaphorePermit>,
    delivery: Option<ProtocolDeliveryGuard>,
}

pub(super) struct ProtocolDeliveryGuard {
    completion: Option<Box<dyn FnOnce(ProtocolDeliveryOutcome) + Send>>,
}

pub(super) enum ProtocolDeliveryOutcome {
    Confirmed,
    RolledBack,
}

#[derive(Clone)]
pub(super) struct ProtocolRouter {
    accounts: AccountsRpc,
    app_control: AppControlRpc,
    browser: BrowserProtocolRpc,
    agent_status: AgentStatusAuthority,
    ai_vault: AiVaultAuthority,
    cli: CliRpc,
    connection_id: String,
    agent_session: AgentSessionRpc,
    agent_trust: AgentTrustRpc,
    computer: ComputerRpc,
    markdown: MarkdownRpc,
    preflight: PreflightRpc,
    ui: UiRpc,

    files: FilesRpc,
    browser_command: BrowserCommandRpc,
    browser_replay: BrowserReplayRpc,
    browser_writeback: BrowserWritebackRpc,
    emulator: EmulatorRpc,
    shell_files: ShellFilesRpc,
    git: GitRpc,
    orchestration: OrchestrationRpc,
    provider_usage: ProviderUsageRpc,
    rate_limit_resume: RateLimitResumeRpc,
    crash_reports: CrashReportsRpc,
    feedback: FeedbackRpc,
    layout: LayoutRpc,
    star_nag: StarNagRpc,
    worktree_labels: WorktreeLabelsRpc,
    diagnostics: DiagnosticsRpc,
    github: GitHubRpc,
    host_registry: HostRegistryRpc,
    local_downloads: LocalDownloadRpc,
    mobile: MobileRpc,
    notifications: NotificationsRpc,
    repo: RepoRpc,
    repository_refs: RepositoryRefs,
    session_tabs: SessionTabsRpc,
    project_group: ProjectGroupRpc,
    project_host_setup: ProjectHostSetupRpc,
    shell_platform: ShellPlatformRpc,
    skills: SkillsRpc,
    settings: SettingsRpc,
    repo_host: RepoHostRpc,
    runtime_environments: RuntimeEnvironmentRpc,
    stats: StatsRpc,
    status: StatusRpc,
    terminal: TerminalRpc,
    updater: UpdaterRpc,
    workspace_events: WorkspaceEventsRpc,
    worktree: WorktreeRpc,
    windows_firewall: WindowsFirewallRpc,
    developer_permissions: DeveloperPermissionsRpc,
    keybindings: KeybindingsRpc,
    artifact: ArtifactRpc,
    dangerous_approval: DangerousApprovalRpc,
    clipboard: ClipboardRpc,
    folder_workspace: FolderWorkspaceRpc,
    profiles: ProfilesRpc,
    workspace_cleanup: WorkspaceCleanupRpc,
    workspace_session: WorkspaceSessionRpc,
    shell_telemetry: ShellTelemetryRpc,
    ritual: RitualRpc,
    workspace_ports: WorkspacePortsRpc,
    shell_state: ShellStateRpc,
    project: ProjectRpc,
    visual_regression: VisualRegressionRpc,
    workspace_space: WorkspaceSpaceRpc,
    client_events: ClientEventsRpc,
    project_context: ProjectContextRpc,
    notebook: NotebookRpc,
    external_editor: ExternalEditorRpc,
    shell_events: ShellEventsRpc,
    shell_runtime: ShellRuntimeRpc,
    shell_host: crate::shell_services::ShellServicesRegistry,
    host_progress: HostProgressRpc,
}

pub(super) struct ProtocolRouterInputs {
    pub(super) accounts: AccountsRpc,
    pub(super) app_control: AppControlRpc,
    pub(super) browser: BrowserProtocolRpc,
    pub(super) agent_status: AgentStatusAuthority,
    pub(super) ai_vault: AiVaultAuthority,
    pub(super) cli: CliRpc,
    pub(super) connection_id: String,
    pub(super) agent_session: AgentSessionRpc,
    pub(super) agent_trust: AgentTrustRpc,
    pub(super) computer: ComputerRpc,
    pub(super) markdown: MarkdownRpc,
    pub(super) preflight: PreflightRpc,
    pub(super) ui: UiRpc,

    pub(super) files: FilesRpc,
    pub(super) browser_command: BrowserCommandRpc,
    pub(super) browser_replay: BrowserReplayRpc,
    pub(super) browser_writeback: BrowserWritebackRpc,
    pub(super) emulator: EmulatorRpc,
    pub(super) shell_files: ShellFilesRpc,
    pub(super) git: GitRpc,
    pub(super) orchestration: OrchestrationRpc,
    pub(super) provider_usage: ProviderUsageRpc,
    pub(super) rate_limit_resume: RateLimitResumeRpc,
    pub(super) crash_reports: CrashReportsRpc,
    pub(super) feedback: FeedbackRpc,
    pub(super) layout: LayoutRpc,
    pub(super) star_nag: StarNagRpc,
    pub(super) worktree_labels: WorktreeLabelsRpc,
    pub(super) diagnostics: DiagnosticsRpc,
    pub(super) github: GitHubRpc,
    pub(super) host_registry: HostRegistryRpc,
    pub(super) local_downloads: LocalDownloadRpc,
    pub(super) mobile: MobileRpc,
    pub(super) notifications: NotificationsRpc,
    pub(super) repo: RepoRpc,
    pub(super) repository_refs: RepositoryRefs,
    pub(super) session_tabs: SessionTabsRpc,
    pub(super) project_group: ProjectGroupRpc,
    pub(super) shell_platform: ShellPlatformRpc,
    pub(super) skills: SkillsRpc,
    pub(super) settings: SettingsRpc,
    pub(super) repo_host: RepoHostRpc,
    pub(super) runtime_environments: RuntimeEnvironmentRpc,
    pub(super) stats: StatsRpc,
    pub(super) status: StatusRpc,
    pub(super) terminal: TerminalRpc,
    pub(super) updater: UpdaterRpc,
    pub(super) workspace_events: WorkspaceEventsRpc,
    pub(super) worktree: WorktreeRpc,
    pub(super) windows_firewall: WindowsFirewallRpc,
    pub(super) developer_permissions: DeveloperPermissionsRpc,
    pub(super) keybindings: KeybindingsRpc,
    pub(super) artifact: ArtifactRpc,
    pub(super) dangerous_approval: DangerousApprovalRpc,
    pub(super) project_host_setup: ProjectHostSetupRpc,
    pub(super) clipboard: ClipboardRpc,
    pub(super) folder_workspace: FolderWorkspaceRpc,
    pub(super) profiles: ProfilesRpc,
    pub(super) workspace_cleanup: WorkspaceCleanupRpc,
    pub(super) workspace_session: WorkspaceSessionRpc,
    pub(super) shell_telemetry: ShellTelemetryRpc,
    pub(super) ritual: RitualRpc,
    pub(super) workspace_ports: WorkspacePortsRpc,
    pub(super) shell_state: ShellStateRpc,
    pub(super) project: ProjectRpc,
    pub(super) visual_regression: VisualRegressionRpc,
    pub(super) workspace_space: WorkspaceSpaceRpc,
    pub(super) client_events: ClientEventsRpc,
    pub(super) project_context: ProjectContextRpc,
    pub(super) notebook: NotebookRpc,
    pub(super) external_editor: ExternalEditorRpc,
    pub(super) shell_events: ShellEventsRpc,
    pub(super) shell_runtime: ShellRuntimeRpc,
    pub(super) shell_host: crate::shell_services::ShellServicesRegistry,
    pub(super) host_progress: HostProgressRpc,
}

pub(super) enum ProtocolOutcome {
    InputConsumed(u64),
    Abandoned,
    Complete(ProtocolPayload),
    Failed(Status),
    StreamComplete,
    StreamPayload(ProtocolPayload),
}

enum ProtocolHandlerOutcome {
    Abandoned,
    Complete(ProtocolHandlerResponse),
    Failed(Status),
    StreamComplete,
}

#[derive(Clone)]
pub(super) struct ProtocolCancellation {
    inner: Arc<ProtocolCancellationState>,
}

struct ProtocolCancellationState {
    is_cancelled: AtomicBool,
    notify: Notify,
}

#[derive(Clone)]
pub(super) struct ProtocolResponseBudget {
    permits: Arc<Semaphore>,
}

struct ProtocolRequest<'a> {
    destination: Option<&'a str>,
    payload: &'a [u8],
    procedure: &'a str,
}

trait ProtocolHandler {
    async fn handle(
        &self,
        request: ProtocolRequest<'_>,
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome;
}

impl ProtocolAccessContext {
    pub(super) fn new(
        authorization: Option<MobileAuthorization>,
        principal: CallerClass,
        principal_id: String,
        runtime_authorization: Option<RuntimeAuthorization>,
    ) -> Self {
        Self {
            authorization,
            principal,
            principal_id,
            runtime_authorization,
        }
    }

    fn authorize(&self, method: &MethodMetadata, peer_kind: PeerKind) -> Result<(), Status> {
        if self.principal_id().is_empty() {
            return Err(status(
                StatusCode::Unauthenticated,
                "Authenticated principal has no identity",
            ));
        }
        let scope = AccessScope::try_from(method.scope).map_err(|_| {
            status(
                StatusCode::Internal,
                "Method access policy has an unknown resource scope",
            )
        })?;
        let tier = AccessTier::try_from(method.tier).map_err(|_| {
            status(
                StatusCode::Internal,
                "Method access policy has an unknown permission tier",
            )
        })?;
        if !matches!(
            scope,
            AccessScope::Worktree | AccessScope::Project | AccessScope::Host
        ) || !matches!(
            tier,
            AccessTier::Read | AccessTier::Control | AccessTier::Host
        ) {
            return Err(status(
                StatusCode::Internal,
                "Method access policy is not supported by this daemon",
            ));
        }
        if !method
            .callers
            .contains(&(protocol_principal(self.principal()) as i32))
        {
            return Err(status(
                StatusCode::PermissionDenied,
                "Authenticated principal cannot call this method",
            ));
        }
        if !method.peer_kinds.is_empty() && !method.peer_kinds.contains(&(peer_kind as i32)) {
            return Err(status(
                StatusCode::PermissionDenied,
                "Transport peer cannot call this method",
            ));
        }
        match self.principal() {
            CallerClass::Local => Ok(()),
            CallerClass::Mobile => {
                let Some(authorization) = self.authorization.as_ref() else {
                    return Err(status(
                        StatusCode::Unauthenticated,
                        "Mobile authorization is unavailable",
                    ));
                };
                if authorization.device_id() != self.principal_id() {
                    return Err(status(
                        StatusCode::Unauthenticated,
                        "Mobile principal does not match its authorization",
                    ));
                }
                if authorization.is_authorized() {
                    Ok(())
                } else {
                    Err(status(
                        StatusCode::Unauthenticated,
                        "Mobile authorization has been revoked",
                    ))
                }
            }
            CallerClass::Runtime => {
                let Some(authorization) = self.runtime_authorization.as_ref() else {
                    return Err(status(
                        StatusCode::Unauthenticated,
                        "Runtime authorization is unavailable",
                    ));
                };
                if authorization.peer_id() != self.principal_id() {
                    return Err(status(
                        StatusCode::Unauthenticated,
                        "Runtime principal does not match its authorization",
                    ));
                }
                if authorization.is_authorized() {
                    Ok(())
                } else {
                    Err(status(
                        StatusCode::Unauthenticated,
                        "Runtime authorization has been revoked",
                    ))
                }
            }
        }
    }

    pub(super) fn principal(&self) -> CallerClass {
        self.principal
    }

    pub(super) fn principal_id(&self) -> &str {
        &self.principal_id
    }
}

fn protocol_principal(principal: CallerClass) -> ProtocolCallerClass {
    match principal {
        CallerClass::Local => ProtocolCallerClass::Local,
        CallerClass::Mobile => ProtocolCallerClass::Mobile,
        CallerClass::Runtime => ProtocolCallerClass::Runtime,
    }
}

impl ProtocolCallContext {
    pub(super) async fn receive_duplex_payload(&self) -> Result<Option<Vec<u8>>, Status> {
        self.ensure_active()?;
        let mut input = self.duplex_input.lock().await;
        let receiver = input
            .as_mut()
            .ok_or_else(|| status(StatusCode::FailedPrecondition, "Call has no duplex input"))?;
        let payload = receiver.recv().await;
        if let Some(payload) = payload.as_ref() {
            self.events
                .send(ProtocolCompletion {
                    call_id: self.call_id,
                    outcome: ProtocolOutcome::InputConsumed(payload.len() as u64),
                })
                .await
                .map_err(|_| status(StatusCode::Cancelled, "Protocol connection closed"))?;
        }
        self.ensure_active()?;
        Ok(payload)
    }

    pub(super) fn access(&self) -> &ProtocolAccessContext {
        &self.access
    }

    pub(super) fn call_id(&self) -> u64 {
        self.call_id
    }

    pub(super) fn deadline(&self) -> Option<Instant> {
        self.deadline
    }

    pub(super) fn is_cancelled(&self) -> bool {
        self.cancellation.is_cancelled()
    }

    pub(super) async fn cancelled(&self) {
        self.cancellation.cancelled().await;
    }

    pub(super) fn peer_kind(&self) -> PeerKind {
        self.peer_kind
    }

    fn ensure_active(&self) -> Result<(), Status> {
        if self.is_cancelled() {
            return Err(status(
                StatusCode::Cancelled,
                &format!("Call {} was cancelled", self.call_id()),
            ));
        }
        if self
            .deadline()
            .is_some_and(|deadline| deadline <= Instant::now())
        {
            return Err(deadline_status(self.call_id()));
        }
        Ok(())
    }

    pub(super) async fn send_stream_payload(&self, payload: Vec<u8>) -> Result<(), Status> {
        self.ensure_active()?;
        let payload = self.response_budget.reserve(payload).await?;
        self.events
            .send(ProtocolCompletion {
                call_id: self.call_id,
                outcome: ProtocolOutcome::StreamPayload(payload),
            })
            .await
            .map_err(|_| status(StatusCode::Cancelled, "Protocol connection closed"))?;
        self.ensure_active()
    }
}

impl ProtocolResponseBudget {
    pub(super) fn new() -> Self {
        Self {
            permits: Arc::new(Semaphore::new(MAX_CONNECTION_BUFFERED_RESPONSE_BYTES)),
        }
    }

    async fn reserve(&self, data: Vec<u8>) -> Result<ProtocolPayload, Status> {
        if data.len() > MAX_CONNECTION_BUFFERED_RESPONSE_BYTES {
            return Err(status(
                StatusCode::ResourceExhausted,
                "Response exceeds the connection buffer limit",
            ));
        }
        let permits = u32::try_from(data.len()).map_err(|_| {
            status(
                StatusCode::ResourceExhausted,
                "Response length cannot be represented",
            )
        })?;
        let budget = if permits == 0 {
            None
        } else {
            Some(
                self.permits
                    .clone()
                    .acquire_many_owned(permits)
                    .await
                    .map_err(|_| status(StatusCode::Cancelled, "Protocol connection closed"))?,
            )
        };
        Ok(ProtocolPayload {
            data,
            _budget: budget,
            delivery: None,
        })
    }
}

impl ProtocolPayload {
    fn with_delivery(mut self, delivery: Option<ProtocolDeliveryGuard>) -> Self {
        self.delivery = delivery;
        self
    }

    pub(super) fn into_parts(
        self,
    ) -> (
        Vec<u8>,
        Option<OwnedSemaphorePermit>,
        Option<ProtocolDeliveryGuard>,
    ) {
        (self.data, self._budget, self.delivery)
    }
}

impl ProtocolDeliveryGuard {
    pub(super) fn new(completion: impl FnOnce(ProtocolDeliveryOutcome) + Send + 'static) -> Self {
        Self {
            completion: Some(Box::new(completion)),
        }
    }

    pub(super) fn confirm(mut self) {
        if let Some(completion) = self.completion.take() {
            completion(ProtocolDeliveryOutcome::Confirmed);
        }
    }
}

impl ProtocolHandlerResponse {
    pub(super) fn plain(payload: Vec<u8>) -> Self {
        Self {
            delivery: None,
            payload,
        }
    }

    pub(super) fn with_delivery(payload: Vec<u8>, delivery: ProtocolDeliveryGuard) -> Self {
        Self {
            delivery: Some(delivery),
            payload,
        }
    }

    fn into_parts(self) -> (Vec<u8>, Option<ProtocolDeliveryGuard>) {
        (self.payload, self.delivery)
    }
}

impl Drop for ProtocolDeliveryGuard {
    fn drop(&mut self) {
        if let Some(completion) = self.completion.take() {
            completion(ProtocolDeliveryOutcome::RolledBack);
        }
    }
}

impl ProtocolRouter {
    pub(super) fn new(inputs: ProtocolRouterInputs) -> Self {
        let ProtocolRouterInputs {
            accounts,
            app_control,
            browser,
            agent_status,
            ai_vault,
            cli,
            connection_id,
            agent_session,
            agent_trust,
            computer,
            markdown,
            preflight,
            ui,
            files,
            browser_command,
            browser_replay,
            browser_writeback,
            emulator,
            shell_files,
            git,
            orchestration,
            provider_usage,
            rate_limit_resume,
            crash_reports,
            feedback,
            layout,
            star_nag,
            worktree_labels,
            diagnostics,
            github,
            host_registry,
            local_downloads,
            mobile,
            notifications,
            repo,
            repository_refs,
            session_tabs,
            project_group,
            shell_platform,
            skills,
            settings,
            repo_host,
            runtime_environments,
            stats,
            status,
            terminal,
            updater,
            workspace_events,
            worktree,
            windows_firewall,
            developer_permissions,
            keybindings,
            artifact,
            dangerous_approval,
            project_host_setup,
            clipboard,
            folder_workspace,
            profiles,
            workspace_cleanup,
            workspace_session,
            shell_telemetry,
            ritual,
            workspace_ports,
            shell_state,
            project,
            visual_regression,
            workspace_space,
            client_events,
            project_context,
            notebook,
            external_editor,
            shell_events,
            shell_runtime,
            shell_host,
            host_progress,
        } = inputs;
        Self {
            accounts,
            app_control,
            browser,
            agent_status,
            ai_vault,
            cli,
            connection_id,
            agent_session,
            agent_trust,
            computer,
            markdown,
            preflight,
            ui,
            files,
            browser_command,
            browser_replay,
            browser_writeback,
            emulator,
            shell_files,
            git,
            orchestration,
            provider_usage,
            rate_limit_resume,
            crash_reports,
            feedback,
            layout,
            star_nag,
            worktree_labels,
            diagnostics,
            github,
            host_registry,
            local_downloads,
            mobile,
            notifications,
            repo,
            repository_refs,
            session_tabs,
            project_group,
            shell_platform,
            skills,
            settings,
            repo_host,
            runtime_environments,
            stats,
            status,
            terminal,
            updater,
            workspace_events,
            worktree,
            windows_firewall,
            developer_permissions,
            keybindings,
            artifact,
            dangerous_approval,
            project_host_setup,
            clipboard,
            folder_workspace,
            profiles,
            workspace_cleanup,
            workspace_session,
            shell_telemetry,
            ritual,
            workspace_ports,
            shell_state,
            project,
            visual_regression,
            workspace_space,
            client_events,
            project_context,
            notebook,
            external_editor,
            shell_events,
            shell_runtime,
            shell_host,
            host_progress,
        }
    }

    fn cancel_start_call(&self, procedure: &str, call_id: u64) {
        let Some(method) = method_metadata(procedure) else {
            return;
        };
        if !matches!(
            method.id,
            MethodId::AgentStartRuntimeV1LocalDownloadServiceStartFile
                | MethodId::AgentStartRuntimeV1LocalDownloadServiceStartFolder
        ) {
            return;
        }
        self.local_downloads
            .cancel_start_call(&self.connection_id, call_id);
    }

    fn start_trace_span(
        &self,
        name: &'static str,
        attributes: serde_json::Map<String, serde_json::Value>,
    ) -> crate::diagnostics::TraceSpan {
        self.diagnostics.start_trace_span(name, attributes)
    }
}

impl ProtocolHandler for ProtocolRouter {
    async fn handle(
        &self,
        request: ProtocolRequest<'_>,
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        if let Err(error) = context.ensure_active() {
            return ProtocolHandlerOutcome::Failed(error);
        }
        let Some(method) = method_metadata(request.procedure) else {
            return ProtocolHandlerOutcome::Failed(status(
                StatusCode::Unimplemented,
                "Procedure is not implemented",
            ));
        };
        if let Err(error) = context.access().authorize(method, context.peer_kind()) {
            return ProtocolHandlerOutcome::Failed(error);
        }
        if let Err(error) = context.ensure_active() {
            return ProtocolHandlerOutcome::Failed(error);
        }
        if let Some(environment_id) = request.destination {
            return self
                .handle_routed(method, environment_id, request.payload, context)
                .await;
        }
        // Why: domain futures keep independent handler temporaries off the same Tokio stack.
        match method::Method::from(method.id) {
            method::Method::Agents(method) => {
                Box::pin(self.handle_agents(method, request, context)).await
            }
            method::Method::Browser(method) => {
                Box::pin(self.handle_browser(method, request, context)).await
            }
            method::Method::Computer(method) => {
                Box::pin(self.handle_computer(method, request, context)).await
            }
            method::Method::Files(method) => {
                Box::pin(self.handle_files(method, request, context)).await
            }
            method::Method::Git(method) => Box::pin(self.handle_git(method, request)).await,
            method::Method::Github(method) => {
                Box::pin(self.handle_github(method, request, context)).await
            }
            method::Method::Orchestration(method) => {
                Box::pin(self.handle_orchestration(method, request, context)).await
            }
            method::Method::Preferences(method) => {
                Box::pin(self.handle_preferences(method, request, context)).await
            }
            method::Method::Projects(method) => {
                Box::pin(self.handle_projects(method, request, context)).await
            }
            method::Method::Runtime(method) => {
                Box::pin(self.handle_runtime(method, request, context)).await
            }
            method::Method::Support(method) => {
                Box::pin(self.handle_support(method, request, context)).await
            }
            method::Method::Terminal(method) => {
                Box::pin(self.handle_terminal(method, request, context)).await
            }
            method::Method::Workspaces(method) => {
                Box::pin(self.handle_workspaces(method, request, context)).await
            }
        }
    }
}

impl ProtocolRouter {
    async fn handle_routed(
        &self,
        method: &'static MethodMetadata,
        environment_id: &str,
        payload: &[u8],
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        if !allows_runtime_environment_route(method)
            || context.access().principal() != CallerClass::Local
            || context.peer_kind() != PeerKind::ChromeExtension
        {
            return ProtocolHandlerOutcome::Failed(status(
                StatusCode::PermissionDenied,
                "Runtime call cannot use an environment destination",
            ));
        }
        if method.client_streaming {
            return self
                .handle_routed_duplex(method, environment_id, payload, context)
                .await;
        }
        if method.server_streaming {
            return self
                .handle_routed_stream(method, environment_id, payload, context)
                .await;
        }
        let route = match self
            .runtime_environments
            .routed_connection(environment_id)
            .await
        {
            Ok(route) => route,
            Err(error) => return ProtocolHandlerOutcome::Failed(error),
        };
        match route
            .unary_raw(method, payload.to_vec(), routed_call_timeout(context))
            .await
        {
            Ok(response) => {
                ProtocolHandlerOutcome::Complete(ProtocolHandlerResponse::plain(response))
            }
            Err(error) => ProtocolHandlerOutcome::Failed(protocol_peer_status(error)),
        }
    }

    async fn handle_routed_duplex(
        &self,
        method: &'static MethodMetadata,
        environment_id: &str,
        payload: &[u8],
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        let route = match self
            .runtime_environments
            .routed_connection(environment_id)
            .await
        {
            Ok(route) => route,
            Err(error) => return ProtocolHandlerOutcome::Failed(error),
        };
        let (mut writer, mut stream) = match route
            .duplex_raw(method, payload.to_vec(), routed_call_timeout(context))
            .await
        {
            Ok(duplex) => duplex,
            Err(error) => return ProtocolHandlerOutcome::Failed(protocol_peer_status(error)),
        };
        let input = async {
            loop {
                match context.receive_duplex_payload().await? {
                    Some(payload) => writer.send(payload).await.map_err(protocol_peer_status)?,
                    None => {
                        writer.end().await.map_err(protocol_peer_status)?;
                        return Ok::<(), Status>(());
                    }
                }
            }
        };
        let output = async {
            loop {
                match stream.receive().await {
                    Ok(Some(event)) => context.send_stream_payload(event).await?,
                    Ok(None) => return Ok::<(), Status>(()),
                    Err(error) => {
                        route.invalidate_if_connection_failed(&error).await;
                        return Err(protocol_peer_status(error));
                    }
                }
            }
        };
        tokio::pin!(input, output);
        // Why: either direction may exhaust credit independently; never block output behind input.
        tokio::select! {
            result = &mut output => match result {
                Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                Err(error) => ProtocolHandlerOutcome::Failed(error),
            },
            result = &mut input => match result {
                Err(error) => ProtocolHandlerOutcome::Failed(error),
                Ok(()) => match output.await {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                },
            },
        }
    }

    async fn handle_routed_stream(
        &self,
        method: &'static MethodMetadata,
        environment_id: &str,
        payload: &[u8],
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        let reconnect = StreamReconnectPolicy::try_from(method.stream_reconnect);
        loop {
            let route = match self
                .runtime_environments
                .routed_connection(environment_id)
                .await
            {
                Ok(route) => route,
                Err(error) => return ProtocolHandlerOutcome::Failed(error),
            };
            let mut stream = match route
                .server_stream_raw(method, payload.to_vec(), routed_call_timeout(context))
                .await
            {
                Ok(stream) => stream,
                Err(error) => return ProtocolHandlerOutcome::Failed(protocol_peer_status(error)),
            };
            loop {
                match stream.receive().await {
                    Ok(Some(event)) => {
                        if let Err(error) = context.send_stream_payload(event).await {
                            return ProtocolHandlerOutcome::Failed(error);
                        }
                    }
                    Ok(None) => return ProtocolHandlerOutcome::StreamComplete,
                    Err(error)
                        if reconnect == Ok(StreamReconnectPolicy::RestartFromRequest)
                            && error.remote_status().is_none()
                            && context.ensure_active().is_ok() =>
                    {
                        route.invalidate_if_connection_failed(&error).await;
                        break;
                    }
                    Err(error) => {
                        return ProtocolHandlerOutcome::Failed(protocol_peer_status(error));
                    }
                }
            }
        }
    }
}

pub(super) fn allows_runtime_environment_route(method: &MethodMetadata) -> bool {
    RuntimeRoutePolicy::try_from(method.route) == Ok(RuntimeRoutePolicy::EnvironmentAllowed)
        && method
            .callers
            .contains(&(ProtocolCallerClass::Local as i32))
        && method
            .callers
            .contains(&(ProtocolCallerClass::Runtime as i32))
        && (method.peer_kinds.is_empty()
            || (method
                .peer_kinds
                .contains(&(PeerKind::ChromeExtension as i32))
                && method.peer_kinds.contains(&(PeerKind::Daemon as i32))))
}

fn routed_call_timeout(context: &ProtocolCallContext) -> Duration {
    context
        .deadline()
        .map(|deadline| deadline.saturating_duration_since(Instant::now()))
        .unwrap_or_else(|| Duration::from_millis(u64::from(u32::MAX)))
}

fn protocol_peer_status(error: crate::transport::ProtocolPeerError) -> Status {
    let code = match &error {
        crate::transport::ProtocolPeerError::ConnectionTimeout => StatusCode::DeadlineExceeded,
        crate::transport::ProtocolPeerError::RuntimeMismatch => StatusCode::FailedPrecondition,
        crate::transport::ProtocolPeerError::ConnectionFailed
        | crate::transport::ProtocolPeerError::Protocol(_) => StatusCode::Unavailable,
        crate::transport::ProtocolPeerError::Remote(display) => return display.status().clone(),
    };
    status(code, &error.to_string())
}

impl ProtocolCancellation {
    pub(super) fn new() -> Self {
        Self {
            inner: Arc::new(ProtocolCancellationState {
                is_cancelled: AtomicBool::new(false),
                notify: Notify::new(),
            }),
        }
    }

    pub(super) fn cancel(&self) {
        if !self.inner.is_cancelled.swap(true, Ordering::AcqRel) {
            self.inner.notify.notify_waiters();
        }
    }

    pub(super) fn is_cancelled(&self) -> bool {
        self.inner.is_cancelled.load(Ordering::Acquire)
    }

    async fn cancelled(&self) {
        loop {
            let notified = self.inner.notify.notified();
            if self.is_cancelled() {
                return;
            }
            notified.await;
        }
    }
}

pub(super) async fn execute_protocol_call(
    router: ProtocolRouter,
    access: ProtocolAccessContext,
    call: ProtocolCall,
    events: mpsc::Sender<ProtocolCompletion>,
    response_budget: ProtocolResponseBudget,
) {
    let ProtocolCall {
        duplex_input,
        call_id,
        cancellation,
        deadline,
        destination,
        payload: request_payload,
        peer_kind,
        procedure,
    } = call;
    let diagnostic_procedure = if method_metadata(&procedure).is_some() {
        procedure.as_str()
    } else {
        "<unknown>"
    };
    let mut trace_attributes = serde_json::Map::new();
    trace_attributes.insert(
        "rpc.destination_present".to_owned(),
        serde_json::Value::Bool(destination.is_some()),
    );
    trace_attributes.insert(
        "rpc.peer_kind".to_owned(),
        serde_json::Value::from(peer_kind as i32),
    );
    trace_attributes.insert(
        "rpc.procedure".to_owned(),
        serde_json::Value::String(diagnostic_procedure.to_owned()),
    );
    trace_attributes.insert(
        "rpc.request_bytes".to_owned(),
        serde_json::Value::from(request_payload.len() as u64),
    );
    let mut trace_span = router.start_trace_span("runtime.rpc", trace_attributes);
    if duplex_input.is_some() && !request_payload.is_empty() {
        // Why: dispatch consumes the initial message just like each later duplex receive.
        if events
            .send(ProtocolCompletion {
                call_id,
                outcome: ProtocolOutcome::InputConsumed(request_payload.len() as u64),
            })
            .await
            .is_err()
        {
            return;
        }
    }
    let context = ProtocolCallContext {
        duplex_input: tokio::sync::Mutex::new(duplex_input),
        access,
        call_id,
        cancellation: cancellation.clone(),
        deadline,
        events: events.clone(),
        peer_kind,
        response_budget: response_budget.clone(),
    };
    let request = ProtocolRequest {
        destination: destination.as_deref(),
        payload: &request_payload,
        procedure: &procedure,
    };
    let outcome = tokio::select! {
        biased;
        () = cancellation.cancelled() => {
            router.cancel_start_call(&procedure, call_id);
            ProtocolHandlerOutcome::Abandoned
        }
        () = wait_for_deadline(deadline) => {
            cancellation.cancel();
            router.cancel_start_call(&procedure, call_id);
            ProtocolHandlerOutcome::Failed(deadline_status(call_id))
        }
        // Why only this branch is scoped: cancellation and the deadline still
        // race the handler unchanged, and dropping the losing branch drops the
        // scope with it, so an interrupted call leaves no parent behind.
        outcome = trace_span.scope(Box::pin(router.handle(request, &context))) => outcome,
    };
    match outcome {
        ProtocolHandlerOutcome::Complete(response) => {
            let (response, delivery) = response.into_parts();
            let reserved = tokio::select! {
                biased;
                () = cancellation.cancelled() => {
                    trace_span.interrupt(Some("protocol call canceled"));
                    return;
                }
                () = wait_for_deadline(deadline) => {
                    cancellation.cancel();
                    Err(deadline_status(call_id))
                }
                reserved = response_budget.reserve(response) => reserved,
            };
            let payload = match reserved {
                Ok(payload) => payload.with_delivery(delivery),
                Err(status) => {
                    trace_span
                        .set_attribute("rpc.status_code", serde_json::Value::from(status.code));
                    trace_span.failure("protocol response reservation failed");
                    let _ = events
                        .send(ProtocolCompletion {
                            call_id,
                            outcome: ProtocolOutcome::Failed(status),
                        })
                        .await;
                    return;
                }
            };
            let completion = ProtocolCompletion {
                call_id,
                outcome: ProtocolOutcome::Complete(payload),
            };
            tokio::select! {
                biased;
                () = cancellation.cancelled() => {
                    trace_span.interrupt(Some("protocol call canceled"));
                }
                () = wait_for_deadline(deadline) => {
                    cancellation.cancel();
                    trace_span.failure("protocol response deadline exceeded");
                }
                result = events.send(completion) => {
                    if result.is_ok() {
                        trace_span.success();
                    } else {
                        trace_span.interrupt(Some("protocol completion channel closed"));
                    }
                }
            }
        }
        ProtocolHandlerOutcome::Abandoned => {
            trace_span.interrupt(Some("protocol call abandoned"));
            let _ = events
                .send(ProtocolCompletion {
                    call_id,
                    outcome: ProtocolOutcome::Abandoned,
                })
                .await;
        }
        ProtocolHandlerOutcome::Failed(status) => {
            trace_span.set_attribute("rpc.status_code", serde_json::Value::from(status.code));
            trace_span.failure("protocol call failed");
            let _ = events
                .send(ProtocolCompletion {
                    call_id,
                    outcome: ProtocolOutcome::Failed(status),
                })
                .await;
        }
        ProtocolHandlerOutcome::StreamComplete => {
            trace_span.success();
            let _ = events
                .send(ProtocolCompletion {
                    call_id,
                    outcome: ProtocolOutcome::StreamComplete,
                })
                .await;
        }
    }
}

pub(super) fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

fn deadline_status(call_id: u64) -> Status {
    status(
        StatusCode::DeadlineExceeded,
        &format!("Call {call_id} exceeded its deadline"),
    )
}

async fn wait_for_deadline(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => sleep_until(deadline).await,
        None => pending::<()>().await,
    }
}
