use std::sync::OnceLock;

use regex::Regex;
use url::Url;

use super::GitRemoteIdentity;

pub(crate) fn normalize(remote_name: &str, remote_url: &str) -> Option<GitRemoteIdentity> {
    let trimmed = remote_url.trim();
    if !trimmed.contains("://")
        && let Some((host, path)) = split_scp_remote(trimmed)
    {
        return identity(remote_name, trimmed, host, path);
    }
    let url = Url::parse(trimmed).ok()?;
    if !matches!(url.scheme(), "git" | "http" | "https" | "ssh") {
        return None;
    }
    let hostname = url.host_str()?.to_lowercase();
    let host = match url.port() {
        Some(port) => format!("{hostname}:{port}"),
        None => hostname,
    };
    identity(remote_name, trimmed, &host, url.path())
}

fn split_scp_remote(value: &str) -> Option<(&str, &str)> {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    let pattern = PATTERN.get_or_init(|| {
        Regex::new(r"^(?:[^@/\s]+@)?([^:/\s]+):(.+)$").expect("Git SCP remote pattern is valid")
    });
    let captures = pattern.captures(value)?;
    Some((captures.get(1)?.as_str(), captures.get(2)?.as_str()))
}

fn identity(
    remote_name: &str,
    remote_url: &str,
    host: &str,
    raw_path: &str,
) -> Option<GitRemoteIdentity> {
    let path = raw_path.trim_matches('/');
    let suffix_start = path.len().saturating_sub(4);
    let without_suffix = path
        .as_bytes()
        .get(suffix_start..)
        .is_some_and(|suffix| suffix.eq_ignore_ascii_case(b".git"))
        .then(|| &path[..suffix_start]);
    let path = without_suffix.unwrap_or(path);
    if host.is_empty() || path.is_empty() {
        return None;
    }
    Some(GitRemoteIdentity {
        canonical_key: format!("{}/{path}", host.to_lowercase()),
        remote_name: remote_name.to_owned(),
        remote_url: remote_url.to_owned(),
    })
}
