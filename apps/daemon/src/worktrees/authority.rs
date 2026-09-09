use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value, json, to_value};
use thiserror::Error;
use tokio::sync::broadcast;

use crate::client_events::{ClientEventsAuthority, WorktreeHeadIdentity};
use crate::hosts::HostFilesystemError;
use crate::persistence::{WorkspaceEventPayload, WorkspaceJournal, WorkspaceJournalError};
use crate::projects::ProjectCatalogError;
use crate::repositories::{RepositoryAuthority, hooks as repository_hooks};
use crate::terminal_session::{TerminalCreateRequest, TerminalPresentation};
use crate::terminal_session::{TerminalSessionAuthority, TerminalSessionError};
use crate::workspace_session::WorkspaceSessionAuthority;

use super::catalog::{WorktreeCatalog, WorktreeCatalogError};
use super::projection::{WorktreePsResult, build_summaries};
use super::projection::{detected_value, record_value};

const DEFAULT_WORKTREE_PS_LIMIT: usize = 200;
const WORKTREE_STATE_EVENT_CAPACITY: usize = 128;

#[derive(Clone)]
pub(crate) struct WorktreeAuthority {
    catalog: WorktreeCatalog,
    client_events: ClientEventsAuthority,
    journal: WorkspaceJournal,
    terminals: TerminalSessionAuthority,
    workspace_session: WorkspaceSessionAuthority,
    repositories: RepositoryAuthority,
    preserved_branches: Arc<Mutex<HashMap<String, PreservedBranch>>>,
    state_events: broadcast::Sender<Value>,
}

struct PreservedBranch {
    branch_name: String,
    head: String,
    worktree: super::catalog::ResolvedWorktree,
}

#[derive(Debug, Error)]
pub(crate) enum WorktreeAuthorityError {
    #[error("invalid_limit")]
    InvalidLimit,
    #[error(transparent)]
    Catalog(#[from] WorktreeCatalogError),
    #[error(transparent)]
    Journal(#[from] WorkspaceJournalError),
    #[error(transparent)]
    Project(#[from] ProjectCatalogError),
    #[error("worktree terminal projection failed")]
    Projection,
    #[error("{0}")]
    Operation(String),
    #[error(transparent)]
    Terminal(#[from] TerminalSessionError),
    #[error(transparent)]
    WorkspaceSession(#[from] crate::workspace_session::WorkspaceSessionError),
    #[error(transparent)]
    Filesystem(#[from] HostFilesystemError),
}

impl WorktreeAuthority {
    pub(crate) fn new(
        catalog: WorktreeCatalog,
        client_events: ClientEventsAuthority,
        journal: WorkspaceJournal,
        terminals: TerminalSessionAuthority,
        workspace_session: WorkspaceSessionAuthority,
        repositories: RepositoryAuthority,
    ) -> Self {
        let catalog_for_watcher = catalog.clone();
        let events_for_watcher = client_events.clone();
        let (state_events, _) = broadcast::channel(WORKTREE_STATE_EVENT_CAPACITY);
        let state_events_for_watcher = state_events.clone();
        tokio::spawn(async move {
            let mut previous = BTreeMap::<String, Vec<WorktreeHeadIdentity>>::new();
            let mut previous_state = HashMap::<String, Value>::new();
            let mut interval = tokio::time::interval(Duration::from_secs(2));
            loop {
                interval.tick().await;
                let Ok(worktrees) = catalog_for_watcher.list_resolved().await else {
                    continue;
                };
                let mut current = BTreeMap::<String, Vec<WorktreeHeadIdentity>>::new();
                for worktree in &worktrees {
                    current.entry(worktree.repo_id.clone()).or_default().push(
                        WorktreeHeadIdentity {
                            worktree_path: worktree.path.clone(),
                            head: worktree.head.clone(),
                            branch: (!worktree.branch.is_empty()
                                && worktree.branch != "(detached)")
                                .then(|| format!("refs/heads/{}", worktree.branch)),
                        },
                    );
                }
                for identities in current.values_mut() {
                    identities.sort_by(|left, right| left.worktree_path.cmp(&right.worktree_path));
                }
                for (repo_id, identities) in &current {
                    if previous.get(repo_id) != Some(identities) {
                        events_for_watcher.publish_worktree_head_identities_changed(
                            repo_id.clone(),
                            identities.clone(),
                        );
                    }
                }
                for repo_id in previous
                    .keys()
                    .filter(|repo_id| !current.contains_key(*repo_id))
                {
                    events_for_watcher
                        .publish_worktree_head_identities_changed(repo_id.clone(), Vec::new());
                }
                previous = current;

                let mut next_state = HashMap::new();
                for worktree in worktrees {
                    let Some(base) = worktree.metadata.get("baseRef").and_then(Value::as_str)
                    else {
                        continue;
                    };
                    let base = base.trim();
                    if base.is_empty() {
                        continue;
                    }
                    let output = catalog_for_watcher
                        .git_at(
                            &worktree.host_id,
                            &worktree.path,
                            [
                                "rev-list",
                                "--left-right",
                                "--count",
                                &format!("{base}...HEAD"),
                            ],
                        )
                        .await;
                    let (status, behind) = match output {
                        Ok(output) if output.exit_code == 0 => parse_base_counts(&output.stdout),
                        _ => ("unknown", None),
                    };
                    let mut event = json!({
                        "type": "baseStatus",
                        "repoId": worktree.repo_id,
                        "worktreeId": worktree.id,
                        "status": status,
                        "base": base,
                    });
                    if let Some(behind) = behind
                        && let Some(object) = event.as_object_mut()
                    {
                        object.insert("behind".to_owned(), Value::from(behind));
                    }
                    if previous_state.get(&worktree.id) != Some(&event) {
                        let _ = state_events_for_watcher.send(event.clone());
                    }
                    next_state.insert(worktree.id, event);
                }
                previous_state = next_state;
            }
        });
        Self {
            catalog,
            client_events,
            journal,
            terminals,
            workspace_session,
            repositories,
            preserved_branches: Arc::new(Mutex::new(HashMap::new())),
            state_events,
        }
    }

    pub(crate) fn subscribe_state_events(&self) -> broadcast::Receiver<Value> {
        self.state_events.subscribe()
    }

    pub(crate) async fn sleep(
        &self,
        selector: &str,
        agent_rows: impl FnOnce() -> Vec<Value> + Send,
    ) -> Result<Value, WorktreeAuthorityError> {
        let worktree = self.catalog.resolve_managed(selector).await?;
        self.terminals
            .sleep_worktree(&worktree.host_id, &worktree.id, agent_rows)
            .await?;
        Ok(json!({ "worktreeId": worktree.id }))
    }

    pub(crate) async fn activate(
        &self,
        selector: &str,
        notify_clients: bool,
    ) -> Result<Value, WorktreeAuthorityError> {
        let worktree = self.catalog.resolve_managed(selector).await?;
        let resumed = self
            .terminals
            .wake_worktree(&worktree.host_id, &worktree.id)
            .await?;
        if notify_clients {
            let host_scope = (worktree.host_id != "local").then_some(worktree.host_id.as_str());
            let worktree_id = worktree.id.clone();
            self.workspace_session
                .mutate(host_scope, move |session| {
                    let Some(session) = session.as_object_mut() else {
                        return ((), false);
                    };
                    let changed = session.get("activeWorktreeId").and_then(Value::as_str)
                        != Some(worktree_id.as_str());
                    if changed {
                        session.insert(
                            "activeWorktreeId".to_owned(),
                            Value::String(worktree_id.clone()),
                        );
                    }
                    ((), changed)
                })
                .await?;
        }
        if notify_clients {
            self.client_events.publish_activate_worktree(
                worktree.repo_id.clone(),
                worktree.id.clone(),
                None,
                None,
                None,
            );
        }
        Ok(json!({
            "repoId": worktree.repo_id,
            "worktreeId": worktree.id,
            "activated": true,
            "sleepingAgentWake": if resumed > 0 { "requested" } else { "not-applicable" }
        }))
    }

    pub(crate) async fn create(
        &self,
        input: &Value,
        mobile: bool,
    ) -> Result<Value, WorktreeAuthorityError> {
        let repo_selector = input
            .get("repo")
            .and_then(Value::as_str)
            .ok_or_else(|| WorktreeAuthorityError::Operation("missing_repo_selector".to_owned()))?;
        let project = self.catalog.project(repo_selector).await?;
        if !matches!(project.kind, crate::projects::ProjectKind::Git) {
            return Err(WorktreeAuthorityError::Operation(
                "Folder mode does not support creating worktrees.".to_owned(),
            ));
        }
        let _mutation = self.catalog.mutation_guard().await;
        let expected_revision = input
            .get("expectedRevision")
            .and_then(Value::as_i64)
            .ok_or_else(|| {
                WorktreeAuthorityError::Operation("missing_expected_revision".to_owned())
            })?;
        let actual_revision = self.journal.revision(project.id.clone()).await?;
        if actual_revision != expected_revision {
            return Err(ProjectCatalogError::RevisionConflict {
                actual_revision,
                expected_revision,
                scope: "worktree",
            }
            .into());
        }
        let parent = if input.get("noParent").and_then(Value::as_bool) == Some(true) {
            None
        } else {
            if let Some(selector) = input
                .get("parentWorktree")
                .or_else(|| input.get("parentWorktreeId"))
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
            {
                Some(self.catalog.resolve_managed(selector).await?)
            } else {
                None
            }
        };
        let host = self
            .catalog
            .execution_host(&project.execution_host_id)
            .await?;
        let filesystem = crate::hosts::HostFilesystem::new(host.clone());
        let repo = self
            .repositories
            .show_on_host(&project.execution_host_id, format!("id:{}", project.id))
            .await
            .map_err(|error| WorktreeAuthorityError::Operation(error.to_string()))?;
        let setup_decision = if input.get("runHooks").and_then(Value::as_bool) == Some(true) {
            repository_hooks::WorktreeSetupDecision::Run
        } else {
            repository_hooks::setup_decision(input.get("setupDecision").and_then(Value::as_str))
                .ok_or_else(|| {
                    WorktreeAuthorityError::Operation("invalid_setup_decision".to_owned())
                })?
        };
        let base = match input.get("baseBranch").and_then(Value::as_str) {
            Some(value) if !value.trim().is_empty() => value.trim().to_owned(),
            _ => {
                let output = self
                    .catalog
                    .git_at(
                        &project.execution_host_id,
                        &project.path,
                        ["symbolic-ref", "--short", "HEAD"],
                    )
                    .await?;
                if output.exit_code != 0 || output.stdout.trim().is_empty() {
                    return Err(WorktreeAuthorityError::Operation(
                        "Could not resolve a default base ref for this repo.".to_owned(),
                    ));
                }
                output.stdout.trim().to_owned()
            }
        };
        reject_git_name(&base)?;
        let branch = input
            .get("branchNameOverride")
            .or_else(|| input.get("name"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| format!("yiru/{}", unix_millis()));
        reject_git_name(&branch)?;
        let branch_check = self
            .catalog
            .git_at(
                &project.execution_host_id,
                &project.path,
                ["check-ref-format", "--branch", branch.as_str()],
            )
            .await?;
        if branch_check.exit_code != 0 {
            return Err(WorktreeAuthorityError::Operation(
                "git_ref_invalid".to_owned(),
            ));
        }
        let root = project
            .worktree_base_path
            .as_deref()
            .map(str::to_owned)
            .unwrap_or_else(|| filesystem.paths().dirname(&project.path));
        let directory_name = input
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| branch.rsplit('/').next().unwrap_or(branch.as_str()));
        if directory_name == "."
            || directory_name == ".."
            || directory_name.contains('/')
            || directory_name.contains('\\')
        {
            return Err(WorktreeAuthorityError::Operation(
                "worktree_name_invalid".to_owned(),
            ));
        }
        let target = filesystem.paths().join(&[root.as_str(), directory_name]);
        if filesystem.exists(&target).await? {
            return Err(WorktreeAuthorityError::Operation(
                "worktree_path_exists".to_owned(),
            ));
        }
        let reuse_branch = super::create_branch::can_reuse(
            &self.catalog,
            &project.execution_host_id,
            &project.path,
            &branch,
            &base,
        )
        .await?;
        let args = if reuse_branch {
            vec!["worktree", "add", target.as_str(), branch.as_str()]
        } else {
            vec![
                "worktree",
                "add",
                "-b",
                branch.as_str(),
                target.as_str(),
                base.as_str(),
            ]
        };
        let output = self
            .catalog
            .git_at(&project.execution_host_id, &project.path, args)
            .await?;
        if output.exit_code != 0 {
            return Err(WorktreeAuthorityError::Operation(command_detail(
                &output.stderr,
                &output.stdout,
                output.exit_code,
            )));
        }
        if let Some(sparse) = input.get("sparseCheckout").and_then(Value::as_object) {
            let directories = sparse
                .get("directories")
                .and_then(Value::as_array)
                .map(|values| {
                    values
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(str::to_owned)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            if directories.is_empty() {
                return Err(WorktreeAuthorityError::Operation(
                    "Sparse checkout requires at least one directory.".to_owned(),
                ));
            }
            let init = self
                .catalog
                .git_at(
                    &project.execution_host_id,
                    &target,
                    ["sparse-checkout", "init", "--cone"],
                )
                .await?;
            if init.exit_code != 0 {
                return Err(WorktreeAuthorityError::Operation(command_detail(
                    &init.stderr,
                    &init.stdout,
                    init.exit_code,
                )));
            }
            let mut sparse_args = vec!["sparse-checkout".to_owned(), "set".to_owned()];
            sparse_args.extend(directories);
            let set = self
                .catalog
                .git_at(&project.execution_host_id, &target, sparse_args)
                .await?;
            if set.exit_code != 0 {
                return Err(WorktreeAuthorityError::Operation(command_detail(
                    &set.stderr,
                    &set.stdout,
                    set.exit_code,
                )));
            }
        }
        let mut warning = None;
        let hooks_plan = match repository_hooks::plan_worktree_create(
            &repo,
            &filesystem,
            &target,
            setup_decision,
        )
        .await
        {
            Ok(plan) => plan,
            Err(repository_hooks::WorktreeHooksPlanError::DecisionRequired) => {
                return Err(WorktreeAuthorityError::Operation(
                    "Setup decision required for this repository".to_owned(),
                ));
            }
            Err(repository_hooks::WorktreeHooksPlanError::Filesystem(error)) => {
                warning = Some(format!("hooks inspection failed: {error}"));
                repository_hooks::WorktreeHooksPlan::empty()
            }
        };
        self.catalog
            .invalidate_project(&project.execution_host_id, &project.id);
        let created = self
            .catalog
            .list_resolved()
            .await?
            .into_iter()
            .find(|worktree| {
                worktree.host_id == project.execution_host_id
                    && worktree.repo_id == project.id
                    && filesystem.paths().equal(&worktree.path, &target)
            })
            .ok_or_else(|| {
                WorktreeAuthorityError::Operation("created_worktree_not_found".to_owned())
            })?;
        let mut metadata = Map::new();
        if reuse_branch {
            metadata.insert("preserveBranchOnDelete".to_owned(), Value::Bool(true));
        }
        let instance_id = crate::terminal_session::random_id()
            .map_err(|error| WorktreeAuthorityError::Operation(error.to_string()))?;
        metadata.insert("instanceId".to_owned(), Value::String(instance_id.clone()));
        for key in [
            "comment",
            "displayName",
            "linkedPR",
            "workspaceStatus",
            "manualOrder",
            "pushTarget",
            "sparseCheckout",
            "pendingFirstAgentMessageRename",
            "createdWithAgent",
        ] {
            if let Some(value) = input.get(key)
                && !value.is_null()
            {
                metadata.insert(key.to_owned(), value.clone());
            }
        }
        if !metadata.contains_key("createdWithAgent")
            && let Some(agent) = input.get("startupAgent").filter(|value| !value.is_null())
        {
            metadata.insert("createdWithAgent".to_owned(), agent.clone());
        }
        let metadata_base_ref = input
            .get("compareBaseRef")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(base.as_str());
        metadata.insert(
            "baseRef".to_owned(),
            Value::String(metadata_base_ref.to_owned()),
        );
        metadata.insert("createdAt".to_owned(), json!(unix_millis()));
        if let Some(parent) = parent
            && let Some(parent_instance_id) =
                parent.metadata.get("instanceId").and_then(Value::as_str)
        {
            metadata.insert(
                "lineage".to_owned(),
                json!({
                    "worktreeId": created.id,
                    "worktreeInstanceId": instance_id,
                    "parentWorktreeId": parent.id,
                    "parentWorktreeInstanceId": parent_instance_id,
                    "origin": "manual",
                    "capture": {"source": "manual-action", "confidence": "explicit"},
                    "createdAt": unix_millis()
                }),
            );
        }
        let created = self.catalog.patch_metadata(&created.id, metadata).await?;
        let event = self
            .journal
            .append(
                project.id.clone(),
                "worktree.created".to_owned(),
                WorkspaceEventPayload::from_iter([(
                    "worktreeId".to_owned(),
                    Value::String(created.id.clone()),
                )]),
            )
            .await?;
        self.client_events
            .publish_worktrees_changed(project.id.clone());
        let mut result = json!({
            "revision": event.revision,
            "worktree": record_value(&created),
        });
        if let Some(warning) = warning {
            append_create_warning(&mut result, warning);
        }
        if !hooks_plan.default_tabs.is_empty()
            && let Some(object) = result.as_object_mut()
        {
            object.insert("defaultTabs".to_owned(), default_tabs_value(&hooks_plan));
        }
        if hooks_plan.run_setup
            && let Err(error) = super::archive::run_effective_setup_hook(
                &filesystem,
                host.as_ref(),
                &created.path,
                &repo,
            )
            .await
        {
            append_create_warning(&mut result, format!("setup hook failed: {error}"));
        }
        let has_startup = input.get("startupAgent").and_then(Value::as_str).is_some()
            || input
                .get("startup")
                .or_else(|| input.get("startupCommand"))
                .is_some_and(|value| !value.is_null());
        if mobile
            && !has_startup
            && let Err(error) = self
                .create_default_tab_terminals(&created, &hooks_plan)
                .await
        {
            append_create_warning(
                &mut result,
                format!("default tab provisioning failed: {error}"),
            );
        }
        if input.get("activate").and_then(Value::as_bool) == Some(true) {
            let _ = self.activate(&created.id, true).await?;
        }
        if let Some(agent) = input.get("startupAgent").and_then(Value::as_str) {
            let prompt = input.get("startupPrompt").and_then(Value::as_str);
            let startup = self
                .terminals
                .agent_startup(&created.id, agent, prompt)
                .await?;
            let terminal = self
                .terminals
                .create(TerminalCreateRequest {
                    activate: input.get("activate").and_then(Value::as_bool) == Some(true),
                    cols: 120,
                    command: Some(startup.command),
                    cwd: None,
                    cwd_fallback: false,
                    env: startup.environment,
                    env_to_delete: Vec::new(),
                    focus: false,
                    launch_agent: Some(agent.to_owned()),
                    launch_config: Some(startup.launch_config),
                    launch_token: None,
                    leaf_id: None,
                    presentation: Some(TerminalPresentation::Visible),
                    rows: 40,
                    startup_command_delivery: startup.startup_command_delivery,
                    renderer_backed: false,
                    tab_id: None,
                    title: Some(agent.to_owned()),
                    split_direction: None,
                    split_from_leaf_id: None,
                    split_telemetry_source: None,
                    worktree: Some(format!("id:{}", created.id)),
                })
                .await?;
            if let Some(object) = result.as_object_mut() {
                object.insert(
                    "agentTerminalHandle".to_owned(),
                    Value::String(terminal.handle.clone()),
                );
                object.insert(
                    "startupTerminal".to_owned(),
                    serde_json::to_value(terminal)
                        .map_err(|error| WorktreeAuthorityError::Operation(error.to_string()))?,
                );
            }
        } else if let Some(startup) = input.get("startup").or_else(|| input.get("startupCommand")) {
            let (command, environment) = if let Some(command) = startup.as_str() {
                (
                    command.to_owned(),
                    startup_environment(input.get("startupEnv")),
                )
            } else {
                let Some(object) = startup.as_object() else {
                    return Err(WorktreeAuthorityError::Operation(
                        "startup_command_invalid".to_owned(),
                    ));
                };
                let command = object
                    .get("command")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|command| !command.is_empty())
                    .ok_or_else(|| {
                        WorktreeAuthorityError::Operation("startup_command_invalid".to_owned())
                    })?
                    .to_owned();
                (command, startup_environment(object.get("env")))
            };
            let terminal = self
                .terminals
                .create(TerminalCreateRequest {
                    activate: input.get("activate").and_then(Value::as_bool) == Some(true),
                    cols: 120,
                    command: Some(command),
                    cwd: None,
                    cwd_fallback: false,
                    env: environment,
                    env_to_delete: Vec::new(),
                    focus: false,
                    launch_agent: None,
                    launch_config: None,
                    launch_token: None,
                    leaf_id: None,
                    presentation: Some(TerminalPresentation::Visible),
                    rows: 40,
                    startup_command_delivery: None,
                    renderer_backed: false,
                    tab_id: None,
                    title: Some("startup".to_owned()),
                    split_direction: None,
                    split_from_leaf_id: None,
                    split_telemetry_source: None,
                    worktree: Some(format!("id:{}", created.id)),
                })
                .await?;
            if let Some(object) = result.as_object_mut() {
                object.insert(
                    "startupTerminal".to_owned(),
                    serde_json::to_value(terminal)
                        .map_err(|error| WorktreeAuthorityError::Operation(error.to_string()))?,
                );
            }
        }
        if mobile
            && has_startup
            && let Err(error) = self
                .create_default_tab_terminals(&created, &hooks_plan)
                .await
        {
            append_create_warning(
                &mut result,
                format!("default tab provisioning failed: {error}"),
            );
        }
        Ok(result)
    }

    async fn create_default_tab_terminals(
        &self,
        worktree: &super::catalog::ResolvedWorktree,
        plan: &repository_hooks::WorktreeHooksPlan,
    ) -> Result<(), WorktreeAuthorityError> {
        for tab in &plan.default_tabs {
            let created = self
                .terminals
                .create(TerminalCreateRequest {
                    activate: false,
                    cols: 120,
                    command: if plan.run_default_tab_commands {
                        tab.command.clone()
                    } else {
                        None
                    },
                    cwd: None,
                    cwd_fallback: false,
                    env: Vec::new(),
                    env_to_delete: Vec::new(),
                    focus: false,
                    launch_agent: None,
                    launch_config: None,
                    launch_token: None,
                    leaf_id: None,
                    presentation: Some(TerminalPresentation::Visible),
                    rows: 40,
                    startup_command_delivery: None,
                    renderer_backed: false,
                    tab_id: None,
                    title: tab.title.clone(),
                    split_direction: None,
                    split_from_leaf_id: None,
                    split_telemetry_source: None,
                    worktree: Some(format!("id:{}", worktree.id)),
                })
                .await?;
            if let Some(color) = &tab.color {
                let host_scope = (worktree.host_id != "local").then_some(worktree.host_id.as_str());
                self.workspace_session
                    .set_tab_color(host_scope, &worktree.id, &created.tab_id, color.clone())
                    .await?;
            }
        }
        Ok(())
    }

    pub(crate) async fn prefetch_create_base(
        &self,
        repo_selector: &str,
        base_branch: Option<&str>,
    ) -> Result<Value, WorktreeAuthorityError> {
        let project = self.catalog.project(repo_selector).await?;
        if !matches!(project.kind, crate::projects::ProjectKind::Git) {
            return Err(WorktreeAuthorityError::Operation(
                "Folder mode does not support creating worktrees.".to_owned(),
            ));
        }
        let branch = base_branch.filter(|value| !value.trim().is_empty());
        if let Some(branch) = branch {
            let mut candidates = vec![branch.trim().to_owned()];
            if !branch.starts_with("refs/") {
                candidates.insert(0, format!("refs/remotes/origin/{}", branch.trim()));
                candidates.push(format!("refs/heads/{}", branch.trim()));
            }
            for candidate in candidates {
                let probe = self
                    .catalog
                    .git_at(
                        &project.execution_host_id,
                        &project.path,
                        ["rev-parse", "--verify", &format!("{candidate}^{{commit}}")],
                    )
                    .await?;
                if probe.exit_code == 0 && !probe.stdout.trim().is_empty() {
                    return Ok(Value::Null);
                }
            }
        }
        let args = branch.map_or_else(
            || vec!["fetch".to_owned(), "--all".to_owned(), "--prune".to_owned()],
            |branch| vec!["fetch".to_owned(), "origin".to_owned(), branch.to_owned()],
        );
        let output = self
            .catalog
            .git_at(&project.execution_host_id, &project.path, args)
            .await?;
        if output.exit_code != 0 {
            return Err(WorktreeAuthorityError::Operation(command_detail(
                &output.stderr,
                &output.stdout,
                output.exit_code,
            )));
        }
        self.catalog
            .invalidate_project(&project.execution_host_id, &project.id);
        Ok(Value::Null)
    }

    pub(crate) async fn resolve_pr_base(
        &self,
        repo_selector: &str,
        pr_number: i64,
        head_ref_name: Option<&str>,
        base_ref_name: Option<&str>,
        cross_repository: bool,
    ) -> Result<Value, WorktreeAuthorityError> {
        let project = self.catalog.project(repo_selector).await?;
        if !matches!(project.kind, crate::projects::ProjectKind::Git) {
            return Ok(json!({ "error": "Folder mode does not support creating worktrees." }));
        }
        let number = pr_number.to_string();
        let output = self
            .catalog
            .git_at(
                &project.execution_host_id,
                &project.path,
                ["fetch", "origin", &format!("refs/pull/{number}/head")],
            )
            .await?;
        if output.exit_code != 0 {
            return Ok(
                json!({ "error": command_detail(&output.stderr, &output.stdout, output.exit_code) }),
            );
        }
        let head = self
            .catalog
            .git_at(
                &project.execution_host_id,
                &project.path,
                ["rev-parse", "--verify", "FETCH_HEAD"],
            )
            .await?;
        if head.exit_code != 0 || head.stdout.trim().is_empty() {
            return Ok(json!({ "error": "Could not resolve pull request head." }));
        }
        let base = base_ref_name.filter(|value| !value.trim().is_empty());
        let head_name = head_ref_name.filter(|value| !value.trim().is_empty());
        if let Some(base) = base {
            let fetched = self
                .catalog
                .git_at(
                    &project.execution_host_id,
                    &project.path,
                    ["fetch", "origin", base.trim()],
                )
                .await?;
            if fetched.exit_code != 0 {
                return Ok(json!({
                    "error": format!(
                        "Failed to fetch origin/{}: {}",
                        base.trim(),
                        command_detail(&fetched.stderr, &fetched.stdout, fetched.exit_code)
                    )
                }));
            }
            self.catalog
                .invalidate_project(&project.execution_host_id, &project.id);
        }
        let mut result = json!({
            "baseBranch": head.stdout.trim(),
            "headSha": head.stdout.trim(),
            "branchNameOverride": head_name,
        });
        if let Some(base) = base
            && let Some(object) = result.as_object_mut()
        {
            object.insert(
                "compareBaseRef".to_owned(),
                Value::String(format!("refs/remotes/origin/{}", base.trim())),
            );
        }
        if !cross_repository
            && let Some(head_name) = head_name
            && let Some(object) = result.as_object_mut()
        {
            object.insert(
                "pushTarget".to_owned(),
                json!({"remoteName":"origin","branchName":head_name.trim()}),
            );
        }
        Ok(result)
    }

    pub(crate) async fn lineage_list(&self) -> Result<Value, WorktreeAuthorityError> {
        let mut lineage = Map::new();
        let mut workspace_lineage = Map::new();
        for worktree in self.catalog.list_resolved().await? {
            if let Some(value) = worktree.metadata.get("lineage")
                && value.is_object()
            {
                lineage.insert(worktree.id.clone(), value.clone());
            }
            if let Some(value) = worktree.metadata.get("workspaceLineage")
                && value.is_object()
            {
                workspace_lineage.insert(worktree.id, value.clone());
            }
        }
        Ok(json!({
            "lineage": lineage,
            "workspaceLineage": workspace_lineage
        }))
    }

    pub(crate) async fn remove(
        &self,
        selector: &str,
        expected_revision: i64,
        force: bool,
        run_hooks: bool,
    ) -> Result<Value, WorktreeAuthorityError> {
        let mut worktree = self.catalog.resolve_for_removal(selector).await?;
        if worktree.is_main_worktree {
            return Err(WorktreeAuthorityError::Operation(
                "Cannot delete the project root workspace.".to_owned(),
            ));
        }
        let _mutation = self.catalog.mutation_guard().await;
        let actual_revision = self.journal.revision(worktree.repo_id.clone()).await?;
        if actual_revision != expected_revision {
            return Err(ProjectCatalogError::RevisionConflict {
                actual_revision,
                expected_revision,
                scope: "worktree",
            }
            .into());
        }
        let mut removed_registration = false;
        if worktree.workspace_kind == "git" {
            let repo = self
                .repositories
                .show_on_host(&worktree.host_id, worktree.repo_id.clone())
                .await
                .map_err(|error| WorktreeAuthorityError::Operation(error.to_string()))?;
            let host = self
                .catalog
                .execution_host(&worktree.host_id)
                .await
                .map_err(WorktreeAuthorityError::Catalog)?;
            let filesystem = crate::hosts::HostFilesystem::new(host.clone());
            let registration =
                super::removal::registration(&self.catalog, &filesystem, &worktree).await?;
            if matches!(registration, super::removal::Registration::Registered(_)) {
                if run_hooks
                    && let Err(error) = super::archive::run_effective_archive_hook(
                        &filesystem,
                        host.as_ref(),
                        &worktree.path,
                        &repo,
                    )
                    .await
                {
                    eprintln!(
                        "[hooks] archive hook failed for {}: {}",
                        worktree.path, error
                    );
                }
                let super::removal::Registration::Registered(refreshed) =
                    super::removal::registration(&self.catalog, &filesystem, &worktree).await?
                else {
                    return Err(WorktreeAuthorityError::Operation(
                        "Worktree registration changed during deletion. Retry deletion.".to_owned(),
                    ));
                };
                worktree.branch = refreshed.branch;
                worktree.head = refreshed.head;
                let shared_links =
                    super::removal::known_links(&filesystem, &worktree, &repo).await?;
                if !force {
                    super::removal::clean(&self.catalog, &worktree, &shared_links).await?;
                }
                self.terminals
                    .stop_in_worktree(&worktree.host_id, &worktree.id)
                    .await?;
                super::removal::unlink(&filesystem, &worktree, &shared_links).await?;
                let args = if force {
                    vec!["worktree", "remove", "--force", worktree.path.as_str()]
                } else {
                    vec!["worktree", "remove", worktree.path.as_str()]
                };
                let output = self.catalog.git(&worktree, args).await?;
                if output.exit_code != 0 {
                    return Err(WorktreeAuthorityError::Operation(command_detail(
                        output.stderr.as_str(),
                        output.stdout.as_str(),
                        output.exit_code,
                    )));
                }
                removed_registration = true;
            } else {
                self.terminals
                    .stop_in_worktree(&worktree.host_id, &worktree.id)
                    .await?;
            }
        } else {
            self.terminals
                .stop_in_worktree(&worktree.host_id, &worktree.id)
                .await?;
        }
        self.terminals
            .forget_worktree_ports(&worktree.host_id, &worktree.id);
        self.catalog.invalidate_worktree(&worktree);
        let branch = (removed_registration
            && worktree
                .metadata
                .get("preserveBranchOnDelete")
                .and_then(Value::as_bool)
                != Some(true)
            && !worktree.branch.is_empty()
            && worktree.branch != "(detached)")
            .then_some(worktree.branch.clone());
        let mut result = Map::new();
        result.insert("removed".to_owned(), Value::Bool(true));
        if let Some(branch) = branch {
            let output = self
                .catalog
                .git(&worktree, ["branch", "-d", "--", branch.as_str()])
                .await?;
            if output.exit_code != 0 {
                lock(&self.preserved_branches).insert(
                    worktree.id.clone(),
                    PreservedBranch {
                        branch_name: branch.clone(),
                        head: worktree.head.clone(),
                        worktree: worktree.clone(),
                    },
                );
                result.insert(
                    "preservedBranch".to_owned(),
                    json!({ "branchName": branch, "head": worktree.head }),
                );
            } else {
                lock(&self.preserved_branches).remove(&worktree.id);
            }
        }
        self.catalog.remove_metadata(&worktree).await?;
        let mut payload = WorkspaceEventPayload::new();
        payload.insert("worktreeId".to_owned(), Value::String(worktree.id.clone()));
        let event = self
            .journal
            .append(
                worktree.repo_id.clone(),
                "worktree.removed".to_owned(),
                payload,
            )
            .await?;
        self.client_events
            .publish_worktrees_changed(worktree.repo_id.clone());
        result.insert("revision".to_owned(), Value::from(event.revision));
        Ok(Value::Object(result))
    }

    pub(crate) async fn force_delete_branch(
        &self,
        selector: &str,
        branch_name: &str,
        expected_head: &str,
    ) -> Result<Value, WorktreeAuthorityError> {
        let worktree_id = selector.strip_prefix("id:").unwrap_or(selector);
        let target = lock(&self.preserved_branches)
            .get(worktree_id)
            .filter(|target| target.branch_name == branch_name && target.head == expected_head)
            .map(|target| (target.branch_name.clone(), target.head.clone()))
            .ok_or_else(|| {
                WorktreeAuthorityError::Operation(format!(
                    "No preserved branch cleanup is pending for \"{branch_name}\"."
                ))
            })?;
        let worktree = lock(&self.preserved_branches)
            .get(worktree_id)
            .map(|target| target.worktree.clone())
            .ok_or(WorktreeCatalogError::NotFound)?;
        let listed = self
            .catalog
            .git(&worktree, ["worktree", "list", "--porcelain"])
            .await?;
        if listed.exit_code == 0
            && listed
                .stdout
                .lines()
                .any(|line| line == format!("branch refs/heads/{}", target.0))
        {
            return Err(WorktreeAuthorityError::Operation(
                "Local branch is checked out in another worktree.".to_owned(),
            ));
        }
        let deleted = self
            .catalog
            .git(
                &worktree,
                [
                    "update-ref",
                    "-d",
                    &format!("refs/heads/{}", target.0),
                    target.1.as_str(),
                ],
            )
            .await?;
        if deleted.exit_code != 0 {
            return Err(WorktreeAuthorityError::Operation(
                "Local branch changed after the workspace was deleted.".to_owned(),
            ));
        }
        self.catalog.invalidate_worktree(&worktree);
        lock(&self.preserved_branches).remove(worktree_id);
        Ok(json!({ "deleted": true }))
    }

    pub(crate) async fn ps(
        &self,
        limit: Option<f64>,
        mobile: bool,
        agent_rows: Vec<Value>,
    ) -> Result<WorktreePsResult, WorktreeAuthorityError> {
        let limit = match limit {
            None => DEFAULT_WORKTREE_PS_LIMIT,
            Some(limit) if limit > 0.0 && limit.fract() == 0.0 && limit <= usize::MAX as f64 => {
                limit as usize
            }
            Some(_) => return Err(WorktreeAuthorityError::InvalidLimit),
        };
        let worktrees = self.catalog.list_resolved().await?;
        let terminal_rows = to_value(self.terminals.list(None, 10_000, false).await?)
            .map_err(|_| WorktreeAuthorityError::Projection)?;
        let mut summaries = build_summaries(
            worktrees,
            &terminal_rows,
            &self.workspace_session.loaded_sessions(),
            mobile,
        );
        super::agent_rows::attach(&mut summaries, agent_rows, unix_millis());
        let total_count = summaries.len();
        summaries.truncate(limit);
        Ok(WorktreePsResult {
            truncated: total_count > summaries.len(),
            total_count,
            worktrees: summaries,
        })
    }

    pub(crate) async fn list(
        &self,
        repo: Option<&str>,
        limit: Option<f64>,
    ) -> Result<Value, WorktreeAuthorityError> {
        let limit = parse_limit(limit)?;
        let mut worktrees = self.catalog.list_resolved().await?;
        if let Some(repo) = repo {
            let repo_id = resolve_repo_id(&worktrees, repo)?;
            worktrees.retain(|worktree| worktree.repo_id == repo_id);
        }
        worktrees.retain(|worktree| worktree.visible);
        let total_count = worktrees.len();
        worktrees.truncate(limit);
        Ok(json!({
            "worktrees": worktrees.iter().map(record_value).collect::<Vec<_>>(),
            "totalCount": total_count,
            "truncated": total_count > worktrees.len(),
        }))
    }

    pub(crate) async fn show(&self, selector: &str) -> Result<Value, WorktreeAuthorityError> {
        let worktree = self.catalog.resolve_managed(selector).await?;
        let revision = self.journal.revision(worktree.repo_id.clone()).await?;
        Ok(json!({ "worktree": record_value(&worktree), "revision": revision }))
    }

    pub(crate) async fn detected_list(
        &self,
        repo_selector: &str,
    ) -> Result<Value, WorktreeAuthorityError> {
        let worktrees = self.catalog.list_resolved().await?;
        let repo_id = resolve_repo_id(&worktrees, repo_selector)?;
        let selected = worktrees
            .iter()
            .filter(|worktree| worktree.repo_id == repo_id)
            .collect::<Vec<_>>();
        let authoritative = selected.iter().all(|worktree| worktree.authoritative);
        let revision = self.journal.revision(repo_id.clone()).await?;
        Ok(json!({
            "repoId": repo_id,
            "revision": revision,
            "authoritative": authoritative,
            "source": if authoritative { "git" } else { "metadata-fallback" },
            "worktrees": selected.into_iter().map(detected_value).collect::<Vec<_>>(),
        }))
    }

    pub(crate) async fn set(
        &self,
        selector: &str,
        expected_revision: i64,
        patch: Map<String, Value>,
    ) -> Result<Value, WorktreeAuthorityError> {
        let current = self.catalog.resolve_managed(selector).await?;
        let _mutation = self.catalog.mutation_guard().await;
        let actual_revision = self.journal.revision(current.repo_id.clone()).await?;
        if actual_revision != expected_revision {
            return Err(ProjectCatalogError::RevisionConflict {
                actual_revision,
                expected_revision,
                scope: "worktree",
            }
            .into());
        }
        let updated = self.catalog.patch_metadata(&current.id, patch).await?;
        self.catalog.invalidate_worktree(&current);
        let mut payload = WorkspaceEventPayload::new();
        payload.insert("worktreeId".to_owned(), Value::String(updated.id.clone()));
        let event = self
            .journal
            .append(
                updated.repo_id.clone(),
                "worktree.updated".to_owned(),
                payload,
            )
            .await?;
        self.client_events
            .publish_worktrees_changed(updated.repo_id.clone());
        Ok(json!({ "worktree": record_value(&updated), "revision": event.revision }))
    }

    pub(crate) async fn persist_sort_order(
        &self,
        ordered_ids: Vec<String>,
    ) -> Result<Value, WorktreeAuthorityError> {
        let updated = self.catalog.reorder(ordered_ids).await?;
        self.client_events.publish_repos_changed();
        Ok(json!({ "updated": updated }))
    }

    pub(crate) async fn branch_rename_failure_output(
        &self,
        selector: &str,
    ) -> Result<Value, WorktreeAuthorityError> {
        self.catalog.resolve_managed(selector).await?;
        Ok(Value::Null)
    }
}

fn append_create_warning(result: &mut Value, warning: String) {
    let Some(object) = result.as_object_mut() else {
        return;
    };
    let warning = match object
        .remove("warning")
        .and_then(|value| value.as_str().map(str::to_owned))
    {
        Some(existing) => format!("{existing} {warning}"),
        None => warning,
    };
    object.insert("warning".to_owned(), Value::String(warning));
}

fn default_tabs_value(plan: &repository_hooks::WorktreeHooksPlan) -> Value {
    let tabs = plan
        .default_tabs
        .iter()
        .map(|tab| {
            let mut value = Map::new();
            if let Some(title) = &tab.title {
                value.insert("title".to_owned(), Value::String(title.clone()));
            }
            if let Some(color) = &tab.color {
                value.insert("color".to_owned(), Value::String(color.clone()));
            }
            if let Some(command) = &tab.command {
                value.insert("command".to_owned(), Value::String(command.clone()));
            }
            Value::Object(value)
        })
        .collect::<Vec<_>>();
    json!({
        "tabs": tabs,
        "runCommands": plan.run_default_tab_commands,
    })
}

fn parse_limit(limit: Option<f64>) -> Result<usize, WorktreeAuthorityError> {
    match limit {
        None => Ok(DEFAULT_WORKTREE_PS_LIMIT),
        Some(limit) if limit > 0.0 && limit.fract() == 0.0 && limit <= usize::MAX as f64 => {
            Ok(limit as usize)
        }
        Some(_) => Err(WorktreeAuthorityError::InvalidLimit),
    }
}

fn resolve_repo_id(
    worktrees: &[super::ResolvedWorktree],
    selector: &str,
) -> Result<String, WorktreeAuthorityError> {
    let selector = selector.strip_prefix("id:").unwrap_or(selector);
    let mut matches = worktrees
        .iter()
        .filter(|worktree| {
            worktree.repo_id == selector
                || worktree.repo_display_name == selector
                || worktree.repo_path == selector
        })
        .map(|worktree| worktree.repo_id.clone())
        .collect::<std::collections::BTreeSet<_>>();
    match matches.len() {
        0 => Err(WorktreeCatalogError::NotFound.into()),
        1 => Ok(matches.pop_first().unwrap_or_default()),
        _ => Err(WorktreeCatalogError::AmbiguousSelector.into()),
    }
}

fn command_detail(stderr: &str, stdout: &str, exit_code: i32) -> String {
    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };
    if detail.is_empty() {
        format!("git exited with status {exit_code}")
    } else {
        detail.to_owned()
    }
}

fn reject_git_name(value: &str) -> Result<(), WorktreeAuthorityError> {
    let value = value.trim();
    if value.is_empty() || value.starts_with('-') || value.chars().any(char::is_control) {
        return Err(WorktreeAuthorityError::Operation(
            "git_ref_invalid".to_owned(),
        ));
    }
    Ok(())
}

fn parse_base_counts(output: &str) -> (&'static str, Option<u64>) {
    let mut counts = output
        .split_whitespace()
        .filter_map(|value| value.parse::<u64>().ok());
    let behind = counts.next();
    let ahead = counts.next();
    match (behind, ahead) {
        (Some(behind), Some(_)) if behind == 0 => ("current", Some(behind)),
        (Some(behind), Some(_)) => ("drift", Some(behind)),
        _ => ("unknown", None),
    }
}

fn startup_environment(value: Option<&Value>) -> Vec<(String, String)> {
    value
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(|object| object.iter())
        .filter_map(|(name, value)| value.as_str().map(|value| (name.clone(), value.to_owned())))
        .collect()
}

fn unix_millis() -> i64 {
    i64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |duration| duration.as_millis()),
    )
    .unwrap_or(i64::MAX)
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
