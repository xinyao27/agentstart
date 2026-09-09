use thiserror::Error;

use crate::hosts::{HostFilesystem, HostFilesystemError, HostPlatform};
use crate::workspace_ports::WorkspacePortProbe;

#[derive(Debug, Error)]
pub(super) enum SourcePathError {
    #[error(transparent)]
    Filesystem(#[from] HostFilesystemError),
    #[error("browser writeback source URL is invalid")]
    InvalidUrl,
    #[error("browser writeback source URI encoding is invalid")]
    InvalidEncoding,
}

pub(super) async fn resolve(
    worktree: &WorkspacePortProbe,
    filesystem: &HostFilesystem,
    platform: HostPlatform,
    source_hint: Option<&str>,
) -> Result<Option<String>, SourcePathError> {
    let Some(source_hint) = source_hint else {
        return Ok(None);
    };
    let hint = normalize_hint(source_hint)?;
    let paths = filesystem.paths();
    let candidate = if is_absolute(&hint) {
        hint
    } else {
        paths.join(&[&worktree.path, &hint])
    };
    let root = filesystem.canonical_directory(&worktree.path).await?;
    let parent = match filesystem
        .canonical_directory(&paths.dirname(&candidate))
        .await
    {
        Ok(parent) => parent,
        Err(_) => return Ok(None),
    };
    if !is_within_root(platform, &root, &parent) || !filesystem.exists(&candidate).await? {
        return Ok(None);
    }
    Ok(Some(candidate))
}

fn normalize_hint(source_hint: &str) -> Result<String, SourcePathError> {
    let without_query = source_hint
        .split_once(['?', '#'])
        .map_or(source_hint, |(value, _)| value);
    if without_query.starts_with("file://") {
        let parsed = url::Url::parse(without_query).map_err(|_| SourcePathError::InvalidUrl)?;
        return decode_uri_component(parsed.path());
    }
    let normalized = without_query
        .strip_prefix("webpack://")
        .and_then(|value| value.split_once('/').map(|(_, path)| path))
        .or_else(|| without_query.strip_prefix("vite://"))
        .unwrap_or(without_query);
    let normalized = normalized
        .strip_prefix("/@fs/")
        .map_or_else(|| normalized.to_owned(), |value| format!("/{value}"));
    let normalized = normalized.strip_prefix("./").unwrap_or(&normalized);
    decode_uri_component(normalized)
}

fn decode_uri_component(value: &str) -> Result<String, SourcePathError> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut cursor = 0;
    while cursor < bytes.len() {
        if bytes[cursor] != b'%' {
            decoded.push(bytes[cursor]);
            cursor += 1;
            continue;
        }
        let pair = bytes
            .get(cursor + 1..cursor + 3)
            .ok_or(SourcePathError::InvalidEncoding)?;
        let high = hex_value(pair[0]).ok_or(SourcePathError::InvalidEncoding)?;
        let low = hex_value(pair[1]).ok_or(SourcePathError::InvalidEncoding)?;
        decoded.push((high << 4) | low);
        cursor += 3;
    }
    String::from_utf8(decoded).map_err(|_| SourcePathError::InvalidEncoding)
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn is_absolute(path: &str) -> bool {
    path.starts_with('/')
        || path.as_bytes().get(0..3).is_some_and(|value| {
            value[0].is_ascii_alphabetic() && value[1] == b':' && matches!(value[2], b'/' | b'\\')
        })
}

fn is_within_root(platform: HostPlatform, root: &str, candidate: &str) -> bool {
    let (root, candidate, separator) = if platform == HostPlatform::Windows {
        (root.to_lowercase(), candidate.to_lowercase(), '\\')
    } else {
        (root.to_owned(), candidate.to_owned(), '/')
    };
    let root = root.trim_end_matches(['/', '\\']);
    candidate == root || candidate.starts_with(&format!("{root}{separator}"))
}
