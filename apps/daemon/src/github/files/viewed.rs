use std::collections::HashMap;

use serde_json::Value;

use super::super::context::api_args;
use super::super::{GitHubAuthority, GitHubContext, GitHubRepository};

const QUERY: &str = r"
query($owner: String!, $repo: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      id
      files(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { path viewerViewedState }
      }
    }
  }
}";

pub(super) struct ViewedFiles {
    pub(super) pull_request_id: String,
    states: HashMap<String, String>,
}

impl ViewedFiles {
    pub(super) fn merge(&self, files: &mut Value) {
        let Some(files) = files.as_array_mut() else {
            return;
        };
        for file in files {
            let Some(path) = file.get("path").and_then(Value::as_str) else {
                continue;
            };
            file["viewerViewedState"] = Value::String(
                self.states
                    .get(path)
                    .map_or("UNVIEWED", String::as_str)
                    .to_owned(),
            );
        }
    }
}

pub(super) async fn fetch(
    authority: &GitHubAuthority,
    context: &GitHubContext,
    repository: &GitHubRepository,
    number: u64,
) -> Option<ViewedFiles> {
    let mut after: Option<String> = None;
    let mut pull_request_id = None;
    let mut states = HashMap::new();
    for _ in 0..3 {
        let mut tail = vec![
            "graphql".to_owned(),
            "-f".to_owned(),
            format!("query={QUERY}"),
            "-f".to_owned(),
            format!("owner={}", repository.owner),
            "-f".to_owned(),
            format!("repo={}", repository.repo),
            "-F".to_owned(),
            format!("number={number}"),
        ];
        if let Some(after) = &after {
            tail.extend(["-f".to_owned(), format!("after={after}")]);
        }
        let raw = authority
            .gh_json(context, api_args(repository, tail), 30_000)
            .await
            .ok()?;
        if raw
            .get("errors")
            .and_then(Value::as_array)
            .is_some_and(|value| !value.is_empty())
        {
            return None;
        }
        let pull_request = raw.pointer("/data/repository/pullRequest")?;
        pull_request_id = pull_request
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .or(pull_request_id);
        for file in pull_request
            .pointer("/files/nodes")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let Some(path) = file.get("path").and_then(Value::as_str) else {
                continue;
            };
            let Some(state) = file.get("viewerViewedState").and_then(Value::as_str) else {
                continue;
            };
            states.insert(path.to_owned(), state.to_owned());
        }
        let page = pull_request.pointer("/files/pageInfo")?;
        if page.get("hasNextPage").and_then(Value::as_bool) != Some(true) {
            break;
        }
        after = page
            .get("endCursor")
            .and_then(Value::as_str)
            .map(str::to_owned);
        after.as_ref()?;
    }
    Some(ViewedFiles {
        pull_request_id: pull_request_id?,
        states,
    })
}
