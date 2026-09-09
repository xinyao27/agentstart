mod identity;
mod input;
pub(in crate::rpc) mod protocol;
pub(in crate::rpc) mod protocol_values;

use crate::host_registry::HostRegistryError;
use crate::persistence::visual_regression::{
    VisualRegressionSave, VisualRegressionStore, VisualRegressionStoreError,
};
use crate::persistence::{WorkspaceEventPayload, WorkspaceJournal, WorkspaceJournalError};
use crate::workspace_ports::{WorkspacePortClassification, WorkspacePortsRegistry};
use crate::worktrees::{WorktreeCatalog, WorktreeCatalogError};
use identity::{PreviewIdentityError, require_local_preview, workspace_mismatch};
use input::VisualRegressionIdentity;
use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Error)]
pub(crate) enum VisualRegressionRpcError {
    #[error(transparent)]
    Journal(#[from] WorkspaceJournalError),
    #[error(transparent)]
    PreviewIdentity(#[from] PreviewIdentityError),
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error("visual regression response serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error(transparent)]
    Storage(#[from] VisualRegressionStoreError),
    #[error(transparent)]
    Worktrees(#[from] WorktreeCatalogError),
}

#[derive(Clone)]
pub(crate) struct VisualRegressionRpc {
    journal: WorkspaceJournal,
    ports: WorkspacePortsRegistry,
    store: VisualRegressionStore,
    worktrees: WorktreeCatalog,
}

impl VisualRegressionRpc {
    pub(crate) fn new(
        journal: WorkspaceJournal,
        ports: WorkspacePortsRegistry,
        store: VisualRegressionStore,
        worktrees: WorktreeCatalog,
    ) -> Self {
        Self {
            journal,
            ports,
            store,
            worktrees,
        }
    }

    // Why shared: the protobuf surface runs the same identity probe, store
    // read, and journal append, so both wire surfaces call these two methods
    // and cannot drift on what a capture requires.
    pub(crate) async fn latest(
        &self,
        input: VisualRegressionIdentity,
    ) -> Result<Value, VisualRegressionRpcError> {
        self.require_identity(&input.page_url, &input.project_id, &input.worktree_id)
            .await?;
        let capture = self
            .store
            .latest(input.project_id, input.worktree_id)
            .await?;
        Ok(serde_json::to_value(capture)?)
    }

    pub(crate) async fn save(
        &self,
        input: VisualRegressionSave,
    ) -> Result<Value, VisualRegressionRpcError> {
        self.require_identity(&input.page_url, &input.project_id, &input.worktree_id)
            .await?;
        let capture = self.store.save(input).await?;
        let payload = WorkspaceEventPayload::from_iter([
            (
                "diffRatio".to_owned(),
                capture.diff_ratio.map_or(Value::Null, Value::from),
            ),
            (
                "pageUrl".to_owned(),
                Value::String(capture.page_url.clone()),
            ),
            (
                "worktreeId".to_owned(),
                Value::String(capture.worktree_id.clone()),
            ),
        ]);
        self.journal
            .append(
                capture.project_id.clone(),
                "browser.visual-capture.saved".to_owned(),
                payload,
            )
            .await?;
        Ok(serde_json::to_value(capture)?)
    }

    async fn require_identity(
        &self,
        page_url: &str,
        project_id: &str,
        worktree_id: &str,
    ) -> Result<(), VisualRegressionRpcError> {
        let preview = require_local_preview(page_url)?;
        let probe = self.worktrees.resolve_selector(worktree_id).await?;
        if probe.repo_id != project_id {
            return Err(workspace_mismatch().into());
        }
        let source = self
            .worktrees
            .port_probes_on_host(&probe.host_id, project_id)
            .await?;
        let ports = self.ports.for_host(&source.host_id).await?;
        let observed = ports.scan(&source.probes, Some(project_id)).await;
        let is_exact = observed.ports.iter().any(|candidate| {
            candidate.port == preview.port
                && matches!(
                    &candidate.classification,
                    WorkspacePortClassification::Workspace { owner, .. }
                        if owner.repo_id == project_id && owner.worktree_id == worktree_id
                )
        });
        if !is_exact {
            return Err(workspace_mismatch().into());
        }
        Ok(())
    }
}
