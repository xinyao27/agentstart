use tokio::io::{AsyncReadExt, AsyncSeekExt};

use crate::hosts::{HostCommand, HostKind};
use crate::workspace_paths::{AuthorizedWorkspacePath, PathResolution};

use super::metadata;
use super::{FileReadChunkResult, FileReadResult, FileStatResult, ShellFileError, ShellFiles};

const BINARY_PROBE_BYTES: usize = 8_192;
const MAX_FILE_SIZE: u64 = 50 * 1_024 * 1_024;

impl ShellFiles {
    pub(crate) async fn read(
        &self,
        file_path: &str,
        include_local_log_metadata: bool,
    ) -> Result<FileReadResult, ShellFileError> {
        let target = self
            .authority
            .resolve(file_path, PathResolution::Follow)
            .await?;
        let metadata = required_metadata(&target).await?;
        if metadata.size > MAX_FILE_SIZE {
            return Err(ShellFileError::Operation(format!(
                "File too large: {:.1}MB exceeds 50MB limit",
                metadata.size as f64 / 1_024.0 / 1_024.0
            )));
        }
        if metadata.is_directory {
            return Err(ShellFileError::Operation(
                "Cannot read a directory".to_owned(),
            ));
        }
        let file_identity = if include_local_log_metadata {
            local_file_identity(&target).await?
        } else {
            None
        };
        let mime_type = preview_mime_type(&target.path);
        if let Some(mime_type) = mime_type {
            let bytes = read_bytes(
                &target,
                usize::try_from(MAX_FILE_SIZE).unwrap_or(usize::MAX),
            )
            .await?;
            return Ok(FileReadResult {
                content: bytes,
                is_binary: true,
                is_image: Some(true),
                mime_type: Some(mime_type),
                file_identity,
            });
        }
        if metadata.size > BINARY_PROBE_BYTES as u64 {
            let prefix = read_range(&target, 0, BINARY_PROBE_BYTES).await?;
            if prefix.contains(&0) {
                return Ok(FileReadResult {
                    content: Vec::new(),
                    is_binary: true,
                    is_image: None,
                    mime_type: None,
                    file_identity,
                });
            }
        }
        let bytes = read_bytes(
            &target,
            usize::try_from(MAX_FILE_SIZE).unwrap_or(usize::MAX),
        )
        .await?;
        let is_binary = bytes.iter().take(BINARY_PROBE_BYTES).any(|byte| *byte == 0);
        Ok(FileReadResult {
            content: if is_binary {
                Vec::new()
            } else {
                String::from_utf8_lossy(&bytes).into_owned().into_bytes()
            },
            is_binary,
            is_image: None,
            mime_type: None,
            file_identity,
        })
    }

    pub(crate) async fn read_chunk(
        &self,
        file_path: &str,
        offset: u64,
        length: usize,
    ) -> Result<FileReadChunkResult, ShellFileError> {
        let target = self
            .authority
            .resolve(file_path, PathResolution::Follow)
            .await?;
        let metadata = required_metadata(&target).await?;
        if metadata.is_directory {
            return Err(ShellFileError::Operation(
                "Cannot read a directory".to_owned(),
            ));
        }
        let requested = usize::try_from(metadata.size.saturating_sub(offset))
            .unwrap_or(usize::MAX)
            .min(length);
        let bytes = read_range(&target, offset, requested).await?;
        let bytes_read = bytes.len();
        Ok(FileReadChunkResult {
            content: bytes,
            bytes_read,
            eof: offset.saturating_add(bytes_read as u64) >= metadata.size,
        })
    }

    pub(crate) async fn stat(&self, file_path: &str) -> Result<FileStatResult, ShellFileError> {
        let target = self
            .authority
            .resolve(file_path, PathResolution::Follow)
            .await?;
        let value = required_metadata(&target).await?;
        Ok(FileStatResult {
            is_directory: value.is_directory,
            mtime: value.mtime_ms,
            size: value.size,
        })
    }

    pub(crate) async fn path_exists(&self, file_path: &str) -> Result<bool, ShellFileError> {
        let target = self
            .authority
            .resolve(file_path, PathResolution::Follow)
            .await?;
        Ok(metadata::load(&target).await?.is_some())
    }
}

async fn required_metadata(
    target: &AuthorizedWorkspacePath,
) -> Result<metadata::FileMetadata, ShellFileError> {
    metadata::load(target)
        .await?
        .ok_or_else(|| ShellFileError::Operation("No such file or directory".to_owned()))
}

async fn read_bytes(
    target: &AuthorizedWorkspacePath,
    max_bytes: usize,
) -> Result<Vec<u8>, ShellFileError> {
    if target.host.kind() == HostKind::Local {
        return Ok(tokio::fs::read(&target.path).await?);
    }
    crate::hosts::HostFilesystem::new(target.host.clone())
        .read(&target.path, max_bytes)
        .await?
        .ok_or_else(|| ShellFileError::Operation("Unable to read file".to_owned()))
}

async fn read_range(
    target: &AuthorizedWorkspacePath,
    offset: u64,
    length: usize,
) -> Result<Vec<u8>, ShellFileError> {
    if length == 0 {
        return Ok(Vec::new());
    }
    if target.host.kind() == HostKind::Local {
        let mut file = tokio::fs::File::open(&target.path).await?;
        file.seek(std::io::SeekFrom::Start(offset)).await?;
        let mut bytes = vec![0; length];
        let bytes_read = file.read(&mut bytes).await?;
        bytes.truncate(bytes_read);
        return Ok(bytes);
    }
    let script = "dd if=\"$1\" bs=1 skip=\"$2\" count=\"$3\" 2>/dev/null";
    let mut command = HostCommand::new(
        "sh",
        [
            "-c".to_owned(),
            script.to_owned(),
            "sh".to_owned(),
            target.path.clone(),
            offset.to_string(),
            length.to_string(),
        ],
    );
    command.capture_stdout_bytes = true;
    command.max_output_bytes = Some(length);
    let output = target.host.exec(command).await?;
    if output.exit_code != 0 {
        return Err(ShellFileError::Operation(
            "Unable to read file range".to_owned(),
        ));
    }
    output
        .stdout_bytes
        .ok_or_else(|| ShellFileError::Operation("Missing file range output".to_owned()))
}

async fn local_file_identity(
    target: &AuthorizedWorkspacePath,
) -> Result<Option<String>, ShellFileError> {
    if target.host.kind() != HostKind::Local {
        return Ok(None);
    }
    Ok(Some(metadata::local_identity(
        &tokio::fs::metadata(&target.path).await?,
    )))
}

fn preview_mime_type(path: &str) -> Option<&'static str> {
    let extension = path.rsplit('.').next()?.to_ascii_lowercase();
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
