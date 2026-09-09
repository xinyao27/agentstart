mod agent;
mod input;
mod prompt;
pub(super) mod protocol;
mod source;

use std::net::{Ipv4Addr, Ipv6Addr};

use serde_json::{Value, json};
use thiserror::Error;
use url::Host;

use crate::agent_trust::AgentTrustService;
use crate::host_registry::{HostRegistry, HostRegistryError};
use crate::hosts::{ExecutionHost, HostFilesystem};
use crate::persistence::{WorkspaceEventPayload, WorkspaceJournal, WorkspaceJournalError};
use crate::settings::SettingsAuthority;
use crate::terminal_session::TerminalSessionAuthority;
use crate::workspace_ports::{
    WorkspacePortClassification, WorkspacePortProbe, WorkspacePortsRegistry,
};
use crate::worktrees::{WorktreeCatalog, WorktreeCatalogError};
use agent::{AgentLaunchError, AgentLauncher, AgentTrustRegistry};
use input::{ApplyColorInput, ApplyCssInput, LocateElementInput, RecordVerificationInput, Target};
use source::SourcePathError;

#[derive(Clone)]
pub(super) struct BrowserWritebackRpc {
    agent_trust: AgentTrustRegistry,
    hosts: HostRegistry,
    journal: WorkspaceJournal,
    ports: WorkspacePortsRegistry,
    settings: SettingsAuthority,
    terminals: TerminalSessionAuthority,
    worktrees: WorktreeCatalog,
}

struct VerifiedWorktree {
    host: std::sync::Arc<dyn ExecutionHost>,
    probe: WorkspacePortProbe,
}

#[derive(Debug, Error)]
enum BrowserWritebackRpcError {
    #[error(transparent)]
    Agent(Box<AgentLaunchError>),
    #[error(transparent)]
    Host(Box<HostRegistryError>),
    #[error(transparent)]
    Journal(Box<WorkspaceJournalError>),
    #[error("browser_writeback_page_identity_mismatch")]
    PageIdentityMismatch,
    #[error(transparent)]
    Source(Box<SourcePathError>),
    #[error("browser_writeback_terminal_mismatch")]
    TerminalMismatch,
    #[error(transparent)]
    Worktree(Box<WorktreeCatalogError>),
    #[error("browser_writeback_workspace_identity_mismatch")]
    WorkspaceIdentityMismatch,
}

impl BrowserWritebackRpc {
    pub(super) fn new(
        agent_trust: AgentTrustService,
        hosts: HostRegistry,
        journal: WorkspaceJournal,
        ports: WorkspacePortsRegistry,
        settings: SettingsAuthority,
        terminals: TerminalSessionAuthority,
        worktrees: WorktreeCatalog,
    ) -> Self {
        Self {
            agent_trust: AgentTrustRegistry::new(agent_trust),
            hosts,
            journal,
            ports,
            settings,
            terminals,
            worktrees,
        }
    }

    async fn apply_color(&self, input: ApplyColorInput) -> Result<Value, BrowserWritebackRpcError> {
        let worktree = self.require_worktree(&input.target).await?;
        let prompt = prompt::color(&input.color, input.intent.as_deref());
        let terminal_handle = self.start_agent(&input.target, &worktree, &prompt).await?;
        let payload = WorkspaceEventPayload::from_iter([
            ("color".to_owned(), Value::String(input.color)),
            (
                "terminalHandle".to_owned(),
                Value::String(terminal_handle.clone()),
            ),
            (
                "worktreeId".to_owned(),
                Value::String(input.target.worktree_id),
            ),
        ]);
        self.append(
            &input.target.project_id,
            "browser.color.writeback-started",
            payload,
        )
        .await?;
        Ok(json!({ "terminalHandle": terminal_handle }))
    }

    async fn apply_css(&self, input: ApplyCssInput) -> Result<Value, BrowserWritebackRpcError> {
        let worktree = self.require_worktree(&input.target).await?;
        self.require_local_page(&input.target, &worktree, &input.page_url)
            .await?;
        let prompt = prompt::css(&input);
        let terminal_handle = self.start_agent(&input.target, &worktree, &prompt).await?;
        let payload = WorkspaceEventPayload::from_iter([
            ("pageUrl".to_owned(), Value::String(input.page_url)),
            (
                "terminalHandle".to_owned(),
                Value::String(terminal_handle.clone()),
            ),
            (
                "worktreeId".to_owned(),
                Value::String(input.target.worktree_id),
            ),
        ]);
        self.append(
            &input.target.project_id,
            "browser.css.writeback-started",
            payload,
        )
        .await?;
        Ok(json!({ "terminalHandle": terminal_handle }))
    }

    async fn locate_element(
        &self,
        input: LocateElementInput,
    ) -> Result<Value, BrowserWritebackRpcError> {
        let worktree = self.require_worktree(&input.target).await?;
        self.require_local_page(&input.target, &worktree, &input.page_url)
            .await?;
        let filesystem = HostFilesystem::new(worktree.host.clone());
        let source_path = source::resolve(
            &worktree.probe,
            &filesystem,
            worktree.host.platform(),
            input.evidence.file_name.as_deref(),
        )
        .await
        .map_err(|error| BrowserWritebackRpcError::Source(Box::new(error)))?;
        let prompt = prompt::element(&input, source_path.as_deref());
        let terminal_handle = self.start_agent(&input.target, &worktree, &prompt).await?;
        let payload = WorkspaceEventPayload::from_iter([
            (
                "componentName".to_owned(),
                input
                    .evidence
                    .component_name
                    .map_or(Value::Null, Value::String),
            ),
            (
                "fileName".to_owned(),
                input.evidence.file_name.map_or(Value::Null, Value::String),
            ),
            ("pageUrl".to_owned(), Value::String(input.page_url)),
            (
                "terminalHandle".to_owned(),
                Value::String(terminal_handle.clone()),
            ),
            (
                "worktreeId".to_owned(),
                Value::String(input.target.worktree_id),
            ),
        ]);
        self.append(
            &input.target.project_id,
            "browser.element.agent-started",
            payload,
        )
        .await?;
        Ok(json!({ "terminalHandle": terminal_handle }))
    }

    async fn record_verification(
        &self,
        input: RecordVerificationInput,
    ) -> Result<Value, BrowserWritebackRpcError> {
        let worktree = self.require_worktree(&input.target).await?;
        self.require_local_page(&input.target, &worktree, &input.page_url)
            .await?;
        let terminals = self
            .terminals
            .list(Some(&input.target.worktree_id), usize::MAX, false)
            .await
            .map_err(|_| BrowserWritebackRpcError::TerminalMismatch)?;
        let is_exact = terminals.terminals.iter().any(|terminal| {
            terminal.handle == input.terminal_handle
                && terminal.connected
                && terminal.worktree_id == input.target.worktree_id
        });
        if !is_exact {
            return Err(BrowserWritebackRpcError::TerminalMismatch);
        }
        let payload = WorkspaceEventPayload::from_iter([
            ("detail".to_owned(), Value::String(input.detail)),
            ("pageUrl".to_owned(), Value::String(input.page_url)),
            ("success".to_owned(), Value::Bool(input.success)),
            (
                "terminalHandle".to_owned(),
                Value::String(input.terminal_handle),
            ),
            (
                "worktreeId".to_owned(),
                Value::String(input.target.worktree_id),
            ),
        ]);
        let event = self
            .journal
            .append(
                input.target.project_id,
                "browser.writeback.verified".to_owned(),
                payload,
            )
            .await
            .map_err(|error| BrowserWritebackRpcError::Journal(Box::new(error)))?;
        Ok(json!({ "eventId": event.id }))
    }

    async fn require_worktree(
        &self,
        target: &Target,
    ) -> Result<VerifiedWorktree, BrowserWritebackRpcError> {
        let probe = self
            .worktrees
            .resolve_selector(&target.worktree_id)
            .await
            .map_err(|error| BrowserWritebackRpcError::Worktree(Box::new(error)))?;
        if probe.repo_id != target.project_id {
            return Err(BrowserWritebackRpcError::WorkspaceIdentityMismatch);
        }
        let host = self
            .hosts
            .execution_host(&probe.host_id)
            .await
            .map_err(|error| BrowserWritebackRpcError::Host(Box::new(error)))?;
        Ok(VerifiedWorktree { host, probe })
    }

    async fn require_local_page(
        &self,
        target: &Target,
        worktree: &VerifiedWorktree,
        page_url: &str,
    ) -> Result<(), BrowserWritebackRpcError> {
        let page = url::Url::parse(page_url)
            .map_err(|_| BrowserWritebackRpcError::PageIdentityMismatch)?;
        if !matches!(page.scheme(), "http" | "https") || !is_local_host(page.host()) {
            return Err(BrowserWritebackRpcError::PageIdentityMismatch);
        }
        let port = page
            .port()
            .unwrap_or_else(|| if page.scheme() == "https" { 443 } else { 80 });
        let source = self
            .worktrees
            .port_probes_on_host(&worktree.probe.host_id, &target.project_id)
            .await
            .map_err(|error| BrowserWritebackRpcError::Worktree(Box::new(error)))?;
        let ports = self
            .ports
            .for_host(&source.host_id)
            .await
            .map_err(|error| BrowserWritebackRpcError::Host(Box::new(error)))?;
        let observed = ports.scan(&source.probes, Some(&target.project_id)).await;
        let is_exact = observed.ports.iter().any(|candidate| {
            candidate.port == port
                && matches!(
                    &candidate.classification,
                    WorkspacePortClassification::Workspace { owner, .. }
                        if owner.repo_id == target.project_id
                            && owner.worktree_id == target.worktree_id
                )
        });
        if !is_exact {
            return Err(BrowserWritebackRpcError::PageIdentityMismatch);
        }
        Ok(())
    }

    async fn start_agent(
        &self,
        target: &Target,
        worktree: &VerifiedWorktree,
        prompt: &str,
    ) -> Result<String, BrowserWritebackRpcError> {
        AgentLauncher {
            settings: &self.settings,
            terminals: &self.terminals,
            trust: &self.agent_trust,
        }
        .launch(
            worktree.host.clone(),
            &target.worktree_id,
            &worktree.probe.path,
            prompt,
        )
        .await
        .map_err(|error| BrowserWritebackRpcError::Agent(Box::new(error)))
    }

    async fn append(
        &self,
        scope: &str,
        kind: &str,
        payload: WorkspaceEventPayload,
    ) -> Result<(), BrowserWritebackRpcError> {
        self.journal
            .append(scope.to_owned(), kind.to_owned(), payload)
            .await
            .map_err(|error| BrowserWritebackRpcError::Journal(Box::new(error)))?;
        Ok(())
    }
}

fn is_local_host(host: Option<Host<&str>>) -> bool {
    match host {
        Some(Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(host)) => host == Ipv4Addr::LOCALHOST,
        Some(Host::Ipv6(host)) => host == Ipv6Addr::LOCALHOST,
        None => false,
    }
}
