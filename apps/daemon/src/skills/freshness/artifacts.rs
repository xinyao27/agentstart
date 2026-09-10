use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::Value;
use tokio::fs;

const EMBEDDED_CURRENT_MANIFEST: &[u8] = include_bytes!(concat!(
    env!("OUT_DIR"),
    "/skill-resources/current-manifest.json"
));
const EMBEDDED_RELEASE_MAPPING: &[u8] = include_bytes!(concat!(
    env!("OUT_DIR"),
    "/skill-resources/release-mapping.json"
));
const EMBEDDED_SNAPSHOT_REGISTRY: &[u8] = include_bytes!(concat!(
    env!("OUT_DIR"),
    "/skill-resources/snapshot-registry.json"
));

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Snapshot {
    pub(crate) files: Vec<SnapshotFile>,
    pub(crate) package_digest: String,
    pub(crate) release_revision: u64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SnapshotFile {
    pub(crate) classification: String,
    pub(crate) exact_sha256: String,
    pub(crate) executable: bool,
    pub(crate) path: String,
    pub(crate) text_normalized_sha256: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CurrentSnapshot {
    #[serde(flatten)]
    pub(crate) snapshot: Snapshot,
    pub(crate) name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Manifest {
    pub(crate) schema_version: u64,
    pub(crate) skills: Vec<CurrentSnapshot>,
}

#[derive(Deserialize)]
pub(crate) struct Registry {
    pub(crate) skills: BTreeMap<String, Vec<Snapshot>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReleaseMapping {
    pub(crate) releases: Vec<Release>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Release {
    pub(crate) app_version: String,
    pub(crate) skills: BTreeMap<String, u64>,
}

pub(crate) struct Artifacts {
    pub(crate) current: BTreeMap<String, Snapshot>,
    pub(crate) releases: HashMap<(String, u64), String>,
    pub(crate) snapshots: BTreeMap<String, Vec<Snapshot>>,
}

pub(crate) async fn global_locks() -> BTreeMap<String, String> {
    let path = std::env::var_os("XDG_STATE_HOME").map_or_else(
        || {
            std::env::var_os("HOME")
                .map(PathBuf::from)
                .unwrap_or_default()
                .join(".agents")
                .join(".skill-lock.json")
        },
        |root| PathBuf::from(root).join("skills").join(".skill-lock.json"),
    );
    let Ok(bytes) = fs::read(path).await else {
        return BTreeMap::new();
    };
    let Ok(value) = serde_json::from_slice::<Value>(&bytes) else {
        return BTreeMap::new();
    };
    if value.get("version").and_then(Value::as_u64).unwrap_or(0) < 3 {
        return BTreeMap::new();
    }
    value
        .get("skills")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter_map(|(name, entry)| {
            let hash = entry.get("skillFolderHash").and_then(Value::as_str)?;
            let path = entry.get("skillPath").and_then(Value::as_str)?;
            let source = entry.get("source").and_then(Value::as_str)?;
            (!hash.is_empty() && !path.is_empty() && !source.is_empty())
                .then(|| (name.clone(), hash.to_owned()))
        })
        .collect()
}

pub(crate) async fn load_artifacts() -> Result<Artifacts, String> {
    let _ = super::super::guides::load().await?;
    let artifacts = if let Some(root) = std::env::var_os("AGENTSTART_SKILL_RESOURCES_DIR") {
        let root = PathBuf::from(root);
        let manifest = read_json(&root.join("current-manifest.json")).await?;
        let registry = read_json(&root.join("snapshot-registry.json")).await?;
        let mapping = read_json(&root.join("release-mapping.json")).await?;
        (manifest, registry, mapping)
    } else {
        let manifest = read_embedded(EMBEDDED_CURRENT_MANIFEST)?;
        let registry = read_embedded(EMBEDDED_SNAPSHOT_REGISTRY)?;
        let mapping = read_embedded(EMBEDDED_RELEASE_MAPPING)?;
        (manifest, registry, mapping)
    };
    assemble_artifacts(artifacts.0, artifacts.1, artifacts.2)
}

fn assemble_artifacts(
    manifest: Manifest,
    registry: Registry,
    mapping: ReleaseMapping,
) -> Result<Artifacts, String> {
    if manifest.schema_version != 2 {
        return Err("invalid_skill_bundle_manifest".to_owned());
    }
    let mut current = BTreeMap::new();
    for entry in manifest.skills {
        let is_registered = registry.skills.get(&entry.name).is_some_and(|snapshots| {
            snapshots.iter().any(|snapshot| {
                snapshot.release_revision == entry.snapshot.release_revision
                    && snapshot.package_digest == entry.snapshot.package_digest
            })
        });
        if !is_registered {
            return Err(format!("inconsistent_skill_snapshot:{}", entry.name));
        }
        current.insert(entry.name, entry.snapshot);
    }
    let mut releases = HashMap::new();
    for release in mapping.releases {
        for (name, revision) in release.skills {
            releases
                .entry((name, revision))
                .or_insert_with(|| release.app_version.clone());
        }
    }
    Ok(Artifacts {
        current,
        releases,
        snapshots: registry.skills,
    })
}

async fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let bytes = fs::read(path)
        .await
        .map_err(|error| format!("{}: {error}", path.display()))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("{}: {error}", path.display()))
}

fn read_embedded<T: for<'de> Deserialize<'de>>(bytes: &[u8]) -> Result<T, String> {
    serde_json::from_slice(bytes).map_err(|error| format!("embedded_skill_resource: {error}"))
}
