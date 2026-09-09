use serde_json::{Value, json};

use crate::github::{GitHubAuthority, GitHubContext};

pub(crate) async fn summary(
    authority: &GitHubAuthority,
    context: &GitHubContext,
    pull_request: &Value,
) -> Option<Value> {
    let base_ref = pull_request.get("baseRefName")?.as_str()?;
    let base_oid = pull_request.get("baseRefOid")?.as_str()?;
    let head_oid = pull_request.get("headRefOid")?.as_str()?;
    let merge_base = authority
        .git(context, ["merge-base", head_oid, base_oid], 15_000)
        .await
        .ok()?;
    let behind = authority
        .git(
            context,
            ["rev-list", "--count", &format!("{head_oid}..{base_oid}")],
            15_000,
        )
        .await
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .unwrap_or(0);
    let tree = authority
        .git(
            context,
            ["merge-tree", merge_base.trim(), base_oid, head_oid],
            30_000,
        )
        .await
        .ok()?;
    let files = parse_conflicts(&tree);
    Some(json!({
        "baseRef": base_ref,
        "baseCommit": base_oid.chars().take(7).collect::<String>(),
        "commitsBehind": behind,
        "files": files,
        "localMergeState": files.is_empty().then_some("clean")
    }))
}

fn parse_conflicts(output: &str) -> Vec<String> {
    let mut conflict = false;
    let mut files = Vec::new();
    for line in output.lines() {
        if matches!(
            line,
            "changed in both" | "added in both" | "removed in both"
        ) {
            conflict = true;
            continue;
        }
        if !conflict {
            continue;
        }
        let trimmed = line.trim_start();
        if trimmed.starts_with("our ") || trimmed.starts_with("their ") {
            if let Some(path) = trimmed.splitn(4, ' ').nth(3)
                && !files.iter().any(|value| value == path)
            {
                files.push(path.to_owned());
            }
        } else if !line.starts_with(' ') {
            conflict = false;
        }
    }
    files
}
