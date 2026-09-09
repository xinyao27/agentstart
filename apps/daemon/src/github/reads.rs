use serde_json::{Value, json};

use super::context::api_args;
use super::mapping::{user, work_item};
use super::{GitHubAuthority, GitHubContext, GitHubError, GitHubRepository};

mod branch;
pub(crate) use branch::BranchLookup;
pub(crate) use branch::conflict_summary;

pub(super) const PR_FIELDS: &str = "number,title,state,url,labels,updatedAt,author,isDraft,headRefName,baseRefName,headRefOid,baseRefOid,headRepositoryOwner,additions,deletions,changedFiles,reviewDecision,reviewRequests,latestReviews,assignees,statusCheckRollup,mergeable,mergeStateStatus,autoMergeRequest,maintainerCanModify";
const PR_LIST_FIELDS: &str = "number,title,state,url,labels,updatedAt,author,isDraft,headRefName,baseRefName,headRefOid,headRepositoryOwner,reviewRequests";

impl GitHubAuthority {
    pub(crate) async fn rate_limit(&self, force: bool) -> Value {
        let Ok(host) = self.hosts.execution_host("local").await else {
            return json!({ "ok": false, "error": "GitHub host is unavailable" });
        };
        let context = GitHubContext {
            execution_host_id: "local".to_owned(),
            host,
            path: ".".to_owned(),
            project_id: "local".to_owned(),
        };
        self.rate_limit_for(&context, force).await
    }

    pub(crate) async fn repo_slug(&self, repo: &str) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        Ok(self
            .repository(&context)
            .await?
            .as_ref()
            .map_or(Value::Null, repository_json))
    }

    pub(crate) async fn repo_upstream(&self, repo: &str) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let origin = self.repository(&context).await?;
        let upstream = self
            .git(&context, ["remote", "get-url", "upstream"], 10_000)
            .await
            .ok()
            .and_then(|value| parse_remote_slug(&value));
        if let Some(upstream) = upstream
            && different_repository(origin.as_ref(), &upstream)
        {
            return Ok(repository_json(&upstream));
        }
        let Some(origin) = origin else {
            return Ok(Value::Null);
        };
        let value = self
            .gh_json(
                &context,
                ["repo", "view", &slug(&origin), "--json", "isFork,parent"],
                10_000,
            )
            .await;
        let Ok(value) = value else {
            return Ok(Value::Null);
        };
        let owner = value.pointer("/parent/owner/login").and_then(Value::as_str);
        let repo = value.pointer("/parent/name").and_then(Value::as_str);
        Ok(
            if value.get("isFork").and_then(Value::as_bool) == Some(true) {
                match (owner, repo) {
                    (Some(owner), Some(repo)) => json!({ "owner": owner, "repo": repo }),
                    _ => Value::Null,
                }
            } else {
                Value::Null
            },
        )
    }

    pub(crate) async fn list_work_items(
        &self,
        repo: &str,
        limit: u64,
        page: u64,
        query: Option<&str>,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let repository = self.repository(&context).await?;
        let limit = limit.clamp(1, 100);
        let page = page.max(1);
        let fetch_limit = (limit * page).min(1_000);
        let search = [query.unwrap_or("").trim(), "is:pr", "sort:created-desc"]
            .into_iter()
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        if search.len() > 8 * 1_024 {
            return Ok(json!({ "items": [], "source": Value::Null }));
        }
        let mut args = vec![
            "pr".to_owned(),
            "list".to_owned(),
            "--limit".to_owned(),
            fetch_limit.to_string(),
            "--state".to_owned(),
            "all".to_owned(),
            "--json".to_owned(),
            PR_LIST_FIELDS.to_owned(),
            "--search".to_owned(),
            search,
        ];
        append_repo(&mut args, repository.as_ref());
        let raw = self.gh_json(&context, args, 30_000).await?;
        let offset = usize::try_from((page - 1) * limit).unwrap_or(usize::MAX);
        let items = raw
            .as_array()
            .into_iter()
            .flatten()
            .skip(offset)
            .take(usize::try_from(limit).unwrap_or(100))
            .map(|value| work_item(value, repository.as_ref()))
            .collect::<Vec<_>>();
        Ok(json!({
            "items": items,
            "source": repository.as_ref().map_or(Value::Null, repository_json)
        }))
    }

    pub(crate) async fn work_item(
        &self,
        repo: &str,
        number: u64,
        override_repo: Option<GitHubRepository>,
    ) -> Result<Value, GitHubError> {
        let context = self.context(repo, None).await?;
        let repository = self.resolve_repository(&context, override_repo).await?;
        let mut args = vec![
            "pr".to_owned(),
            "view".to_owned(),
            number.to_string(),
            "--json".to_owned(),
            PR_FIELDS.to_owned(),
        ];
        append_repo(&mut args, repository.as_ref());
        match self.gh_json(&context, args, 30_000).await {
            Ok(raw) => Ok(work_item(&raw, repository.as_ref())),
            Err(_) => Ok(Value::Null),
        }
    }

    pub(crate) async fn list_labels(&self, repo: &str) -> Result<Value, GitHubError> {
        let (context, repository) = self.resolved(repo).await?;
        let Some(repository) = repository else {
            return Ok(json!([]));
        };
        let endpoint = format!(
            "repos/{}/{}/labels?per_page=100",
            repository.owner, repository.repo
        );
        let output = self
            .gh(
                &context,
                api_args(&repository, ["--paginate", &endpoint, "--jq", ".[].name"]),
                30_000,
            )
            .await;
        Ok(match output {
            Ok(output) => Value::Array(
                output
                    .lines()
                    .filter(|line| !line.is_empty())
                    .map(|line| json!(line))
                    .collect(),
            ),
            Err(_) => json!([]),
        })
    }

    pub(crate) async fn list_assignable_users(&self, repo: &str) -> Result<Value, GitHubError> {
        let (context, repository) = self.resolved(repo).await?;
        let Some(repository) = repository else {
            return Ok(json!([]));
        };
        let endpoint = format!(
            "repos/{}/{}/assignees?per_page=100",
            repository.owner, repository.repo
        );
        let output = self
            .gh_json(
                &context,
                api_args(&repository, ["--paginate", &endpoint]),
                30_000,
            )
            .await;
        Ok(match output {
            Ok(Value::Array(values)) => {
                Value::Array(values.iter().filter_map(user).collect::<Vec<_>>())
            }
            _ => json!([]),
        })
    }

    async fn resolved(
        &self,
        repo: &str,
    ) -> Result<(GitHubContext, Option<GitHubRepository>), GitHubError> {
        let context = self.context(repo, None).await?;
        let repository = self.repository(&context).await?;
        Ok((context, repository))
    }
}

pub(super) fn append_repo(args: &mut Vec<String>, repository: Option<&GitHubRepository>) {
    if let Some(repository) = repository {
        args.extend(["--repo".to_owned(), slug(repository)]);
    }
}

pub(super) fn slug(repository: &GitHubRepository) -> String {
    repository.host.as_ref().map_or_else(
        || format!("{}/{}", repository.owner, repository.repo),
        |host| format!("{host}/{}/{}", repository.owner, repository.repo),
    )
}

fn different_repository(left: Option<&GitHubRepository>, right: &GitHubRepository) -> bool {
    left.is_none_or(|left| {
        !left.owner.eq_ignore_ascii_case(&right.owner)
            || !left.repo.eq_ignore_ascii_case(&right.repo)
    })
}

fn parse_remote_slug(value: &str) -> Option<GitHubRepository> {
    let path = value
        .trim()
        .strip_prefix("git@github.com:")
        .or_else(|| value.trim().strip_prefix("https://github.com/"))?;
    super::context::parse_slug(path)
}

fn repository_json(repository: &GitHubRepository) -> Value {
    json!({ "owner": repository.owner, "repo": repository.repo })
}
