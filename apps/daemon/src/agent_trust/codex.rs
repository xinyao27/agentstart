use crate::hosts::{ExecutionHost, HostFileKind, HostFilesystem};

use super::AgentTrustError;
use super::atomic::replace;
use super::toml::upsert_project_trust;
use super::workspace::resolve_codex_root;

const CONFIG_MAX_BYTES: usize = 16 * 1_024 * 1_024;

pub(super) async fn mark_trusted(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    managed_codex_home: &str,
    workspace_path: &str,
) -> Result<(), AgentTrustError> {
    let workspace_path = resolve_codex_root(filesystem, host, workspace_path).await;
    let home = filesystem
        .home_directory()
        .await?
        .ok_or(AgentTrustError::HomeUnavailable)?;
    let system_config = filesystem.paths().join(&[&home, ".codex", "config.toml"]);
    update_config(filesystem, host, &system_config, &workspace_path).await?;
    let managed_config = filesystem
        .paths()
        .join(&[managed_codex_home, "config.toml"]);
    update_config(filesystem, host, &managed_config, &workspace_path).await
}

async fn update_config(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    path: &str,
    workspace_path: &str,
) -> Result<(), AgentTrustError> {
    let existing = read_config(filesystem, path).await?;
    let updated = upsert_project_trust(&existing, workspace_path);
    if updated != existing {
        replace(filesystem, host, path, updated.as_bytes()).await?;
    }
    Ok(())
}

async fn read_config(filesystem: &HostFilesystem, path: &str) -> Result<String, AgentTrustError> {
    let Some(stat) = filesystem.stat(path).await? else {
        return Ok(String::new());
    };
    if stat.kind != HostFileKind::File && stat.kind != HostFileKind::Symlink {
        return Err(AgentTrustError::ConfigTooLarge);
    }
    if stat.size_bytes > CONFIG_MAX_BYTES as u64 {
        return Err(AgentTrustError::ConfigTooLarge);
    }
    let contents = filesystem
        .read_text(path, CONFIG_MAX_BYTES)
        .await?
        .ok_or(AgentTrustError::ConfigTooLarge)?;
    Ok(contents
        .strip_prefix('\u{feff}')
        .unwrap_or(&contents)
        .to_owned())
}
