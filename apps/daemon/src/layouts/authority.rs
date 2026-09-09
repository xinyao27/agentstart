use serde_json::{Map, Value};
use thiserror::Error;

use crate::host_registry::{HostRegistry, HostRegistryError};
use crate::hosts::{HostFilesystem, HostFilesystemError};
use crate::persistence::{WorkspaceJournal, WorkspaceJournalError};
use crate::rpc::{AgentSessionAuthority, AgentSessionLaunchError, AgentSessionLaunchRequest};
use crate::terminal_session::{
    TerminalCreateRequest, TerminalPresentation, TerminalSessionAuthority, TerminalSessionError,
};
use crate::worktrees::{ResolvedWorktree, WorktreeCatalog, WorktreeCatalogError};

use super::config::read_layout_recipes;
use super::model::{LayoutAppliedPane, LayoutPane, LayoutRecipe};

// Why: Layout terminals use the same initial geometry as agent and session-tab launches.
const LAYOUT_TERMINAL_COLS: u16 = 120;
const LAYOUT_TERMINAL_ROWS: u16 = 40;

// Why: Applying a layout reveals each newly launched pane.
const LAYOUT_PANE_PRESENTATION: TerminalPresentation = TerminalPresentation::Visible;

// Why: apps/daemon conventionally reports revision conflicts with a fixed domain tag rather
// than the scope key used internally for the journal partition (see worktrees::authority and
// rpc/repo/protocol.rs), so this does not echo worktree.repo_id back to the caller.
const REVISION_CONFLICT_SCOPE: &str = "worktree";

#[derive(Clone)]
pub(crate) struct LayoutAuthority {
    agent_sessions: AgentSessionAuthority,
    hosts: HostRegistry,
    journal: WorkspaceJournal,
    terminals: TerminalSessionAuthority,
    worktrees: WorktreeCatalog,
}

#[derive(Debug, Error)]
pub(crate) enum LayoutAuthorityError {
    // Why: The caller-visible error identifies an unmatched layout name.
    #[error("layout_recipe_not_found")]
    RecipeNotFound,
    #[error("workspaceRevisionConflict")]
    RevisionConflict {
        actual_revision: i64,
        expected_revision: i64,
        scope: &'static str,
    },
    #[error(transparent)]
    AgentLaunch(#[from] AgentSessionLaunchError),
    #[error(transparent)]
    Filesystem(#[from] HostFilesystemError),
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error(transparent)]
    Journal(#[from] WorkspaceJournalError),
    #[error(transparent)]
    Terminal(#[from] TerminalSessionError),
    #[error(transparent)]
    Worktree(#[from] WorktreeCatalogError),
}

impl LayoutAuthority {
    pub(crate) fn new(
        worktrees: WorktreeCatalog,
        hosts: HostRegistry,
        terminals: TerminalSessionAuthority,
        journal: WorkspaceJournal,
        agent_sessions: AgentSessionAuthority,
    ) -> Self {
        Self {
            agent_sessions,
            hosts,
            journal,
            terminals,
            worktrees,
        }
    }

    pub(crate) async fn list(
        &self,
        worktree_selector: &str,
    ) -> Result<Vec<LayoutRecipe>, LayoutAuthorityError> {
        let worktree = self.worktrees.resolve_managed(worktree_selector).await?;
        self.recipes_for(&worktree).await
    }

    pub(crate) async fn apply(
        &self,
        worktree_selector: &str,
        expected_revision: i64,
        name: &str,
    ) -> Result<(Vec<LayoutAppliedPane>, i64), LayoutAuthorityError> {
        let worktree = self.worktrees.resolve_managed(worktree_selector).await?;
        let recipe = self
            .recipes_for(&worktree)
            .await?
            .into_iter()
            .find(|candidate| candidate.name == name)
            .ok_or(LayoutAuthorityError::RecipeNotFound)?;
        let actual_revision = self.journal.revision(worktree.repo_id.clone()).await?;
        if actual_revision != expected_revision {
            return Err(LayoutAuthorityError::RevisionConflict {
                actual_revision,
                expected_revision,
                scope: REVISION_CONFLICT_SCOPE,
            });
        }
        self.apply_recipe(&worktree, recipe).await
    }

    async fn recipes_for(
        &self,
        worktree: &ResolvedWorktree,
    ) -> Result<Vec<LayoutRecipe>, LayoutAuthorityError> {
        let host = self.hosts.execution_host(&worktree.host_id).await?;
        let filesystem = HostFilesystem::new(host);
        Ok(read_layout_recipes(&worktree.path, &filesystem).await?)
    }

    async fn apply_recipe(
        &self,
        worktree: &ResolvedWorktree,
        recipe: LayoutRecipe,
    ) -> Result<(Vec<LayoutAppliedPane>, i64), LayoutAuthorityError> {
        let repo_id = worktree.repo_id.clone();
        let _ = self
            .journal
            .append(
                repo_id.clone(),
                "layout.apply.started".to_owned(),
                event_payload([
                    ("name", Value::String(recipe.name.clone())),
                    ("worktreeId", Value::String(worktree.id.clone())),
                ]),
            )
            .await;
        let mut started = Vec::with_capacity(recipe.panes.len());
        for pane in &recipe.panes {
            let applied = match self.start_pane(&worktree.id, pane).await {
                Ok(applied) => applied,
                Err(error) => {
                    self.rollback(&started).await;
                    let _ = self
                        .journal
                        .append(
                            repo_id,
                            "layout.apply.failed".to_owned(),
                            event_payload([
                                ("name", Value::String(recipe.name.clone())),
                                ("worktreeId", Value::String(worktree.id.clone())),
                                ("detail", Value::String(error.to_string())),
                            ]),
                        )
                        .await;
                    return Err(error);
                }
            };
            let _ = self
                .journal
                .append(
                    repo_id.clone(),
                    "layout.apply.pane-started".to_owned(),
                    event_payload([
                        ("name", Value::String(recipe.name.clone())),
                        ("worktreeId", Value::String(worktree.id.clone())),
                        (
                            "terminalHandle",
                            Value::String(applied.terminal_handle.clone()),
                        ),
                        ("title", Value::String(applied.title.clone())),
                    ]),
                )
                .await;
            started.push(applied);
        }
        let complete = self
            .journal
            .append(
                repo_id,
                "layout.apply.complete".to_owned(),
                event_payload([
                    ("name", Value::String(recipe.name)),
                    ("worktreeId", Value::String(worktree.id.clone())),
                    ("paneCount", Value::from(started.len())),
                ]),
            )
            .await?;
        Ok((started, complete.revision))
    }

    // Why: Rollback stops every started agent session before surfacing the original failure.
    async fn rollback(&self, panes: &[LayoutAppliedPane]) {
        for pane in panes {
            match &pane.session_id {
                Some(session_id) => self.agent_sessions.stop_launched(session_id).await,
                None => {
                    let _ = self.terminals.close(&pane.terminal_handle).await;
                }
            }
        }
    }

    async fn start_pane(
        &self,
        worktree_id: &str,
        pane: &LayoutPane,
    ) -> Result<LayoutAppliedPane, LayoutAuthorityError> {
        match pane {
            LayoutPane::Agent {
                agent,
                prompt,
                title,
            } => {
                let launch = self
                    .agent_sessions
                    .launch(AgentSessionLaunchRequest {
                        agent: agent.clone(),
                        presentation: LAYOUT_PANE_PRESENTATION,
                        prompt: prompt.clone(),
                        title: Some(title.clone()),
                        worktree_id: worktree_id.to_owned(),
                    })
                    .await?;
                Ok(LayoutAppliedPane {
                    terminal_handle: launch.terminal_handle,
                    title: launch.title,
                    session_id: Some(launch.session_id),
                })
            }
            LayoutPane::Command { command, title } => {
                self.start_terminal(worktree_id, Some(command.clone()), title.clone())
                    .await
            }
            LayoutPane::Shell { title } => {
                self.start_terminal(worktree_id, None, title.clone()).await
            }
        }
    }

    async fn start_terminal(
        &self,
        worktree_id: &str,
        command: Option<String>,
        title: String,
    ) -> Result<LayoutAppliedPane, LayoutAuthorityError> {
        let created = self
            .terminals
            .create(TerminalCreateRequest {
                activate: false,
                cols: LAYOUT_TERMINAL_COLS,
                command,
                cwd: None,
                cwd_fallback: false,
                env: Vec::new(),
                env_to_delete: Vec::new(),
                focus: false,
                launch_agent: None,
                launch_config: None,
                launch_token: None,
                leaf_id: None,
                presentation: Some(LAYOUT_PANE_PRESENTATION),
                rows: LAYOUT_TERMINAL_ROWS,
                startup_command_delivery: None,
                renderer_backed: false,
                tab_id: None,
                title: Some(title.clone()),
                split_direction: None,
                split_from_leaf_id: None,
                split_telemetry_source: None,
                worktree: Some(format!("id:{worktree_id}")),
            })
            .await?;
        Ok(LayoutAppliedPane {
            terminal_handle: created.handle,
            title,
            session_id: None,
        })
    }
}

fn event_payload<const N: usize>(fields: [(&str, Value); N]) -> Map<String, Value> {
    fields
        .into_iter()
        .map(|(key, value)| (key.to_owned(), value))
        .collect()
}
