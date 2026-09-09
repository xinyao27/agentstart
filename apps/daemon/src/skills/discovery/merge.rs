use std::collections::BTreeMap;

use serde_json::Value;

use crate::hosts::HostFilesystem;

use super::super::stable_id;
use super::roots::SourceRoot;

pub(crate) fn merge_candidates(candidates: Vec<Value>) -> Vec<Value> {
    let mut merged = BTreeMap::<(String, String, String, String), Value>::new();
    for candidate in candidates {
        let key = (
            candidate
                .get("scope")
                .and_then(Value::as_str)
                .unwrap_or("global")
                .to_owned(),
            candidate
                .get("sourceKind")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned(),
            candidate
                .get("folderName")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned(),
            candidate
                .get("contentDigest")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned(),
        );
        if let Some(existing) = merged.get_mut(&key) {
            let mut placements = existing
                .get("placements")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            for placement in candidate
                .get("placements")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                let id = placement.get("id");
                if !placements.iter().any(|existing| existing.get("id") == id) {
                    placements.push(placement.clone());
                }
            }
            if candidate_is_better(&candidate, existing) {
                for field in [
                    "name",
                    "folderName",
                    "description",
                    "sourceKind",
                    "sourceLabel",
                    "rootPath",
                    "directoryPath",
                    "skillFilePath",
                    "fileCount",
                ] {
                    if let Some(value) = candidate.get(field) {
                        existing[field] = value.clone();
                    }
                }
            }
            placements.sort_by(compare_placements);
            existing["placements"] = Value::Array(placements);
            refresh_merged_fields(existing);
        } else {
            let mut candidate = candidate;
            let identity = format!("{}\0{}\0{}\0{}", key.0, key.1, key.2, key.3);
            candidate["id"] = Value::String(stable_id(&identity));
            merged.insert(key, candidate);
        }
    }
    let mut skills = merged
        .into_values()
        .map(|mut value| {
            if let Some(object) = value.as_object_mut() {
                object.remove("scope");
                object.remove("contentDigest");
            }
            value
        })
        .collect::<Vec<_>>();
    skills.sort_by(|left, right| {
        string_field(left, "name")
            .to_lowercase()
            .cmp(&string_field(right, "name").to_lowercase())
            .then_with(|| string_field(left, "sourceLabel").cmp(string_field(right, "sourceLabel")))
            .then_with(|| {
                string_field(left, "skillFilePath").cmp(string_field(right, "skillFilePath"))
            })
    });
    skills
}

pub(crate) fn placement_topology(
    filesystem: &HostFilesystem,
    root: &SourceRoot,
    resolved_directory: Option<&str>,
    canonical_agents_root: Option<&str>,
    directory_is_linked: bool,
    root_is_linked: bool,
) -> &'static str {
    if root.kind == "repo" {
        return "repo-scope";
    }
    if root.kind == "plugin" {
        return "plugin-cache";
    }
    if directory_is_linked {
        let is_alias =
            resolved_directory
                .zip(canonical_agents_root)
                .is_some_and(|(directory, canonical)| {
                    same_path(
                        filesystem,
                        &filesystem.paths().dirname(directory),
                        canonical,
                    )
                });
        return if is_alias {
            "provider-alias"
        } else {
            "external-link"
        };
    }
    if root_is_linked {
        "external-link"
    } else if root.id == "home-agents" {
        "canonical-copy"
    } else {
        "independent-copy"
    }
}

pub(crate) fn same_path(filesystem: &HostFilesystem, left: &str, right: &str) -> bool {
    filesystem.paths().equal(left, right)
}

fn candidate_is_better(candidate: &Value, existing: &Value) -> bool {
    placement_rank(candidate) > placement_rank(existing)
        || placement_rank(candidate) == placement_rank(existing)
            && string_field(candidate, "sourceLabel") < string_field(existing, "sourceLabel")
}

fn placement_rank(skill: &Value) -> u8 {
    skill
        .get("placements")
        .and_then(Value::as_array)
        .and_then(|placements| placements.first())
        .and_then(|placement| placement.get("topology"))
        .and_then(Value::as_str)
        .map_or(0, topology_rank)
}

fn compare_placements(left: &Value, right: &Value) -> std::cmp::Ordering {
    let left_rank = left
        .get("topology")
        .and_then(Value::as_str)
        .map_or(0, topology_rank);
    let right_rank = right
        .get("topology")
        .and_then(Value::as_str)
        .map_or(0, topology_rank);
    left_rank
        .cmp(&right_rank)
        .reverse()
        .then_with(|| string_field(left, "rootLabel").cmp(string_field(right, "rootLabel")))
        .then_with(|| string_field(left, "directoryPath").cmp(string_field(right, "directoryPath")))
}

fn topology_rank(topology: &str) -> u8 {
    match topology {
        "canonical-copy" => 3,
        "independent-copy" => 2,
        "provider-alias" => 1,
        _ => 0,
    }
}

fn refresh_merged_fields(skill: &mut Value) {
    let Some(placements) = skill.get("placements").and_then(Value::as_array) else {
        return;
    };
    let mut providers = Vec::new();
    let mut updated_at = None;
    for placement in placements {
        for provider in placement
            .get("providers")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            if !providers.contains(provider) {
                providers.push(provider.clone());
            }
        }
        if let Some(value) = placement.get("updatedAt").and_then(Value::as_i64) {
            updated_at = Some(updated_at.map_or(value, |latest: i64| latest.max(value)));
        }
    }
    skill["providers"] = Value::Array(providers);
    skill["updatedAt"] = updated_at.map_or(Value::Null, Value::from);
}

pub(crate) fn string_field<'a>(value: &'a Value, field: &str) -> &'a str {
    value.get(field).and_then(Value::as_str).unwrap_or("")
}

pub(crate) fn content_digest(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(bytes);
    digest[..8]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(crate) fn summarize(bytes: &[u8]) -> (Option<String>, Option<String>) {
    let text = String::from_utf8_lossy(bytes).replace("\r\n", "\n");
    let body = text
        .strip_prefix("---\n")
        .and_then(|value| value.split_once("\n---"))
        .map_or(text.as_str(), |(_, body)| body);
    let mut name = None;
    let mut description = None;
    for line in text.lines() {
        if let Some(value) = line.strip_prefix("name:") {
            name = Some(value.trim().trim_matches(['\'', '"']).to_owned());
        }
        if let Some(value) = line.strip_prefix("description:") {
            description = Some(value.trim().trim_matches(['\'', '"']).to_owned());
        }
    }
    if name.as_deref().is_some_and(str::is_empty) {
        name = None;
    }
    if description.as_deref().is_some_and(str::is_empty) {
        description = body
            .lines()
            .find(|line| !line.trim().is_empty() && !line.starts_with('#'))
            .map(|line| line.trim().to_owned());
    }
    (name, description)
}
