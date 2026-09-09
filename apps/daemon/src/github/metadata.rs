use std::time::Duration;

use serde_json::{Map, Value, json};

use super::context::api_args;
use super::{GitHubAuthority, GitHubContext, GitHubRepository};

const MERGE_CACHE_TTL: Duration = Duration::from_secs(60);
const MERGE_CACHE_MAX: usize = 256;

const QUERY: &str = r"
query($owner: String!, $repo: String!, $branch: String!) {
  repository(owner: $owner, name: $repo) {
    viewerDefaultMergeMethod mergeCommitAllowed rebaseMergeAllowed squashMergeAllowed
    autoMergeAllowed mergeQueue(branch: $branch) { id }
  }
}";
const BASIC_QUERY: &str = r"
query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    viewerDefaultMergeMethod mergeCommitAllowed rebaseMergeAllowed squashMergeAllowed
    autoMergeAllowed
  }
}";

impl GitHubAuthority {
    pub(super) async fn merge_metadata(
        &self,
        context: &GitHubContext,
        repository: &GitHubRepository,
        branch: Option<&str>,
    ) -> Value {
        let key = format!(
            "{}\0{}\0{}\0{}",
            context.execution_host_id,
            repository.owner.to_ascii_lowercase(),
            repository.repo.to_ascii_lowercase(),
            branch.unwrap_or("__repo__")
        );
        if let Some(value) = self.cached_merge_metadata(&key) {
            return value;
        }
        let Some(branch) = branch else {
            return Value::Object(Map::new());
        };
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
                "-f".to_owned(),
                format!("branch={branch}"),
            ],
        );
        let repository_data = self
            .gh_json(context, args, 30_000)
            .await
            .ok()
            .and_then(|raw| raw.pointer("/data/repository").cloned());
        let repository_data = match repository_data {
            Some(value) => Some(value),
            None => self.basic_merge_metadata(context, repository).await,
        };
        let value = repository_data.map_or_else(unknown_metadata, map_metadata);
        self.cache_merge_metadata(key, value.clone());
        value
    }

    async fn basic_merge_metadata(
        &self,
        context: &GitHubContext,
        repository: &GitHubRepository,
    ) -> Option<Value> {
        let args = api_args(
            repository,
            [
                "graphql".to_owned(),
                "-f".to_owned(),
                format!("query={BASIC_QUERY}"),
                "-f".to_owned(),
                format!("owner={}", repository.owner),
                "-f".to_owned(),
                format!("repo={}", repository.repo),
            ],
        );
        self.gh_json(context, args, 30_000)
            .await
            .ok()
            .and_then(|raw| raw.pointer("/data/repository").cloned())
    }

    fn cached_merge_metadata(&self, key: &str) -> Option<Value> {
        let cache = self
            .merge_cache
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        cache
            .get(key)
            .filter(|(created, _)| created.elapsed() < MERGE_CACHE_TTL)
            .map(|(_, value)| value.clone())
    }

    fn cache_merge_metadata(&self, key: String, value: Value) {
        let mut cache = self
            .merge_cache
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        cache.retain(|_, (created, _)| created.elapsed() < MERGE_CACHE_TTL);
        if cache.len() >= MERGE_CACHE_MAX
            && let Some(oldest) = cache
                .iter()
                .min_by_key(|(_, (created, _))| *created)
                .map(|(key, _)| key.clone())
        {
            cache.remove(&oldest);
        }
        cache.insert(key, (std::time::Instant::now(), value));
    }
}

pub(super) fn apply(item: &mut Value, metadata: &Value) {
    let Some(item) = item.as_object_mut() else {
        return;
    };
    let Some(metadata) = metadata.as_object() else {
        return;
    };
    for key in [
        "autoMergeAllowed",
        "mergeQueueRequired",
        "mergeMethodSettings",
    ] {
        if let Some(value) = metadata.get(key) {
            item.insert(key.to_owned(), value.clone());
        }
    }
}

fn map_metadata(raw: Value) -> Value {
    let default = raw
        .get("viewerDefaultMergeMethod")
        .and_then(Value::as_str)
        .unwrap_or("SQUASH")
        .to_ascii_lowercase();
    json!({
        "autoMergeAllowed": raw.get("autoMergeAllowed").and_then(Value::as_bool),
        "mergeQueueRequired": raw.get("mergeQueue").map(|value| !value.is_null()),
        "mergeMethodSettings": {
            "defaultMethod": default,
            "allowedMethods": {
                "merge": raw.get("mergeCommitAllowed").and_then(Value::as_bool).unwrap_or(false),
                "squash": raw.get("squashMergeAllowed").and_then(Value::as_bool).unwrap_or(false),
                "rebase": raw.get("rebaseMergeAllowed").and_then(Value::as_bool).unwrap_or(false)
            }
        }
    })
}

fn unknown_metadata() -> Value {
    json!({ "autoMergeAllowed": null, "mergeQueueRequired": null })
}
