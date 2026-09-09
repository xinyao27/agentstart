mod python;

use std::sync::Arc;

use serde::Serialize;
use thiserror::Error;

use crate::external_paths::ExternalPathAuthority;
use crate::host_registry::HostRegistry;
use crate::hosts::{ExecutionHost, HostCommandError, HostFilesystem};
use crate::projects::ProjectCatalog;
use crate::workspace_paths::{PathResolution, WorkspacePathAuthority, WorkspacePathError};
use crate::worktrees::WorktreeCatalog;

#[derive(Clone)]
pub(crate) struct NotebookRunner {
    authority: WorkspacePathAuthority,
}

pub(super) struct NotebookTarget {
    pub(super) cwd: String,
    pub(super) host: Arc<dyn ExecutionHost>,
}

pub(crate) struct NotebookRunRequest {
    pub(crate) code: String,
    pub(crate) file_path: String,
    pub(crate) preamble: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NotebookRunResult {
    pub(crate) stdout: String,
    pub(crate) stderr: String,
    pub(crate) exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
}

#[derive(Debug, Error)]
pub(crate) enum NotebookRunError {
    #[error(transparent)]
    Host(#[from] HostCommandError),
    #[error("notebook runner received an invalid interpreter response")]
    InvalidInterpreterResponse,
    #[error("notebook runner request serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error(transparent)]
    WorkspacePath(#[from] WorkspacePathError),
}

impl NotebookRunner {
    pub(crate) fn new(
        projects: ProjectCatalog,
        worktrees: WorktreeCatalog,
        hosts: HostRegistry,
        external_paths: ExternalPathAuthority,
    ) -> Self {
        Self {
            authority: WorkspacePathAuthority::new(projects, worktrees, hosts, external_paths),
        }
    }

    pub(crate) async fn run(
        &self,
        request: NotebookRunRequest,
    ) -> Result<NotebookRunResult, NotebookRunError> {
        let authorized = self
            .authority
            .resolve(&request.file_path, PathResolution::Follow)
            .await?;
        let cwd = HostFilesystem::new(authorized.host.clone())
            .paths()
            .dirname(&authorized.path);
        let target = NotebookTarget {
            cwd,
            host: authorized.host,
        };
        if request
            .code
            .trim_matches(is_ecmascript_whitespace)
            .is_empty()
            && request
                .preamble
                .trim_matches(is_ecmascript_whitespace)
                .is_empty()
        {
            return Ok(NotebookRunResult {
                stdout: String::new(),
                stderr: String::new(),
                exit_code: Some(0),
                error: None,
            });
        }
        python::run(target, request.code, request.preamble).await
    }
}

fn is_ecmascript_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{0009}'..='\u{000d}'
            | '\u{0020}'
            | '\u{00a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
            | '\u{feff}'
    )
}
