use regex::Regex;
use reqwest::header::{ACCEPT, ACCEPT_LANGUAGE, COOKIE, REFERER, USER_AGENT};
use serde_json::{Value, json};
use std::time::Duration;

const ENDPOINT: &str = "https://platform.minimax.io/v1/api/openplatform/coding_plan/remains";
const REFERER_VALUE: &str = "https://platform.minimax.io/console/usage";
const SESSION_WINDOW_MINUTES: u64 = 300;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

pub(super) async fn fetch(
    client: &reqwest::Client,
    cookie: Option<&str>,
    group_override: Option<&str>,
    models: Option<&str>,
) -> Value {
    let raw_cookie = cookie.map(str::trim).unwrap_or_default();
    if raw_cookie.is_empty() {
        return unavailable("MiniMax session cookie not configured");
    }
    let cookie = normalize_cookie(raw_cookie);
    if cookie_value(&cookie, "_token").is_none() {
        return error(
            "MiniMax auth cookie not found — paste a Cookie header with _token",
            "missing-credentials",
        );
    }
    let group_id = group_override
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .or_else(|| cookie_value(&cookie, "minimax_group_id_v2"));
    let mut request = client
        .get(ENDPOINT)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(ACCEPT_LANGUAGE, "en-US,en;q=0.9")
        .header(REFERER, REFERER_VALUE)
        .header(USER_AGENT, browser_user_agent())
        .header(COOKIE, &cookie);
    if let Some(group_id) = group_id {
        request = request.header("X-Group-Id", group_id);
    }
    let response = match request.timeout(REQUEST_TIMEOUT).send().await {
        Ok(response) => response,
        Err(cause) => return error(&redact(&cause.to_string()), "network"),
    };
    let status = response.status().as_u16();
    if matches!(status, 401 | 403) {
        return error(
            "MiniMax session expired. Replace the MiniMax cookie in Settings.",
            "stale-token",
        );
    }
    if !response.status().is_success() {
        return error(&format!("MiniMax usage fetch failed ({status})"), "server");
    }
    let payload = match response.json::<Value>().await {
        Ok(payload) => payload,
        Err(cause) => return error(&redact(&cause.to_string()), "parse"),
    };
    if let Some(payload_error) = payload_error(&payload) {
        return payload_error;
    }
    let snapshots = payload
        .get("model_remains")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(usage_snapshot)
        .collect::<Vec<_>>();
    let preferred = parse_models(models);
    let selected = preferred
        .iter()
        .find_map(|model| snapshots.iter().find(|snapshot| &snapshot.model == model))
        .or_else(|| (snapshots.len() == 1).then(|| &snapshots[0]));
    let Some(selected) = selected else {
        return error(
            "MiniMax usage data for the configured model was not found",
            "usage-unavailable",
        );
    };
    json!({
        "provider": "minimax",
        "session": selected.window,
        "weekly": null,
        "updatedAt": super::now_ms_lossy(),
        "error": null,
        "status": "ok",
        "usageMetadata": { "source": "web" }
    })
}

struct Snapshot {
    model: String,
    window: Value,
}

fn usage_snapshot(value: &Value) -> Option<Snapshot> {
    let object = value.as_object()?;
    let model = object.get("model_name")?.as_str()?.to_owned();
    let remaining = number(object.get("current_interval_remaining_percent"))?;
    number(object.get("start_time"))?;
    let reset = number(object.get("end_time"))?;
    Some(Snapshot {
        model,
        window: super::window(
            (100.0 - remaining).round().clamp(0.0, 100.0),
            SESSION_WINDOW_MINUTES,
            Some(reset),
        ),
    })
}

fn payload_error(payload: &Value) -> Option<Value> {
    let base = payload.get("base_resp")?.as_object()?;
    let is_error = match base.get("status_code") {
        None => false,
        Some(Value::Number(value)) => value.as_i64() != Some(0),
        Some(_) => true,
    };
    if !is_error {
        return None;
    }
    let message = base
        .get("status_msg")
        .and_then(Value::as_str)
        .unwrap_or("MiniMax returned an error");
    Some(error(&redact(message), "usage-unavailable"))
}

fn parse_models(value: Option<&str>) -> Vec<String> {
    let values = value
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if values.is_empty() {
        vec!["general".to_owned()]
    } else {
        values
    }
}

fn number(value: Option<&Value>) -> Option<f64> {
    match value? {
        Value::Number(value) => value.as_f64().filter(|value| value.is_finite()),
        Value::String(value) if !value.trim().is_empty() => {
            value.parse::<f64>().ok().filter(|value| value.is_finite())
        }
        _ => None,
    }
}

fn normalize_cookie(value: &str) -> String {
    cookie_pairs(value)
        .into_iter()
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("; ")
}

fn cookie_value(value: &str, requested: &str) -> Option<String> {
    cookie_pairs(value)
        .into_iter()
        .find_map(|(name, value)| (name == requested).then_some(value))
}

fn cookie_pairs(value: &str) -> Vec<(String, String)> {
    let mut pairs = value
        .split(';')
        .filter_map(|part| {
            let part = part.trim();
            let part = part
                .get("cookie:".len()..)
                .filter(|_| {
                    part.get(.."cookie:".len())
                        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("cookie:"))
                })
                .unwrap_or(part)
                .trim();
            let (name, value) = part.split_once('=')?;
            let name = name.trim();
            let value = value.trim();
            (!name.is_empty() && !value.is_empty()).then(|| (name.to_owned(), value.to_owned()))
        })
        .collect::<Vec<_>>();
    if let Ok(expression) = Regex::new(r#"(?:^|[;\s])([A-Za-z0-9_.-]+)\s*:\s*[\"']([^\"']+)[\"']"#)
    {
        pairs.extend(expression.captures_iter(value).filter_map(|capture| {
            let name = capture.get(1)?.as_str().trim();
            let value = capture.get(2)?.as_str().trim();
            (!name.is_empty() && !value.is_empty()).then(|| (name.to_owned(), value.to_owned()))
        }));
    }
    pairs
}

fn browser_user_agent() -> &'static str {
    if cfg!(target_os = "windows") {
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0"
    } else if cfg!(target_os = "macos") {
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:152.0) Gecko/20100101 Firefox/152.0"
    } else {
        "Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0"
    }
}

fn unavailable(message: &str) -> Value {
    json!({
        "provider": "minimax",
        "session": null,
        "weekly": null,
        "updatedAt": super::now_ms_lossy(),
        "error": message,
        "status": "unavailable",
        "usageMetadata": { "failureKind": "missing-credentials", "source": "web" }
    })
}

fn error(message: &str, failure: &str) -> Value {
    json!({
        "provider": "minimax",
        "session": null,
        "weekly": null,
        "updatedAt": super::now_ms_lossy(),
        "error": message,
        "status": "error",
        "usageMetadata": { "failureKind": failure, "source": "web" }
    })
}

fn redact(value: &str) -> String {
    let mut value = Regex::new(r"(?i)Cookie:\s*[^\n\r]+").map_or_else(
        |_| value.to_owned(),
        |expression| {
            expression
                .replace_all(value, "Cookie: [REDACTED]")
                .into_owned()
        },
    );
    for name in [
        "_token",
        "_twpid",
        "_abck",
        "ak_bmsc",
        "bm_mi",
        "bm_sv",
        "bm_sz",
        "minimax_group_id_v2",
    ] {
        let assignment = Regex::new(&format!(r"{}=([^;\s]+)", regex::escape(name)));
        if let Ok(assignment) = assignment {
            value = assignment
                .replace_all(&value, format!("{name}=[REDACTED]"))
                .into_owned();
        }
    }
    value
}

pub(super) fn credential_error() -> Value {
    error(
        "MiniMax session cookie could not be decrypted",
        "keychain-unavailable",
    )
}
