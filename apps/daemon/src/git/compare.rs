use std::collections::HashMap;

use serde_json::{Map, Value, json};

use super::runner::GitRunner;
use super::scope::{GitAuthority, GitAuthorityError};
use super::write::resolve_commit;

impl GitAuthority {
    pub(crate) async fn branch_compare(
        &self,
        worktree: &str,
        base_ref: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let compare_ref = current_branch(&scope.runner)
            .await
            .unwrap_or_else(|| "HEAD".to_owned());
        let head_oid = resolve_commit(&scope.runner, "HEAD").await;
        let base_oid = resolve_commit(&scope.runner, base_ref).await;
        if head_oid.is_none() && base_oid.is_none() {
            return Ok(branch_result(
                (base_ref, &compare_ref, None, None, None),
                "unborn-head",
                Some(
                    "This branch does not have a committed HEAD yet, so compare-to-base is unavailable.",
                ),
                Vec::new(),
                Some(0),
            ));
        }
        if head_oid.is_none() {
            return Ok(branch_result(
                (base_ref, &compare_ref, None, base_oid.as_deref(), None),
                "ready",
                None,
                Vec::new(),
                Some(0),
            ));
        }
        let Some(base_oid) = base_oid else {
            return Ok(branch_result(
                (base_ref, &compare_ref, head_oid.as_deref(), None, None),
                "invalid-base",
                Some(&format!(
                    "Base ref {base_ref} could not be resolved in this repository."
                )),
                Vec::new(),
                None,
            ));
        };
        let head_oid = head_oid.unwrap_or_default();
        let merge_base = scope
            .runner
            .checked(strings(["merge-base", &base_oid, &head_oid]))
            .await
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());
        let Some(merge_base) = merge_base else {
            return Ok(branch_result(
                (
                    base_ref,
                    &compare_ref,
                    Some(&head_oid),
                    Some(&base_oid),
                    None,
                ),
                "no-merge-base",
                Some(&format!(
                    "This branch and {base_ref} do not share a merge base, so compare-to-base is unavailable."
                )),
                Vec::new(),
                None,
            ));
        };
        match load_changes(&scope.runner, Some(&merge_base), &head_oid).await {
            Ok(entries) => {
                let ahead = scope
                    .runner
                    .checked(strings([
                        "rev-list",
                        "--count",
                        &format!("{base_oid}..{head_oid}"),
                    ]))
                    .await
                    .ok()
                    .and_then(|value| value.trim().parse::<u64>().ok())
                    .unwrap_or(0);
                Ok(branch_result(
                    (
                        base_ref,
                        &compare_ref,
                        Some(&head_oid),
                        Some(&base_oid),
                        Some(&merge_base),
                    ),
                    "ready",
                    None,
                    entries,
                    Some(ahead),
                ))
            }
            Err(error) => Ok(branch_result(
                (
                    base_ref,
                    &compare_ref,
                    Some(&head_oid),
                    Some(&base_oid),
                    Some(&merge_base),
                ),
                "error",
                Some(&error.to_string()),
                Vec::new(),
                None,
            )),
        }
    }

    pub(crate) async fn commit_compare(
        &self,
        worktree: &str,
        commit_id: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let Some(commit_oid) = resolve_commit(&scope.runner, commit_id).await else {
            return Ok(json!({
                "summary": { "commitOid": "", "parentOid": null, "compareRef": commit_id,
                    "baseRef": "parent", "changedFiles": 0, "status": "invalid-commit",
                    "errorMessage": format!("Commit {commit_id} could not be resolved in this repository.") },
                "entries": []
            }));
        };
        let parents = scope
            .runner
            .checked(strings(["rev-list", "--parents", "-n", "1", &commit_oid]))
            .await;
        let parent = parents
            .as_ref()
            .ok()
            .and_then(|line| line.split_whitespace().nth(1))
            .map(str::to_owned);
        match load_changes(&scope.runner, parent.as_deref(), &commit_oid).await {
            Ok(entries) => Ok(json!({
                "summary": { "commitOid": commit_oid, "parentOid": parent,
                    "compareRef": short_oid(&commit_oid), "baseRef": parent.as_deref().map(short_oid).unwrap_or("empty tree"),
                    "changedFiles": entries.len(), "status": "ready" },
                "entries": entries
            })),
            Err(error) => Ok(json!({
                "summary": { "commitOid": commit_oid, "parentOid": parent,
                    "compareRef": short_oid(&commit_oid), "baseRef": parent.as_deref().map(short_oid).unwrap_or("empty tree"),
                    "changedFiles": 0, "status": "error", "errorMessage": error.to_string() },
                "entries": []
            })),
        }
    }
}

async fn load_changes(
    runner: &GitRunner,
    from: Option<&str>,
    to: &str,
) -> Result<Vec<Value>, super::runner::GitError> {
    let (name_args, stats_args) = match from {
        Some(from) => (
            strings([
                "-c",
                "core.quotePath=false",
                "diff",
                "--name-status",
                "-M",
                "-C",
                from,
                to,
            ]),
            strings([
                "-c",
                "core.quotePath=false",
                "diff",
                "-z",
                "--numstat",
                "-M",
                "-C",
                from,
                to,
            ]),
        ),
        None => (
            strings([
                "-c",
                "core.quotePath=false",
                "diff-tree",
                "--root",
                "--no-commit-id",
                "--name-status",
                "-r",
                "-M",
                "-C",
                to,
            ]),
            strings([
                "-c",
                "core.quotePath=false",
                "diff-tree",
                "-z",
                "--root",
                "--no-commit-id",
                "--numstat",
                "-r",
                "-M",
                "-C",
                to,
            ]),
        ),
    };
    let (names, stats) = tokio::try_join!(runner.checked(name_args), runner.checked(stats_args))?;
    let stats = parse_numstat(&stats);
    Ok(names
        .lines()
        .filter_map(|line| change_entry(line, &stats))
        .collect())
}

fn change_entry(line: &str, stats: &HashMap<String, (u64, u64)>) -> Option<Value> {
    let parts = line.split('\t').collect::<Vec<_>>();
    let raw_status = parts.first().copied().unwrap_or_default();
    let status = status_name(raw_status.chars().next().unwrap_or('M'));
    let (old_path, path) = if raw_status.starts_with('R') || raw_status.starts_with('C') {
        (
            parts.get(1).copied(),
            parts.get(2).copied().unwrap_or_default(),
        )
    } else {
        (None, parts.get(1).copied().unwrap_or_default())
    };
    if path.is_empty() {
        return None;
    }
    let mut entry = Map::from_iter([
        ("path".to_owned(), Value::String(path.to_owned())),
        ("status".to_owned(), Value::String(status.to_owned())),
    ]);
    if let Some(old_path) = old_path {
        entry.insert("oldPath".to_owned(), Value::String(old_path.to_owned()));
    }
    if let Some((added, removed)) = stats.get(path) {
        entry.insert("added".to_owned(), json!(added));
        entry.insert("removed".to_owned(), json!(removed));
    }
    Some(Value::Object(entry))
}

fn parse_numstat(output: &str) -> HashMap<String, (u64, u64)> {
    let fields = output.split('\0').collect::<Vec<_>>();
    let mut stats = HashMap::new();
    let mut index = 0;
    while index < fields.len() {
        let header = fields[index];
        index += 1;
        if header.is_empty() {
            continue;
        }
        let mut parts = header.splitn(3, '\t');
        let added = parts.next().and_then(|value| value.parse().ok());
        let removed = parts.next().and_then(|value| value.parse().ok());
        let path = parts.next().unwrap_or_default();
        let target = if path.is_empty() && index + 1 < fields.len() {
            index += 1;
            let target = fields[index];
            index += 1;
            target
        } else {
            path
        };
        if let (Some(added), Some(removed)) = (added, removed)
            && !target.is_empty()
        {
            stats.insert(target.to_owned(), (added, removed));
        }
    }
    stats
}

fn branch_result(
    identity: (&str, &str, Option<&str>, Option<&str>, Option<&str>),
    status: &str,
    error: Option<&str>,
    entries: Vec<Value>,
    commits_ahead: Option<u64>,
) -> Value {
    let (base_ref, compare_ref, head_oid, base_oid, merge_base) = identity;
    let mut summary = Map::from_iter([
        ("baseRef".to_owned(), Value::String(base_ref.to_owned())),
        (
            "baseOid".to_owned(),
            base_oid.map_or(Value::Null, |value| Value::String(value.to_owned())),
        ),
        (
            "compareRef".to_owned(),
            Value::String(compare_ref.to_owned()),
        ),
        (
            "headOid".to_owned(),
            head_oid.map_or(Value::Null, |value| Value::String(value.to_owned())),
        ),
        (
            "mergeBase".to_owned(),
            merge_base.map_or(Value::Null, |value| Value::String(value.to_owned())),
        ),
        ("changedFiles".to_owned(), json!(entries.len())),
        ("status".to_owned(), Value::String(status.to_owned())),
    ]);
    if let Some(error) = error {
        summary.insert("errorMessage".to_owned(), Value::String(error.to_owned()));
    }
    if let Some(ahead) = commits_ahead {
        summary.insert("commitsAhead".to_owned(), json!(ahead));
    }
    json!({ "summary": summary, "entries": entries })
}

async fn current_branch(runner: &GitRunner) -> Option<String> {
    runner
        .checked(strings(["branch", "--show-current"]))
        .await
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn short_oid(oid: &str) -> &str {
    &oid[..oid.len().min(7)]
}

fn status_name(status: char) -> &'static str {
    match status {
        'A' => "added",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "copied",
        _ => "modified",
    }
}

fn strings<const N: usize>(values: [&str; N]) -> Vec<String> {
    values.into_iter().map(str::to_owned).collect()
}
