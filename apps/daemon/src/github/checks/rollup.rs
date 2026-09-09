mod mapping;

use serde_json::Value;

use super::super::context::api_args;
use super::super::{GitHubAuthority, GitHubContext, GitHubError, GitHubRepository};

const QUERY: &str = r"
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      headRefOid
      commits(last: 1) { nodes { commit {
        statusCheckRollup { contexts(first: 100) { nodes {
          __typename
          ... on CheckRun {
            databaseId name status conclusion detailsUrl url
            checkSuite { databaseId workflowRun { databaseId } }
          }
          ... on StatusContext { context state targetUrl }
        } } }
        checkSuites(first: 100) { nodes {
          databaseId status conclusion url app { name slug }
        } }
      } } }
    }
  }
}";

pub(super) async fn fetch(
    authority: &GitHubAuthority,
    context: &GitHubContext,
    repository: &GitHubRepository,
    number: u64,
    no_cache: bool,
) -> Result<Option<Vec<Value>>, GitHubError> {
    let mut tail = vec!["graphql".to_owned()];
    if !no_cache {
        tail.extend(["--cache".to_owned(), "60s".to_owned()]);
    }
    tail.extend([
        "-f".to_owned(),
        format!("owner={}", repository.owner),
        "-f".to_owned(),
        format!("repo={}", repository.repo),
        "-F".to_owned(),
        format!("pr={number}"),
        "-f".to_owned(),
        format!("query={QUERY}"),
    ]);
    let raw = authority
        .gh_json(context, api_args(repository, tail), 30_000)
        .await?;
    let Some(pr) = raw.pointer("/data/repository/pullRequest") else {
        return Ok(None);
    };
    let Some(commit) = pr.pointer("/commits/nodes/0/commit") else {
        return Ok(Some(Vec::new()));
    };
    let contexts = commit
        .pointer("/statusCheckRollup/contexts/nodes")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    let mut output = Vec::new();
    let mut names = Vec::new();
    let mut suites_with_runs = Vec::new();
    for raw in contexts
        .iter()
        .filter(|value| value.get("__typename").and_then(Value::as_str) == Some("CheckRun"))
    {
        let Some(name) = raw
            .get("name")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        names.push(name.to_owned());
        if let Some(id) = raw
            .pointer("/checkSuite/databaseId")
            .and_then(Value::as_u64)
        {
            suites_with_runs.push(id);
        }
        output.push(mapping::check_run(raw, name));
    }
    for raw in contexts
        .iter()
        .filter(|value| value.get("__typename").and_then(Value::as_str) == Some("StatusContext"))
    {
        let Some(name) = raw
            .get("context")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        if !names.iter().any(|value| value == name) {
            output.push(mapping::status(raw, name));
        }
    }
    let head_sha = pr.get("headRefOid").and_then(Value::as_str);
    for (index, suite) in commit
        .pointer("/checkSuites/nodes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|value| {
            value
                .get("conclusion")
                .and_then(Value::as_str)
                .is_some_and(|value| value.eq_ignore_ascii_case("action_required"))
        })
        .filter(|value| {
            value
                .get("databaseId")
                .and_then(Value::as_u64)
                .is_none_or(|id| !suites_with_runs.contains(&id))
        })
        .enumerate()
    {
        output.push(mapping::pending_suite(repository, suite, head_sha, index));
    }
    Ok(Some(output))
}

pub(super) async fn rest(
    authority: &GitHubAuthority,
    context: &GitHubContext,
    repository: &GitHubRepository,
    head_sha: &str,
    no_cache: bool,
) -> Option<Vec<Value>> {
    let cache = (!no_cache).then_some("60s");
    let encoded = super::super::files::percent_encode(head_sha);
    let endpoint = format!(
        "repos/{}/{}/commits/{encoded}",
        repository.owner, repository.repo
    );
    let runs = authority
        .gh_json(
            context,
            rest_args(
                repository,
                cache,
                format!("{endpoint}/check-runs?per_page=100"),
            ),
            30_000,
        )
        .await
        .ok()?;
    let mut output = runs
        .get("check_runs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|raw| {
            let name = raw.get("name").and_then(Value::as_str)?;
            Some(mapping::check_run(raw, name))
        })
        .collect::<Vec<_>>();
    let names = output
        .iter()
        .filter_map(|value| value.get("name").and_then(Value::as_str))
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if let Ok(statuses) = authority
        .gh_json(
            context,
            rest_args(repository, cache, format!("{endpoint}/status?per_page=100")),
            30_000,
        )
        .await
    {
        for raw in statuses
            .get("statuses")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let Some(name) = raw.get("context").and_then(Value::as_str) else {
                continue;
            };
            if !names.iter().any(|value| value == name) {
                output.push(mapping::status(raw, name));
            }
        }
    }
    if let Ok(suites) = authority
        .gh_json(
            context,
            rest_args(
                repository,
                cache,
                format!("{endpoint}/check-suites?per_page=100"),
            ),
            30_000,
        )
        .await
    {
        for (index, suite) in suites
            .get("check_suites")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter(|value| {
                value.get("conclusion").and_then(Value::as_str) == Some("action_required")
            })
            .enumerate()
        {
            output.push(mapping::pending_suite(
                repository,
                suite,
                Some(head_sha),
                index,
            ));
        }
    }
    (!output.is_empty()).then_some(output)
}

fn rest_args(repository: &GitHubRepository, cache: Option<&str>, endpoint: String) -> Vec<String> {
    let mut args = Vec::new();
    if let Some(cache) = cache {
        args.extend(["--cache".to_owned(), cache.to_owned()]);
    }
    args.push(endpoint);
    api_args(repository, args)
}
