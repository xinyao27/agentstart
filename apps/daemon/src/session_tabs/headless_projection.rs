use std::cmp::Ordering;
use std::collections::HashSet;

use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};

use crate::terminal_session::TerminalHeadlessBinding;

use super::model::{RendererHost, RendererSnapshot};

pub(super) mod browser;
mod editor;
pub(super) mod presentation;

pub(super) fn persisted_snapshot(session: &Value, worktree: &str, revision: u64) -> Value {
    let tabs = session
        .get("tabsByWorktree")
        .and_then(Value::as_object)
        .and_then(|tabs| tabs.get(worktree))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut tabs = tabs
        .into_iter()
        .filter_map(|tab| tab.as_object().cloned())
        .collect::<Vec<_>>();
    tabs.sort_by(|left, right| {
        compare_numbers(left.get("sortOrder"), right.get("sortOrder"))
            .then_with(|| compare_numbers(left.get("createdAt"), right.get("createdAt")))
    });
    let active_tab_id = session
        .get("activeTabIdByWorktree")
        .and_then(Value::as_object)
        .and_then(|active| active.get(worktree))
        .or_else(|| session.get("activeTabId"))
        .and_then(Value::as_str);
    let layouts = session
        .get("terminalLayoutsByTabId")
        .and_then(Value::as_object);
    let mut output_tabs = Vec::new();
    for (index, tab) in tabs.iter().enumerate() {
        let Some(tab_id) = tab.get("id").and_then(Value::as_str) else {
            continue;
        };
        let layout = layouts.and_then(|layouts| layouts.get(tab_id));
        let mut leaf_ids = collect_leaf_ids(layout);
        if leaf_ids.is_empty() {
            leaf_ids.push(derived_leaf_id(tab_id));
        }
        for leaf_id in &leaf_ids {
            let pty_id = layout
                .and_then(|layout| layout.get("ptyIdsByLeafId"))
                .and_then(Value::as_object)
                .and_then(|bindings| bindings.get(leaf_id))
                .and_then(Value::as_str)
                .or_else(|| {
                    (leaf_ids.len() == 1)
                        .then(|| tab.get("ptyId").and_then(Value::as_str))
                        .flatten()
                });
            let title = ["customTitle", "generatedTitle", "title", "defaultTitle"]
                .into_iter()
                .filter_map(|field| tab.get(field).and_then(Value::as_str))
                .map(str::trim)
                .find(|title| !title.is_empty())
                .map(str::to_owned)
                .unwrap_or_else(|| format!("Terminal {}", index + 1));
            let is_active = active_tab_id == Some(tab_id)
                && layout
                    .and_then(|layout| layout.get("activeLeafId"))
                    .and_then(Value::as_str)
                    .is_none_or(|active| active == leaf_id);
            let mut output = Map::from_iter([
                ("type".to_owned(), Value::String("terminal".to_owned())),
                (
                    "id".to_owned(),
                    Value::String(format!("{tab_id}::{leaf_id}")),
                ),
                ("title".to_owned(), Value::String(title)),
                ("parentTabId".to_owned(), Value::String(tab_id.to_owned())),
                ("leafId".to_owned(), Value::String(leaf_id.clone())),
                ("isActive".to_owned(), Value::Bool(is_active)),
            ]);
            if let Some(pty_id) = pty_id {
                output.insert("ptyId".to_owned(), Value::String(pty_id.to_owned()));
            }
            for field in ["color", "launchAgent", "startupCwd"] {
                if let Some(value) = tab.get(field) {
                    output.insert(field.to_owned(), value.clone());
                }
            }
            if tab.get("isPinned").and_then(Value::as_bool) == Some(true) {
                output.insert("isPinned".to_owned(), Value::Bool(true));
            }
            if let Some(layout) = layout {
                output.insert("parentLayout".to_owned(), layout.clone());
            }
            output_tabs.push(Value::Object(output));
        }
    }
    let active = output_tabs
        .iter()
        .find(|tab| tab.get("isActive").and_then(Value::as_bool) == Some(true))
        .or_else(|| output_tabs.first());
    let active_id = active
        .and_then(|tab| tab.get("id"))
        .cloned()
        .unwrap_or(Value::Null);
    let parent_order = tabs
        .iter()
        .filter_map(|tab| tab.get("id").and_then(Value::as_str))
        .map(|tab| Value::String(tab.to_owned()))
        .collect::<Vec<_>>();
    let group_id = format!("headless-terminals:{worktree}");
    let mut snapshot = json!({
        "worktree": worktree,
        "publicationEpoch": format!("headless-hydrated:{revision:x}"),
        "snapshotVersion": revision.saturating_add(1),
        "activeGroupId": if output_tabs.is_empty() { Value::Null } else { Value::String(group_id.clone()) },
        "activeTabId": active_id,
        "activeTabType": if output_tabs.is_empty() { Value::Null } else { Value::String("terminal".to_owned()) },
        "tabs": output_tabs
    });
    if !parent_order.is_empty() {
        let persisted_groups = session
            .get("tabGroups")
            .and_then(Value::as_object)
            .and_then(|groups| groups.get(worktree))
            .and_then(Value::as_array)
            .filter(|groups| !groups.is_empty())
            .cloned();
        snapshot["tabGroups"] = persisted_groups.map_or_else(
            || {
                Value::Array(vec![json!({
                    "id": group_id,
                    "activeTabId": active_tab_id,
                    "tabOrder": parent_order
                })])
            },
            Value::Array,
        );
        if let Some(layout) = session
            .get("tabGroupLayouts")
            .and_then(Value::as_object)
            .and_then(|layouts| layouts.get(worktree))
        {
            snapshot["tabGroupLayout"] = layout.clone();
        }
    }
    snapshot
}

pub(super) fn headless_snapshot(
    session: &Value,
    host_id: Option<&str>,
    worktree: &str,
    revision: u64,
    bindings: &[TerminalHeadlessBinding],
) -> RendererSnapshot {
    let mut value = persisted_snapshot(session, worktree, revision);
    let mut tabs = value
        .get_mut("tabs")
        .and_then(Value::as_array_mut)
        .map(std::mem::take)
        .unwrap_or_default();
    for tab in &mut tabs {
        let binding = bindings.iter().find(|binding| {
            tab.get("ptyId").and_then(Value::as_str) == Some(binding.pty_id.as_str())
        });
        tab["status"] = Value::String(
            if binding.is_some() {
                "ready"
            } else if tab
                .get("ptyId")
                .and_then(Value::as_str)
                .is_some_and(|id| !id.is_empty())
            {
                "sleeping"
            } else {
                "pending-handle"
            }
            .to_owned(),
        );
        if let (Some(tab), Some(binding)) = (tab.as_object_mut(), binding) {
            tab.insert(
                "title".to_owned(),
                Value::String(
                    binding
                        .title
                        .clone()
                        .unwrap_or_else(|| "Terminal".to_owned()),
                ),
            );
        }
    }
    for binding in bindings {
        if tabs
            .iter()
            .any(|tab| tab.get("ptyId").and_then(Value::as_str) == Some(binding.pty_id.as_str()))
        {
            continue;
        }
        tabs.push(json!({
            "type": "terminal",
            "id": format!("{}::{}", binding.tab_id, binding.leaf_id),
            "title": binding.title.clone().unwrap_or_else(|| "Terminal".to_owned()),
            "parentTabId": binding.tab_id,
            "leafId": binding.leaf_id,
            "ptyId": binding.pty_id,
            "isActive": false,
            "status": "ready"
        }));
    }
    editor::append(session, worktree, &mut tabs);
    let active = tabs
        .iter()
        .find(|tab| tab.get("isActive").and_then(Value::as_bool) == Some(true))
        .or_else(|| tabs.first());
    value["activeTabId"] = active
        .and_then(|tab| tab.get("id"))
        .cloned()
        .unwrap_or(Value::Null);
    value["activeTabType"] = active
        .and_then(|tab| tab.get("type"))
        .cloned()
        .unwrap_or(Value::Null);
    value["tabs"] = Value::Array(tabs);
    let publication_epoch = value
        .get("publicationEpoch")
        .and_then(Value::as_str)
        .unwrap_or("headless")
        .to_owned();
    let snapshot_version = value
        .get("snapshotVersion")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    RendererSnapshot {
        host: RendererHost::from_scope(host_id),
        publication_epoch,
        snapshot_version,
        value,
        worktree: worktree.to_owned(),
    }
}

fn collect_leaf_ids(layout: Option<&Value>) -> Vec<String> {
    let mut ids = Vec::new();
    let mut seen = HashSet::new();
    let mut stack = layout
        .and_then(|layout| layout.get("root"))
        .into_iter()
        .collect::<Vec<_>>();
    while let Some(node) = stack.pop() {
        match node.get("type").and_then(Value::as_str) {
            Some("leaf") => {
                if let Some(id) = node.get("leafId").and_then(Value::as_str)
                    && is_uuid(id)
                    && seen.insert(id.to_owned())
                {
                    ids.push(id.to_owned());
                }
            }
            Some("split") => {
                if let Some(second) = node.get("second") {
                    stack.push(second);
                }
                if let Some(first) = node.get("first") {
                    stack.push(first);
                }
            }
            Some(_) | None => {}
        }
    }
    if let Some(id) = layout
        .and_then(|layout| layout.get("activeLeafId"))
        .and_then(Value::as_str)
        && is_uuid(id)
        && seen.insert(id.to_owned())
    {
        ids.push(id.to_owned());
    }
    if let Some(bindings) = layout
        .and_then(|layout| layout.get("ptyIdsByLeafId"))
        .and_then(Value::as_object)
    {
        for id in bindings.keys() {
            if is_uuid(id) && seen.insert(id.clone()) {
                ids.push(id.clone());
            }
        }
    }
    ids
}

fn derived_leaf_id(tab_id: &str) -> String {
    let hash = Sha256::digest(format!("headless-terminal-leaf:{tab_id}"))
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let variant = (u8::from_str_radix(&hash[16..17], 16).unwrap_or_default() & 0x3) | 0x8;
    format!(
        "{}-{}-4{}-{:x}{}-{}",
        &hash[0..8],
        &hash[8..12],
        &hash[13..16],
        variant,
        &hash[17..20],
        &hash[20..32]
    )
}

fn compare_numbers(left: Option<&Value>, right: Option<&Value>) -> Ordering {
    left.and_then(Value::as_f64)
        .partial_cmp(&right.and_then(Value::as_f64))
        .unwrap_or(Ordering::Equal)
}

fn is_uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && bytes.iter().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => *byte == b'-',
            14 => matches!(*byte, b'1'..=b'5'),
            19 => matches!(*byte, b'8' | b'9' | b'a' | b'b'),
            _ => byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase(),
        })
}
