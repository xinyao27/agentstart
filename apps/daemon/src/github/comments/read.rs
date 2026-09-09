use serde_json::{Map, Value, json};

use super::super::context::api_args;
use super::super::{GitHubAuthority, GitHubContext, GitHubError, GitHubRepository};

const REVIEW_THREADS_QUERY: &str = r"
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          id isResolved line startLine originalLine originalStartLine
          comments(first: 100) {
            nodes {
              databaseId author { __typename login avatarUrl(size: 48) }
              body createdAt url path
              reactionGroups { content reactors { totalCount } }
            }
          }
        }
      }
      comments(first: 100) {
        nodes {
          databaseId author { __typename login avatarUrl(size: 48) }
          body createdAt url reactionGroups { content reactors { totalCount } }
        }
      }
    }
  }
}";

pub(super) async fn fetch(
    authority: &GitHubAuthority,
    context: &GitHubContext,
    repository: &GitHubRepository,
    number: u64,
    no_cache: bool,
) -> Result<Value, GitHubError> {
    let base = format!("repos/{}/{}", repository.owner, repository.repo);
    let cache = (!no_cache).then_some("60s");
    let conversation_args = rest_args(
        repository,
        cache,
        format!("{base}/issues/{number}/comments?per_page=100"),
    );
    let review_args = rest_args(
        repository,
        cache,
        format!("{base}/pulls/{number}/reviews?per_page=100"),
    );
    let graph_args = api_args(
        repository,
        [
            "graphql".to_owned(),
            "-f".to_owned(),
            format!("query={REVIEW_THREADS_QUERY}"),
            "-f".to_owned(),
            format!("owner={}", repository.owner),
            "-f".to_owned(),
            format!("repo={}", repository.repo),
            "-F".to_owned(),
            format!("pr={number}"),
        ],
    );
    let (conversation, threads, reviews) = tokio::join!(
        authority.gh_json(context, conversation_args, 30_000),
        authority.gh_json(context, graph_args, 30_000),
        authority.gh_json(context, review_args, 30_000)
    );
    let mut comments = rest_comments(conversation, false);
    if let Ok(value) = threads {
        let graph_conversation = graph_conversation(&value);
        if !graph_conversation.is_empty() {
            comments = graph_conversation;
        }
        comments.extend(graph_threads(&value));
    }
    comments.extend(rest_comments(reviews, false));
    comments.sort_by(|left, right| text(left, "createdAt").cmp(text(right, "createdAt")));
    comments.dedup_by_key(|comment| comment.get("id").and_then(Value::as_u64));
    Ok(Value::Array(comments))
}

fn rest_args(repository: &GitHubRepository, cache: Option<&str>, endpoint: String) -> Vec<String> {
    let mut args = Vec::new();
    if let Some(cache) = cache {
        args.extend(["--cache".to_owned(), cache.to_owned()]);
    }
    args.push(endpoint);
    api_args(repository, args)
}

fn rest_comments(result: Result<Value, GitHubError>, inline: bool) -> Vec<Value> {
    let Ok(Value::Array(values)) = result else {
        return Vec::new();
    };
    values
        .iter()
        .filter(|value| {
            value
                .get("body")
                .and_then(Value::as_str)
                .is_some_and(|body| !body.trim().is_empty())
        })
        .map(|value| super::map_comment(value, inline))
        .collect()
}

fn graph_conversation(raw: &Value) -> Vec<Value> {
    raw.pointer("/data/repository/pullRequest/comments/nodes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|comment| graph_comment(comment, None))
        .collect()
}

fn graph_threads(raw: &Value) -> Vec<Value> {
    let mut output = Vec::new();
    for thread in raw
        .pointer("/data/repository/pullRequest/reviewThreads/nodes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        for comment in thread
            .pointer("/comments/nodes")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            output.push(graph_comment(comment, Some(thread)));
        }
    }
    output
}

fn graph_comment(raw: &Value, thread: Option<&Value>) -> Value {
    let author = raw.get("author");
    let mut output = Map::from_iter([
        (
            "id".to_owned(),
            raw.get("databaseId").cloned().unwrap_or_else(|| json!(0)),
        ),
        (
            "author".to_owned(),
            json!(
                author
                    .and_then(|value| value.get("login"))
                    .and_then(Value::as_str)
                    .unwrap_or("ghost")
            ),
        ),
        (
            "authorAvatarUrl".to_owned(),
            json!(
                author
                    .and_then(|value| value.get("avatarUrl"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
            ),
        ),
        ("body".to_owned(), json!(text(raw, "body"))),
        ("createdAt".to_owned(), json!(text(raw, "createdAt"))),
        ("url".to_owned(), json!(text(raw, "url"))),
        (
            "isBot".to_owned(),
            json!(
                author
                    .and_then(|value| value.get("__typename"))
                    .and_then(Value::as_str)
                    == Some("Bot")
            ),
        ),
    ]);
    if let Some(reactions) = reactions(raw.get("reactionGroups")) {
        output.insert("reactions".to_owned(), reactions);
    }
    if let Some(thread) = thread {
        for (key, value) in [
            ("path", raw.get("path")),
            ("threadId", thread.get("id")),
            ("isResolved", thread.get("isResolved")),
        ] {
            if let Some(value) = value {
                output.insert(key.to_owned(), value.clone());
            }
        }
        output.insert(
            "isOutdated".to_owned(),
            json!(thread.get("line").is_none_or(Value::is_null)),
        );
        for (key, current, original) in [
            ("line", "line", "originalLine"),
            ("startLine", "startLine", "originalStartLine"),
        ] {
            if let Some(value) = thread
                .get(current)
                .filter(|value| !value.is_null())
                .or_else(|| thread.get(original).filter(|value| !value.is_null()))
            {
                output.insert(key.to_owned(), value.clone());
            }
        }
    }
    Value::Object(output)
}

fn reactions(raw: Option<&Value>) -> Option<Value> {
    let mut output = Vec::new();
    for group in raw.and_then(Value::as_array).into_iter().flatten() {
        let content = match text(group, "content") {
            "THUMBS_UP" => "+1",
            "THUMBS_DOWN" => "-1",
            "LAUGH" => "laugh",
            "CONFUSED" => "confused",
            "HEART" => "heart",
            "HOORAY" => "hooray",
            "ROCKET" => "rocket",
            "EYES" => "eyes",
            _ => continue,
        };
        let count = group
            .pointer("/reactors/totalCount")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        if count > 0 {
            output.push(json!({ "content": content, "count": count }));
        }
    }
    (!output.is_empty()).then(|| Value::Array(output))
}

fn text<'a>(raw: &'a Value, key: &str) -> &'a str {
    raw.get(key).and_then(Value::as_str).unwrap_or("")
}
