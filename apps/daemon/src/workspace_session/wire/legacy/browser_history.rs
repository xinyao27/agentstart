use std::cmp::Ordering;
use std::collections::HashSet;

use serde_json::Value;
use url::Url;

const MAX_ENTRIES: usize = 200;

struct HistoryEntry {
    last_visited_at: f64,
    normalized_url: String,
    value: Value,
}

pub(super) fn repair(value: &mut Value) {
    let Some(entries) = value.as_array() else {
        return;
    };
    let mut entries = entries.iter().filter_map(read_entry).collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        right
            .last_visited_at
            .partial_cmp(&left.last_visited_at)
            .unwrap_or(Ordering::Equal)
    });
    let mut seen = HashSet::new();
    let mut normalized = Vec::with_capacity(entries.len().min(MAX_ENTRIES));
    for entry in entries {
        if !seen.insert(entry.normalized_url) {
            continue;
        }
        normalized.push(entry.value);
        if normalized.len() == MAX_ENTRIES {
            break;
        }
    }
    *value = Value::Array(normalized);
}

fn read_entry(value: &Value) -> Option<HistoryEntry> {
    let mut value = value.as_object()?.clone();
    let safe_url = redact_kagi_token(value.get("url")?.as_str()?);
    let normalized_url = normalize_url(&safe_url);
    let last_visited_at = value.get("lastVisitedAt")?.as_f64()?;
    value.insert("url".to_owned(), Value::String(safe_url));
    value.insert(
        "normalizedUrl".to_owned(),
        Value::String(normalized_url.clone()),
    );
    Some(HistoryEntry {
        last_visited_at,
        normalized_url,
        value: Value::Object(value),
    })
}

fn normalize_url(raw: &str) -> String {
    let safe = redact_kagi_token(raw);
    let Ok(parsed) = Url::parse(&safe) else {
        return safe.to_lowercase();
    };
    parsed
        .to_string()
        .strip_suffix('/')
        .unwrap_or_else(|| parsed.as_str())
        .to_owned()
}

fn redact_kagi_token(raw: &str) -> String {
    let Ok(mut parsed) = Url::parse(raw) else {
        return raw.to_owned();
    };
    let is_kagi = parsed.scheme() == "https"
        && matches!(parsed.host_str(), Some("kagi.com" | "www.kagi.com"))
        && matches!(parsed.path(), "/search" | "/search/");
    if !is_kagi || !parsed.query_pairs().any(|(key, _)| key == "token") {
        return raw.to_owned();
    }
    let retained = parsed
        .query_pairs()
        .filter(|(key, _)| key != "token")
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();
    if retained.is_empty() {
        parsed.set_query(None);
    } else {
        parsed.query_pairs_mut().clear().extend_pairs(retained);
    }
    parsed.to_string()
}
