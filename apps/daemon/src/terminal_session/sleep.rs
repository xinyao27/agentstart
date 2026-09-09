use super::{TerminalSessionAuthority, TerminalSessionError, sleep_records};
use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

impl TerminalSessionAuthority {
    pub(crate) async fn sleep_worktree(
        &self,
        host_id: &str,
        worktree_id: &str,
        read_rows: impl FnOnce() -> Vec<Value> + Send,
    ) -> Result<(), TerminalSessionError> {
        let host_scope = (host_id != "local").then_some(host_id);
        let _guard = self.worktree_gate.acquire(host_scope, worktree_id).await;
        let targets = self.state.active_targets(host_scope, worktree_id);
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
            .min(i64::MAX as u128) as i64;
        let rows: HashMap<_, _> = read_rows()
            .into_iter()
            .filter_map(|row| Some((row.get("handle")?.as_str()?.to_owned(), row)))
            .collect();
        // Why: the durable scrollback must predate any irreversible process stop.
        for (handle, _) in &targets {
            self.save_sleep_scrollback(handle).await?;
        }
        let mut checkpoints = Map::new();
        let mut target_panes = HashMap::new();
        for (handle, _) in &targets {
            if let Some((pane, record)) = self.state.with(handle, |terminal| {
                let pane = format!("{}:{}", terminal.tab_id, terminal.leaf_id);
                let record = rows.get(handle).and_then(|row| {
                    sleep_records::checkpoint(row, terminal.launch_config.as_ref(), now)
                });
                (pane, record)
            }) {
                target_panes.insert(handle.clone(), pane.clone());
                if let Some(record) = record {
                    checkpoints.insert(pane, record);
                }
            }
        }
        let live_panes: HashSet<_> = target_panes.values().cloned().collect();
        let worktree = worktree_id.to_owned();
        self.workspace_session
            .mutate(host_scope, move |session| {
                let Some(session) = session.as_object_mut() else {
                    return ((), false);
                };
                let records = session
                    .entry("sleepingAgentSessionsByPaneKey")
                    .or_insert_with(|| json!({}));
                if let Some(records) = records.as_object_mut() {
                    // Why: current binding identity supersedes stale checkpoints from an earlier process.
                    records.retain(|pane, _| !live_panes.contains(pane));
                    records.extend(checkpoints);
                }
                if session.get("activeWorktreeId").and_then(Value::as_str)
                    == Some(worktree.as_str())
                {
                    session.insert("activeWorktreeId".to_owned(), Value::Null);
                }
                ((), true)
            })
            .await?;
        // Why: no process is stopped until its existing recovery document is durable.
        self.workspace_session.flush().await?;
        let mut failure = None;
        let mut stopped_panes = HashSet::new();
        for (handle, _) in targets {
            match self.close(&handle).await {
                Ok(_) if self.state.is_live(&handle) == Some(false) => {
                    if let Some(pane) = target_panes.remove(&handle) {
                        stopped_panes.insert(pane);
                    }
                }
                Ok(_) => {
                    failure.get_or_insert(TerminalSessionError::WaitTimeout);
                }
                Err(error) => {
                    failure.get_or_insert(error);
                }
            }
        }
        if !stopped_panes.is_empty() {
            self.workspace_session
                .mutate(host_scope, move |session| {
                    let Some(records) = session
                        .get_mut("sleepingAgentSessionsByPaneKey")
                        .and_then(Value::as_object_mut)
                    else {
                        return ((), false);
                    };
                    let mut changed = false;
                    for pane in stopped_panes {
                        if let Some(record) = records.get_mut(&pane) {
                            record["origin"] = json!("worktree-sleep");
                            changed = true;
                        }
                    }
                    ((), changed)
                })
                .await?;
            self.workspace_session.flush().await?;
        }
        failure.map_or(Ok(()), Err)
    }
    async fn save_sleep_scrollback(&self, handle: &str) -> Result<(), TerminalSessionError> {
        let (host_id, tab_id, leaf_id, provider) = self
            .state
            .with(handle, |record| {
                (
                    record.host_id.clone(),
                    record.tab_id.clone(),
                    record.leaf_id.clone(),
                    record.snapshot_provider.clone(),
                )
            })
            .ok_or(TerminalSessionError::NotFound)?;
        let buffer = provider.plain_history().await.ok_or_else(|| {
            TerminalSessionError::Process("could not read terminal sleep history".to_owned())
        })?;
        if buffer.is_empty() {
            return Ok(());
        }
        let snapshots = self.snapshots.clone();
        let snapshot_tab = tab_id.clone();
        let snapshot_leaf = leaf_id.clone();
        let reference = tokio::task::spawn_blocking(move || {
            snapshots.store_blocking(&snapshot_tab, &snapshot_leaf, &buffer)
        })
        .await?
        .ok_or(TerminalSessionError::Process(
            "could not persist terminal sleep scrollback".to_owned(),
        ))?;
        self.workspace_session
            .bind_pty_scrollback(crate::workspace_session::PtyScrollback {
                host_id,
                tab_id,
                leaf_id,
                reference,
            })
            .await?;
        Ok(())
    }
}
