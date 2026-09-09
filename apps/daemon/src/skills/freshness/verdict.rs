use std::collections::BTreeMap;

use serde_json::Value;

use super::artifacts::Snapshot;
use super::identity::ObservedPackage;

pub(super) fn matches_snapshot(observed: &ObservedPackage, snapshot: &Snapshot) -> bool {
    observed.files.len() == snapshot.files.len()
        && observed
            .files
            .iter()
            .zip(&snapshot.files)
            .all(|(actual, expected)| {
                actual.path == expected.path
                    && actual.executable == expected.executable
                    && actual.classification == expected.classification
                    && if expected.classification == "text" && !expected.executable {
                        actual.text_normalized_sha256 == expected.text_normalized_sha256
                    } else {
                        actual.exact_sha256 == expected.exact_sha256
                    }
            })
}

pub(super) fn deduplicate(values: Vec<Value>) -> Vec<Value> {
    let mut deduped = BTreeMap::<String, Value>::new();
    for value in values {
        let topology = text(&value, "topology");
        let bucket = if matches!(topology, "canonical-copy" | "provider-alias") {
            "managed-global"
        } else {
            topology
        };
        let identity = value
            .get("physicalIdentity")
            .and_then(Value::as_str)
            .map_or_else(
                || format!("logical\0{}", text(&value, "id")),
                |identity| format!("{}\0{identity}\0{bucket}", text(&value, "name")),
            );
        if let Some(existing) = deduped.get_mut(&identity) {
            let mut providers = existing
                .get("providers")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            for provider in value
                .get("providers")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                if !providers.contains(provider) {
                    providers.push(provider.clone());
                }
            }
            if topology_rank(topology) > topology_rank(text(existing, "topology")) {
                *existing = value;
            }
            existing["providers"] = Value::Array(providers);
        } else {
            deduped.insert(identity, value);
        }
    }
    deduped.into_values().collect()
}

pub(super) fn eligible_names(installations: &[Value]) -> Vec<String> {
    let mut by_name = BTreeMap::<&str, Vec<&Value>>::new();
    for installation in installations {
        by_name
            .entry(text(installation, "name"))
            .or_default()
            .push(installation);
    }
    by_name
        .into_iter()
        .filter_map(|(name, entries)| {
            let has_outdated = entries
                .iter()
                .any(|entry| text(entry, "status") == "outdated");
            let all_updatable = entries.iter().all(|entry| {
                matches!(text(entry, "status"), "current" | "outdated")
                    && matches!(
                        text(entry, "topology"),
                        "canonical-copy" | "provider-alias" | "independent-copy"
                    )
                    && entry.get("resolvedPath").is_some_and(Value::is_string)
                    && entry.get("physicalIdentity").is_some_and(Value::is_string)
            });
            let has_reliable = entries.iter().any(|entry| {
                matches!(text(entry, "topology"), "canonical-copy" | "provider-alias")
            });
            (has_outdated && all_updatable && has_reliable).then(|| name.to_owned())
        })
        .collect()
}

fn topology_rank(topology: &str) -> u8 {
    match topology {
        "canonical-copy" => 3,
        "independent-copy" => 2,
        "provider-alias" => 1,
        _ => 0,
    }
}

pub(super) fn text<'a>(value: &'a Value, field: &str) -> &'a str {
    value.get(field).and_then(Value::as_str).unwrap_or("")
}
