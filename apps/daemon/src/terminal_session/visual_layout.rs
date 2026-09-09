use std::collections::HashMap;

use serde_json::{Map, Value, json};

use super::model::TerminalSummary;

pub(super) fn build(
    records: &[(TerminalSummary, Option<String>)],
    sessions: &[(Option<String>, Value)],
) -> Vec<Value> {
    let summaries = records
        .iter()
        .map(|(summary, host)| {
            (
                (
                    host.clone(),
                    summary.tab_id.clone(),
                    summary.leaf_id.clone(),
                ),
                summary,
            )
        })
        .collect::<HashMap<_, _>>();
    let mut layouts = Vec::new();
    for (host, session) in sessions {
        let Some(tabs_by_worktree) = object(session, "tabsByWorktree") else {
            continue;
        };
        for (worktree_id, tabs) in tabs_by_worktree {
            let Some(tabs) = tabs.as_array() else {
                continue;
            };
            let visual_tabs = tabs
                .iter()
                .filter_map(|tab| build_tab(host, tab, session, &summaries))
                .collect::<Vec<_>>();
            if visual_tabs.is_empty() {
                continue;
            }
            let worktree_path = records
                .iter()
                .find(|(summary, record_host)| {
                    record_host == host && summary.worktree_id == *worktree_id
                })
                .map(|(summary, _)| summary.worktree_path.clone())
                .unwrap_or_default();
            let active_tab_id = object(session, "activeTabIdByWorktree")
                .and_then(|active| active.get(worktree_id))
                .and_then(Value::as_str)
                .map(str::to_owned)
                .or_else(|| {
                    session
                        .get("activeTabId")
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                });
            layouts.push(json!({
                "worktreeId": worktree_id,
                "worktreePath": worktree_path,
                "root": {
                    "type": "group",
                    "groupId": null,
                    "activeTabId": active_tab_id,
                    "tabs": visual_tabs
                }
            }));
        }
    }
    layouts
}

fn build_tab(
    host: &Option<String>,
    tab: &Value,
    session: &Value,
    summaries: &HashMap<(Option<String>, String, String), &TerminalSummary>,
) -> Option<Value> {
    let tab = tab.as_object()?;
    let tab_id = tab.get("id")?.as_str()?;
    let layout = object(session, "terminalLayoutsByTabId")?
        .get(tab_id)?
        .as_object()?;
    let requested_active = layout.get("activeLeafId").and_then(Value::as_str);
    let panes = build_pane(
        host,
        tab_id,
        layout.get("root")?,
        requested_active,
        summaries,
    )?;
    let active_leaf_id = requested_active
        .filter(|leaf| {
            summaries.contains_key(&(host.clone(), tab_id.to_owned(), (*leaf).to_owned()))
        })
        .map(str::to_owned)
        .or_else(|| first_leaf(&panes));
    Some(json!({
        "tabId": tab_id,
        "title": tab.get("customTitle").and_then(Value::as_str)
            .or_else(|| tab.get("title").and_then(Value::as_str)),
        "activeLeafId": active_leaf_id,
        "panes": panes
    }))
}

fn build_pane(
    host: &Option<String>,
    tab_id: &str,
    node: &Value,
    active_leaf: Option<&str>,
    summaries: &HashMap<(Option<String>, String, String), &TerminalSummary>,
) -> Option<Value> {
    let node = node.as_object()?;
    match node.get("type").and_then(Value::as_str)? {
        "leaf" => {
            let leaf_id = node.get("leafId")?.as_str()?;
            let summary = summaries.get(&(host.clone(), tab_id.to_owned(), leaf_id.to_owned()))?;
            Some(json!({
                "type": "terminal",
                "handle": summary.handle,
                "tabId": summary.tab_id,
                "leafId": summary.leaf_id,
                "title": summary.title,
                "connected": summary.connected,
                "active": active_leaf == Some(leaf_id)
            }))
        }
        "split" => {
            let first = build_pane(host, tab_id, node.get("first")?, active_leaf, summaries);
            let second = build_pane(host, tab_id, node.get("second")?, active_leaf, summaries);
            match (first, second) {
                (Some(first), Some(second)) => Some(json!({
                    "type": "pane-split",
                    "direction": node.get("direction").and_then(Value::as_str).unwrap_or("vertical"),
                    "first": first,
                    "second": second
                })),
                (Some(pane), None) | (None, Some(pane)) => Some(pane),
                (None, None) => None,
            }
        }
        _ => None,
    }
}

fn first_leaf(pane: &Value) -> Option<String> {
    match pane.get("type").and_then(Value::as_str) {
        Some("terminal") => pane
            .get("leafId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        Some("pane-split") => {
            first_leaf(pane.get("first")?).or_else(|| first_leaf(pane.get("second")?))
        }
        _ => None,
    }
}

fn object<'a>(value: &'a Value, key: &str) -> Option<&'a Map<String, Value>> {
    value.get(key).and_then(Value::as_object)
}
