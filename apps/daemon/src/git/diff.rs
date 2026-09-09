use base64::Engine;
use serde_json::{Map, Value, json};

use crate::hosts::HostFilesystem;

use super::runner::{GitError, GitRunOptions, GitRunner};
use super::scope::{GitAuthority, GitAuthorityError, GitScope};

const MAX_BLOB_BYTES: usize = 10 * 1_024 * 1_024;
const MAX_RENDERED_LINES: usize = 120_000;
const MAX_RENDERED_CHARACTERS: usize = 6_000_000;

impl GitAuthority {
    pub(crate) async fn diff(
        &self,
        worktree: &str,
        file_path: &str,
        staged: bool,
        compare_against_head: bool,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let left = if staged || compare_against_head {
            blob_at(&scope.runner, "HEAD", file_path).await
        } else {
            let index = index_blob(&scope.runner, file_path).await;
            if index.exists {
                index
            } else {
                blob_at(&scope.runner, "HEAD", file_path).await
            }
        };
        let right = if staged {
            index_blob(&scope.runner, file_path).await
        } else {
            working_blob(&scope, file_path).await?
        };
        Ok(build_diff(left, right, file_path))
    }

    pub(crate) async fn branch_diff(
        &self,
        worktree: &str,
        merge_base: &str,
        head_oid: &str,
        file_path: &str,
        old_path: Option<&str>,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let left = blob_at(&scope.runner, merge_base, old_path.unwrap_or(file_path)).await;
        let right = blob_at(&scope.runner, head_oid, file_path).await;
        Ok(build_diff(left, right, file_path))
    }

    pub(crate) async fn commit_diff(
        &self,
        worktree: &str,
        commit_oid: &str,
        parent_oid: Option<&str>,
        file_path: &str,
        old_path: Option<&str>,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let left = match parent_oid {
            Some(parent) => blob_at(&scope.runner, parent, old_path.unwrap_or(file_path)).await,
            None => Blob::missing(),
        };
        let right = blob_at(&scope.runner, commit_oid, file_path).await;
        Ok(build_diff(left, right, file_path))
    }
}

#[derive(Default)]
struct Blob {
    bytes: Vec<u8>,
    exists: bool,
    overflow: bool,
}

impl Blob {
    fn missing() -> Self {
        Self::default()
    }

    fn from_bytes(bytes: Vec<u8>) -> Self {
        Self {
            bytes,
            exists: true,
            overflow: false,
        }
    }

    fn overflow() -> Self {
        Self {
            bytes: Vec::new(),
            exists: true,
            overflow: true,
        }
    }

    fn is_binary(&self) -> bool {
        self.overflow || self.bytes.iter().take(8_000).any(|byte| *byte == 0)
    }
}

async fn blob_at(runner: &GitRunner, oid: &str, file_path: &str) -> Blob {
    let git_path = file_path.replace('\\', "/");
    read_git_bytes(
        runner,
        vec![
            "show".to_owned(),
            "--end-of-options".to_owned(),
            format!("{oid}:{git_path}"),
        ],
    )
    .await
}

async fn index_blob(runner: &GitRunner, file_path: &str) -> Blob {
    let git_path = file_path.replace('\\', "/");
    read_git_bytes(runner, vec!["show".to_owned(), format!(":{git_path}")]).await
}

async fn read_git_bytes(runner: &GitRunner, args: Vec<String>) -> Blob {
    match runner.read_bytes(args, blob_options()).await {
        Ok(output) if output.exit_code == 0 => {
            Blob::from_bytes(output.stdout_bytes.unwrap_or_default())
        }
        Err(GitError::OutputLimit) => Blob::overflow(),
        _ => Blob::missing(),
    }
}

async fn working_blob(scope: &GitScope, file_path: &str) -> Result<Blob, GitAuthorityError> {
    let filesystem = HostFilesystem::new(scope.host.clone());
    let path = filesystem.paths().resolve(&scope.runner.cwd, &[file_path]);
    let Some(stat) = filesystem.stat(&path).await? else {
        return Ok(Blob::missing());
    };
    if stat.size_bytes > MAX_BLOB_BYTES as u64 {
        return Ok(Blob::overflow());
    }
    match filesystem.read(&path, MAX_BLOB_BYTES).await {
        Ok(Some(bytes)) => Ok(Blob::from_bytes(bytes)),
        Ok(None) => Ok(Blob::missing()),
        Err(error) => Err(error.into()),
    }
}

fn build_diff(original: Blob, modified: Blob, file_path: &str) -> Value {
    let original_binary = original.is_binary();
    let modified_binary = modified.is_binary();
    if original_binary || modified_binary {
        let mime = preview_mime(file_path);
        let mut result = Map::from_iter([
            ("kind".to_owned(), Value::String("binary".to_owned())),
            (
                "originalContent".to_owned(),
                Value::String(preview_content(&original, mime)),
            ),
            (
                "modifiedContent".to_owned(),
                Value::String(preview_content(&modified, mime)),
            ),
            ("originalIsBinary".to_owned(), Value::Bool(original_binary)),
            ("modifiedIsBinary".to_owned(), Value::Bool(modified_binary)),
        ]);
        if let Some(mime) = mime {
            result.insert("isImage".to_owned(), Value::Bool(true));
            result.insert("mimeType".to_owned(), Value::String(mime.to_owned()));
        }
        if !modified.exists {
            result.insert("modifiedDeleted".to_owned(), Value::Bool(true));
        }
        return Value::Object(result);
    }
    let original = String::from_utf8_lossy(&original.bytes).into_owned();
    let modified = String::from_utf8_lossy(&modified.bytes).into_owned();
    if let Some(limit) = render_limit(&original, &modified) {
        json!({
            "kind": "text", "originalContent": "", "modifiedContent": "",
            "originalIsBinary": false, "modifiedIsBinary": false,
            "largeDiffRenderLimit": limit
        })
    } else {
        json!({
            "kind": "text", "originalContent": original, "modifiedContent": modified,
            "originalIsBinary": false, "modifiedIsBinary": false
        })
    }
}

fn render_limit(original: &str, modified: &str) -> Option<Value> {
    let characters = original
        .encode_utf16()
        .count()
        .saturating_add(modified.encode_utf16().count());
    let limits = json!({ "maxLinesPerSide": MAX_RENDERED_LINES, "maxCombinedCharacters": MAX_RENDERED_CHARACTERS });
    if characters > MAX_RENDERED_CHARACTERS {
        return Some(
            json!({ "limited": true, "reason": "character-count", "lineCounts": null, "characterCount": characters, "limits": limits }),
        );
    }
    let original_lines = line_count(original);
    let modified_lines = line_count(modified);
    if original_lines > MAX_RENDERED_LINES || modified_lines > MAX_RENDERED_LINES {
        return Some(json!({
            "limited": true, "reason": "line-count",
            "lineCounts": { "original": original_lines.min(MAX_RENDERED_LINES + 1), "modified": modified_lines.min(MAX_RENDERED_LINES + 1) },
            "lineCountsAreMinimum": { "original": original_lines > MAX_RENDERED_LINES, "modified": modified_lines > MAX_RENDERED_LINES },
            "characterCount": characters, "limits": limits
        }));
    }
    None
}

fn line_count(value: &str) -> usize {
    if value.is_empty() {
        0
    } else {
        value
            .bytes()
            .filter(|byte| *byte == b'\n')
            .count()
            .saturating_add(1)
    }
}

fn preview_content(blob: &Blob, mime: Option<&str>) -> String {
    if blob.is_binary() && mime.is_some() && !blob.overflow {
        base64::engine::general_purpose::STANDARD.encode(&blob.bytes)
    } else {
        String::new()
    }
}

fn preview_mime(path: &str) -> Option<&'static str> {
    let extension = path
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())?;
    match extension.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "svg" => Some("image/svg+xml"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        "pdf" => Some("application/pdf"),
        _ => None,
    }
}

fn blob_options() -> GitRunOptions {
    GitRunOptions {
        max_output_bytes: MAX_BLOB_BYTES,
        timeout_ms: Some(120_000),
    }
}
