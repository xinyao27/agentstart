use serde_json::{Map, Value, json};
use std::collections::BTreeMap;
use tokio::fs;

use super::artifacts::{Artifacts, Snapshot, load_artifacts};
use super::identity::{observe_package, physical_identity};
use super::verdict::{deduplicate, eligible_names, matches_snapshot, text};

pub(crate) async fn inventory(discovered: &Value) -> Result<Value, String> {
    let artifacts = load_artifacts().await?;
    let mut installations = Vec::new();
    for skill in discovered
        .get("skills")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(name) = skill.get("folderName").and_then(Value::as_str) else {
            continue;
        };
        let Some(current) = artifacts.current.get(name) else {
            continue;
        };
        for placement in skill
            .get("placements")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            installations.push(observe(name, current, placement, &artifacts).await);
        }
    }
    let mut installations = deduplicate(installations);
    installations.sort_by(|left, right| {
        text(left, "name")
            .cmp(text(right, "name"))
            .then_with(|| text(left, "unresolvedPath").cmp(text(right, "unresolvedPath")))
    });
    let eligible_update_names = eligible_names(&installations);
    Ok(json!({
        "schemaVersion": 1,
        "installations": installations,
        "eligibleUpdateNames": eligible_update_names,
        "scannedAt": super::super::now()
    }))
}

pub(crate) fn failed_update_names(
    names: &[String],
    inventory: &Value,
    locks: &BTreeMap<String, String>,
) -> Vec<String> {
    let installations = inventory
        .get("installations")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    names
        .iter()
        .filter(|name| {
            let convergent = installations
                .iter()
                .filter(|entry| {
                    text(entry, "name") == name.as_str()
                        && matches!(text(entry, "topology"), "canonical-copy" | "provider-alias")
                })
                .collect::<Vec<_>>();
            convergent.is_empty()
                || convergent.into_iter().any(|entry| {
                    !placement_landed(entry, locks.get(name.as_str()).map(String::as_str))
                })
        })
        .cloned()
        .collect()
}

fn placement_landed(entry: &Value, lock_hash: Option<&str>) -> bool {
    matches!(text(entry, "status"), "current" | "newer-known")
        || text(entry, "status") == "unrecognized"
            && lock_hash.is_some_and(|hash| {
                entry.get("observedGitTreeSha").and_then(Value::as_str) == Some(hash)
            })
}

async fn observe(
    name: &str,
    current: &Snapshot,
    placement: &Value,
    artifacts: &Artifacts,
) -> Value {
    let unresolved = text(placement, "directoryPath");
    let topology = text(placement, "topology");
    let base = |resolved_path: Value, physical_identity: Value, error_category: Value| {
        let mut value = Map::new();
        value.insert(
            "id".to_owned(),
            Value::String(super::super::stable_id(&format!("{unresolved}\0{name}"))),
        );
        value.insert("name".to_owned(), Value::String(name.to_owned()));
        for field in ["rootId", "providers", "sourceKind", "sourceLabel"] {
            value.insert(
                field.to_owned(),
                placement.get(field).cloned().unwrap_or(Value::Null),
            );
        }
        value.insert(
            "unresolvedPath".to_owned(),
            Value::String(unresolved.to_owned()),
        );
        value.insert("resolvedPath".to_owned(), resolved_path);
        value.insert("physicalIdentity".to_owned(), physical_identity);
        value.insert("topology".to_owned(), Value::String(topology.to_owned()));
        value.insert(
            "currentReleaseRevision".to_owned(),
            Value::from(current.release_revision),
        );
        value.insert(
            "currentPackageDigest".to_owned(),
            Value::String(current.package_digest.clone()),
        );
        value.insert(
            "currentAppVersion".to_owned(),
            Value::String(env!("CARGO_PKG_VERSION").to_owned()),
        );
        value.insert("errorCategory".to_owned(), error_category);
        value
    };
    let resolved = match fs::canonicalize(unresolved).await {
        Ok(path) => path,
        Err(error) => {
            let mut value = base(Value::Null, Value::Null, Value::String(error.to_string()));
            append_observation(&mut value, "inaccessible", None, None, None, None);
            return Value::Object(value);
        }
    };
    let metadata = match fs::metadata(&resolved).await {
        Ok(metadata) if metadata.is_dir() => metadata,
        Ok(_) => {
            let mut value = base(
                Value::String(resolved.to_string_lossy().into_owned()),
                Value::Null,
                Value::String("not-directory".to_owned()),
            );
            append_observation(&mut value, "inaccessible", None, None, None, None);
            return Value::Object(value);
        }
        Err(error) => {
            let mut value = base(Value::Null, Value::Null, Value::String(error.to_string()));
            append_observation(&mut value, "inaccessible", None, None, None, None);
            return Value::Object(value);
        }
    };
    let resolved_text = resolved.to_string_lossy().into_owned();
    let identity = physical_identity(&resolved_text, &metadata);
    let mut value = base(
        Value::String(resolved_text),
        Value::String(identity),
        Value::Null,
    );
    match observe_package(&resolved).await {
        Ok(observed) => {
            let matched = if observed.digest == current.package_digest {
                Some(current)
            } else {
                artifacts.snapshots.get(name).and_then(|snapshots| {
                    snapshots
                        .iter()
                        .rev()
                        .find(|snapshot| matches_snapshot(&observed, snapshot))
                })
            };
            let status = matched.map_or("unrecognized", |snapshot| {
                if snapshot.release_revision > current.release_revision {
                    "newer-known"
                } else if snapshot.package_digest == current.package_digest {
                    "current"
                } else {
                    "outdated"
                }
            });
            let installed_version = matched.map(|snapshot| {
                if snapshot.release_revision == current.release_revision {
                    env!("CARGO_PKG_VERSION").to_owned()
                } else {
                    artifacts
                        .releases
                        .get(&(name.to_owned(), snapshot.release_revision))
                        .cloned()
                        .unwrap_or_default()
                }
            });
            append_observation(
                &mut value,
                status,
                matched.map(|snapshot| snapshot.release_revision),
                installed_version.filter(|version| !version.is_empty()),
                Some(observed.digest),
                Some(observed.git_tree_sha),
            );
        }
        Err(error) => {
            let status = if error == "skill-package-inaccessible" {
                "inaccessible"
            } else {
                "unrecognized"
            };
            value.insert("errorCategory".to_owned(), Value::String(error));
            append_observation(&mut value, status, None, None, None, None);
        }
    }
    Value::Object(value)
}

fn append_observation(
    value: &mut Map<String, Value>,
    status: &str,
    revision: Option<u64>,
    version: Option<String>,
    digest: Option<String>,
    git_tree_sha: Option<String>,
) {
    value.insert("status".to_owned(), Value::String(status.to_owned()));
    value.insert(
        "installedReleaseRevision".to_owned(),
        revision.map_or(Value::Null, Value::from),
    );
    value.insert(
        "installedAppVersion".to_owned(),
        version.map_or(Value::Null, Value::String),
    );
    value.insert(
        "observedPackageDigest".to_owned(),
        digest.map_or(Value::Null, Value::String),
    );
    value.insert(
        "observedGitTreeSha".to_owned(),
        git_tree_sha.map_or(Value::Null, Value::String),
    );
}
