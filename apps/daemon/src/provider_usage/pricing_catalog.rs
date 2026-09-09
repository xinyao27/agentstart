use std::collections::{BTreeMap, BTreeSet};
use std::io::Read;
use std::path::PathBuf;

use serde::Deserialize;
use serde_json::Value;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Pricing {
    pub input: f64,
    pub output: f64,
    pub cache_read: Option<f64>,
    pub cache_write: Option<f64>,
    pub threshold_tokens: Option<f64>,
    pub input_above_threshold: Option<f64>,
    pub output_above_threshold: Option<f64>,
    pub cache_read_above_threshold: Option<f64>,
    pub cache_write_above_threshold: Option<f64>,
}

pub(super) struct Catalog(BTreeMap<String, Pricing>);

impl Catalog {
    pub(super) fn load() -> Self {
        Self::load_for("anthropic")
    }

    pub(super) fn load_for(provider: &str) -> Self {
        Self(read_catalog(provider).unwrap_or_default())
    }

    pub(super) fn find(&self, model: &str) -> Option<&Pricing> {
        candidates(model)
            .into_iter()
            .find_map(|candidate| self.0.get(&candidate))
    }
}

fn read_catalog(provider_id: &str) -> Option<BTreeMap<String, Pricing>> {
    let mut bytes = Vec::new();
    std::fs::File::open(cache_path()?)
        .ok()?
        .take(16 * 1024 * 1024)
        .read_to_end(&mut bytes)
        .ok()?;
    let payload: Value = serde_json::from_slice(&bytes).ok()?;
    if payload.get("version")?.as_u64()? != 1 {
        return None;
    }
    let mut catalog = BTreeMap::new();
    for provider in payload.get("catalog")?.as_array()? {
        if provider
            .get("id")
            .and_then(Value::as_str)
            .is_none_or(|id| id.trim().to_lowercase() != provider_id)
        {
            continue;
        }
        for model in provider.get("models")?.as_array()? {
            let Some(id) = model.get("id").and_then(Value::as_str) else {
                continue;
            };
            let Some(pricing) = model
                .get("pricing")
                .and_then(|value| serde_json::from_value::<Pricing>(value.clone()).ok())
            else {
                continue;
            };
            if !pricing.input.is_finite()
                || pricing.input < 0.0
                || !pricing.output.is_finite()
                || pricing.output < 0.0
            {
                continue;
            }
            catalog.insert(id.trim().to_lowercase(), pricing);
        }
    }
    Some(catalog)
}

fn cache_path() -> Option<PathBuf> {
    let home = crate::paths::resolve_local_home_path()?;
    let base = if cfg!(target_os = "macos") {
        home.join("Library").join("Caches")
    } else if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData").join("Local"))
    } else {
        std::env::var_os("XDG_CACHE_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".cache"))
    };
    Some(
        base.join("Yiru")
            .join("model-pricing")
            .join("models-dev-v1.json"),
    )
}

fn candidates(model: &str) -> Vec<String> {
    let mut result = vec![model.trim().to_lowercase()];
    let mut seen = BTreeSet::from([result[0].clone()]);
    let mut index = 0;
    while index < result.len() && index < 32 {
        let value = result[index].clone();
        let mut additions = Vec::new();
        for prefix in [
            "anthropic.",
            "anthropic/",
            "anthropic:",
            "openai/",
            "openai:",
            "openai-codex/",
            "openai-codex:",
        ] {
            if let Some(value) = value.strip_prefix(prefix) {
                additions.push(value.to_owned());
            }
        }
        if let Some((base, date)) = value.rsplit_once('@')
            && date.len() == 8
            && date.bytes().all(|byte| byte.is_ascii_digit())
        {
            additions.push(base.to_owned());
            additions.push(format!("{base}-{date}"));
        }
        if let Some((base, date)) = value.rsplit_once('-')
            && date.len() == 8
            && date.starts_with("20")
            && date.bytes().all(|byte| byte.is_ascii_digit())
        {
            additions.push(base.to_owned());
        }
        if value.len() >= 11 {
            let split = value.len() - 11;
            if value.is_char_boundary(split)
                && value.get(split..split + 3) == Some("-20")
                && chrono::NaiveDate::parse_from_str(&value[split + 1..], "%Y-%m-%d").is_ok()
            {
                additions.push(value[..split].to_owned());
            }
        }
        if let Some((base, version)) = value.rsplit_once("-v")
            && version.split_once(':').is_some_and(|(left, right)| {
                !left.is_empty()
                    && !right.is_empty()
                    && left
                        .bytes()
                        .chain(right.bytes())
                        .all(|byte| byte.is_ascii_digit())
            })
        {
            additions.push(base.to_owned());
        }
        if value.starts_with("claude-") && !value.contains('@') {
            additions.push(format!("{value}@default"));
        }
        for value in additions {
            if !value.is_empty() && seen.insert(value.clone()) {
                result.push(value);
            }
        }
        index += 1;
    }
    result
}
