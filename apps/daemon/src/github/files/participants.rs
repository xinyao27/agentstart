use std::collections::BTreeMap;

use serde_json::{Value, json};

use crate::github::context::api_args;
use crate::github::{GitHubAuthority, GitHubContext, GitHubRepository};

const QUERY: &str = r"
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      participants(first: 100) { nodes { login name avatarUrl(size: 48) } }
    }
  }
}";

pub(super) async fn fetch(
    authority: &GitHubAuthority,
    context: &GitHubContext,
    repository: &GitHubRepository,
    number: u64,
    item: &Value,
    comments: &Value,
) -> Value {
    let args = api_args(
        repository,
        [
            "graphql".to_owned(),
            "-f".to_owned(),
            format!("query={QUERY}"),
            "-f".to_owned(),
            format!("owner={}", repository.owner),
            "-f".to_owned(),
            format!("repo={}", repository.repo),
            "-F".to_owned(),
            format!("number={number}"),
        ],
    );
    let graph = authority.gh_json(context, args, 30_000).await.ok();
    let mut users = BTreeMap::new();
    for value in graph
        .as_ref()
        .and_then(|value| value.pointer("/data/repository/pullRequest/participants/nodes"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        merge(&mut users, value);
    }
    for field in ["reviewRequests", "latestReviews", "assignees"] {
        for value in item
            .get(field)
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            merge(&mut users, value);
        }
    }
    if let Some(author) = item.get("author").and_then(Value::as_str) {
        merge(
            &mut users,
            &json!({ "login": author, "avatarUrl": item.get("authorAvatarUrl") }),
        );
    }
    for value in comments.as_array().into_iter().flatten() {
        if let Some(author) = value.get("author").and_then(Value::as_str) {
            merge(
                &mut users,
                &json!({ "login": author, "avatarUrl": value.get("authorAvatarUrl") }),
            );
        }
    }
    Value::Array(users.into_values().collect())
}

fn merge(users: &mut BTreeMap<String, Value>, raw: &Value) {
    let Some(login) = raw
        .get("login")
        .and_then(Value::as_str)
        .or_else(|| raw.get("author").and_then(Value::as_str))
    else {
        return;
    };
    if login.is_empty() || login == "ghost" {
        return;
    }
    let key = login.to_ascii_lowercase();
    let name = raw.get("name").and_then(Value::as_str);
    let avatar = raw
        .get("avatarUrl")
        .or_else(|| raw.get("authorAvatarUrl"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let existing = users.get(&key);
    users.insert(
        key,
        json!({
            "login": existing.and_then(|value| value.get("login")).and_then(Value::as_str).unwrap_or(login),
            "name": existing.and_then(|value| value.get("name")).and_then(Value::as_str).or(name),
            "avatarUrl": if avatar.is_empty() {
                existing.and_then(|value| value.get("avatarUrl")).and_then(Value::as_str).unwrap_or("")
            } else { avatar }
        }),
    );
}
