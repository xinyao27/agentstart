use regex::Regex;
use reqwest::header::{ACCEPT, COOKIE, ORIGIN, REFERER};
use serde_json::{Value, json};
use std::time::Duration;

const BASE_URL: &str = "https://opencode.ai";
const SERVER_URL: &str = "https://opencode.ai/_server";
const USAGE_URL: &str = "https://opencode.ai/zen/go/v1/usage";
const WORKSPACES_SERVER_ID: &str =
    "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f";
const RESPONSE_BYTE_LIMIT: usize = 10_000_000;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

pub(super) async fn fetch(
    client: &reqwest::Client,
    raw_cookie: &str,
    workspace_override: Option<&str>,
) -> Value {
    if let Some(key) = open_code_api_key() {
        return fetch_usage_api(client, &key).await;
    }
    let normalized_cookie = normalize_cookie(raw_cookie);
    if normalized_cookie.is_empty() {
        return result("Session cookie not configured", "unavailable");
    }
    let cookie = auth_cookie(&normalized_cookie);
    if cookie.is_empty() {
        return result(
            "No auth cookie found — paste the full Cookie header from opencode.ai DevTools",
            "error",
        );
    }
    let workspace_override = workspace_override
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let ids = match workspace_override {
        Some(value) if valid_workspace_id(value) => vec![value.to_owned()],
        Some(_) => {
            return result(
                "Invalid workspace ID format: must match ^(wrk|wk)_[A-Za-z0-9]+$",
                "error",
            );
        }
        None => match fetch_workspace_ids(client, &cookie).await {
            Ok(ids) => ids,
            Err(error) => return result(&error, "error"),
        },
    };
    if ids.is_empty() {
        return result(
            "No workspace ID found — set a Workspace ID override in settings",
            "error",
        );
    }
    let mut last_error = String::new();
    for id in ids {
        match fetch_workspace_usage(client, &cookie, &id).await {
            Ok(Some(usage)) => return usage,
            Ok(None) => last_error = "Could not parse usage data from page".to_owned(),
            Err(error) => last_error = error,
        }
    }
    result(
        if last_error.is_empty() {
            "Could not parse usage data from any available workspace"
        } else {
            &last_error
        },
        "error",
    )
}

// Why: the opencode CLI stores the Go subscription API key in its auth file, so
// usage works without the manual cookie. The API is preferred over the
// dashboard scrape because it reports account-wide windows.
fn open_code_api_key() -> Option<String> {
    for path in super::open_code_auth_paths() {
        let Ok(contents) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&contents) else {
            continue;
        };
        let Some(entry) = value.get("opencode-go").and_then(Value::as_object) else {
            continue;
        };
        if entry.get("type").and_then(Value::as_str) != Some("api") {
            continue;
        }
        return entry
            .get("key")
            .and_then(Value::as_str)
            .filter(|key| !key.is_empty())
            .map(str::to_owned);
    }
    None
}

async fn fetch_usage_api(client: &reqwest::Client, key: &str) -> Value {
    let response = match client
        .get(USAGE_URL)
        .bearer_auth(key)
        .header(ACCEPT, "application/json")
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => return result(&error.to_string(), "error"),
    };
    if !response.status().is_success() {
        return result(
            &format!("Usage request failed ({})", response.status().as_u16()),
            "error",
        );
    }
    let payload = match response.json::<Value>().await {
        Ok(payload) => payload,
        Err(_) => return result("Usage response is invalid", "error"),
    };
    let Some(usage) = payload.get("usage") else {
        return result("Usage response did not include plan windows", "error");
    };
    let session = api_window(usage.get("rolling"), 300);
    let weekly = api_window(usage.get("weekly"), 10_080);
    let monthly = api_window(usage.get("monthly"), 43_200);
    if session.is_none() && weekly.is_none() && monthly.is_none() {
        return result(
            "No OpenCode Go subscription is active for this account",
            "unavailable",
        );
    }
    json!({
        "provider": "opencode-go",
        "session": session,
        "weekly": weekly,
        "monthly": monthly,
        "updatedAt": super::now_ms_lossy(),
        "error": null,
        "status": "ok"
    })
}

fn api_window(value: Option<&Value>, minutes: u64) -> Option<Value> {
    let window = value?;
    if window.get("status").and_then(Value::as_str) != Some("ok") {
        return None;
    }
    let percent = window
        .get("percent")
        .and_then(Value::as_f64)?
        .clamp(0.0, 100.0);
    let resets = window
        .get("resetsAt")
        .and_then(Value::as_str)
        .and_then(super::parse_timestamp);
    Some(super::window(percent, minutes, resets))
}

async fn fetch_workspace_ids(
    client: &reqwest::Client,
    cookie: &str,
) -> Result<Vec<String>, String> {
    let instance = super::random_uuid().map_err(|_| "Workspace request could not be created")?;
    let response = client
        .get(format!("{SERVER_URL}?id={WORKSPACES_SERVER_ID}"))
        .header(COOKIE, cookie)
        .header("X-Server-Id", WORKSPACES_SERVER_ID)
        .header("X-Server-Instance", format!("server-fn:{instance}"))
        .header(ACCEPT, "text/javascript, application/json;q=0.9, */*;q=0.8")
        .header(ORIGIN, BASE_URL)
        .header(REFERER, BASE_URL)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Workspaces fetch failed ({})",
            response.status().as_u16()
        ));
    }
    let text = bounded_text(response).await?;
    let expression = Regex::new(r#"\bid\s*:\s*[\"']((?:wrk|wk)_[a-zA-Z0-9]+)[\"']"#)
        .map_err(|_| "Workspace response parser is unavailable")?;
    let mut ids = Vec::new();
    for capture in expression.captures_iter(&text) {
        let Some(id) = capture.get(1).map(|value| value.as_str().to_owned()) else {
            continue;
        };
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    Ok(ids)
}

async fn fetch_workspace_usage(
    client: &reqwest::Client,
    cookie: &str,
    workspace_id: &str,
) -> Result<Option<Value>, String> {
    let response = client
        .get(format!("{BASE_URL}/workspace/{workspace_id}/go"))
        .header(COOKIE, cookie)
        .header(
            ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header(ORIGIN, BASE_URL)
        .header(REFERER, BASE_URL)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Usage page fetch failed ({})",
            response.status().as_u16()
        ));
    }
    let text = bounded_text(response).await?;
    Ok(parse_usage(&text).map(|usage| {
        json!({
            "provider": "opencode-go",
            "session": usage_window(usage.rolling_percent, usage.rolling_reset, 300),
            "weekly": usage_window(usage.weekly_percent, usage.weekly_reset, 10_080),
            "monthly": usage.monthly_percent.zip(usage.monthly_reset)
                .map(|(percent, reset)| usage_window(percent, reset, 43_200)),
            "updatedAt": super::now_ms_lossy(),
            "error": null,
            "status": "ok"
        })
    }))
}

async fn bounded_text(mut response: reqwest::Response) -> Result<String, String> {
    if response
        .content_length()
        .is_some_and(|length| length > RESPONSE_BYTE_LIMIT as u64)
    {
        return Err("OpenCode response is too large".to_owned());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        if bytes.len().saturating_add(chunk.len()) > RESPONSE_BYTE_LIMIT {
            return Err("OpenCode response is too large".to_owned());
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| "OpenCode response is invalid".to_owned())
}

fn normalize_cookie(raw: &str) -> String {
    let value = raw.trim();
    if value.is_empty()
        || value.contains(';')
        || value.to_ascii_lowercase().starts_with("auth=")
        || value.to_ascii_lowercase().starts_with("__host-auth=")
    {
        return value.to_owned();
    }
    let token = value.starts_with("Fe26.2**")
        || value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'));
    if token {
        format!("auth={value}")
    } else {
        value.to_owned()
    }
}

fn auth_cookie(raw: &str) -> String {
    raw.split(';')
        .filter_map(|part| {
            let (name, value) = part.trim().split_once('=')?;
            matches!(name.trim(), "auth" | "__Host-auth")
                .then(|| format!("{}={}", name.trim(), value.trim()))
        })
        .collect::<Vec<_>>()
        .join("; ")
}

fn valid_workspace_id(value: &str) -> bool {
    let Some(suffix) = value
        .strip_prefix("wrk_")
        .or_else(|| value.strip_prefix("wk_"))
    else {
        return false;
    };
    !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_alphanumeric())
}

struct Usage {
    rolling_percent: f64,
    rolling_reset: f64,
    weekly_percent: f64,
    weekly_reset: f64,
    monthly_percent: Option<f64>,
    monthly_reset: Option<f64>,
}

fn parse_usage(text: &str) -> Option<Usage> {
    if text.is_empty() || text.len() > RESPONSE_BYTE_LIMIT {
        return None;
    }
    let rolling = usage_block(text, "rollingUsage")?;
    let weekly = usage_block(text, "weeklyUsage")?;
    let monthly = usage_block(text, "monthlyUsage");
    Some(Usage {
        rolling_percent: clamp(field(rolling, "usagePercent")?),
        rolling_reset: field(rolling, "resetInSec")?,
        weekly_percent: clamp(field(weekly, "usagePercent")?),
        weekly_reset: field(weekly, "resetInSec")?,
        monthly_percent: monthly
            .and_then(|block| field(block, "usagePercent"))
            .map(clamp),
        monthly_reset: monthly.and_then(|block| field(block, "resetInSec")),
    })
}

fn usage_block<'a>(text: &'a str, key: &str) -> Option<&'a str> {
    let key_expression = Regex::new(&format!(r"\b{}\b\s*:", regex::escape(key))).ok()?;
    for found in key_expression.find_iter(text) {
        let tail = text.get(found.end()..)?;
        let Some(relative) = tail.find('{').filter(|relative| *relative < 30) else {
            continue;
        };
        let open = found.end() + relative;
        let mut depth = 0_u32;
        for (relative_index, character) in text.get(open..)?.char_indices() {
            match character {
                '{' => depth += 1,
                '}' => {
                    depth = depth.checked_sub(1)?;
                    if depth == 0 {
                        let block = text.get(open..open + relative_index + 1)?;
                        if field(block, "usagePercent").is_some()
                            && field(block, "resetInSec").is_some()
                        {
                            return Some(block);
                        }
                        break;
                    }
                }
                _ => {}
            }
        }
    }
    None
}

fn field(object: &str, name: &str) -> Option<f64> {
    let expression = Regex::new(&format!(
        r"^\b{}\b\s*:\s*(-?[0-9]+(?:\.[0-9]+)?)",
        regex::escape(name)
    ))
    .ok()?;
    let mut depth = 0_u32;
    for (index, character) in object.char_indices() {
        match character {
            '{' => depth += 1,
            '}' => depth = depth.checked_sub(1)?,
            _ if depth == 1 => {
                if let Some(found) = expression.captures(object.get(index..)?) {
                    let value = found.get(1)?.as_str().parse::<f64>().ok()?;
                    return value.is_finite().then_some(value);
                }
            }
            _ => {}
        }
    }
    None
}

fn usage_window(percent: f64, reset_seconds: f64, minutes: u64) -> Value {
    super::window(
        percent,
        minutes,
        Some(super::now_ms_lossy() + reset_seconds * 1_000.0),
    )
}

fn clamp(value: f64) -> f64 {
    value.clamp(0.0, 100.0)
}

fn result(message: &str, status: &str) -> Value {
    json!({
        "provider": "opencode-go",
        "session": null,
        "weekly": null,
        "monthly": null,
        "updatedAt": super::now_ms_lossy(),
        "error": message,
        "status": status
    })
}
