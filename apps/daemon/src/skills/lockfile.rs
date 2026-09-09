use std::collections::BTreeMap;

use serde_json::Value;

use crate::hosts::HostFilesystem;

const MAX_LOCKFILE_BYTES: usize = 256 * 1024;

pub(super) async fn read_sources<'a>(
    filesystem: &HostFilesystem,
    home: &str,
    repo_paths: impl IntoIterator<Item = &'a String>,
) -> BTreeMap<String, String> {
    let mut sources = BTreeMap::new();
    let global = filesystem
        .paths()
        .join(&[home, ".agents", ".skill-lock.json"]);
    merge_file(filesystem, &global, &mut sources).await;
    for repo_path in repo_paths {
        let path = filesystem.paths().join(&[repo_path, "skills-lock.json"]);
        merge_file(filesystem, &path, &mut sources).await;
    }
    sources
}

pub(super) fn apply(skills: &mut [Value], sources: &BTreeMap<String, String>) {
    for skill in skills {
        let source = skill
            .get("folderName")
            .and_then(Value::as_str)
            .and_then(|name| sources.get(name))
            .cloned()
            .map_or(Value::Null, Value::String);
        skill["installSource"] = source;
    }
}

async fn merge_file(
    filesystem: &HostFilesystem,
    path: &str,
    sources: &mut BTreeMap<String, String>,
) {
    let Some(bytes) = filesystem
        .read(path, MAX_LOCKFILE_BYTES)
        .await
        .ok()
        .flatten()
    else {
        return;
    };
    let Ok(value) = serde_json::from_slice::<Value>(&bytes) else {
        return;
    };
    for (folder, entry) in value
        .get("skills")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
    {
        let Some(source) = entry
            .get("source")
            .and_then(Value::as_str)
            .and_then(super::run::policy::canonical_source)
        else {
            continue;
        };
        sources.insert(folder.clone(), source);
    }
}
