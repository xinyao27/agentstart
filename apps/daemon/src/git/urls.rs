use serde_json::Value;
use url::Url;

use super::runner::GitRunner;
use super::scope::{GitAuthority, GitAuthorityError};

#[derive(Clone, Copy)]
enum HostedProvider {
    Bitbucket,
    GitHub,
    GitLab,
}

struct HostedRemote {
    host: &'static str,
    path: String,
    provider: HostedProvider,
}

impl GitAuthority {
    pub(crate) async fn remote_commit_url(
        &self,
        worktree: &str,
        sha: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let Some(remote) = origin_url(&scope.runner).await else {
            return Ok(Value::Null);
        };
        Ok(build_commit_url(&remote, sha)
            .map(Value::String)
            .unwrap_or(Value::Null))
    }
}

async fn origin_url(runner: &GitRunner) -> Option<String> {
    runner
        .read(strings(["remote", "get-url", "origin"]))
        .await
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn build_commit_url(remote: &str, sha: &str) -> Option<String> {
    let sha = sha.trim();
    if sha.is_empty() {
        return None;
    }
    let remote = parse_hosted_remote(remote)?;
    let base = format!("https://{}/{}", remote.host, encode_path(&remote.path));
    let sha = encode_component(sha);
    Some(match remote.provider {
        HostedProvider::GitHub => format!("{base}/commit/{sha}"),
        HostedProvider::GitLab => format!("{base}/-/commit/{sha}"),
        HostedProvider::Bitbucket => format!("{base}/commits/{sha}"),
    })
}

fn parse_hosted_remote(value: &str) -> Option<HostedRemote> {
    let value = value.trim().strip_prefix("git+").unwrap_or(value.trim());
    if let Some((name, path)) = value.split_once(':')
        && name.bytes().all(|byte| byte.is_ascii_alphabetic())
        && path.len() >= 2
        && !path.starts_with('/')
        && let Some((host, provider)) = shorthand_provider(name)
    {
        return clean_remote_path(path).map(|path| HostedRemote {
            host,
            path,
            provider,
        });
    }
    if !value.contains("://")
        && !value.chars().any(char::is_whitespace)
        && let Some((authority, path)) = value.split_once(':')
        && !path.is_empty()
        && let Some(host) = scp_host(authority)
        && let Some((host, provider)) = provider_for_host(host)
    {
        return clean_remote_path(path).map(|path| HostedRemote {
            host,
            path,
            provider,
        });
    }
    let parsed = Url::parse(value).ok()?;
    if !matches!(parsed.scheme(), "git" | "http" | "https" | "ssh") {
        return None;
    }
    let (host, provider) = provider_for_host(parsed.host_str()?)?;
    clean_remote_path(parsed.path()).map(|path| HostedRemote {
        host,
        path,
        provider,
    })
}

fn shorthand_provider(value: &str) -> Option<(&'static str, HostedProvider)> {
    match value.to_ascii_lowercase().as_str() {
        "github" => Some(("github.com", HostedProvider::GitHub)),
        "gitlab" => Some(("gitlab.com", HostedProvider::GitLab)),
        "bitbucket" => Some(("bitbucket.org", HostedProvider::Bitbucket)),
        _ => None,
    }
}

fn scp_host(authority: &str) -> Option<&str> {
    let (user, host) = authority
        .split_once('@')
        .map_or((None, authority), |(user, host)| (Some(user), host));
    if host.is_empty()
        || host.contains([':', '/'])
        || user.is_some_and(|user| user.is_empty() || user.contains(['@', ':', '/']))
    {
        return None;
    }
    Some(host)
}

fn provider_for_host(value: &str) -> Option<(&'static str, HostedProvider)> {
    match value.to_ascii_lowercase().as_str() {
        "github.com" | "ssh.github.com" => Some(("github.com", HostedProvider::GitHub)),
        "gitlab.com" => Some(("gitlab.com", HostedProvider::GitLab)),
        "bitbucket.org" => Some(("bitbucket.org", HostedProvider::Bitbucket)),
        _ => None,
    }
}

fn clean_remote_path(value: &str) -> Option<String> {
    let value = value.trim_matches('/');
    let value = if value
        .as_bytes()
        .get(value.len().saturating_sub(4)..)
        .is_some_and(|suffix| suffix.eq_ignore_ascii_case(b".git"))
    {
        &value[..value.len() - 4]
    } else {
        value
    };
    let parts = value
        .split('/')
        .filter(|part| !part.is_empty())
        .map(|part| percent_decode(part).unwrap_or_else(|| part.to_owned()))
        .collect::<Vec<_>>();
    (parts.len() >= 2).then(|| parts.join("/"))
}

fn encode_path(value: &str) -> String {
    value
        .split(['/', '\\'])
        .filter(|part| !part.is_empty())
        .map(encode_component)
        .collect::<Vec<_>>()
        .join("/")
}

fn encode_component(value: &str) -> String {
    let mut output = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric()
            || matches!(
                byte,
                b'-' | b'.' | b'_' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')'
            )
        {
            output.push(char::from(byte));
        } else {
            output.push('%');
            output.push(hex(byte >> 4));
            output.push(hex(byte & 0x0f));
        }
    }
    output
}

fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'%' {
            output.push(bytes[index]);
            index += 1;
            continue;
        }
        let high = decode_hex(*bytes.get(index + 1)?)?;
        let low = decode_hex(*bytes.get(index + 2)?)?;
        output.push(high * 16 + low);
        index += 3;
    }
    String::from_utf8(output).ok()
}

fn decode_hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn hex(value: u8) -> char {
    char::from(if value < 10 {
        b'0' + value
    } else {
        b'A' + value - 10
    })
}

fn strings<const N: usize>(values: [&str; N]) -> Vec<String> {
    values.into_iter().map(str::to_owned).collect()
}
