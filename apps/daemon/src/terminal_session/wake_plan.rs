use super::{TerminalSessionError, identity};
use serde_json::Value;

pub(super) struct WakePane {
    pub(super) tab_id: String,
    pub(super) leaf_id: String,
    pub(super) title: Option<String>,
    pub(super) cwd: Option<String>,
    pub(super) agent: Option<String>,
    pub(super) record: Option<Value>,
    pub(super) buffer: Option<String>,
}

pub(super) fn panes(
    session: &Value,
    worktree_id: &str,
) -> Result<Vec<WakePane>, TerminalSessionError> {
    let mut result = Vec::new();
    let tabs = session
        .get("tabsByWorktree")
        .and_then(|tabs| tabs.get(worktree_id))
        .and_then(Value::as_array);
    for tab in tabs.into_iter().flatten() {
        let Some(tab_id) = tab
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| identity::is_uuid(id))
        else {
            continue;
        };
        let Some(layout) = session
            .get("terminalLayoutsByTabId")
            .and_then(|layouts| layouts.get(tab_id))
        else {
            continue;
        };
        let mut remaining = layout.get("root").into_iter().collect::<Vec<_>>();
        while let Some(node) = remaining.pop() {
            if node.get("type").and_then(Value::as_str) == Some("split") {
                remaining.extend(node.get("second"));
                remaining.extend(node.get("first"));
                continue;
            }
            let Some(leaf_id) = node
                .get("leafId")
                .and_then(Value::as_str)
                .filter(|id| identity::is_uuid(id))
            else {
                continue;
            };
            // Why: an unspawned tab may carry a queued setup command owned by its creator.
            if layout
                .get("ptyIdsByLeafId")
                .and_then(|ids| ids.get(leaf_id))
                .and_then(Value::as_str)
                .is_none()
            {
                continue;
            }
            let pane_key = format!("{tab_id}:{leaf_id}");
            let record = session
                .get("sleepingAgentSessionsByPaneKey")
                .and_then(|records| records.get(&pane_key))
                .cloned();
            if record.as_ref().is_some_and(|record| {
                record.get("worktreeId").and_then(Value::as_str) != Some(worktree_id)
            }) {
                return Err(TerminalSessionError::InvalidInput(
                    "sleeping agent belongs to another worktree",
                ));
            }
            result.push(WakePane {
                tab_id: tab_id.to_owned(),
                leaf_id: leaf_id.to_owned(),
                title: tab
                    .get("customTitle")
                    .or_else(|| tab.get("title"))
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                cwd: tab
                    .get("startupCwd")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                agent: tab
                    .get("launchAgent")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                record,
                buffer: layout
                    .get("buffersByLeafId")
                    .and_then(|buffers| buffers.get(leaf_id))
                    .and_then(Value::as_str)
                    .map(str::to_owned),
            });
        }
    }
    Ok(result)
}

pub(super) fn resume_arguments(
    agent: &str,
    provider: &Value,
    omp_path: Option<&str>,
) -> Result<Vec<String>, TerminalSessionError> {
    if !super::sleep_records::resumable(agent, provider) {
        return Err(TerminalSessionError::InvalidInput(
            "agent session resume identity is unavailable",
        ));
    }
    let id =
        provider
            .get("id")
            .and_then(Value::as_str)
            .ok_or(TerminalSessionError::InvalidInput(
                "missing agent session id",
            ))?;
    let args: Vec<&str> = match agent {
        "claude" | "gemini" | "droid" | "grok" | "devin" => vec!["--resume", id],
        "codex" => vec!["resume", id],
        "antigravity" => vec!["--conversation", id],
        "opencode" | "mimo-code" => vec!["--session", id],
        "pi" => vec![
            "--session",
            provider
                .get("transcriptPath")
                .and_then(Value::as_str)
                .ok_or(TerminalSessionError::InvalidInput(
                    "missing agent transcript path",
                ))?,
        ],
        "omp" => vec![
            "--resume",
            omp_path
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .unwrap_or(id),
        ],
        _ => {
            return Err(TerminalSessionError::InvalidInput(
                "unsupported agent resume",
            ));
        }
    };
    Ok(args.into_iter().map(str::to_owned).collect())
}
