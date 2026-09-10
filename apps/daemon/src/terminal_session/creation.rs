use serde_json::{Map, Value};
use tokio::sync::{broadcast, watch};

use crate::hosts::HostPlatform;
use crate::workspace_session::PtyBinding;

use super::authority::TerminalSessionAuthority;
use super::model::{
    TerminalCreateRequest, TerminalCreateResult, TerminalPresentation, TerminalRestore,
    TerminalStartupCwdFallback,
};
use super::path_provenance::TerminalPathProvenance;
use super::state::TerminalRecord;
use super::{TerminalSessionError, identity, launch, process, query, reveal, scope};

impl TerminalSessionAuthority {
    pub(crate) async fn create(
        &self,
        request: TerminalCreateRequest,
    ) -> Result<TerminalCreateResult, TerminalSessionError> {
        let mut attributes = Map::new();
        attributes.insert("cols".to_owned(), Value::from(request.cols));
        attributes.insert("rows".to_owned(), Value::from(request.rows));
        attributes.insert(
            "has_agent".to_owned(),
            Value::Bool(request.launch_agent.is_some() || request.launch_config.is_some()),
        );
        let mut trace = self.start_trace_span("terminal.session.create", attributes);
        let result = self.create_inner(request, true, None).await;
        match &result {
            Ok(created) => {
                trace.set_attribute("is_reattach", Value::Bool(created.is_reattach));
                trace.success();
            }
            Err(_) => trace.failure("terminal creation failed"),
        }
        result
    }

    pub(super) async fn create_while_worktree_locked(
        &self,
        request: TerminalCreateRequest,
        _guard: &tokio::sync::OwnedMutexGuard<()>,
        restore_buffer: Option<String>,
    ) -> Result<TerminalCreateResult, TerminalSessionError> {
        self.create_inner(request, false, restore_buffer).await
    }

    async fn create_inner(
        &self,
        mut request: TerminalCreateRequest,
        serialize: bool,
        restore_buffer: Option<String>,
    ) -> Result<TerminalCreateResult, TerminalSessionError> {
        let selector = match request.worktree.as_deref() {
            Some(selector) => selector.to_owned(),
            None => self.workspace_session.active_worktree(None).await?.ok_or(
                TerminalSessionError::InvalidInput("missing active worktree"),
            )?,
        };
        let scope = scope::resolve(&selector, &self.worktrees, &self.hosts).await?;
        let worktree_guard = if serialize {
            Some(
                self.worktree_gate
                    .acquire(scope.host_id.as_deref(), &scope.worktree_id)
                    .await,
            )
        } else {
            None
        };
        if request.launch_agent.as_deref() == Some("codex") {
            let home = self
                .codex_runtime
                .prepare_for_launch(query::codex_target(scope.host.kind(), scope.host.target()))
                .await
                .map_err(|error| TerminalSessionError::LaunchPreparation(error.to_string()))?;
            query::apply_codex_home(&mut request.env, home.as_ref());
            if let Some(config) = request.launch_config.as_mut() {
                query::apply_codex_home(&mut config.agent_env, home.as_ref());
            }
        }
        let cwd = scope::resolve_cwd(
            scope.host.clone(),
            &scope.path,
            request.cwd.take(),
            request.cwd_fallback,
        )
        .await?;
        let tab_id = match request.tab_id.as_deref() {
            Some(id) if identity::is_uuid(id) => id.to_owned(),
            Some(_) => return Err(TerminalSessionError::InvalidInput("invalid tab id")),
            None => identity::random_id()?,
        };
        let leaf_id = match request.leaf_id.as_deref() {
            Some(id) if identity::is_uuid(id) => id.to_owned(),
            Some(_) => return Err(TerminalSessionError::InvalidInput("invalid leaf id")),
            None => identity::random_id()?,
        };
        if let Some(existing) = self.state.reattach(
            scope.host_id.as_deref(),
            &scope.worktree_id,
            &tab_id,
            &leaf_id,
        ) {
            self.workspace_ports
                .bind_pty(scope.host.id(), &existing.pty_id, &existing.worktree_id)
                .await;
            drop(worktree_guard);
            let reveal = reveal::terminal(
                &self.shells,
                &request,
                reveal::TerminalReveal {
                    cwd: (existing.cwd != existing.worktree_path).then_some(existing.cwd),
                    handle: &existing.handle,
                    leaf_id: &existing.leaf_id,
                    pty_id: &existing.pty_id,
                    tab_id: &existing.tab_id,
                    title: existing.title.as_deref(),
                    worktree_id: &existing.worktree_id,
                },
            )
            .await;
            let warning = reveal.warning(&existing.handle);
            return Ok(TerminalCreateResult {
                handle: existing.handle,
                is_reattach: true,
                pane_key: format!("{}:{}", existing.tab_id, existing.leaf_id),
                pty_id: existing.pty_id,
                restore: TerminalRestore {
                    is_alternate_screen: false,
                    kind: "none",
                    startup_cwd_fallback: None,
                },
                session_expired: false,
                surface: if reveal.is_visible() {
                    "visible"
                } else {
                    "background"
                },
                tab_id: existing.tab_id,
                title: existing.title,
                transport_generation: existing.transport_generation,
                warning,
                worktree_id: existing.worktree_id,
            });
        }
        let handle = identity::random_id()?;
        let transport_generation = identity::random_id()?;
        if request.launch_config.is_some() && request.launch_token.is_none() {
            request.launch_token = Some(identity::random_id()?);
        }
        let title = request.title.clone();
        let terminal_cwd = cwd.path.clone();
        let host_id = scope.host_id.clone();
        let startup_cwd = (cwd.path != scope.path).then(|| cwd.path.clone());
        request.env.retain(|(name, _)| !is_runtime_env(name));
        request
            .env
            .extend(runtime_env(&request, &tab_id, &leaf_id, &scope.worktree_id));
        let hook_environment = self
            .agent_hook_environment
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone();
        request.env_to_delete.retain(|name| !is_hook_env(name));
        // Why: missing authority values must also clear inherited daemon env,
        // while caller deletions must not remove the current hook credentials.
        for name in HOOK_ENV_KEYS {
            if !hook_environment.iter().any(|(key, _)| key == name) {
                request.env_to_delete.push(name.to_owned());
            }
        }
        request.env.extend(hook_environment);
        let windows_shell = self
            .settings
            .agent_launch_settings(request.launch_agent.as_deref().unwrap_or_default())
            .terminal_windows_shell;
        let launch = launch::build(
            scope.host.as_ref(),
            &request,
            cwd.path,
            windows_shell.as_deref(),
        );
        let mut spawned =
            process::spawn(launch, request.cols, request.rows, self.events.clone()).await?;
        let mut tail = super::tail::TerminalTail::new();
        if let Some(buffer) = restore_buffer {
            // Why: persisted scrollback is visible text, never terminal input or replayed attention.
            let history = format!("{}\n", super::tail_control::plain_text(&buffer));
            tail.append(&history);
            spawned.start.release_model();
            if !spawned.snapshot_provider.restore(history).await {
                spawned.start.release();
                let _ = spawned.control.kill().await;
                return Err(TerminalSessionError::Process(
                    "terminal history restore failed".to_owned(),
                ));
            }
        }
        let (exit, _) = watch::channel(None);
        let (stream_events, _) = broadcast::channel(256);
        let pty_id = spawned.pty_id.clone();
        self.state.insert(TerminalRecord {
            branch: scope.branch,
            cols: request.cols,
            control: Some(spawned.control),
            created_at: epoch_millis(),
            cwd: terminal_cwd.clone(),
            exit,
            handle: handle.clone(),
            host_id: host_id.clone(),
            input_reservation: None,
            input_revision: 0,
            last_output_at: None,
            has_agent: request.launch_agent.is_some() || request.launch_config.is_some(),
            launch_agent: request.launch_agent.clone(),
            launch_token: request.launch_token.clone(),
            launch_config: request.launch_config.clone(),
            restored_checkpoint: None,
            leaf_id: leaf_id.clone(),
            pending_utf8: Vec::new(),
            path_provenance: TerminalPathProvenance::new(
                scope.host.platform() == HostPlatform::Windows || is_windows_path(&scope.path),
            ),
            process_exit_code: None,
            pty_id: pty_id.clone(),
            reader_finished: false,
            final_history: None,
            raw_output: std::collections::VecDeque::new(),
            raw_output_bytes: 0,
            rows: request.rows,
            sequence: 0,
            snapshot_provider: spawned.snapshot_provider,
            tail,
            tab_id: tab_id.clone(),
            title: title.clone(),
            transport_generation: transport_generation.clone(),
            stream_events,
            side_effects: super::side_effects::SideEffectObserver::new(
                title.as_deref(),
                request.command.as_deref(),
            ),
            agent_status: None,
            driver: super::state::TerminalDriver::Idle,
            display_mode: super::state::TerminalDisplayMode::Auto,
            desktop_viewport_owner: None,
            viewport_owner: None,
            viewport_revision: 0,
            viewer_activity: 0,
            viewers: std::collections::HashMap::new(),
            query_reply_client: None,
            worktree_id: scope.worktree_id.clone(),
            worktree_path: scope.path.clone(),
        });
        let start = spawned.start;
        if let Err(error) = self
            .workspace_session
            .bind_pty(PtyBinding {
                activate: is_focused(request.presentation, request.focus, request.activate),
                host_id,
                leaf_id: leaf_id.clone(),
                launch_agent: request.launch_agent.clone(),
                pty_id: pty_id.clone(),
                split_direction: request.split_direction,
                split_from_leaf_id: request.split_from_leaf_id.clone(),
                startup_cwd,
                tab_id: tab_id.clone(),
                title: title.clone(),
                worktree_id: scope.worktree_id.clone(),
            })
            .await
        {
            start.release();
            let _ = self.close(&handle).await;
            return Err(error.into());
        }
        self.workspace_ports
            .bind_pty(scope.host.id(), &pty_id, &scope.worktree_id)
            .await;
        self.revision
            .send_modify(|value| *value = value.saturating_add(1));
        start.release();
        drop(worktree_guard);
        let reveal = reveal::terminal(
            &self.shells,
            &request,
            reveal::TerminalReveal {
                cwd: (terminal_cwd != scope.path).then_some(terminal_cwd),
                handle: &handle,
                leaf_id: &leaf_id,
                pty_id: &pty_id,
                tab_id: &tab_id,
                title: title.as_deref(),
                worktree_id: &scope.worktree_id,
            },
        )
        .await;
        let warning = reveal.warning(&handle);
        Ok(TerminalCreateResult {
            handle,
            is_reattach: false,
            pane_key: format!("{tab_id}:{leaf_id}"),
            pty_id,
            restore: TerminalRestore {
                is_alternate_screen: false,
                kind: "none",
                startup_cwd_fallback: cwd.fallback.map(|cwd| TerminalStartupCwdFallback {
                    cwd,
                    kind: "worktree",
                }),
            },
            session_expired: false,
            surface: if reveal.is_visible() {
                "visible"
            } else {
                "background"
            },
            tab_id,
            title,
            transport_generation,
            warning,
            worktree_id: scope.worktree_id,
        })
    }
}

fn epoch_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

fn runtime_env(
    request: &TerminalCreateRequest,
    tab_id: &str,
    leaf_id: &str,
    worktree_id: &str,
) -> Vec<(String, String)> {
    let mut env = vec![
        (
            "AGENTSTART_PANE_KEY".to_owned(),
            format!("{tab_id}:{leaf_id}"),
        ),
        ("AGENTSTART_TAB_ID".to_owned(), tab_id.to_owned()),
        ("AGENTSTART_WORKTREE_ID".to_owned(), worktree_id.to_owned()),
    ];
    if let Some(token) = &request.launch_token {
        env.push(("AGENTSTART_AGENT_LAUNCH_TOKEN".to_owned(), token.clone()));
    }
    env
}

const HOOK_ENV_KEYS: [&str; 5] = [
    "AGENTSTART_AGENT_HOOK_PORT",
    "AGENTSTART_AGENT_HOOK_TOKEN",
    "AGENTSTART_AGENT_HOOK_ENV",
    "AGENTSTART_AGENT_HOOK_VERSION",
    "AGENTSTART_AGENT_HOOK_ENDPOINT",
];

fn is_hook_env(name: &str) -> bool {
    HOOK_ENV_KEYS.iter().any(|key| {
        if cfg!(windows) {
            name.eq_ignore_ascii_case(key)
        } else {
            name == *key
        }
    })
}

fn is_runtime_env(name: &str) -> bool {
    is_hook_env(name)
        || matches!(
            name,
            "AGENTSTART_AGENT_LAUNCH_TOKEN"
                | "AGENTSTART_PANE_KEY"
                | "AGENTSTART_TAB_ID"
                | "AGENTSTART_WORKTREE_ID"
        )
}

fn is_focused(presentation: Option<TerminalPresentation>, focus: bool, activate: bool) -> bool {
    presentation == Some(TerminalPresentation::Focused)
        || (presentation.is_none() && (focus || activate))
}

fn is_windows_path(path: &str) -> bool {
    path.as_bytes().get(0..3).is_some_and(|bytes| {
        bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && matches!(bytes[2], b'/' | b'\\')
    }) || path.starts_with("\\\\")
}
