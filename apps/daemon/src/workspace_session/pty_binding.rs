use serde_json::{Map, Value, json};

#[derive(Clone)]
pub(crate) struct PtyBinding {
    pub(crate) activate: bool,
    pub(crate) host_id: Option<String>,
    pub(crate) leaf_id: String,
    pub(crate) launch_agent: Option<String>,
    pub(crate) pty_id: String,
    pub(crate) split_direction: Option<&'static str>,
    pub(crate) split_from_leaf_id: Option<String>,
    pub(crate) startup_cwd: Option<String>,
    pub(crate) tab_id: String,
    pub(crate) title: Option<String>,
    pub(crate) worktree_id: String,
}

pub(crate) struct PtyScrollback {
    pub(crate) host_id: Option<String>,
    pub(crate) leaf_id: String,
    pub(crate) reference: String,
    pub(crate) tab_id: String,
}

pub(super) fn apply(session: &mut Value, binding: &PtyBinding) {
    let Some(session) = session.as_object_mut() else {
        return;
    };
    bind_tab(session, binding);
    if is_stable_leaf_id(&binding.leaf_id) {
        bind_layout(session, binding);
    }
}

pub(super) fn apply_scrollback(session: &mut Value, scrollback: &PtyScrollback) {
    let Some(layout) = session
        .as_object_mut()
        .and_then(|session| session.get_mut("terminalLayoutsByTabId"))
        .and_then(Value::as_object_mut)
        .and_then(|layouts| layouts.get_mut(&scrollback.tab_id))
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    object_field(layout, "scrollbackRefsByLeafId").insert(
        scrollback.leaf_id.clone(),
        Value::String(scrollback.reference.clone()),
    );
    if let Some(buffers) = layout
        .get_mut("buffersByLeafId")
        .and_then(Value::as_object_mut)
    {
        buffers.remove(&scrollback.leaf_id);
    }
}

pub(super) fn clear_scrollback(session: &mut Value, tab_id: &str, leaf_id: &str) {
    let Some(layout) = session
        .as_object_mut()
        .and_then(|session| session.get_mut("terminalLayoutsByTabId"))
        .and_then(Value::as_object_mut)
        .and_then(|layouts| layouts.get_mut(tab_id))
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    if let Some(references) = layout
        .get_mut("scrollbackRefsByLeafId")
        .and_then(Value::as_object_mut)
    {
        references.remove(leaf_id);
    }
    if let Some(buffers) = layout
        .get_mut("buffersByLeafId")
        .and_then(Value::as_object_mut)
    {
        buffers.remove(leaf_id);
    }
}

pub(super) fn set_tab_color(
    session: &mut Value,
    worktree_id: &str,
    tab_id: &str,
    color: &str,
) -> bool {
    let Some(session) = session.as_object_mut() else {
        return false;
    };
    let mut changed = false;
    for field in ["tabsByWorktree", "unifiedTabs"] {
        let Some(tabs) = session
            .get_mut(field)
            .and_then(Value::as_object_mut)
            .and_then(|by_worktree| by_worktree.get_mut(worktree_id))
            .and_then(Value::as_array_mut)
        else {
            continue;
        };
        for tab in tabs {
            let Some(tab) = tab.as_object_mut() else {
                continue;
            };
            if tab.get("id").and_then(Value::as_str) == Some(tab_id)
                || tab.get("entityId").and_then(Value::as_str) == Some(tab_id)
            {
                tab.insert("color".to_owned(), Value::String(color.to_owned()));
                changed = true;
            }
        }
    }
    changed
}

fn bind_tab(session: &mut Map<String, Value>, binding: &PtyBinding) {
    let tabs_by_worktree = object_field(session, "tabsByWorktree");
    let tabs = tabs_by_worktree
        .entry(binding.worktree_id.clone())
        .or_insert_with(|| Value::Array(Vec::new()));
    if !tabs.is_array() {
        *tabs = Value::Array(Vec::new());
    }
    let tabs = tabs.as_array_mut().expect("terminal tabs were normalized");
    if let Some(tab) = tabs.iter_mut().find_map(|tab| {
        let tab = tab.as_object_mut()?;
        (tab.get("id").and_then(Value::as_str) == Some(&binding.tab_id)).then_some(tab)
    }) {
        tab.insert("ptyId".to_owned(), Value::String(binding.pty_id.clone()));
        apply_tab_metadata(tab, binding);
    } else {
        let ordinal = tabs.len() + 1;
        let default_title = format!("Terminal {ordinal}");
        let title = binding.title.as_ref().unwrap_or(&default_title);
        let mut tab = json!({
            "id": binding.tab_id,
            "ptyId": binding.pty_id,
            "worktreeId": binding.worktree_id,
            "title": title,
            "defaultTitle": default_title,
            "customTitle": binding.title,
            "color": null,
            "sortOrder": tabs.len(),
            "createdAt": epoch_millis(),
            "pendingActivationSpawn": true
        });
        if let Some(cwd) = &binding.startup_cwd {
            tab.as_object_mut()
                .expect("terminal tab is an object")
                .insert("startupCwd".to_owned(), Value::String(cwd.clone()));
        }
        apply_tab_metadata(
            tab.as_object_mut().expect("terminal tab is an object"),
            binding,
        );
        tabs.push(tab);
    }
    set_selected(
        session,
        "activeWorktreeId",
        &binding.worktree_id,
        binding.activate,
    );
    set_selected(session, "activeTabId", &binding.tab_id, binding.activate);
    let active_by_worktree = object_field(session, "activeTabIdByWorktree");
    if binding.activate
        || active_by_worktree
            .get(&binding.worktree_id)
            .is_none_or(Value::is_null)
    {
        active_by_worktree.insert(
            binding.worktree_id.clone(),
            Value::String(binding.tab_id.clone()),
        );
    }
}

fn apply_tab_metadata(tab: &mut Map<String, Value>, binding: &PtyBinding) {
    if let Some(agent) = &binding.launch_agent {
        tab.insert("launchAgent".to_owned(), Value::String(agent.clone()));
    }
    if let Some(title) = &binding.title {
        tab.insert("title".to_owned(), Value::String(title.clone()));
        tab.insert("customTitle".to_owned(), Value::String(title.clone()));
    }
}

fn bind_layout(session: &mut Map<String, Value>, binding: &PtyBinding) {
    let layouts = object_field(session, "terminalLayoutsByTabId");
    let layout = layouts.entry(binding.tab_id.clone()).or_insert_with(|| {
        json!({
            "root": { "type": "leaf", "leafId": binding.leaf_id },
            "activeLeafId": binding.leaf_id,
            "expandedLeafId": null,
            "ptyIdsByLeafId": {}
        })
    });
    let Some(layout) = layout.as_object_mut() else {
        return;
    };
    if layout.get("root").is_none_or(Value::is_null) {
        layout.insert(
            "root".to_owned(),
            json!({ "type": "leaf", "leafId": binding.leaf_id }),
        );
        layout.insert(
            "activeLeafId".to_owned(),
            Value::String(binding.leaf_id.clone()),
        );
        layout.insert("expandedLeafId".to_owned(), Value::Null);
    } else if !contains_leaf(layout.get("root"), &binding.leaf_id)
        && let Some(root) = layout.get("root").cloned()
    {
        let direction = binding.split_direction.unwrap_or("vertical");
        let new_leaf = json!({ "type": "leaf", "leafId": binding.leaf_id });
        let next_root = binding
            .split_from_leaf_id
            .as_deref()
            .and_then(|source| insert_split(root.clone(), source, direction, &new_leaf))
            .unwrap_or_else(|| {
                json!({
                    "type": "split",
                    "direction": direction,
                    "first": root,
                    "second": new_leaf
                })
            });
        layout.insert("root".to_owned(), next_root);
        layout.insert(
            "activeLeafId".to_owned(),
            Value::String(binding.leaf_id.clone()),
        );
        let expanded_is_live = layout
            .get("expandedLeafId")
            .and_then(Value::as_str)
            .is_some_and(|leaf_id| contains_leaf(layout.get("root"), leaf_id));
        if !expanded_is_live {
            layout.insert("expandedLeafId".to_owned(), Value::Null);
        }
    }
    object_field(layout, "ptyIdsByLeafId").insert(
        binding.leaf_id.clone(),
        Value::String(binding.pty_id.clone()),
    );
}

fn insert_split(
    node: Value,
    source_leaf_id: &str,
    direction: &str,
    new_leaf: &Value,
) -> Option<Value> {
    let object = node.as_object()?;
    match object.get("type").and_then(Value::as_str) {
        Some("leaf") if object.get("leafId").and_then(Value::as_str) == Some(source_leaf_id) => {
            Some(json!({
                "type": "split",
                "direction": direction,
                "first": node,
                "second": new_leaf
            }))
        }
        Some("split") => {
            let first = object.get("first")?.clone();
            let second = object.get("second")?.clone();
            if let Some(first) = insert_split(first, source_leaf_id, direction, new_leaf) {
                let mut updated = object.clone();
                updated.insert("first".to_owned(), first);
                Some(Value::Object(updated))
            } else if let Some(second) = insert_split(second, source_leaf_id, direction, new_leaf) {
                let mut updated = object.clone();
                updated.insert("second".to_owned(), second);
                Some(Value::Object(updated))
            } else {
                None
            }
        }
        _ => None,
    }
}

fn contains_leaf(node: Option<&Value>, leaf_id: &str) -> bool {
    let Some(node) = node.and_then(Value::as_object) else {
        return false;
    };
    match node.get("type").and_then(Value::as_str) {
        Some("leaf") => node.get("leafId").and_then(Value::as_str) == Some(leaf_id),
        Some("split") => {
            contains_leaf(node.get("first"), leaf_id) || contains_leaf(node.get("second"), leaf_id)
        }
        Some(_) | None => false,
    }
}

fn set_selected(object: &mut Map<String, Value>, key: &str, value: &str, activate: bool) {
    if activate || object.get(key).is_none_or(Value::is_null) {
        object.insert(key.to_owned(), Value::String(value.to_owned()));
    }
}

fn object_field<'a>(object: &'a mut Map<String, Value>, key: &str) -> &'a mut Map<String, Value> {
    let value = object
        .entry(key.to_owned())
        .or_insert_with(|| Value::Object(Map::new()));
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    value.as_object_mut().expect("session field was normalized")
}

fn is_stable_leaf_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && bytes.iter().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => *byte == b'-',
            14 => matches!(*byte, b'1'..=b'5'),
            19 => matches!(*byte, b'8' | b'9' | b'a' | b'b'),
            _ => byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase(),
        })
}

fn epoch_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}
