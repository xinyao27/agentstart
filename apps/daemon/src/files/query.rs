use std::path::{Path, PathBuf};

use base64::Engine;
use serde_json::{Value, json};

use crate::hosts::{HostFileKind, HostFilesystem};
use crate::workspace_paths::PathResolution;

use super::host_io;
use super::model::{
    DirectoryEntry, FileListEntry, FileListResult, FileOpenResult, FilePreviewResult,
    FileReadChunkResult, FileReadResult, FileStatResult, MarkdownDocument, ServerDirectoryResult,
};
use super::{FilesAuthority, FilesError, inventory, path, scope};

const MOBILE_LIST_LIMIT: usize = 5_000;
const MOBILE_READ_MAX_BYTES: usize = 512 * 1_024;
const PREVIEW_BINARY_MAX_BYTES: usize = 10 * 1_024 * 1_024;

impl FilesAuthority {
    pub(crate) async fn list_mobile(&self, worktree: &str) -> Result<FileListResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let mut paths = inventory::list(scope.host.clone(), &scope.path, &[], None).await?;
        paths.sort_by(|left, right| path::locale_compare(left, right));
        let total_count = paths.len();
        let files = paths
            .into_iter()
            .take(MOBILE_LIST_LIMIT)
            .map(|relative_path| FileListEntry {
                basename: path::basename(&relative_path),
                kind: if path::is_mobile_binary(&relative_path) {
                    "binary"
                } else {
                    "text"
                },
                relative_path,
            })
            .collect();
        Ok(FileListResult {
            files,
            root_path: scope.path,
            total_count,
            truncated: total_count > MOBILE_LIST_LIMIT,
            worktree: scope.worktree_id,
        })
    }

    pub(crate) async fn search_mobile_paths(
        &self,
        worktree: &str,
        query: &str,
        limit: usize,
    ) -> Result<FileListResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (paths, _, inventory_truncated) = self
            .inventory
            .mobile(scope.host.clone(), &scope.path)
            .await?;
        let (matches, total_count) = inventory::rank(&paths, query, limit);
        let files = matches
            .into_iter()
            .map(|relative_path| FileListEntry {
                basename: path::basename(&relative_path),
                kind: if path::is_mobile_binary(&relative_path) {
                    "binary"
                } else {
                    "text"
                },
                relative_path,
            })
            .collect();
        Ok(FileListResult {
            files,
            root_path: scope.path,
            total_count,
            truncated: inventory_truncated || total_count > limit,
            worktree: scope.worktree_id,
        })
    }

    pub(crate) async fn open(
        &self,
        worktree: &str,
        relative_path: &str,
    ) -> Result<FileOpenResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (relative_path, absolute_path) = scope::target(
            &scope,
            &self.paths,
            relative_path,
            false,
            PathResolution::Follow,
        )
        .await?;
        let kind = open_kind(&relative_path);
        if kind == "binary" {
            return Ok(FileOpenResult {
                kind,
                opened: false,
                relative_path,
                worktree: scope.worktree_id,
            });
        }
        if host_io::metadata(scope.host, &absolute_path, true)
            .await?
            .is_none()
        {
            return Err(FilesError::MissingPath(absolute_path));
        }
        self.dispatch_open_command(json!({
            "filePath": absolute_path,
            "relativePath": relative_path,
            "type": "openFile",
            "worktreeId": scope.worktree_id,
        }))
        .await?;
        Ok(FileOpenResult {
            kind,
            opened: true,
            relative_path,
            worktree: scope.worktree_id,
        })
    }

    pub(crate) async fn open_diff(
        &self,
        worktree: &str,
        relative_path: &str,
        staged: bool,
    ) -> Result<FileOpenResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (relative_path, absolute_path) = scope::target(
            &scope,
            &self.paths,
            relative_path,
            false,
            PathResolution::Follow,
        )
        .await?;
        let kind = if path::is_mobile_binary(&relative_path) {
            "binary"
        } else if path::is_markdown(&relative_path) {
            "markdown"
        } else {
            "text"
        };
        self.dispatch_open_command(json!({
            "filePath": absolute_path,
            "relativePath": relative_path,
            "staged": staged,
            "type": "openDiff",
            "worktreeId": scope.worktree_id,
        }))
        .await?;
        Ok(FileOpenResult {
            kind,
            opened: true,
            relative_path,
            worktree: scope.worktree_id,
        })
    }

    pub(crate) async fn read_mobile(
        &self,
        worktree: &str,
        relative_path: &str,
    ) -> Result<FileReadResult, FilesError> {
        if path::is_mobile_binary(relative_path) {
            return Err(FilesError::BinaryFile);
        }
        let scope = self.scopes.resolve(worktree).await?;
        let (relative_path, absolute_path) = scope::target(
            &scope,
            &self.paths,
            relative_path,
            false,
            PathResolution::Follow,
        )
        .await?;
        let Some(metadata) = host_io::metadata(scope.host.clone(), &absolute_path, true).await?
        else {
            return Err(FilesError::MissingPath(absolute_path));
        };
        if metadata.kind == HostFileKind::Directory {
            return Err(FilesError::InvalidInput("Cannot read a directory"));
        }
        let read_limit = usize::try_from(metadata.size.min((MOBILE_READ_MAX_BYTES + 1) as u64))
            .unwrap_or(MOBILE_READ_MAX_BYTES + 1);
        let (bytes, _) = host_io::read_range(scope.host, &absolute_path, 0, read_limit).await?;
        let (content, byte_length, truncated) = truncate_mobile_text(&bytes);
        Ok(FileReadResult {
            byte_length,
            content,
            relative_path,
            truncated,
            worktree: scope.worktree_id,
        })
    }

    pub(crate) async fn read_preview(
        &self,
        worktree: &str,
        relative_path: &str,
    ) -> Result<FilePreviewResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (_, absolute_path) = scope::target(
            &scope,
            &self.paths,
            relative_path,
            false,
            PathResolution::Follow,
        )
        .await?;
        read_preview(scope.host, &absolute_path).await
    }

    pub(crate) async fn read_chunk(
        &self,
        worktree: &str,
        relative_path: &str,
        offset: u64,
        length: usize,
    ) -> Result<FileReadChunkResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (_, absolute_path) = scope::target(
            &scope,
            &self.paths,
            relative_path,
            false,
            PathResolution::Follow,
        )
        .await?;
        let (content, size) =
            host_io::read_range(scope.host, &absolute_path, offset, length).await?;
        let bytes_read = content.len();
        Ok(FileReadChunkResult {
            bytes_read,
            content_base64: base64::engine::general_purpose::STANDARD.encode(content),
            eof: offset.saturating_add(bytes_read as u64) >= size,
        })
    }

    pub(crate) async fn read_directory(
        &self,
        worktree: &str,
        relative_path: &str,
    ) -> Result<Vec<DirectoryEntry>, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (_, absolute_path) = scope::target(
            &scope,
            &self.paths,
            relative_path,
            true,
            PathResolution::Follow,
        )
        .await?;
        let mut entries = HostFilesystem::new(scope.host)
            .read_dir(&absolute_path)
            .await?
            .into_iter()
            .map(|entry| DirectoryEntry {
                is_directory: entry.kind == HostFileKind::Directory,
                is_symlink: entry.kind == HostFileKind::Symlink,
                name: entry.name,
            })
            .collect::<Vec<_>>();
        sort_entries(&mut entries);
        Ok(entries)
    }

    pub(crate) async fn browse_server_directory(
        &self,
        value: &str,
    ) -> Result<ServerDirectoryResult, FilesError> {
        let path = resolve_server_browse_path(value)?;
        let host = self.hosts.execution_host("local").await?;
        let filesystem = HostFilesystem::new(host);
        let Some(metadata) =
            host_io::metadata(self.hosts.execution_host("local").await?, &path, true).await?
        else {
            return Err(FilesError::MissingPath(path));
        };
        if metadata.kind != HostFileKind::Directory {
            return Err(FilesError::InvalidInput("server path is not a directory"));
        }
        let mut entries = filesystem
            .read_dir(&path)
            .await?
            .into_iter()
            .filter(|entry| !matches!(entry.name.as_str(), "." | ".."))
            .map(|entry| DirectoryEntry {
                is_directory: entry.kind == HostFileKind::Directory,
                is_symlink: entry.kind == HostFileKind::Symlink,
                name: entry.name,
            })
            .collect::<Vec<_>>();
        sort_entries(&mut entries);
        Ok(ServerDirectoryResult {
            entries,
            resolved_path: path,
        })
    }

    pub(crate) async fn list_all(
        &self,
        worktree: &str,
        exclude_paths: &[String],
    ) -> Result<Vec<String>, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        inventory::list(scope.host, &scope.path, exclude_paths, None).await
    }

    pub(crate) async fn list_markdown_documents(
        &self,
        worktree: &str,
    ) -> Result<Vec<MarkdownDocument>, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        inventory::markdown_documents(scope.host, &scope.path).await
    }

    pub(crate) async fn stat(
        &self,
        worktree: &str,
        relative_path: &str,
    ) -> Result<FileStatResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (_, absolute_path) = scope::target(
            &scope,
            &self.paths,
            relative_path,
            true,
            PathResolution::Follow,
        )
        .await?;
        let Some(metadata) = host_io::metadata(scope.host, &absolute_path, true).await? else {
            return Err(FilesError::MissingPath(absolute_path));
        };
        Ok(FileStatResult {
            is_directory: metadata.kind == HostFileKind::Directory,
            mtime: metadata.modified_ms,
            size: metadata.size,
        })
    }

    async fn dispatch_open_command(&self, command: Value) -> Result<(), FilesError> {
        if self.shells.dispatch_ui("/ui/command", command).await {
            Ok(())
        } else {
            Err(FilesError::RendererUnavailable)
        }
    }
}

pub(super) async fn read_preview(
    host: std::sync::Arc<dyn crate::hosts::ExecutionHost>,
    path: &str,
) -> Result<FilePreviewResult, FilesError> {
    let mime_type = path::preview_mime(path);
    let maximum = if mime_type.is_some() {
        PREVIEW_BINARY_MAX_BYTES
    } else {
        MOBILE_READ_MAX_BYTES
    };
    let bytes = host_io::read_bounded(host, path, maximum).await?;
    Ok(preview_bytes(path, bytes))
}

pub(super) fn preview_bytes(path: &str, bytes: Vec<u8>) -> FilePreviewResult {
    let mime_type = path::preview_mime(path);
    if let Some(mime_type) = mime_type {
        return FilePreviewResult {
            content: base64::engine::general_purpose::STANDARD.encode(bytes),
            is_binary: true,
            is_image: Some(true),
            mime_type: Some(mime_type),
        };
    }
    if path::is_binary(&bytes) {
        return FilePreviewResult {
            content: String::new(),
            is_binary: true,
            is_image: None,
            mime_type: None,
        };
    }
    FilePreviewResult {
        content: String::from_utf8_lossy(&bytes).into_owned(),
        is_binary: false,
        is_image: None,
        mime_type: None,
    }
}

pub(super) fn truncate_mobile_text(bytes: &[u8]) -> (String, usize, bool) {
    let decoded = String::from_utf8_lossy(bytes);
    let decoded_bytes = decoded.as_bytes();
    let byte_length = decoded_bytes.len();
    if byte_length <= MOBILE_READ_MAX_BYTES {
        return (decoded.into_owned(), byte_length, false);
    }
    (
        String::from_utf8_lossy(&decoded_bytes[..MOBILE_READ_MAX_BYTES]).into_owned(),
        byte_length,
        true,
    )
}

fn open_kind(relative_path: &str) -> &'static str {
    if path::is_mobile_image(relative_path) {
        "image"
    } else if path::is_mobile_binary(relative_path) {
        "binary"
    } else if path::is_markdown(relative_path) {
        "markdown"
    } else {
        "text"
    }
}

fn sort_entries(entries: &mut [DirectoryEntry]) {
    entries.sort_by(|left, right| {
        right
            .is_directory
            .cmp(&left.is_directory)
            .then_with(|| path::locale_compare(&left.name, &right.name))
    });
}

fn resolve_server_browse_path(value: &str) -> Result<String, FilesError> {
    let value = value.trim();
    let value = if value.is_empty() { "~" } else { value };
    if value.contains('\0') {
        return Err(FilesError::InvalidInput("Path cannot contain null bytes"));
    }
    let home = crate::paths::resolve_local_home_path().ok_or(FilesError::HomeUnavailable)?;
    let path = if value == "~" {
        home
    } else if value.starts_with("~/") || value.starts_with("~\\") {
        home.join(&value[2..])
    } else if Path::new(value).is_absolute() {
        PathBuf::from(value)
    } else {
        home.join(value)
    };
    Ok(normalize_local_path(path))
}

fn normalize_local_path(path: PathBuf) -> String {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            value => normalized.push(value.as_os_str()),
        }
    }
    normalized.to_string_lossy().into_owned()
}
