use std::cmp::Ordering;
use std::collections::HashMap;
use std::sync::OnceLock;

use icu_collator::{Collator, CollatorBorrowed, options::CollatorOptions};
use icu_locale_core::Locale;
use serde::Serialize;
use serde_json::Map;
use serde_json::Value;

use super::ResolvedWorktree;

static WORKTREE_COLLATOR: OnceLock<Option<CollatorBorrowed<'static>>> = OnceLock::new();

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorktreePsSummary {
    pub(crate) workspace_kind: &'static str,
    pub(crate) worktree_id: String,
    pub(crate) repo_id: String,
    pub(crate) host_id: String,
    pub(crate) resume_target_status: &'static str,
    pub(crate) terminal_platform: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) prior_worktree_ids: Option<Vec<String>>,
    pub(crate) repo: String,
    pub(crate) path: String,
    pub(crate) branch: String,
    pub(crate) display_name: String,
    pub(crate) workspace_status: String,
    pub(crate) is_archived: bool,
    pub(crate) is_main_worktree: bool,
    pub(crate) has_host_sidebar_activity: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) worktree_instance_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) lineage_worktree_instance_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) parent_worktree_instance_id: Option<String>,
    pub(crate) parent_worktree_id: Option<String>,
    pub(crate) child_worktree_ids: Vec<String>,
    pub(crate) sort_order: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) manual_order: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) last_activity_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) created_at: Option<i64>,
    pub(crate) linked_pr: Option<LinkedPullRequest>,
    pub(crate) comment: String,
    pub(crate) is_pinned: bool,
    pub(crate) is_active: bool,
    pub(crate) unread: bool,
    pub(crate) live_terminal_count: usize,
    pub(crate) has_attached_pty: bool,
    pub(crate) last_output_at: Option<i64>,
    pub(crate) preview: String,
    pub(crate) status: &'static str,
    pub(crate) agents: Vec<Value>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LinkedPullRequest {
    pub(crate) number: u64,
    pub(crate) state: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorktreePsResult {
    pub(crate) worktrees: Vec<WorktreePsSummary>,
    pub(crate) total_count: usize,
    pub(crate) truncated: bool,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct TerminalProjection {
    pub(crate) connected: bool,
    pub(crate) last_output_at: Option<i64>,
    pub(crate) preview: String,
    pub(crate) pty_attached: bool,
}

pub(crate) fn build_summaries(
    worktrees: Vec<ResolvedWorktree>,
    terminal_rows: &Value,
    sessions: &[(Option<String>, Value)],
    mobile: bool,
) -> Vec<WorktreePsSummary> {
    let mut terminals = terminal_projection(terminal_rows);
    let mut active = HashMap::new();
    let mut session_activity = HashMap::new();
    for (host_id, session) in sessions {
        if let Some(worktree) = session.get("activeWorktreeId").and_then(Value::as_str) {
            active.insert((host_id.as_deref().unwrap_or("local"), worktree), true);
        }
        for field in ["tabsByWorktree", "browserTabsByWorktree"] {
            let Some(by_worktree) = session.get(field).and_then(Value::as_object) else {
                continue;
            };
            for (worktree, rows) in by_worktree {
                if rows.as_array().is_some_and(|rows| !rows.is_empty()) {
                    session_activity.insert(
                        (host_id.as_deref().unwrap_or("local"), worktree.as_str()),
                        true,
                    );
                }
            }
        }
        if let Some(ids) = session
            .get("activeWorktreeIdsOnShutdown")
            .and_then(Value::as_array)
        {
            for worktree in ids.iter().filter_map(Value::as_str) {
                session_activity.insert((host_id.as_deref().unwrap_or("local"), worktree), true);
            }
        }
    }
    let mut summaries = worktrees
        .into_iter()
        .filter(|worktree| worktree.visible)
        .map(|worktree| {
            let terminal = terminals
                .remove(&(worktree.host_id.clone(), worktree.id.clone()))
                .unwrap_or_default();
            let is_active = active.contains_key(&(worktree.host_id.as_str(), worktree.id.as_str()));
            let has_session_activity =
                session_activity.contains_key(&(worktree.host_id.as_str(), worktree.id.as_str()));
            WorktreePsSummary {
                workspace_kind: worktree.workspace_kind,
                worktree_id: worktree.id,
                repo_id: worktree.repo_id,
                host_id: worktree.host_id,
                resume_target_status: "local",
                terminal_platform: worktree.terminal_platform,
                prior_worktree_ids: string_array(&worktree.metadata, "priorWorktreeIds"),
                repo: worktree.repo_display_name,
                path: worktree.path,
                branch: worktree.branch,
                display_name: worktree.display_name,
                workspace_status: string(&worktree.metadata, "workspaceStatus")
                    .unwrap_or_else(|| "in-progress".to_owned()),
                is_archived: boolean(&worktree.metadata, "isArchived"),
                is_main_worktree: worktree.is_main_worktree,
                has_host_sidebar_activity: terminal.connected || has_session_activity,
                worktree_instance_id: string(&worktree.metadata, "instanceId"),
                lineage_worktree_instance_id: lineage_field(
                    &worktree.metadata,
                    "worktreeInstanceId",
                ),
                parent_worktree_instance_id: lineage_field(
                    &worktree.metadata,
                    "parentWorktreeInstanceId",
                ),
                parent_worktree_id: lineage_parent(&worktree.metadata),
                child_worktree_ids: string_array(&worktree.metadata, "childWorktreeIds")
                    .unwrap_or_default(),
                sort_order: number(&worktree.metadata, "sortOrder").unwrap_or(0.0),
                manual_order: number(&worktree.metadata, "manualOrder"),
                last_activity_at: integer(&worktree.metadata, "lastActivityAt"),
                created_at: integer(&worktree.metadata, "createdAt"),
                linked_pr: integer(&worktree.metadata, "linkedPR").and_then(|number| {
                    u64::try_from(number).ok().map(|number| LinkedPullRequest {
                        number,
                        state: "unknown".to_owned(),
                    })
                }),
                comment: string(&worktree.metadata, "comment").unwrap_or_default(),
                is_pinned: boolean(&worktree.metadata, "isPinned"),
                is_active,
                unread: boolean(&worktree.metadata, "isUnread"),
                live_terminal_count: usize::from(terminal.connected),
                has_attached_pty: terminal.pty_attached,
                last_output_at: terminal.last_output_at,
                preview: if mobile {
                    clip_utf16(&terminal.preview, 2_048)
                } else {
                    terminal.preview
                },
                status: if terminal.connected {
                    "active"
                } else {
                    "inactive"
                },
                agents: Vec::new(),
            }
        })
        .collect::<Vec<_>>();
    let known_ids = summaries
        .iter()
        .map(|summary| summary.worktree_id.as_str())
        .collect::<std::collections::HashSet<_>>();
    let mut children = HashMap::<String, Vec<String>>::new();
    for summary in &summaries {
        if let Some(parent) = summary
            .parent_worktree_id
            .as_deref()
            .filter(|parent| *parent != summary.worktree_id && known_ids.contains(parent))
        {
            children
                .entry(parent.to_owned())
                .or_default()
                .push(summary.worktree_id.clone());
        }
    }
    for summary in &mut summaries {
        if let Some(ids) = children.get_mut(&summary.worktree_id) {
            ids.sort();
            summary.child_worktree_ids = ids.clone();
        }
    }
    summaries.sort_by(compare);
    summaries
}

pub(crate) fn record_value(worktree: &ResolvedWorktree) -> Value {
    let metadata = &worktree.metadata;
    let mut value = Map::new();
    value.insert("id".to_owned(), Value::String(worktree.id.clone()));
    if let Some(instance_id) = string(metadata, "instanceId") {
        value.insert("instanceId".to_owned(), Value::String(instance_id));
    }
    value.insert("repoId".to_owned(), Value::String(worktree.repo_id.clone()));
    value.insert(
        "projectId".to_owned(),
        Value::String(worktree.repo_id.clone()),
    );
    value.insert("hostId".to_owned(), Value::String(worktree.host_id.clone()));
    if let Some(setup_id) = string(metadata, "projectHostSetupId") {
        value.insert("projectHostSetupId".to_owned(), Value::String(setup_id));
    }
    value.insert("path".to_owned(), Value::String(worktree.path.clone()));
    value.insert("head".to_owned(), Value::String(worktree.head.clone()));
    value.insert("branch".to_owned(), Value::String(worktree.branch.clone()));
    value.insert("isBare".to_owned(), Value::Bool(worktree.is_bare));
    if worktree.is_sparse {
        value.insert("isSparse".to_owned(), Value::Bool(true));
    }
    if let Some(reason) = &worktree.lock_reason {
        value.insert("locked".to_owned(), Value::Bool(true));
        value.insert("lockReason".to_owned(), Value::String(reason.clone()));
    }
    if let Some(reason) = &worktree.prunable_reason {
        value.insert("prunable".to_owned(), Value::Bool(true));
        value.insert("prunableReason".to_owned(), Value::String(reason.clone()));
    }
    value.insert(
        "isMainWorktree".to_owned(),
        Value::Bool(worktree.is_main_worktree),
    );
    value.insert(
        "displayName".to_owned(),
        Value::String(worktree.display_name.clone()),
    );
    value.insert("comment".to_owned(), string_or(metadata, "comment", ""));
    value.insert(
        "linkedPR".to_owned(),
        metadata.get("linkedPR").cloned().unwrap_or(Value::Null),
    );
    value.insert(
        "isArchived".to_owned(),
        Value::Bool(boolean(metadata, "isArchived")),
    );
    value.insert(
        "isUnread".to_owned(),
        Value::Bool(boolean(metadata, "isUnread")),
    );
    value.insert(
        "isPinned".to_owned(),
        Value::Bool(boolean(metadata, "isPinned")),
    );
    value.insert(
        "sortOrder".to_owned(),
        number_or(metadata, "sortOrder", 0.0),
    );
    value.insert(
        "lastActivityAt".to_owned(),
        number_or(metadata, "lastActivityAt", 0.0),
    );
    for field in [
        "manualOrder",
        "createdAt",
        "createdWithAgent",
        "pendingFirstAgentMessageRename",
        "firstAgentMessageRenameError",
        "sparseDirectories",
        "sparseBaseRef",
        "sparsePresetId",
        "baseRef",
        "pushTarget",
        "priorWorktreeIds",
        "workspaceStatus",
        "diffComments",
        "mobileDiffReview",
    ] {
        if let Some(value_field) = metadata.get(field) {
            value.insert(field.to_owned(), value_field.clone());
        }
    }
    value.insert(
        "parentWorktreeId".to_owned(),
        lineage_parent(metadata).map_or(Value::Null, Value::String),
    );
    value.insert(
        "childWorktreeIds".to_owned(),
        metadata
            .get("childWorktreeIds")
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new())),
    );
    value.insert(
        "lineage".to_owned(),
        metadata.get("lineage").cloned().unwrap_or(Value::Null),
    );
    value.insert(
        "workspaceLineage".to_owned(),
        metadata
            .get("workspaceLineage")
            .cloned()
            .unwrap_or(Value::Null),
    );
    let mut git = Map::from_iter([
        ("path".to_owned(), Value::String(worktree.path.clone())),
        ("head".to_owned(), Value::String(worktree.head.clone())),
        ("branch".to_owned(), Value::String(worktree.branch.clone())),
        ("isBare".to_owned(), Value::Bool(worktree.is_bare)),
        (
            "isMainWorktree".to_owned(),
            Value::Bool(worktree.is_main_worktree),
        ),
    ]);
    if worktree.is_sparse {
        git.insert("isSparse".to_owned(), Value::Bool(true));
    }
    if let Some(reason) = &worktree.lock_reason {
        git.insert("locked".to_owned(), Value::Bool(true));
        if !reason.is_empty() {
            git.insert("lockReason".to_owned(), Value::String(reason.clone()));
        }
    }
    if let Some(reason) = &worktree.prunable_reason {
        git.insert("prunable".to_owned(), Value::Bool(true));
        if !reason.is_empty() {
            git.insert("prunableReason".to_owned(), Value::String(reason.clone()));
        }
    }
    value.insert("git".to_owned(), Value::Object(git));
    Value::Object(value)
}

pub(crate) fn detected_value(worktree: &ResolvedWorktree) -> Value {
    let mut value = record_value(worktree);
    if let Some(object) = value.as_object_mut() {
        object.insert(
            "ownership".to_owned(),
            Value::String(
                if worktree.is_managed {
                    "agentstart-managed"
                } else if worktree.authoritative {
                    "external"
                } else {
                    "unknown-legacy"
                }
                .to_owned(),
            ),
        );
        object.insert("selectedCheckout".to_owned(), Value::Bool(false));
        object.insert("visible".to_owned(), Value::Bool(worktree.visible));
    }
    value
}

fn string(metadata: &Map<String, Value>, field: &str) -> Option<String> {
    metadata
        .get(field)
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn string_or(metadata: &Map<String, Value>, field: &str, fallback: &str) -> Value {
    Value::String(string(metadata, field).unwrap_or_else(|| fallback.to_owned()))
}

fn boolean(metadata: &Map<String, Value>, field: &str) -> bool {
    metadata
        .get(field)
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn number_or(metadata: &Map<String, Value>, field: &str, fallback: f64) -> Value {
    metadata
        .get(field)
        .and_then(Value::as_f64)
        .map(Value::from)
        .unwrap_or_else(|| Value::from(fallback))
}

fn number(metadata: &Map<String, Value>, field: &str) -> Option<f64> {
    metadata.get(field).and_then(Value::as_f64)
}

fn integer(metadata: &Map<String, Value>, field: &str) -> Option<i64> {
    metadata.get(field).and_then(Value::as_i64)
}

fn string_array(metadata: &Map<String, Value>, field: &str) -> Option<Vec<String>> {
    metadata.get(field).and_then(Value::as_array).map(|values| {
        values
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect()
    })
}

fn lineage_field(metadata: &Map<String, Value>, field: &str) -> Option<String> {
    metadata
        .get("lineage")
        .and_then(Value::as_object)
        .and_then(|lineage| lineage.get(field))
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn lineage_parent(metadata: &Map<String, Value>) -> Option<String> {
    lineage_field(metadata, "parentWorktreeId").or_else(|| {
        metadata
            .get("parentWorktreeId")
            .and_then(Value::as_str)
            .map(str::to_owned)
    })
}

fn terminal_projection(value: &Value) -> HashMap<(String, String), TerminalProjection> {
    let mut result = HashMap::<(String, String), TerminalProjection>::new();
    let Some(rows) = value.get("terminals").and_then(Value::as_array) else {
        return result;
    };
    for row in rows {
        let Some(worktree_id) = row.get("worktreeId").and_then(Value::as_str) else {
            continue;
        };
        let host_id = row
            .get("hostId")
            .and_then(Value::as_str)
            .unwrap_or("local")
            .to_owned();
        let entry = result.entry((host_id, worktree_id.to_owned())).or_default();
        let connected = row
            .get("connected")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        entry.connected |= connected;
        entry.pty_attached |= connected && row.get("ptyId").is_some_and(|value| !value.is_null());
        let timestamp = row.get("lastOutputAt").and_then(Value::as_i64);
        if timestamp >= entry.last_output_at {
            entry.last_output_at = timestamp;
            entry.preview = row
                .get("preview")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
        }
    }
    result
}

fn compare(left: &WorktreePsSummary, right: &WorktreePsSummary) -> Ordering {
    right
        .is_pinned
        .cmp(&left.is_pinned)
        .then_with(|| right.unread.cmp(&left.unread))
        .then_with(|| {
            right
                .has_host_sidebar_activity
                .cmp(&left.has_host_sidebar_activity)
        })
        .then_with(|| {
            right
                .last_output_at
                .unwrap_or(-1)
                .cmp(&left.last_output_at.unwrap_or(-1))
        })
        .then_with(|| right.live_terminal_count.cmp(&left.live_terminal_count))
        .then_with(|| locale_compare(&left.path, &right.path))
}

fn locale_compare(left: &str, right: &str) -> Ordering {
    WORKTREE_COLLATOR
        .get_or_init(default_collator)
        .as_ref()
        .map_or_else(|| left.cmp(right), |collator| collator.compare(left, right))
}

fn default_collator() -> Option<CollatorBorrowed<'static>> {
    let locale = sys_locale::get_locale()
        .and_then(|locale| normalize_system_locale(&locale).parse::<Locale>().ok())
        .or_else(|| "en-US".parse::<Locale>().ok())?;
    Collator::try_new((&locale).into(), CollatorOptions::default()).ok()
}

fn normalize_system_locale(locale: &str) -> String {
    let normalized = locale
        .split(['.', '@'])
        .next()
        .unwrap_or(locale)
        .replace('_', "-");
    if matches!(normalized.as_str(), "C" | "POSIX") {
        "en-US".to_owned()
    } else {
        normalized
    }
}

fn clip_utf16(value: &str, limit: usize) -> String {
    if value.encode_utf16().count() <= limit {
        return value.to_owned();
    }
    let prefix_limit = limit.saturating_sub(1);
    let mut units = 0;
    let prefix = value
        .char_indices()
        .take_while(|(_, character)| {
            let next = units + character.len_utf16();
            if next > prefix_limit {
                false
            } else {
                units = next;
                true
            }
        })
        .map(|(index, character)| index + character.len_utf8())
        .last()
        .unwrap_or(0);
    format!("{}…", &value[..prefix])
}
