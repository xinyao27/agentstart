use serde_json::{Map, Value};

use crate::hosts::HostFilesystem;

use super::ParseError;

const AUXILIARY_MAX_BYTES: usize = 16 * 1024 * 1024;

pub(super) async fn optional_text(
    filesystem: &HostFilesystem,
    path: &str,
) -> Result<Option<String>, ParseError> {
    let Some(stat) = filesystem.stat(path).await? else {
        return Ok(None);
    };
    if stat.kind != crate::hosts::HostFileKind::File || stat.size_bytes > AUXILIARY_MAX_BYTES as u64
    {
        return Ok(None);
    }
    Ok(filesystem
        .read(path, AUXILIARY_MAX_BYTES)
        .await?
        .map(|bytes| String::from_utf8_lossy(&bytes).into_owned()))
}

pub(super) async fn optional_json(
    filesystem: &HostFilesystem,
    path: &str,
) -> Result<Option<Map<String, Value>>, ParseError> {
    let Some(content) = optional_text(filesystem, path).await? else {
        return Ok(None);
    };
    Ok(serde_json::from_str::<Value>(&content)?
        .as_object()
        .cloned())
}
