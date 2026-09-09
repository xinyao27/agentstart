use std::collections::HashSet;

use serde_json::{Map, Value, json};

use crate::terminal_session::TerminalSessionAuthority;

pub(super) fn client_snapshot(snapshot: &Value, terminals: &TerminalSessionAuthority) -> Value {
    let Some(source) = snapshot.as_object() else {
        return empty("", "none", 0.0);
    };
    let worktree = source
        .get("worktree")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let mut returned = Vec::new();
    let mut returned_ids = HashSet::new();
    let mut claimed_ptys = HashSet::new();
    for tab in source
        .get("tabs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(mut tab) = tab.as_object().cloned() else {
            continue;
        };
        match tab.get("type").and_then(Value::as_str) {
            Some("terminal") => {
                let pty_id = tab
                    .get("ptyId")
                    .and_then(Value::as_str)
                    .filter(|value| !value.is_empty());
                let binding = pty_id.and_then(|pty_id| terminals.mobile_binding(pty_id, worktree));
                if let Some(binding) = binding {
                    if !claimed_ptys.insert(pty_id.unwrap_or_default().to_owned()) {
                        continue;
                    }
                    if tab.get("preserveTitle").and_then(Value::as_bool) != Some(true)
                        && let Some(title) = binding.title.filter(|title| !title.trim().is_empty())
                    {
                        tab.insert("title".to_owned(), Value::String(title));
                    }
                    tab.insert("status".to_owned(), Value::String("ready".to_owned()));
                    tab.insert("terminal".to_owned(), Value::String(binding.handle));
                    tab.insert("worktreeInstanceId".to_owned(), Value::Null);
                } else {
                    tab.insert(
                        "status".to_owned(),
                        Value::String(
                            if pty_id.is_some() {
                                "sleeping"
                            } else {
                                "pending-handle"
                            }
                            .to_owned(),
                        ),
                    );
                    tab.insert("terminal".to_owned(), Value::Null);
                }
                if let Some(id) = tab.get("id").and_then(Value::as_str) {
                    returned_ids.insert(id.to_owned());
                }
                if let Some(id) = tab.get("parentTabId").and_then(Value::as_str) {
                    returned_ids.insert(id.to_owned());
                }
            }
            Some("browser") => {
                for field in ["id", "browserWorkspaceId"] {
                    if let Some(id) = tab.get(field).and_then(Value::as_str) {
                        returned_ids.insert(id.to_owned());
                    }
                }
            }
            Some("markdown") | Some("file") => {
                if let Some(id) = tab.get("id").and_then(Value::as_str) {
                    returned_ids.insert(id.to_owned());
                }
            }
            Some(_) | None => continue,
        }
        tab.remove("preserveTitle");
        returned.push(Value::Object(tab));
    }

    let active = returned
        .iter()
        .find(|tab| {
            tab.get("isActive").and_then(Value::as_bool) == Some(true)
                && tab.get("id") == source.get("activeTabId")
        })
        .or_else(|| {
            returned
                .iter()
                .find(|tab| tab.get("isActive").and_then(Value::as_bool) == Some(true))
        })
        .or_else(|| source.get("activeTabId").and_then(|_| returned.first()));
    let active_id = active
        .and_then(|tab| tab.get("id"))
        .cloned()
        .unwrap_or(Value::Null);
    let active_type = active
        .and_then(|tab| tab.get("type"))
        .cloned()
        .unwrap_or(Value::Null);
    let groups = sanitize_groups(source.get("tabGroups"), &returned_ids);
    let active_group_id = source
        .get("activeGroupId")
        .and_then(Value::as_str)
        .filter(|active| {
            groups
                .iter()
                .any(|group| group.get("id").and_then(Value::as_str) == Some(*active))
        })
        .map(|value| Value::String(value.to_owned()))
        .or_else(|| {
            groups
                .iter()
                .find(|group| {
                    active_id.as_str().is_some_and(|active| {
                        group
                            .get("tabOrder")
                            .and_then(Value::as_array)
                            .is_some_and(|order| order.iter().any(|value| value == active))
                    })
                })
                .and_then(|group| group.get("id").cloned())
        })
        .or_else(|| groups.first().and_then(|group| group.get("id").cloned()))
        .unwrap_or(Value::Null);

    let mut output = Map::new();
    for field in ["publicationEpoch", "snapshotVersion", "worktree"] {
        if let Some(value) = source.get(field) {
            output.insert(field.to_owned(), value.clone());
        }
    }
    if !returned
        .iter()
        .any(|tab| tab.get("isActive").and_then(Value::as_bool) == Some(true))
        && let Some(active_id) = active_id.as_str()
    {
        for tab in &mut returned {
            if tab.get("id").and_then(Value::as_str) == Some(active_id)
                && let Some(tab) = tab.as_object_mut()
            {
                tab.insert("isActive".to_owned(), Value::Bool(true));
            }
        }
    }
    output.insert("activeGroupId".to_owned(), active_group_id);
    output.insert("activeTabId".to_owned(), active_id);
    output.insert("activeTabType".to_owned(), active_type);
    if !groups.is_empty() {
        output.insert("tabGroups".to_owned(), Value::Array(groups));
    }
    if let Some(layout) = source.get("tabGroupLayout") {
        output.insert("tabGroupLayout".to_owned(), layout.clone());
    }
    output.insert("tabs".to_owned(), Value::Array(returned));
    Value::Object(output)
}

pub(super) fn empty(worktree: &str, epoch: &str, version: f64) -> Value {
    json!({
        "worktree": worktree,
        "publicationEpoch": epoch,
        "snapshotVersion": version,
        "activeGroupId": null,
        "activeTabId": null,
        "activeTabType": null,
        "tabs": []
    })
}

pub(super) fn removed(worktree: &str, epoch: &str) -> Value {
    let mut value = empty(worktree, epoch, 0.0);
    value["removed"] = Value::Bool(true);
    value
}

fn sanitize_groups(groups: Option<&Value>, returned: &HashSet<String>) -> Vec<Value> {
    groups
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|group| {
            let mut group = group.as_object()?.clone();
            let order = group
                .get("tabOrder")
                .and_then(Value::as_array)?
                .iter()
                .filter(|tab| tab.as_str().is_some_and(|tab| returned.contains(tab)))
                .cloned()
                .collect::<Vec<_>>();
            if order.is_empty() {
                return None;
            }
            let active = group
                .get("activeTabId")
                .and_then(Value::as_str)
                .filter(|active| order.iter().any(|tab| tab == *active))
                .map(|active| Value::String(active.to_owned()))
                .unwrap_or_else(|| order.first().cloned().unwrap_or(Value::Null));
            let recent = group
                .get("recentTabIds")
                .and_then(Value::as_array)
                .map(|recent| {
                    recent
                        .iter()
                        .filter(|tab| tab.as_str().is_some_and(|tab| returned.contains(tab)))
                        .cloned()
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            group.insert("activeTabId".to_owned(), active);
            group.insert("tabOrder".to_owned(), Value::Array(order));
            if recent.is_empty() {
                group.remove("recentTabIds");
            } else {
                group.insert("recentTabIds".to_owned(), Value::Array(recent));
            }
            Some(Value::Object(group))
        })
        .collect()
}
