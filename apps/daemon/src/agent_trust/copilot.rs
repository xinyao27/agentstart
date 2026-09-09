use serde_json::{Map, Value};

use crate::hosts::{ExecutionHost, HostFileKind, HostFilesystem};

use super::AgentTrustError;
use super::atomic::{canonical_entry, replace};

const CONFIG_MAX_BYTES: usize = 16 * 1_024 * 1_024;

pub(super) async fn mark_trusted(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    workspace_path: &str,
) -> Result<(), AgentTrustError> {
    let workspace_path = canonical_entry(filesystem, host, workspace_path).await;
    let home = filesystem
        .home_directory()
        .await?
        .ok_or(AgentTrustError::HomeUnavailable)?;
    let config_directory = filesystem.paths().join(&[&home, ".copilot"]);
    let config_path = filesystem.paths().join(&[&config_directory, "config.json"]);
    let Some(mut config) = read_config(filesystem, &config_path).await? else {
        return Ok(());
    };
    let existing = config
        .get("trustedFolders")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for value in &existing {
        if let Some(path) = value.as_str()
            && canonical_entry(filesystem, host, path).await == workspace_path
        {
            return Ok(());
        }
    }
    let mut trusted_folders = existing
        .into_iter()
        .filter(Value::is_string)
        .collect::<Vec<_>>();
    trusted_folders.push(Value::String(workspace_path));
    config.insert("trustedFolders".to_owned(), Value::Array(trusted_folders));
    let mut contents = serde_json::to_vec_pretty(&Value::Object(config))?;
    contents.push(b'\n');
    replace(filesystem, host, &config_path, &contents).await
}

async fn read_config(
    filesystem: &HostFilesystem,
    path: &str,
) -> Result<Option<Map<String, Value>>, AgentTrustError> {
    let Some(stat) = filesystem.stat(path).await? else {
        return Ok(Some(Map::new()));
    };
    if stat.kind != HostFileKind::File && stat.kind != HostFileKind::Symlink {
        return Ok(None);
    }
    if stat.size_bytes > CONFIG_MAX_BYTES as u64 {
        return Ok(None);
    }
    let Some(contents) = filesystem.read(path, CONFIG_MAX_BYTES).await? else {
        return Ok(None);
    };
    // Why: malformed user configuration belongs to Copilot. Refuse to overwrite it;
    // accepting the agent's trust prompt remains the fallback.
    let Ok(Value::Object(config)) = serde_json::from_slice(&contents) else {
        return Ok(None);
    };
    Ok(Some(config))
}
