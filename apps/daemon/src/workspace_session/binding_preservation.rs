use std::collections::HashSet;

use serde_json::{Map, Value};

const LEAF_RECORD_KEYS: &[&str] = &[
    "buffersByLeafId",
    "scrollbackRefsByLeafId",
    "titlesByLeafId",
];

pub(super) fn preserve(prior: Option<&Value>, next: &mut Value) {
    let (Some(prior), Some(next)) = (prior.and_then(Value::as_object), next.as_object_mut()) else {
        return;
    };
    preserve_tabs(prior, next);
    preserve_layouts(prior, next);
}

fn preserve_tabs(prior: &Map<String, Value>, next: &mut Map<String, Value>) {
    let Some(prior_tabs) = prior.get("tabsByWorktree").and_then(Value::as_object) else {
        return;
    };
    let Some(next_tabs) = next
        .get_mut("tabsByWorktree")
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    for (worktree_id, tabs) in next_tabs {
        let Some(prior_tabs) = prior_tabs.get(worktree_id).and_then(Value::as_array) else {
            continue;
        };
        for tab in tabs.as_array_mut().into_iter().flatten() {
            let Some(tab) = tab.as_object_mut() else {
                continue;
            };
            let Some(tab_id) = tab.get("id").and_then(Value::as_str) else {
                continue;
            };
            let Some(prior_tab) = prior_tabs.iter().find_map(|candidate| {
                let candidate = candidate.as_object()?;
                (candidate.get("id").and_then(Value::as_str) == Some(tab_id)).then_some(candidate)
            }) else {
                continue;
            };
            let prior_pty = non_empty_string(prior_tab.get("ptyId"));
            if non_empty_string(tab.get("ptyId")).is_none()
                && let Some(prior_pty) = prior_pty
            {
                tab.insert("ptyId".to_owned(), Value::String(prior_pty.to_owned()));
            }
            let prior_instance = non_empty_string(prior_tab.get("worktreeInstanceId"));
            if non_empty_string(tab.get("worktreeInstanceId")).is_none()
                && let (Some(prior_instance), Some(prior_pty), Some(next_pty)) = (
                    prior_instance,
                    prior_pty,
                    non_empty_string(tab.get("ptyId")),
                )
                && prior_pty == next_pty
            {
                tab.insert(
                    "worktreeInstanceId".to_owned(),
                    Value::String(prior_instance.to_owned()),
                );
            }
        }
    }
}

fn preserve_layouts(prior: &Map<String, Value>, next: &mut Map<String, Value>) {
    let Some(prior_layouts) = prior
        .get("terminalLayoutsByTabId")
        .and_then(Value::as_object)
    else {
        return;
    };
    let Some(next_layouts) = next
        .get_mut("terminalLayoutsByTabId")
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    for (tab_id, layout) in next_layouts {
        let Some(prior_layout) = prior_layouts.get(tab_id).and_then(Value::as_object) else {
            continue;
        };
        let Some(layout) = layout.as_object_mut() else {
            continue;
        };
        let Some(prior_bindings) = prior_layout
            .get("ptyIdsByLeafId")
            .and_then(Value::as_object)
        else {
            continue;
        };
        let incoming = layout
            .get("ptyIdsByLeafId")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let mut live_leaf_ids = HashSet::new();
        collect_leaf_ids(layout.get("root"), &mut live_leaf_ids);
        let mut restored = incoming;
        // Why: a client can resolve only the live half of a split; its projection cannot erase a sleeping binding.
        for (leaf_id, pty_id) in prior_bindings {
            if live_leaf_ids.contains(leaf_id.as_str()) {
                restored
                    .entry(leaf_id.clone())
                    .or_insert_with(|| pty_id.clone());
            }
        }
        if restored.is_empty() {
            continue;
        }
        layout.insert("ptyIdsByLeafId".to_owned(), Value::Object(restored));
        for key in LEAF_RECORD_KEYS {
            preserve_leaf_records(prior_layout, layout, key, &live_leaf_ids);
        }
    }
}

fn preserve_leaf_records(
    prior: &Map<String, Value>,
    next: &mut Map<String, Value>,
    key: &str,
    live_leaf_ids: &HashSet<String>,
) {
    let Some(prior_records) = prior.get(key).and_then(Value::as_object) else {
        return;
    };
    let mut records = next
        .get(key)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    for (leaf_id, value) in prior_records {
        if live_leaf_ids.contains(leaf_id) && !records.contains_key(leaf_id) {
            records.insert(leaf_id.clone(), value.clone());
        }
    }
    if !records.is_empty() {
        next.insert(key.to_owned(), Value::Object(records));
    }
}

fn collect_leaf_ids(node: Option<&Value>, leaf_ids: &mut HashSet<String>) {
    let Some(node) = node.and_then(Value::as_object) else {
        return;
    };
    match node.get("type").and_then(Value::as_str) {
        Some("leaf") => {
            if let Some(leaf_id) = node.get("leafId").and_then(Value::as_str) {
                leaf_ids.insert(leaf_id.to_owned());
            }
        }
        Some("split") => {
            collect_leaf_ids(node.get("first"), leaf_ids);
            collect_leaf_ids(node.get("second"), leaf_ids);
        }
        Some(_) | None => {}
    }
}

fn non_empty_string(value: Option<&Value>) -> Option<&str> {
    value
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
}
