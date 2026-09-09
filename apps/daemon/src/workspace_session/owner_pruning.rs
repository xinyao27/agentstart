use serde_json::{Map, Value};

use super::document::default_session;

const LOCAL_HOST_ID: &str = "local";
const WORKTREE_PREFIX: &str = "worktree:";
const WORKTREE_SEPARATOR: &str = "::";

pub(super) fn prune_repo(
    document: &mut Map<String, Value>,
    repo_id: &str,
    host_id: Option<&str>,
) -> bool {
    let prune_local = host_id.is_none_or(|host_id| host_id == LOCAL_HOST_ID);
    let mut changed = prune_local && prune_local_session(document, repo_id);
    if host_id == Some(LOCAL_HOST_ID) {
        return changed;
    }
    let Some(sessions) = document
        .get_mut("workspaceSessionsByHostId")
        .and_then(Value::as_object_mut)
    else {
        return changed;
    };
    match host_id {
        None => {
            for session in sessions.values_mut() {
                changed |= prune_session(session, repo_id);
            }
        }
        Some(host_id) => {
            if let Some(session) = sessions.get_mut(host_id) {
                changed |= prune_session(session, repo_id);
            }
        }
    }
    changed
}

fn prune_local_session(document: &mut Map<String, Value>, repo_id: &str) -> bool {
    let session = document
        .entry("workspaceSession".to_owned())
        .or_insert_with(default_session);
    prune_session(session, repo_id)
}

fn prune_session(session: &mut Value, repo_id: &str) -> bool {
    let prior = session.clone();
    if !session.is_object() {
        *session = default_session();
    }
    let session = session
        .as_object_mut()
        .expect("workspace session was normalized to an object");

    let terminal_ids = remove_owner_entries(session, "tabsByWorktree", repo_id)
        .into_iter()
        .flat_map(|tabs| tabs.as_array().cloned().unwrap_or_default())
        .filter_map(|tab| tab.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect::<Vec<_>>();
    for tab_id in terminal_ids {
        remove_key(session, "terminalLayoutsByTabId", &tab_id);
        remove_key(session, "remoteSessionIdsByTabId", &tab_id);
        null_if_equal(session, "activeTabId", &tab_id);
    }

    for field in [
        "openFilesByWorktree",
        "activeFileIdByWorktree",
        "activeBrowserTabIdByWorktree",
        "activeTabTypeByWorktree",
        "activeTabIdByWorktree",
        "unifiedTabs",
        "tabGroups",
        "tabGroupLayouts",
        "activeGroupIdByWorktree",
        "lastVisitedAtByWorktreeId",
        "defaultTerminalTabsAppliedByWorktreeId",
    ] {
        remove_owner_entries(session, field, repo_id);
    }

    let workspace_ids = remove_owner_entries(session, "browserTabsByWorktree", repo_id)
        .into_iter()
        .flat_map(|workspaces| workspaces.as_array().cloned().unwrap_or_default())
        .filter_map(|workspace| {
            workspace
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .collect::<Vec<_>>();
    for workspace_id in workspace_ids {
        remove_key(session, "browserPagesByWorkspace", &workspace_id);
    }

    if let Some(records) = object_field_mut(session, "sleepingAgentSessionsByPaneKey") {
        let keys = records
            .iter()
            .filter(|(_, record)| {
                record
                    .get("worktreeId")
                    .and_then(Value::as_str)
                    .is_some_and(|owner| owner_belongs_to_repo(owner, repo_id))
            })
            .map(|(key, _)| key.clone())
            .collect::<Vec<_>>();
        for key in keys {
            records.remove(&key);
        }
    }

    null_if_owner(session, "activeWorkspaceKey", repo_id);
    null_if_owner(session, "activeWorktreeId", repo_id);
    null_if_equal(session, "activeRepoId", repo_id);
    if let Some(worktree_ids) = session
        .get_mut("activeWorktreeIdsOnShutdown")
        .and_then(Value::as_array_mut)
    {
        worktree_ids.retain(|value| {
            value
                .as_str()
                .is_none_or(|owner| !owner_belongs_to_repo(owner, repo_id))
        });
    }

    prior != Value::Object(session.clone())
}

fn remove_owner_entries(
    session: &mut Map<String, Value>,
    field: &str,
    repo_id: &str,
) -> Vec<Value> {
    let Some(record) = object_field_mut(session, field) else {
        return Vec::new();
    };
    let keys = record
        .keys()
        .filter(|key| owner_belongs_to_repo(key, repo_id))
        .cloned()
        .collect::<Vec<_>>();
    keys.into_iter()
        .filter_map(|key| record.remove(&key))
        .collect()
}

fn remove_key(session: &mut Map<String, Value>, field: &str, key: &str) {
    if let Some(record) = object_field_mut(session, field) {
        record.remove(key);
    }
}

fn object_field_mut<'a>(
    session: &'a mut Map<String, Value>,
    field: &str,
) -> Option<&'a mut Map<String, Value>> {
    session.get_mut(field).and_then(Value::as_object_mut)
}

fn null_if_owner(session: &mut Map<String, Value>, field: &str, repo_id: &str) {
    let is_owner = session
        .get(field)
        .and_then(Value::as_str)
        .is_some_and(|owner| owner_belongs_to_repo(owner, repo_id));
    if is_owner {
        session.insert(field.to_owned(), Value::Null);
    }
}

fn null_if_equal(session: &mut Map<String, Value>, field: &str, expected: &str) {
    if session.get(field).and_then(Value::as_str) == Some(expected) {
        session.insert(field.to_owned(), Value::Null);
    }
}

fn owner_belongs_to_repo(owner_key: &str, repo_id: &str) -> bool {
    let owner = owner_key
        .strip_prefix(WORKTREE_PREFIX)
        .filter(|worktree_id| !worktree_id.is_empty())
        .unwrap_or(owner_key);
    owner == repo_id
        || owner
            .strip_prefix(repo_id)
            .is_some_and(|suffix| suffix.starts_with(WORKTREE_SEPARATOR))
}
