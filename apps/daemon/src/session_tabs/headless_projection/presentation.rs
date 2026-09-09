use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};

pub(in crate::session_tabs) fn apply(session: &Value, worktree: &str, value: &mut Value) {
    let unified = session
        .get("unifiedTabs")
        .and_then(|map| map.get(worktree))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let ids = unified
        .iter()
        .filter_map(|tab| {
            let id = tab.get("id")?.as_str()?;
            let output = if tab.get("contentType").and_then(Value::as_str) == Some("terminal") {
                tab.get("entityId")?.as_str()?
            } else {
                id
            };
            Some((id.to_owned(), output.to_owned()))
        })
        .collect::<HashMap<_, _>>();
    let mut tabs = value
        .get_mut("tabs")
        .and_then(Value::as_array_mut)
        .map(std::mem::take)
        .unwrap_or_default();
    let known = tabs
        .iter()
        .filter_map(|tab| {
            tab.get("parentTabId")
                .or_else(|| tab.get("id"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .collect::<HashSet<_>>();
    let mut groups = session
        .get("tabGroups")
        .and_then(|map| map.get(worktree))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut assigned = HashSet::new();
    for group in &mut groups {
        let order = group
            .get("tabOrder")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(|id| ids.get(id).map(String::as_str).unwrap_or(id))
            .filter(|id| known.contains(*id) && assigned.insert((*id).to_owned()))
            .map(|id| Value::String(id.to_owned()))
            .collect();
        group["tabOrder"] = Value::Array(order);
        if let Some(active) = group
            .get("activeTabId")
            .and_then(Value::as_str)
            .and_then(|id| ids.get(id))
            .cloned()
        {
            group["activeTabId"] = Value::String(active)
        }
    }
    groups.retain(|group| {
        group
            .get("tabOrder")
            .and_then(Value::as_array)
            .is_some_and(|order| !order.is_empty())
    });
    let extras = tabs
        .iter()
        .filter_map(|tab| {
            tab.get("parentTabId")
                .or_else(|| tab.get("id"))
                .and_then(Value::as_str)
        })
        .filter(|id| assigned.insert((*id).to_owned()))
        .map(|id| Value::String(id.to_owned()))
        .collect::<Vec<_>>();
    if !extras.is_empty() {
        if groups.is_empty() {
            groups.push(json!({"id":format!("session-tabs:{worktree}"),"worktreeId":worktree,"activeTabId":null,"tabOrder":extras}));
        } else if let Some(order) = groups[0].get_mut("tabOrder").and_then(Value::as_array_mut) {
            order.extend(extras)
        }
    }
    let active_group = session
        .get("activeGroupIdByWorktree")
        .and_then(|map| map.get(worktree))
        .and_then(Value::as_str);
    let active_id = groups
        .iter()
        .find(|group| group.get("id").and_then(Value::as_str) == active_group)
        .or_else(|| groups.first())
        .and_then(|group| group.get("activeTabId"))
        .and_then(Value::as_str);
    let order = groups
        .iter()
        .flat_map(|group| {
            group
                .get("tabOrder")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter_map(Value::as_str)
        .enumerate()
        .map(|(index, id)| (id, index))
        .collect::<HashMap<_, _>>();
    let selected_leaf = active_id.and_then(|parent| {
        let leaves = tabs
            .iter()
            .filter(|tab| tab.get("parentTabId").and_then(Value::as_str) == Some(parent))
            .filter_map(|tab| tab.get("leafId").and_then(Value::as_str))
            .collect::<Vec<_>>();
        session
            .get("terminalLayoutsByTabId")
            .and_then(|map| map.get(parent))
            .and_then(|layout| layout.get("activeLeafId"))
            .and_then(Value::as_str)
            .filter(|leaf| leaves.contains(leaf))
            .or_else(|| leaves.first().copied())
            .map(str::to_owned)
    });
    for tab in &mut tabs {
        let identity = tab
            .get("parentTabId")
            .or_else(|| tab.get("id"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        if let Some(metadata) = unified.iter().find(|entry| {
            entry.get("id").and_then(Value::as_str) == Some(identity.as_str())
                || (entry.get("contentType").and_then(Value::as_str) == Some("terminal")
                    && entry.get("entityId").and_then(Value::as_str) == Some(identity.as_str()))
        }) {
            for field in ["color", "isPinned"] {
                if let Some(setting) = metadata.get(field) {
                    tab[field] = setting.clone();
                }
            }
            if let Some(title) = metadata
                .get("customLabel")
                .and_then(Value::as_str)
                .filter(|title| !title.is_empty())
            {
                tab["title"] = Value::String(title.to_owned());
                tab["preserveTitle"] = Value::Bool(true);
            }
        }
        if let Some(active) = active_id {
            tab["isActive"] = Value::Bool(
                identity == active
                    && (tab.get("type").and_then(Value::as_str) != Some("terminal")
                        || tab.get("leafId").and_then(Value::as_str) == selected_leaf.as_deref()),
            );
        }
    }
    tabs.sort_by_key(|tab| {
        tab.get("parentTabId")
            .or_else(|| tab.get("id"))
            .and_then(Value::as_str)
            .and_then(|id| order.get(id))
            .copied()
            .unwrap_or(usize::MAX)
    });
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
    value["activeGroupId"] = active_group
        .filter(|id| {
            groups
                .iter()
                .any(|g| g.get("id").and_then(Value::as_str) == Some(*id))
        })
        .map(|id| Value::String(id.to_owned()))
        .or_else(|| groups.first().and_then(|g| g.get("id")).cloned())
        .unwrap_or(Value::Null);
    value["tabGroups"] = Value::Array(groups);
    if let Some(layout) = session
        .get("tabGroupLayouts")
        .and_then(|map| map.get(worktree))
    {
        value["tabGroupLayout"] = layout.clone();
    }
    value["tabs"] = Value::Array(tabs);
}
