use std::sync::Arc;

use serde_json::{Map, Value, json};

use crate::hosts::{ExecutionHost, HostCommand};
use crate::projects::{GitRemoteIdentity, ProjectKind};

#[derive(Clone)]
pub(super) struct GitHubSlug {
    pub(super) owner: String,
    pub(super) repo: String,
}

pub(super) async fn inspect(
    host: Arc<dyn ExecutionHost>,
    path: &str,
    kind: ProjectKind,
    remotes: &[GitRemoteIdentity],
) -> Map<String, Value> {
    let upstream = if kind == ProjectKind::Git {
        upstream(host.clone(), path, remotes).await
    } else {
        None
    };
    let icon = super::icon_detection::detect(host, path, kind, upstream.as_ref(), remotes).await;
    let mut detected = Map::new();
    if let Some(icon) = icon {
        detected.insert("repoIcon".to_owned(), icon);
    }
    if kind == ProjectKind::Git {
        detected.insert(
            "upstream".to_owned(),
            upstream
                .map(|slug| json!({ "owner":slug.owner, "repo":slug.repo }))
                .unwrap_or(Value::Null),
        );
    }
    detected
}

pub(super) fn github_slug(remote: &GitRemoteIdentity) -> Option<GitHubSlug> {
    let path = remote.canonical_key.strip_prefix("github.com/")?;
    let mut parts = path.split('/');
    let owner = parts.next()?;
    let repo = parts.next()?;
    if owner.is_empty() || repo.is_empty() || parts.next().is_some() {
        return None;
    }
    Some(GitHubSlug {
        owner: owner.to_owned(),
        repo: repo.to_owned(),
    })
}

fn remote_slug(remotes: &[GitRemoteIdentity], name: &str) -> Option<GitHubSlug> {
    remotes
        .iter()
        .find(|remote| remote.remote_name == name)
        .and_then(github_slug)
}

async fn upstream(
    host: Arc<dyn ExecutionHost>,
    path: &str,
    remotes: &[GitRemoteIdentity],
) -> Option<GitHubSlug> {
    let origin = remote_slug(remotes, "origin")?;
    if let Some(upstream) = remote_slug(remotes, "upstream")
        && (!upstream.owner.eq_ignore_ascii_case(&origin.owner)
            || !upstream.repo.eq_ignore_ascii_case(&origin.repo))
    {
        return Some(upstream);
    }
    let slug = format!("{}/{}", origin.owner, origin.repo);
    let mut command = HostCommand::new("gh", ["repo", "view", &slug, "--json", "isFork,parent"]);
    command.cwd = Some(path.to_owned());
    command.env = vec![("GH_PROMPT_DISABLED".to_owned(), "1".to_owned())];
    command.max_output_bytes = Some(64 * 1024);
    command.timeout_ms = Some(10_000);
    let output = host.exec(command).await.ok()?;
    if output.exit_code != 0 {
        return None;
    }
    let value = serde_json::from_str::<Value>(&output.stdout).ok()?;
    if value.get("isFork").and_then(Value::as_bool) != Some(true) {
        return None;
    }
    let parent = value.get("parent")?;
    let owner = parent.get("owner")?.get("login")?.as_str()?.to_owned();
    let repo = parent.get("name")?.as_str()?.to_owned();
    (!owner.is_empty() && !repo.is_empty()).then_some(GitHubSlug { owner, repo })
}
