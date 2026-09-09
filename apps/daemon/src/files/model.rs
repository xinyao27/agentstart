use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileListEntry {
    pub(crate) basename: String,
    pub(crate) kind: &'static str,
    pub(crate) relative_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileListResult {
    pub(crate) files: Vec<FileListEntry>,
    pub(crate) root_path: String,
    pub(crate) total_count: usize,
    pub(crate) truncated: bool,
    pub(crate) worktree: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileOpenResult {
    pub(crate) kind: &'static str,
    pub(crate) opened: bool,
    pub(crate) relative_path: String,
    pub(crate) worktree: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileReadResult {
    pub(crate) byte_length: usize,
    pub(crate) content: String,
    pub(crate) relative_path: String,
    pub(crate) truncated: bool,
    pub(crate) worktree: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FilePreviewResult {
    pub(crate) content: String,
    pub(crate) is_binary: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) is_image: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) mime_type: Option<&'static str>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileReadChunkResult {
    pub(crate) bytes_read: usize,
    pub(crate) content_base64: String,
    pub(crate) eof: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DirectoryEntry {
    pub(crate) is_directory: bool,
    pub(crate) is_symlink: bool,
    pub(crate) name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServerDirectoryResult {
    pub(crate) entries: Vec<DirectoryEntry>,
    pub(crate) resolved_path: String,
}

#[derive(Clone, Copy, Debug, Serialize)]
pub(crate) struct MutationResult {
    pub(crate) ok: bool,
}

impl MutationResult {
    pub(crate) const OK: Self = Self { ok: true };
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchMatch {
    pub(crate) column: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) display_column: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) display_match_length: Option<usize>,
    pub(crate) line: usize,
    pub(crate) line_content: String,
    pub(crate) match_length: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchFileResult {
    pub(crate) file_path: String,
    pub(crate) match_count: usize,
    pub(crate) matches: Vec<SearchMatch>,
    pub(crate) relative_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileSearchResult {
    pub(crate) files: Vec<SearchFileResult>,
    pub(crate) total_matches: usize,
    pub(crate) truncated: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct SearchOptions {
    pub(crate) case_sensitive: bool,
    pub(crate) exclude_pattern: Option<String>,
    pub(crate) include_pattern: Option<String>,
    pub(crate) max_results: usize,
    pub(crate) query: String,
    pub(crate) use_regex: bool,
    pub(crate) whole_word: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownDocument {
    pub(crate) basename: String,
    pub(crate) file_path: String,
    pub(crate) name: String,
    pub(crate) relative_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileStatResult {
    pub(crate) is_directory: bool,
    pub(crate) mtime: f64,
    pub(crate) size: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalPathResolution {
    pub(crate) absolute_path: Option<String>,
    pub(crate) exists: bool,
    pub(crate) is_directory: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) open_target: Option<TerminalOpenTarget>,
    pub(crate) relative_path: Option<String>,
    pub(crate) worktree: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub(crate) enum TerminalOpenTarget {
    #[serde(rename = "worktree-file")]
    WorktreeFile {
        absolute_path: String,
        provider: &'static str,
        relative_path: String,
    },
    #[serde(rename = "absolute-file")]
    AbsoluteFile {
        absolute_path: String,
        grant_id: String,
        provider: &'static str,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LogTailReadResult {
    pub(crate) content_base64: String,
    pub(crate) file_identity: String,
    pub(crate) file_size: u64,
    pub(crate) has_more: bool,
    pub(crate) next_byte_offset: u64,
    pub(crate) reset: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "type"
)]
pub(crate) enum FileWatchEvent {
    #[serde(rename = "starting")]
    Starting { subscription_id: String },
    #[serde(rename = "ready")]
    Ready { subscription_id: String },
    #[serde(rename = "changed")]
    Changed {
        events: Vec<FileChangeEvent>,
        worktree: String,
    },
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "end")]
    End,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileChangeEvent {
    pub(crate) absolute_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) is_directory: Option<bool>,
    pub(crate) kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) old_absolute_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "type"
)]
pub(crate) enum LogTailWatchEvent {
    #[serde(rename = "ready")]
    Ready { subscription_id: String },
    #[serde(rename = "changed")]
    Changed { event_type: &'static str },
    #[serde(rename = "end")]
    End,
}
