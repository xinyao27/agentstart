mod document;

use std::io;
use std::path::{Path, PathBuf};

use thiserror::Error;

use crate::projects::ProjectCatalog;
use crate::worktrees::{WorktreeCatalog, WorktreeCatalogError};

/// Directory under the daemon user-data path that holds one memory file per project.
pub(crate) const MEMORY_DIRECTORY: &str = "project-memory";
const FILE_EXTENSION: &str = "md";

#[derive(Debug, Error)]
pub(crate) enum ProjectMemoryError {
    #[error("the selector {0:?} matches more than one project")]
    Ambiguous(String),
    #[error("project memory would exceed {0} bytes; prune it before appending")]
    DocumentTooLarge(usize),
    #[error("project memory entry exceeds {0} bytes")]
    EntryTooLarge(usize),
    #[error("project_memory_invalid_argument:{0}")]
    InvalidArgument(&'static str),
    #[error("the selector {0:?} does not match any project")]
    ProjectNotFound(String),
    #[error("project memory storage failed: {0}")]
    Storage(String),
}

impl ProjectMemoryError {
    /// A stable domain code the RPC layer maps onto a transport status, mirroring how
    /// `OrchestrationError` keeps its codes separable from its human message.
    pub(crate) fn code(&self) -> &'static str {
        match self {
            Self::Ambiguous(_) => "project_memory_ambiguous_selector",
            Self::DocumentTooLarge(_) => "project_memory_document_too_large",
            Self::EntryTooLarge(_) => "project_memory_entry_too_large",
            Self::InvalidArgument(_) => "invalid_argument",
            Self::ProjectNotFound(_) => "project_not_found",
            Self::Storage(_) => "project_memory_storage_failed",
        }
    }
}

#[derive(Debug)]
pub(crate) struct ProjectMemorySnapshot {
    pub(crate) project_id: String,
    pub(crate) display_name: String,
    pub(crate) path: PathBuf,
    pub(crate) content: String,
    pub(crate) revision: i64,
}

#[derive(Debug)]
pub(crate) struct ProjectMemoryAppend {
    pub(crate) project_id: String,
    pub(crate) path: PathBuf,
    pub(crate) revision: i64,
    /// False when an identical entry was already recorded, so a retry is a no-op.
    pub(crate) appended: bool,
}

#[derive(Debug)]
pub(crate) struct ProjectMemorySummary {
    pub(crate) project_id: String,
    pub(crate) display_name: String,
    pub(crate) project_path: String,
    /// `None` until the project has recorded its first entry.
    pub(crate) memory_path: Option<PathBuf>,
    pub(crate) revision: i64,
    pub(crate) byte_count: i64,
}

#[derive(Clone)]
pub(crate) struct ProjectMemoryAuthority {
    directory: PathBuf,
    projects: ProjectCatalog,
    worktrees: WorktreeCatalog,
}

impl ProjectMemoryAuthority {
    pub(crate) fn new(
        user_data_path: &Path,
        projects: ProjectCatalog,
        worktrees: WorktreeCatalog,
    ) -> Self {
        Self {
            directory: user_data_path.join(MEMORY_DIRECTORY),
            projects,
            worktrees,
        }
    }

    /// The file a project's memory lives in, computed without touching the filesystem.
    /// Why: worker start needs to hand this to the agent before any memory necessarily exists,
    /// so it cannot be derived from a completed read.
    pub(crate) fn path_for_project(&self, project_id: &str) -> PathBuf {
        self.directory
            .join(format!("{}.{FILE_EXTENSION}", file_stem(project_id)))
    }

    pub(crate) async fn read(
        &self,
        selector: &str,
    ) -> Result<ProjectMemorySnapshot, ProjectMemoryError> {
        let project = self.resolve(selector).await?;
        let path = self.path_for_project(&project.id);
        let existing = read_document(&path).await?;
        let content = document::ensure_header(&existing, &project.display_name, &project.id);
        Ok(ProjectMemorySnapshot {
            revision: document::entry_count(&content),
            project_id: project.id,
            display_name: project.display_name,
            path,
            content,
        })
    }

    pub(crate) async fn append(
        &self,
        selector: &str,
        section: Option<&str>,
        text: &str,
    ) -> Result<ProjectMemoryAppend, ProjectMemoryError> {
        let text = text.trim();
        if text.is_empty() {
            return Err(ProjectMemoryError::InvalidArgument("text"));
        }
        if text.len() > document::MAX_ENTRY_BYTES {
            return Err(ProjectMemoryError::EntryTooLarge(text.len()));
        }
        let project = self.resolve(selector).await?;
        let path = self.path_for_project(&project.id);
        let section = section
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(document::DEFAULT_SECTION);
        let existing = read_document(&path).await?;
        let existing = document::ensure_header(&existing, &project.display_name, &project.id);
        let Some(updated) = document::append(&existing, section, &timestamp(), text) else {
            return Ok(ProjectMemoryAppend {
                revision: document::entry_count(&existing),
                project_id: project.id,
                path,
                appended: false,
            });
        };
        if updated.len() > document::MAX_DOCUMENT_BYTES {
            return Err(ProjectMemoryError::DocumentTooLarge(updated.len()));
        }
        write_document(&path, &updated).await?;
        Ok(ProjectMemoryAppend {
            revision: document::entry_count(&updated),
            project_id: project.id,
            path,
            appended: true,
        })
    }

    pub(crate) async fn list(&self) -> Result<Vec<ProjectMemorySummary>, ProjectMemoryError> {
        let projects = self
            .projects
            .list()
            .await
            .map_err(|error| ProjectMemoryError::Storage(error.to_string()))?;
        let mut summaries = Vec::with_capacity(projects.len());
        for project in projects {
            let path = self.path_for_project(&project.id);
            let metadata = match tokio::fs::metadata(&path).await {
                Ok(metadata) => Some(metadata),
                Err(error) if error.kind() == io::ErrorKind::NotFound => None,
                Err(error) => return Err(storage(error)),
            };
            let Some(metadata) = metadata else {
                summaries.push(ProjectMemorySummary {
                    memory_path: None,
                    revision: 0,
                    byte_count: 0,
                    project_id: project.id,
                    display_name: project.display_name,
                    project_path: project.path,
                });
                continue;
            };
            let content = read_document(&path).await?;
            summaries.push(ProjectMemorySummary {
                revision: document::entry_count(&content),
                byte_count: i64::try_from(metadata.len()).unwrap_or(i64::MAX),
                memory_path: Some(path),
                project_id: project.id,
                display_name: project.display_name,
                project_path: project.path,
            });
        }
        Ok(summaries)
    }

    /// A worktree selector resolves to the project that worktree checks out — memory is shared by
    /// every worktree of the same codebase, so a worktree is only a way to name the project.
    async fn resolve(&self, selector: &str) -> Result<ResolvedProject, ProjectMemoryError> {
        let selector = selector.trim();
        if selector.is_empty() {
            return Err(ProjectMemoryError::InvalidArgument("worktree"));
        }
        let worktree =
            self.worktrees
                .resolve_managed(selector)
                .await
                .map_err(|error| match error {
                    WorktreeCatalogError::NotFound => {
                        ProjectMemoryError::ProjectNotFound(selector.to_owned())
                    }
                    WorktreeCatalogError::AmbiguousSelector => {
                        ProjectMemoryError::Ambiguous(selector.to_owned())
                    }
                    other => ProjectMemoryError::Storage(other.to_string()),
                })?;
        Ok(ResolvedProject {
            id: worktree.repo_id,
            display_name: worktree.repo_display_name,
        })
    }
}

struct ResolvedProject {
    id: String,
    display_name: String,
}

async fn read_document(path: &Path) -> Result<String, ProjectMemoryError> {
    match tokio::fs::read_to_string(path).await {
        Ok(content) => Ok(content),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(storage(error)),
    }
}

async fn write_document(path: &Path, content: &str) -> Result<(), ProjectMemoryError> {
    if let Some(directory) = path.parent() {
        tokio::fs::create_dir_all(directory)
            .await
            .map_err(storage)?;
    }
    let temporary = temporary_path(path)?;
    if let Err(error) = tokio::fs::write(&temporary, content).await {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err(storage(error));
    }
    if let Err(error) = crate::atomic_file_replace::replace_async(&temporary, path).await {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err(storage(error));
    }
    Ok(())
}

fn temporary_path(path: &Path) -> Result<PathBuf, ProjectMemoryError> {
    let mut random = [0_u8; 8];
    getrandom::fill(&mut random)
        .map_err(|error| ProjectMemoryError::Storage(format!("entropy_unavailable: {error}")))?;
    let name = path.file_name().map_or_else(
        || "memory".to_owned(),
        |value| value.to_string_lossy().into_owned(),
    );
    Ok(path.with_file_name(format!(
        ".{name}.{}.{:016x}.tmp",
        std::process::id(),
        u64::from_le_bytes(random)
    )))
}

/// Project ids are daemon-minted, but the id becomes a filename here, so anything that could
/// escape the memory directory is folded to a dash.
fn file_stem(project_id: &str) -> String {
    let stem = project_id
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() || matches!(value, '-' | '_' | '.') {
                value
            } else {
                '-'
            }
        })
        .collect::<String>();
    if stem.is_empty() {
        "project".to_owned()
    } else {
        stem
    }
}

fn timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn storage(error: io::Error) -> ProjectMemoryError {
    ProjectMemoryError::Storage(error.to_string())
}
