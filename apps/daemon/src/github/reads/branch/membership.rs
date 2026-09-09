use std::time::{Duration, Instant};

use serde_json::Value;

use crate::github::context::api_args;
use crate::github::{GitHubAuthority, GitHubContext, GitHubRepository};

const DEFINITIVE_TTL: Duration = Duration::from_secs(6 * 60 * 60);
const ERROR_TTL: Duration = Duration::from_secs(5 * 60);
const MAX_PAGES: u64 = 5;
const PAGE_SIZE: usize = 100;
const CACHE_MAX: usize = 200;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Membership {
    Contained,
    NotContained,
    Unknown,
}

pub(super) async fn contains(
    authority: &GitHubAuthority,
    context: &GitHubContext,
    repository: &GitHubRepository,
    pull_request: &Value,
    commit_oid: &str,
) -> Membership {
    let Some(number) = pull_request.get("number").and_then(Value::as_u64) else {
        return Membership::Unknown;
    };
    let oid = commit_oid.trim().to_ascii_lowercase();
    if !(4..=64).contains(&oid.len()) || !oid.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Membership::Unknown;
    }
    let key = format!(
        "membership\0{}\0{}/{}#{number}@{oid}",
        context.execution_host_id,
        repository.owner.to_ascii_lowercase(),
        repository.repo.to_ascii_lowercase()
    );
    if let Some(value) = cached(authority, &key) {
        return value;
    }
    for page in 1..=MAX_PAGES {
        let endpoint = format!(
            "repos/{}/{}/commits/{oid}/pulls?per_page={PAGE_SIZE}&page={page}",
            repository.owner, repository.repo
        );
        let result = authority
            .gh_json(context, api_args(repository, [endpoint]), 30_000)
            .await;
        let Ok(Value::Array(values)) = result else {
            cache(authority, key, Membership::Unknown, ERROR_TTL);
            return Membership::Unknown;
        };
        if values
            .iter()
            .any(|value| value.get("number").and_then(Value::as_u64) == Some(number))
        {
            cache(authority, key, Membership::Contained, DEFINITIVE_TTL);
            return Membership::Contained;
        }
        if values.len() < PAGE_SIZE {
            cache(authority, key, Membership::NotContained, DEFINITIVE_TTL);
            return Membership::NotContained;
        }
    }
    cache(authority, key, Membership::Unknown, ERROR_TTL);
    Membership::Unknown
}

fn cached(authority: &GitHubAuthority, key: &str) -> Option<Membership> {
    let cache = authority
        .membership_cache
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    cache
        .get(key)
        .filter(|(created, _)| created.elapsed() < DEFINITIVE_TTL)
        .and_then(|(_, value)| match value.as_str() {
            "contained" => Some(Membership::Contained),
            "not-contained" => Some(Membership::NotContained),
            "unknown" => Some(Membership::Unknown),
            _ => None,
        })
}

fn cache(authority: &GitHubAuthority, key: String, value: Membership, ttl: Duration) {
    let created = Instant::now()
        .checked_sub(DEFINITIVE_TTL.saturating_sub(ttl))
        .unwrap_or_else(Instant::now);
    let mut cache = authority
        .membership_cache
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    cache.retain(|_, (stored, _)| stored.elapsed() < DEFINITIVE_TTL);
    while cache.len() >= CACHE_MAX {
        let Some(oldest) = cache
            .iter()
            .min_by_key(|(_, (stored, _))| *stored)
            .map(|(key, _)| key.clone())
        else {
            break;
        };
        cache.remove(&oldest);
    }
    cache.insert(
        key,
        (
            created,
            match value {
                Membership::Contained => "contained",
                Membership::NotContained => "not-contained",
                Membership::Unknown => "unknown",
            }
            .to_owned(),
        ),
    );
}
