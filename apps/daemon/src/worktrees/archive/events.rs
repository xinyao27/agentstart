use serde_json::{Map, Value, json};

use crate::worktrees::ResolvedWorktree;

use super::store::WorktreeArchive;

pub(super) fn started(
    archive: &WorktreeArchive,
    worktree: &ResolvedWorktree,
) -> Map<String, Value> {
    payload([
        ("archiveId", json!(archive.id)),
        ("worktreeId", json!(worktree.id)),
    ])
}

pub(super) fn payload<const N: usize>(entries: [(&str, Value); N]) -> Map<String, Value> {
    let mut object = Map::new();
    for (key, value) in entries {
        object.insert(key.to_owned(), value);
    }
    object
}
