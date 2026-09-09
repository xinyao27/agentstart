use std::time::Duration;

use serde_json::{Map, Value};
use url::Url;

use super::RateLimitError;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const PROXY_URL_MAX_LENGTH: usize = 2048;
const PROXY_BYPASS_RULES_MAX_LENGTH: usize = 4096;
const PROXY_SCHEMES: [&str; 5] = ["http", "https", "socks", "socks4", "socks5"];
const PROXY_ENV_KEYS: [&str; 6] = [
    "HTTPS_PROXY",
    "https_proxy",
    "ALL_PROXY",
    "all_proxy",
    "HTTP_PROXY",
    "http_proxy",
];
const NO_PROXY_ENV_KEYS: [&str; 2] = ["NO_PROXY", "no_proxy"];

struct ProxyConfiguration {
    bypass_rules: String,
    url: String,
}

struct ProxyUrlRejected;

pub(super) fn network_client(
    settings: &Map<String, Value>,
) -> Result<reqwest::Client, RateLimitError> {
    // Why: `no_proxy` first suppresses reqwest's own environment and system
    // detection so the configured-then-environment precedence and the bypass
    // rules below stay the single authority for outbound proxying.
    let builder = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .no_proxy();
    let Some(configuration) = proxy_configuration(settings) else {
        return Ok(builder.build()?);
    };
    let ProxyConfiguration { bypass_rules, url } = configuration;
    Ok(builder
        .proxy(reqwest::Proxy::custom(move |target| {
            (!bypasses_proxy(target, &bypass_rules)).then(|| url.clone())
        }))
        .build()?)
}

fn proxy_configuration(settings: &Map<String, Value>) -> Option<ProxyConfiguration> {
    let configured = normalize_proxy_url(settings.get("httpProxyUrl").and_then(Value::as_str));
    let url = match configured {
        Ok(Some(url)) => url,
        _ => proxy_url_from_environment().ok().flatten()?,
    };
    let configured_rules =
        normalize_bypass_rules(settings.get("httpProxyBypassRules").and_then(Value::as_str));
    let bypass_rules = if configured_rules.is_empty() {
        bypass_rules_from_environment()
    } else {
        configured_rules
    };
    Some(ProxyConfiguration { bypass_rules, url })
}

fn normalize_proxy_url(value: Option<&str>) -> Result<Option<String>, ProxyUrlRejected> {
    let Some(value) = value else {
        return Ok(None);
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.chars().count() > PROXY_URL_MAX_LENGTH {
        return Err(ProxyUrlRejected);
    }
    let parsed = Url::parse(trimmed).map_err(|_| ProxyUrlRejected)?;
    if !PROXY_SCHEMES.contains(&parsed.scheme()) {
        return Err(ProxyUrlRejected);
    }
    let Some(host) = parsed.host_str().filter(|host| !host.is_empty()) else {
        return Err(ProxyUrlRejected);
    };
    let authority = match parsed.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_owned(),
    };
    let username = parsed.username();
    let password = parsed.password().unwrap_or_default();
    let credentials = if username.is_empty() && password.is_empty() {
        String::new()
    } else if password.is_empty() {
        format!("{username}@")
    } else {
        format!("{username}:{password}@")
    };
    Ok(Some(format!(
        "{}://{credentials}{authority}",
        parsed.scheme()
    )))
}

fn normalize_bypass_rules(value: Option<&str>) -> String {
    let Some(value) = value else {
        return String::new();
    };
    value
        .chars()
        .take(PROXY_BYPASS_RULES_MAX_LENGTH)
        .collect::<String>()
        .split([';', ',', '\n'])
        .map(str::trim)
        .filter(|rule| !rule.is_empty())
        .collect::<Vec<_>>()
        .join(";")
}

fn proxy_url_from_environment() -> Result<Option<String>, ProxyUrlRejected> {
    for key in PROXY_ENV_KEYS {
        if let Ok(value) = std::env::var(key)
            && !value.is_empty()
        {
            return normalize_proxy_url(Some(&value));
        }
    }
    Ok(None)
}

fn bypass_rules_from_environment() -> String {
    for key in NO_PROXY_ENV_KEYS {
        if let Ok(value) = std::env::var(key)
            && !value.is_empty()
        {
            return normalize_bypass_rules(Some(&value));
        }
    }
    String::new()
}

fn bypasses_proxy(target: &Url, bypass_rules: &str) -> bool {
    let Some(hostname) = target.host_str() else {
        return false;
    };
    let hostname = hostname.to_lowercase();
    let port = match target.port() {
        Some(port) => port.to_string(),
        None => if target.scheme() == "https" {
            "443"
        } else {
            "80"
        }
        .to_owned(),
    };
    bypass_rules
        .split(';')
        .any(|rule| bypass_rule_matches(rule, &hostname, &port))
}

fn bypass_rule_matches(value: &str, hostname: &str, port: &str) -> bool {
    let rule = value.trim().to_lowercase();
    if rule.is_empty() {
        return false;
    }
    if rule == "*" {
        return true;
    }
    let Some((rule_hostname, rule_port)) = parse_bypass_target(&rule) else {
        return false;
    };
    if !rule_port.is_empty() && rule_port != port {
        return false;
    }
    let suffix = strip_wildcard_prefix(&rule_hostname);
    hostname == suffix || hostname.ends_with(&format!(".{suffix}"))
}

fn parse_bypass_target(rule: &str) -> Option<(String, String)> {
    let after_scheme = rule.split_once("://").map_or(rule, |(_, rest)| rest);
    let authority = after_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default();
    let authority = authority
        .rsplit_once('@')
        .map_or(authority, |(_, host)| host);
    // Why: an IPv6 literal keeps its brackets so it compares against the same
    // serialization `Url::host_str` reports for the request target.
    let separator = match authority.rfind(']') {
        Some(end) => authority[end + 1..].find(':').map(|index| end + 1 + index),
        None => authority.find(':'),
    };
    let (hostname, port) = match separator {
        Some(index) => (&authority[..index], &authority[index + 1..]),
        None => (authority, ""),
    };
    (!hostname.is_empty()).then(|| (hostname.to_owned(), port.to_owned()))
}

fn strip_wildcard_prefix(hostname: &str) -> &str {
    hostname
        .strip_prefix("*.")
        .or_else(|| hostname.strip_prefix('.'))
        .unwrap_or(hostname)
}
