use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value};

use crate::projects::Project;
use crate::terminal_scrollback::TerminalScrollbackSnapshots;

const EPHEMERAL_SETUP_PREFIX: &str = "ephemeral-setup-terminal:";
const LOCAL_HOST_ID: &str = "local";
const SESSION_BUFFER_BYTE_LIMIT: usize = 512 * 1024;
const WORKTREE_SEPARATOR: &str = "::";

pub(super) struct ProjectOwners {
    host_by_repo_id: HashMap<String, String>,
}

impl ProjectOwners {
    pub(super) fn new(projects: Vec<Project>) -> Self {
        Self {
            host_by_repo_id: projects
                .into_iter()
                .map(|project| (project.id, project.execution_host_id))
                .collect(),
        }
    }

    fn preserves_renderer_buffer(&self, worktree_id: Option<&str>) -> bool {
        let Some(worktree_id) = worktree_id else {
            return false;
        };
        if worktree_id.starts_with(EPHEMERAL_SETUP_PREFIX) {
            return false;
        }
        let repo_id = worktree_id
            .split_once(WORKTREE_SEPARATOR)
            .map_or(worktree_id, |(repo_id, _)| repo_id);
        self.host_by_repo_id.get(repo_id).is_none_or(|host_id| {
            super::normalize_host_id(host_id).is_some_and(|host_id| host_id != LOCAL_HOST_ID)
        })
    }
}

pub(super) fn normalize_local_session(
    session: &mut Value,
    owners: &ProjectOwners,
    snapshots: &TerminalScrollbackSnapshots,
) -> bool {
    let mut changed = prune_renderer_buffers(session, owners);
    changed |= migrate_buffers(session, snapshots);
    changed
}

pub(super) fn prune_renderer_buffers(session: &mut Value, owners: &ProjectOwners) -> bool {
    let Some(session) = session.as_object_mut() else {
        return false;
    };
    let worktree_by_tab_id = worktree_by_tab_id(session);
    let Some(layouts) = session
        .get_mut("terminalLayoutsByTabId")
        .and_then(Value::as_object_mut)
    else {
        return false;
    };
    let mut changed = false;
    for (tab_id, layout) in layouts {
        let Some(layout) = layout.as_object_mut() else {
            continue;
        };
        if !layout.contains_key("buffersByLeafId") && !layout.contains_key("scrollbackRefsByLeafId")
        {
            continue;
        }
        if owners.preserves_renderer_buffer(worktree_by_tab_id.get(tab_id).map(String::as_str)) {
            changed |= cap_buffers(layout);
        } else {
            changed |= layout.remove("buffersByLeafId").is_some();
            // Why: local text checkpoints belong to the daemon, unlike renderer-owned buffers.
            if worktree_by_tab_id
                .get(tab_id)
                .is_none_or(|worktree| worktree.starts_with(EPHEMERAL_SETUP_PREFIX))
            {
                changed |= layout.remove("scrollbackRefsByLeafId").is_some();
            }
        }
    }
    changed
}

pub(super) fn migrate_buffers(
    session: &mut Value,
    snapshots: &TerminalScrollbackSnapshots,
) -> bool {
    let Some(layouts) = session
        .get_mut("terminalLayoutsByTabId")
        .and_then(Value::as_object_mut)
    else {
        return false;
    };
    let mut changed = false;
    for (tab_id, layout) in layouts {
        let Some(layout) = layout.as_object_mut() else {
            continue;
        };
        let Some(buffers) = layout.get("buffersByLeafId").and_then(Value::as_object) else {
            continue;
        };
        if buffers.is_empty() {
            continue;
        }
        let buffers = buffers.clone();
        let mut references = layout
            .get("scrollbackRefsByLeafId")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let mut remaining = Map::new();
        let mut layout_changed = false;
        for (leaf_id, buffer) in buffers {
            let Some(buffer) = buffer.as_str() else {
                remaining.insert(leaf_id, buffer);
                continue;
            };
            if let Some(reference) = snapshots.store_blocking(tab_id, &leaf_id, buffer) {
                references.insert(leaf_id, Value::String(reference));
                layout_changed = true;
            } else {
                remaining.insert(leaf_id.clone(), Value::String(buffer.to_owned()));
                if references.remove(&leaf_id).is_some() {
                    layout_changed = true;
                }
            }
        }
        if !layout_changed {
            continue;
        }
        replace_record(layout, "scrollbackRefsByLeafId", references);
        replace_record(layout, "buffersByLeafId", remaining);
        changed = true;
    }
    changed
}

pub(super) fn collect_document_refs(document: &Map<String, Value>) -> HashSet<String> {
    let mut references = HashSet::new();
    if let Some(session) = document.get("workspaceSession") {
        collect_session_refs(session, &mut references);
    }
    for session in document
        .get("workspaceSessionsByHostId")
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(Map::values)
    {
        collect_session_refs(session, &mut references);
    }
    references
}

pub(super) fn hydrate_replay_buffers(session: &mut Value, snapshots: &TerminalScrollbackSnapshots) {
    let Some(layouts) = session
        .get_mut("terminalLayoutsByTabId")
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    for layout in layouts.values_mut().filter_map(Value::as_object_mut) {
        let Some(references) = layout
            .get("scrollbackRefsByLeafId")
            .and_then(Value::as_object)
            .cloned()
        else {
            continue;
        };
        let mut buffers = layout
            .get("buffersByLeafId")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        for (leaf_id, reference) in references {
            if buffers.contains_key(&leaf_id) {
                continue;
            }
            let Some(reference) = reference.as_str() else {
                continue;
            };
            if let Some(buffer) = snapshots.read_blocking(reference) {
                buffers.insert(leaf_id, Value::String(buffer));
            }
        }
        if !buffers.is_empty() {
            layout.insert("buffersByLeafId".to_owned(), Value::Object(buffers));
        }
    }
}

fn worktree_by_tab_id(session: &Map<String, Value>) -> HashMap<String, String> {
    let mut result = HashMap::new();
    for (worktree_id, tabs) in session
        .get("tabsByWorktree")
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(Map::iter)
    {
        for tab in tabs.as_array().into_iter().flatten() {
            if let Some(tab_id) = tab.get("id").and_then(Value::as_str) {
                result.insert(tab_id.to_owned(), worktree_id.clone());
            }
        }
    }
    result
}

fn cap_buffers(layout: &mut Map<String, Value>) -> bool {
    let Some(buffers) = layout
        .get_mut("buffersByLeafId")
        .and_then(Value::as_object_mut)
    else {
        return false;
    };
    let mut changed = false;
    for buffer in buffers.values_mut() {
        let Some(value) = buffer.as_str() else {
            continue;
        };
        let capped = trailing_utf8(value, SESSION_BUFFER_BYTE_LIMIT);
        if capped.len() != value.len() {
            *buffer = Value::String(capped.to_owned());
            changed = true;
        }
    }
    changed
}

fn trailing_utf8(value: &str, maximum: usize) -> &str {
    if value.len() <= maximum {
        return value;
    }
    let mut start = value.len() - maximum;
    while !value.is_char_boundary(start) {
        start += 1;
    }
    &value[start..]
}

fn replace_record(layout: &mut Map<String, Value>, key: &str, record: Map<String, Value>) {
    if record.is_empty() {
        layout.remove(key);
    } else {
        layout.insert(key.to_owned(), Value::Object(record));
    }
}

fn collect_session_refs(session: &Value, references: &mut HashSet<String>) {
    for layout in session
        .get("terminalLayoutsByTabId")
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(Map::values)
    {
        for reference in layout
            .get("scrollbackRefsByLeafId")
            .and_then(Value::as_object)
            .into_iter()
            .flat_map(Map::values)
            .filter_map(Value::as_str)
        {
            references.insert(reference.to_owned());
        }
    }
}
