use std::collections::HashSet;

use serde_json::{Value, json};

use super::model::{
    TerminalFocusResult, TerminalManagementKillResult, TerminalRenameResult, TerminalSplitResult,
    TerminalStopExactResult,
};
use super::{TerminalSessionAuthority, TerminalSessionError, scope};

impl TerminalSessionAuthority {
    pub(crate) async fn kill_one(&self, session_id: &str) -> Result<bool, TerminalSessionError> {
        let Some(handle) = self.state.handle_for_pty(session_id) else {
            return Ok(false);
        };
        self.close(&handle).await
    }

    pub(crate) async fn kill_all(
        &self,
    ) -> Result<TerminalManagementKillResult, TerminalSessionError> {
        let initial = self
            .state
            .summaries()
            .into_iter()
            .filter(|(summary, _)| summary.connected)
            .map(|(summary, _)| (summary.handle, summary.pty_id.unwrap_or_default()))
            .collect::<Vec<_>>();
        let mut killed_session_ids = Vec::new();
        for (handle, session_id) in initial.iter().cloned() {
            if self.close(&handle).await? {
                killed_session_ids.push(session_id);
            }
        }
        let remaining = self
            .state
            .summaries()
            .into_iter()
            .filter(|(summary, _)| summary.connected)
            .count();
        Ok(TerminalManagementKillResult {
            killed_count: killed_session_ids.len(),
            killed_session_ids,
            remaining_count: remaining,
        })
    }

    pub(crate) async fn rename(
        &self,
        handle: &str,
        title: Option<String>,
    ) -> Result<TerminalRenameResult, TerminalSessionError> {
        let (tab_id, worktree_id, host_id, leaf_id) = self
            .state
            .with_mut(handle, |record| {
                record.title = title.clone();
                (
                    record.tab_id.clone(),
                    record.worktree_id.clone(),
                    record.host_id.clone(),
                    record.leaf_id.clone(),
                )
            })
            .ok_or(TerminalSessionError::NotFound)?;
        let tab_for_mutation = tab_id.clone();
        let leaf_for_mutation = leaf_id.clone();
        let title_for_mutation = title.clone();
        self.workspace_session
            .mutate(host_id.as_deref(), move |session| {
                let mut changed = false;
                if let Some(tab) = session
                    .get_mut("tabsByWorktree")
                    .and_then(Value::as_object_mut)
                    .and_then(|tabs| tabs.get_mut(&worktree_id))
                    .and_then(Value::as_array_mut)
                    .into_iter()
                    .flatten()
                    .find_map(|tab| {
                        let tab = tab.as_object_mut()?;
                        (tab.get("id").and_then(Value::as_str) == Some(tab_for_mutation.as_str()))
                            .then_some(tab)
                    })
                {
                    let next = title_for_mutation
                        .clone()
                        .map_or(Value::Null, Value::String);
                    if tab.get("customTitle") != Some(&next) || tab.get("title") != Some(&next) {
                        tab.insert("customTitle".to_owned(), next.clone());
                        tab.insert("title".to_owned(), next);
                        changed = true;
                    }
                }
                if let Some(layout) = session
                    .get_mut("terminalLayoutsByTabId")
                    .and_then(Value::as_object_mut)
                    .and_then(|layouts| layouts.get_mut(&tab_for_mutation))
                    .and_then(Value::as_object_mut)
                    .and_then(|layout| layout.get_mut("titlesByLeafId"))
                    .and_then(Value::as_object_mut)
                {
                    let next = title_for_mutation
                        .clone()
                        .map_or(Value::Null, Value::String);
                    if layout.get(&leaf_for_mutation) != Some(&next) {
                        layout.insert(leaf_for_mutation, next);
                        changed = true;
                    }
                }
                ((), changed)
            })
            .await?;
        Ok(TerminalRenameResult {
            handle: handle.to_owned(),
            tab_id,
            title,
        })
    }

    pub(crate) async fn focus(
        &self,
        handle: &str,
    ) -> Result<TerminalFocusResult, TerminalSessionError> {
        let (tab_id, worktree_id, leaf_id, pty_id, title) = self
            .state
            .with(handle, |record| {
                (
                    record.tab_id.clone(),
                    record.worktree_id.clone(),
                    record.leaf_id.clone(),
                    record.pty_id.clone(),
                    record.title.clone(),
                )
            })
            .ok_or(TerminalSessionError::NotFound)?;
        let _ = self
            .shells
            .request_web(
                None,
                "/terminal/reveal",
                json!({
                    "worktreeId": worktree_id,
                    "ptyId": format!("runtime:{handle}"),
                    "durablePtyId": pty_id,
                    "title": title,
                    "activate": true,
                    "tabId": tab_id,
                    "leafId": leaf_id,
                    "source": "runtime-session"
                }),
            )
            .await;
        Ok(TerminalFocusResult {
            handle: handle.to_owned(),
            tab_id,
            worktree_id,
        })
    }

    pub(crate) async fn split(
        &self,
        handle: &str,
        direction: &'static str,
        command: Option<String>,
        env: Vec<(String, String)>,
        telemetry_source: Option<String>,
    ) -> Result<TerminalSplitResult, TerminalSessionError> {
        let (tab_id, worktree_id, leaf_id, cols, rows) = self
            .state
            .with(handle, |record| {
                (
                    record.tab_id.clone(),
                    record.worktree_id.clone(),
                    record.leaf_id.clone(),
                    record.cols,
                    record.rows,
                )
            })
            .ok_or(TerminalSessionError::NotFound)?;
        let created = self
            .create(super::model::TerminalCreateRequest {
                activate: true,
                cols,
                command,
                cwd: None,
                cwd_fallback: false,
                env,
                env_to_delete: Vec::new(),
                focus: true,
                launch_agent: None,
                launch_config: None,
                launch_token: None,
                leaf_id: None,
                presentation: Some(super::model::TerminalPresentation::Focused),
                rows,
                split_direction: Some(direction),
                split_from_leaf_id: Some(leaf_id),
                split_telemetry_source: telemetry_source,
                startup_command_delivery: None,
                renderer_backed: false,
                tab_id: Some(tab_id.clone()),
                title: None,
                worktree: Some(format!("id:{worktree_id}")),
            })
            .await?;
        Ok(TerminalSplitResult {
            handle: created.handle,
            pane_runtime_id: -1,
            tab_id,
        })
    }

    pub(crate) async fn stop(&self, selector: &str) -> Result<usize, TerminalSessionError> {
        let scope = scope::resolve(selector, &self.worktrees, &self.hosts).await?;
        self.stop_in_worktree(
            scope.host_id.as_deref().unwrap_or("local"),
            &scope.worktree_id,
        )
        .await
    }

    pub(crate) async fn stop_in_worktree(
        &self,
        host_id: &str,
        worktree_id: &str,
    ) -> Result<usize, TerminalSessionError> {
        let targets = self
            .state
            .active_targets((host_id != "local").then_some(host_id), worktree_id);
        let mut tasks = tokio::task::JoinSet::new();
        for (handle, _) in targets {
            let authority = self.clone();
            tasks.spawn(async move { authority.close(&handle).await });
        }
        let mut stopped = 0;
        while let Some(result) = tasks.join_next().await {
            if result?? {
                stopped += 1;
            }
        }
        Ok(stopped)
    }

    pub(crate) async fn forget_worktree(
        &self,
        host_id: &str,
        worktree_id: &str,
    ) -> Result<(), TerminalSessionError> {
        let host_scope = (host_id != "local").then_some(host_id);
        self.workspace_session
            .prune_worktree_owner(worktree_id, host_scope)
            .await?;
        for handle in self.state.remove_worktree(host_scope, worktree_id) {
            self.auto_restore_fit.cancel(&handle);
        }
        self.forget_worktree_ports(host_id, worktree_id);
        Ok(())
    }

    pub(crate) async fn stop_exact(
        &self,
        selector: &str,
        expected_pty_ids: Vec<String>,
        target_only: bool,
    ) -> Result<TerminalStopExactResult, TerminalSessionError> {
        let expected = expected_pty_ids.into_iter().collect::<HashSet<_>>();
        if expected.len() != 1 || expected.contains("") {
            return Err(TerminalSessionError::InvalidInput(
                "terminal exact stop requires one PTY",
            ));
        }
        let scope = scope::resolve(selector, &self.worktrees, &self.hosts).await?;
        let live_targets = self
            .state
            .active_targets(scope.host_id.as_deref(), &scope.worktree_id);
        let live = live_targets
            .iter()
            .map(|(_, pty_id)| pty_id.clone())
            .collect::<HashSet<_>>();
        let expected_is_live = expected.is_subset(&live);
        if !expected_is_live || (!target_only && expected != live) {
            return Err(TerminalSessionError::InvalidInput(
                "terminal stop PTY set mismatch",
            ));
        }
        let mut stopped_pty_ids = Vec::new();
        for (handle, pty_id) in live_targets {
            if expected.contains(&pty_id) && self.close(&handle).await? {
                stopped_pty_ids.push(pty_id);
            }
        }
        stopped_pty_ids.sort_unstable();
        let remaining = self
            .state
            .active_targets(scope.host_id.as_deref(), &scope.worktree_id)
            .into_iter()
            .map(|(_, pty_id)| pty_id)
            .collect::<HashSet<_>>();
        let target_still_live = expected.iter().any(|pty_id| remaining.contains(pty_id));
        let verified = if target_only {
            !target_still_live
        } else {
            remaining.is_empty()
        };
        let mut live_pty_ids = live.into_iter().collect::<Vec<_>>();
        live_pty_ids.sort_unstable();
        let mut remaining_live_pty_ids = remaining.into_iter().collect::<Vec<_>>();
        remaining_live_pty_ids.sort_unstable();
        Ok(TerminalStopExactResult {
            live_pty_ids,
            post_stop_verified: verified,
            post_stop_failure: (!verified).then_some("terminal_exact_stop_still_live"),
            remaining_live_pty_ids,
            stopped: stopped_pty_ids.len(),
            stopped_pty_ids,
        })
    }
}
