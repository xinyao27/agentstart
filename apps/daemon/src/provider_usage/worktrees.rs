use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::projects::ProjectCatalog;
use crate::worktrees::WorktreeMetadataStore;

use super::ProviderUsageError;

#[derive(Clone)]
pub(super) struct WorktreeSources {
    projects: ProjectCatalog,
    metadata: WorktreeMetadataStore,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UsageWorktree {
    pub repo_id: String,
    pub worktree_id: String,
    pub path: String,
    pub display_name: String,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Location {
    pub project_key: String,
    pub project_label: String,
    pub repo_id: Option<String>,
    pub worktree_id: Option<String>,
}

impl WorktreeSources {
    pub(super) fn new(projects: ProjectCatalog, metadata: WorktreeMetadataStore) -> Self {
        Self { projects, metadata }
    }

    pub(super) async fn load(&self) -> Result<Vec<UsageWorktree>, ProviderUsageError> {
        let mut result = Vec::new();
        for project in self.projects.list().await.map_err(scan_error)? {
            if project.execution_host_id != "local" {
                continue;
            }
            result.push(UsageWorktree {
                repo_id: project.id.clone(),
                worktree_id: format!("{}::{}", project.id, project.path),
                path: project.path.clone(),
                display_name: project.display_name.clone(),
            });
            // Why: background analytics uses persisted metadata and never invokes git discovery.
            for worktree in self
                .metadata
                .list(project.storage_id)
                .await
                .map_err(scan_error)?
            {
                if worktree
                    .host_id
                    .as_deref()
                    .is_some_and(|host| host != "local")
                    || worktree.path == project.path
                {
                    continue;
                }
                result.push(UsageWorktree {
                    repo_id: project.id.clone(),
                    worktree_id: worktree.id,
                    path: worktree.path,
                    display_name: worktree.display_name,
                });
            }
        }
        result.sort_by(|left, right| {
            (&left.repo_id, &left.worktree_id).cmp(&(&right.repo_id, &right.worktree_id))
        });
        Ok(result)
    }
}

pub(super) struct Attribution {
    worktrees: Vec<(String, UsageWorktree)>,
    canonical_paths: BTreeMap<String, String>,
}

impl Attribution {
    pub(super) fn new(worktrees: Vec<UsageWorktree>) -> Self {
        let mut worktrees = worktrees
            .into_iter()
            .map(|worktree| (canonical(&worktree.path), worktree))
            .collect::<Vec<_>>();
        worktrees.sort_by_key(|(path, _)| std::cmp::Reverse(path.len()));
        Self {
            worktrees,
            canonical_paths: BTreeMap::new(),
        }
    }

    pub(super) fn locate(&mut self, cwd: Option<&str>) -> Location {
        let Some(cwd) = cwd.filter(|value| !value.is_empty()) else {
            return Location {
                project_key: "unscoped".to_owned(),
                project_label: "Unknown location".to_owned(),
                ..Location::default()
            };
        };
        let canonical = self
            .canonical_paths
            .entry(cwd.to_owned())
            .or_insert_with(|| canonical(cwd));
        for (path, worktree) in &self.worktrees {
            if Path::new(canonical).starts_with(Path::new(path)) {
                return Location {
                    project_key: format!("worktree:{}", worktree.worktree_id),
                    project_label: if worktree.display_name.is_empty() {
                        label(&worktree.path)
                    } else {
                        worktree.display_name.clone()
                    },
                    repo_id: Some(worktree.repo_id.clone()),
                    worktree_id: Some(worktree.worktree_id.clone()),
                };
            }
        }
        Location {
            project_key: format!("cwd:{}", comparable(cwd)),
            project_label: label(cwd),
            ..Location::default()
        }
    }
}

fn canonical(value: &str) -> String {
    // Why: copied Windows transcripts must not become relative paths inside this POSIX daemon's cwd.
    if !cfg!(windows) && (value.as_bytes().get(1) == Some(&b':') || value.starts_with("\\\\")) {
        return value.to_owned();
    }
    let path = std::fs::canonicalize(value).unwrap_or_else(|_| {
        let path = Path::new(value);
        if path.is_absolute() {
            path.to_path_buf()
        } else {
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join(path)
        }
    });
    comparable(&path.to_string_lossy())
}

fn comparable(value: &str) -> String {
    let mut normalized = PathBuf::new();
    for component in Path::new(value).components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    let value = normalized.to_string_lossy();
    if cfg!(windows) {
        value.to_lowercase()
    } else {
        value.into_owned()
    }
}

fn label(value: &str) -> String {
    let path = Path::new(value);
    let Some(name) = path.file_name() else {
        return value.to_owned();
    };
    match path.parent().and_then(Path::file_name) {
        Some(parent) => Path::new(parent).join(name).to_string_lossy().into_owned(),
        None => name.to_string_lossy().into_owned(),
    }
}

fn scan_error(error: impl std::fmt::Display) -> ProviderUsageError {
    ProviderUsageError::Scan(error.to_string())
}
