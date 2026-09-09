use std::future::Future;

use serde_json::{Map, Value, json};

use crate::hosts::{HostFilesystem, HostFilesystemError};

const MAX_CONFIG_BYTES: usize = 1024 * 1024;

pub(super) async fn inspect(
    repo: &Value,
    filesystem: &HostFilesystem,
) -> Result<Vec<Value>, HostFilesystemError> {
    let root = repo.get("path").and_then(Value::as_str).unwrap_or_default();
    let files = RepoFiles { filesystem, root };
    let (superset, conductor, codex, cmux, package_manager) = tokio::join!(
        best_effort(super::setup_json_imports::superset(&files)),
        best_effort(super::setup_json_imports::conductor(&files)),
        best_effort(super::setup_codex_import::inspect(&files)),
        best_effort(super::setup_json_imports::cmux(&files)),
        best_effort(super::setup_package_import::inspect(&files)),
    );
    Ok([superset, conductor, codex, cmux, package_manager]
        .into_iter()
        .flatten()
        .collect())
}

pub(super) struct RepoFiles<'a> {
    filesystem: &'a HostFilesystem,
    root: &'a str,
}

impl RepoFiles<'_> {
    pub(super) async fn read(&self, relative: &str) -> Result<Option<String>, HostFilesystemError> {
        self.filesystem
            .read_text(
                &self.filesystem.paths().join(&[self.root, relative]),
                MAX_CONFIG_BYTES,
            )
            .await
    }

    pub(super) async fn exists(&self, relative: &str) -> Result<bool, HostFilesystemError> {
        Ok(self.read(relative).await.ok().flatten().is_some())
    }
}

pub(super) fn candidate(
    provider: &str,
    label: &str,
    files: Vec<&str>,
    setup: String,
    archive: Option<String>,
    unsupported: Vec<String>,
) -> Value {
    let mut value = json!({
        "provider":provider, "label":label, "files":files, "setup":setup,
        "unsupportedFields":unsupported,
    });
    if let Some(archive) = archive {
        value["archive"] = json!(archive);
    }
    value
}

pub(super) fn parse_json_object(content: Option<String>) -> Option<Map<String, Value>> {
    serde_json::from_str::<Value>(content.as_deref()?)
        .ok()?
        .as_object()
        .cloned()
}

pub(super) fn command_value(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(value)) => super::ecmascript::trim(value).to_owned(),
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(super::ecmascript::trim)
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

async fn best_effort(
    future: impl Future<Output = Result<Option<Value>, HostFilesystemError>>,
) -> Option<Value> {
    future.await.ok().flatten()
}

pub(super) fn unsupported_fields(source: &Map<String, Value>, fields: &[&str]) -> Vec<String> {
    fields
        .iter()
        .filter(|field| source.contains_key(**field))
        .map(|field| (*field).to_owned())
        .collect()
}
