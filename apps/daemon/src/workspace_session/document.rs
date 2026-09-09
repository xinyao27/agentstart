use serde_json::{Map, Value, json};

use super::{binding_preservation, scrollback, wire};
use crate::terminal_scrollback::TerminalScrollbackSnapshots;

const LOCAL_HOST_ID: &str = "local";

pub(super) fn get(document: &Map<String, Value>, host_id: Option<&str>) -> Value {
    let sanitized = raw_session(document, host_id)
        .filter(|value| value.is_object())
        .and_then(wire::sanitize_session);
    let mut session = default_session();
    if let (Some(session), Some(sanitized)) = (session.as_object_mut(), sanitized)
        && let Some(sanitized) = sanitized.as_object()
    {
        session.extend(sanitized.clone());
    }
    session
}

pub(super) fn loaded_sessions(document: &Map<String, Value>) -> Vec<(Option<String>, Value)> {
    let mut sessions = vec![(None, get(document, None))];
    if let Some(hosts) = document
        .get("workspaceSessionsByHostId")
        .and_then(Value::as_object)
    {
        sessions.extend(
            hosts
                .keys()
                .map(|host_id| (Some(host_id.clone()), get(document, Some(host_id)))),
        );
    }
    sessions
}

pub(super) fn worktree_scopes(document: &Map<String, Value>) -> Vec<(Option<String>, String)> {
    let mut scopes = Vec::new();
    collect_worktrees(document.get("workspaceSession"), None, &mut scopes);
    if let Some(hosts) = document
        .get("workspaceSessionsByHostId")
        .and_then(Value::as_object)
    {
        for (host_id, session) in hosts {
            collect_worktrees(Some(session), Some(host_id), &mut scopes);
        }
    }
    scopes
}

pub(super) fn set(
    document: &mut Map<String, Value>,
    host_id: Option<&str>,
    mut session: Value,
    owners: &scrollback::ProjectOwners,
    snapshots: &TerminalScrollbackSnapshots,
) {
    match normalized_host(host_id) {
        None => {
            scrollback::prune_renderer_buffers(&mut session, owners);
            binding_preservation::preserve(document.get("workspaceSession"), &mut session);
            scrollback::normalize_local_session(&mut session, owners, snapshots);
            document.insert("workspaceSession".to_owned(), session);
        }
        Some(host_id) => {
            scrollback::prune_renderer_buffers(&mut session, owners);
            host_sessions(document).insert(host_id.to_owned(), session);
        }
    }
}

pub(super) fn patch(
    document: &mut Map<String, Value>,
    host_id: Option<&str>,
    patch: Map<String, Value>,
    owners: &scrollback::ProjectOwners,
    snapshots: &TerminalScrollbackSnapshots,
) {
    let mut session = raw_session(document, host_id)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_else(|| {
            default_session()
                .as_object()
                .expect("default workspace session is an object")
                .clone()
        });
    session.extend(patch);
    set(document, host_id, Value::Object(session), owners, snapshots);
}

pub(super) fn migrate_loaded(
    document: &mut Map<String, Value>,
    owners: &scrollback::ProjectOwners,
    snapshots: &TerminalScrollbackSnapshots,
) -> bool {
    document
        .get_mut("workspaceSession")
        .is_some_and(|session| scrollback::normalize_local_session(session, owners, snapshots))
}

fn raw_session<'a>(document: &'a Map<String, Value>, host_id: Option<&str>) -> Option<&'a Value> {
    match normalized_host(host_id) {
        None => document.get("workspaceSession"),
        Some(host_id) => document
            .get("workspaceSessionsByHostId")
            .and_then(Value::as_object)
            .and_then(|sessions| sessions.get(host_id)),
    }
}

pub(super) fn raw_session_mut<'a>(
    document: &'a mut Map<String, Value>,
    host_id: Option<&str>,
) -> Option<&'a mut Value> {
    match normalized_host(host_id) {
        None => document.get_mut("workspaceSession"),
        Some(host_id) => document
            .get_mut("workspaceSessionsByHostId")
            .and_then(Value::as_object_mut)
            .and_then(|sessions| sessions.get_mut(host_id)),
    }
}

fn normalized_host(host_id: Option<&str>) -> Option<&str> {
    host_id
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != LOCAL_HOST_ID)
}

fn collect_worktrees(
    session: Option<&Value>,
    host_id: Option<&str>,
    scopes: &mut Vec<(Option<String>, String)>,
) {
    let mut seen = std::collections::HashSet::new();
    for field in [
        "tabsByWorktree",
        "openFilesByWorktree",
        "unifiedTabs",
        "browserTabsByWorktree",
    ] {
        if let Some(entries) = session
            .and_then(|session| session.get(field))
            .and_then(Value::as_object)
        {
            for worktree in entries.keys() {
                if seen.insert(worktree) {
                    scopes.push((host_id.map(str::to_owned), worktree.clone()));
                }
            }
        }
    }
}

fn host_sessions(document: &mut Map<String, Value>) -> &mut Map<String, Value> {
    let value = document
        .entry("workspaceSessionsByHostId".to_owned())
        .or_insert_with(|| Value::Object(Map::new()));
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    value.as_object_mut().expect("host sessions was normalized")
}

pub(super) fn default_session() -> Value {
    json!({
        "activeRepoId": null,
        "activeWorktreeId": null,
        "activeTabId": null,
        "tabsByWorktree": {},
        "terminalLayoutsByTabId": {},
        "openFilesByWorktree": {},
        "markdownFrontmatterVisible": {},
        "browserTabsByWorktree": {},
        "browserPagesByWorkspace": {},
        "activeBrowserTabIdByWorktree": {},
        "activeFileIdByWorktree": {},
        "activeTabTypeByWorktree": {},
        "browserUrlHistory": [],
        "defaultTerminalTabsAppliedByWorktreeId": {}
    })
}
