use serde_json::{Value, json};
use thiserror::Error;

use crate::client_events::ClientEventsAuthority;
use crate::host_registry::HostRegistryError;
use crate::hosts::{HostFilesystem, HostFilesystemError};
use crate::persistence::WorkspaceJournal;
use crate::projects::{Project, ProjectCatalog, ProjectCatalogError, ProjectKind};
use crate::terminal_session::{TerminalSessionAuthority, TerminalSessionError};

use super::store::{BeginArchive, WorktreeArchiveError, WorktreeArchiveStore};
use crate::worktrees::{WorktreeCatalog, WorktreeCatalogError};

use super::commands::GitCommands;
use super::events::{payload, started};
use super::hook::run as run_archive_hook;

#[derive(Clone)]
pub(crate) struct WorktreeArchiveAuthority {
    archives: WorktreeArchiveStore,
    client_events: ClientEventsAuthority,
    hosts: crate::host_registry::HostRegistry,
    journal: WorkspaceJournal,
    projects: ProjectCatalog,
    terminals: TerminalSessionAuthority,
    worktrees: WorktreeCatalog,
}

#[derive(Debug, Error)]
pub(crate) enum WorktreeArchiveAuthorityError {
    #[error(transparent)]
    Archive(#[from] WorktreeArchiveError),
    #[error(transparent)]
    Catalog(#[from] WorktreeCatalogError),
    #[error(transparent)]
    Journal(#[from] crate::persistence::WorkspaceJournalError),
    #[error(transparent)]
    Filesystem(#[from] HostFilesystemError),
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error(transparent)]
    Project(#[from] ProjectCatalogError),
    #[error(transparent)]
    Terminal(#[from] TerminalSessionError),
    #[error("{0}")]
    Operation(String),
}

impl WorktreeArchiveAuthority {
    pub(crate) fn new(
        archives: WorktreeArchiveStore,
        client_events: ClientEventsAuthority,
        hosts: crate::host_registry::HostRegistry,
        journal: WorkspaceJournal,
        projects: ProjectCatalog,
        terminals: TerminalSessionAuthority,
        worktrees: WorktreeCatalog,
    ) -> Self {
        Self {
            archives,
            client_events,
            hosts,
            journal,
            projects,
            terminals,
            worktrees,
        }
    }

    pub(crate) async fn list(
        &self,
        repo: Option<&str>,
    ) -> Result<Value, WorktreeArchiveAuthorityError> {
        let storage_id = match repo {
            Some(selector) => Some(self.projects.resolve(selector).await?.storage_id),
            None => None,
        };
        Ok(json!({ "archives": self.archives.list(storage_id).await? }))
    }

    pub(crate) async fn archive(
        &self,
        selector: &str,
        expected_revision: i64,
        delete_branch: bool,
    ) -> Result<Value, WorktreeArchiveAuthorityError> {
        let worktree = self.worktrees.resolve_managed(selector).await?;
        let _mutation = self.worktrees.mutation_guard().await;
        let actual_revision = self.journal.revision(worktree.repo_id.clone()).await?;
        if actual_revision != expected_revision {
            return Err(ProjectCatalogError::RevisionConflict {
                actual_revision,
                expected_revision,
                scope: "worktree",
            }
            .into());
        }
        if worktree.is_main_worktree || worktree.is_bare {
            return Err(Self::operation("worktree_archive_main_forbidden"));
        }
        let project = self.project_for(&worktree.repo_id).await?;
        if project.kind != ProjectKind::Git {
            return Err(Self::operation("worktree_archive_main_forbidden"));
        }
        let archive = self
            .archives
            .begin(BeginArchive {
                branch: worktree.branch.clone(),
                head: worktree.head.clone(),
                original_worktree_id: worktree.id.clone(),
                path: worktree.path.clone(),
                storage_repo_id: project.storage_id.clone(),
            })
            .await?;
        self.journal
            .append(
                worktree.repo_id.clone(),
                "worktree.archive.started".to_owned(),
                started(&archive, &worktree),
            )
            .await?;

        let host = self.hosts.execution_host(&worktree.host_id).await?;
        let filesystem = HostFilesystem::new(host.clone());
        let mut stash_oid = None;
        let operation = async {
            self.close_terminals(&worktree.id).await?;
            self.terminals
                .forget_worktree(&worktree.host_id, &worktree.id)
                .await?;
            run_archive_hook(&filesystem, host.as_ref(), &worktree.path).await?;
            let project_runner = GitCommands::new(host.clone(), project.path.clone());
            let worktree_runner = GitCommands::new(host.clone(), worktree.path.clone());
            let status = worktree_runner.checked(["status", "--porcelain"]).await?;
            if !status.trim().is_empty() {
                worktree_runner
                    .checked(vec![
                        "stash".to_owned(),
                        "push".to_owned(),
                        "--include-untracked".to_owned(),
                        "--message".to_owned(),
                        format!("agentstart-archive:{}", archive.id),
                    ])
                    .await?;
                stash_oid = Some(
                    worktree_runner
                        .checked(["rev-parse", "refs/stash"])
                        .await?
                        .trim()
                        .to_owned(),
                );
            }
            self.archives
                .preserve(archive.id.clone(), stash_oid.clone())
                .await?;
            project_runner
                .checked(["worktree", "remove", "--force", &worktree.path])
                .await?;
            if delete_branch && !worktree.branch.is_empty() && worktree.branch != "(detached)" {
                project_runner
                    .checked(["branch", "-D", &worktree.branch])
                    .await?;
            }
            Ok::<(), WorktreeArchiveAuthorityError>(())
        }
        .await;
        if let Err(error) = operation {
            let detail = error.to_string();
            let _ = self.archives.fail(archive.id.clone(), detail.clone()).await;
            let _ = self
                .journal
                .append(
                    worktree.repo_id.clone(),
                    "worktree.archive.failed".to_owned(),
                    payload([
                        ("archiveId", json!(archive.id)),
                        ("detail", json!(detail.clone())),
                        ("worktreeId", json!(worktree.id)),
                    ]),
                )
                .await;
            if let Some(stash_oid) = stash_oid
                && filesystem.exists(&worktree.path).await.unwrap_or(false)
            {
                let _ = GitCommands::new(host, worktree.path.clone())
                    .checked(["stash", "apply", "--index", &stash_oid])
                    .await;
            }
            return Err(Self::operation(format!(
                "worktree_archive_failed: {detail}"
            )));
        }
        let completed = self
            .archives
            .complete(archive.id.clone(), stash_oid.clone())
            .await?;
        let event = self
            .journal
            .append(
                worktree.repo_id.clone(),
                "worktree.archive.complete".to_owned(),
                payload([
                    ("archiveId", json!(archive.id)),
                    ("branchDeleted", json!(delete_branch)),
                    ("changesPreserved", json!(stash_oid.is_some())),
                    ("worktreeId", json!(worktree.id)),
                ]),
            )
            .await?;
        self.worktrees
            .invalidate_project(&worktree.host_id, &worktree.repo_id);
        self.client_events
            .publish_worktrees_changed(worktree.repo_id.clone());
        Ok(json!({ "archive": completed, "revision": event.revision }))
    }

    pub(crate) async fn restore(
        &self,
        archive_id: &str,
        expected_revision: i64,
    ) -> Result<Value, WorktreeArchiveAuthorityError> {
        let archive = self.archives.get(archive_id.to_owned()).await?;
        let _mutation = self.worktrees.mutation_guard().await;
        let actual_revision = self.journal.revision(archive.repo_id.clone()).await?;
        if actual_revision != expected_revision {
            return Err(ProjectCatalogError::RevisionConflict {
                actual_revision,
                expected_revision,
                scope: "worktree",
            }
            .into());
        }
        if archive.status != "archived" && archive.status != "failed" {
            return Err(Self::operation("worktree_archive_not_restorable"));
        }
        let project = self.project_for(&archive.repo_id).await?;
        let host = self
            .hosts
            .execution_host(&project.execution_host_id)
            .await?;
        let filesystem = HostFilesystem::new(host.clone());
        if filesystem.exists(&archive.path).await? {
            return Err(Self::operation("worktree_archive_path_occupied"));
        }
        let runner = GitCommands::new(host.clone(), project.path);
        let detached = archive.branch == "(detached)";
        let branch_ref = format!("refs/heads/{}", archive.branch);
        let branch_exists = !detached
            && runner
                .run(["show-ref", "--verify", "--quiet", branch_ref.as_str()])
                .await
                .is_ok();
        let args = if detached {
            vec!["worktree", "add", "--detach", &archive.path, &archive.head]
        } else if branch_exists {
            vec!["worktree", "add", &archive.path, &archive.branch]
        } else {
            vec![
                "worktree",
                "add",
                "-b",
                &archive.branch,
                &archive.path,
                &archive.head,
            ]
        };
        runner.checked(args).await?;
        if let Some(stash_oid) = archive.stash_oid.as_deref() {
            GitCommands::new(host, archive.path.clone())
                .checked(["stash", "apply", "--index", stash_oid])
                .await?;
        }
        let restored = self.archives.restored(archive.id.clone()).await?;
        let event = self
            .journal
            .append(
                archive.repo_id.clone(),
                "worktree.archive.restored".to_owned(),
                payload([
                    ("archiveId", json!(archive.id)),
                    ("worktreeId", json!(archive.original_worktree_id)),
                ]),
            )
            .await?;
        self.worktrees
            .invalidate_project(&project.execution_host_id, &archive.repo_id);
        self.client_events
            .publish_worktrees_changed(archive.repo_id.clone());
        Ok(json!({ "archive": restored, "revision": event.revision }))
    }

    async fn close_terminals(
        &self,
        worktree_id: &str,
    ) -> Result<(), WorktreeArchiveAuthorityError> {
        let terminals = self
            .terminals
            .list(Some(worktree_id), 10_000, false)
            .await?;
        for terminal in terminals.terminals {
            self.terminals.close(&terminal.handle).await?;
        }
        Ok(())
    }

    async fn project_for(&self, repo_id: &str) -> Result<Project, WorktreeArchiveAuthorityError> {
        self.projects
            .list()
            .await?
            .into_iter()
            .find(|project| project.id == repo_id)
            .ok_or(ProjectCatalogError::NotFound.into())
    }

    fn operation(message: impl Into<String>) -> WorktreeArchiveAuthorityError {
        WorktreeArchiveAuthorityError::Operation(message.into())
    }
}
