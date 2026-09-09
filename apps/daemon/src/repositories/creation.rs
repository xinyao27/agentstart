use std::sync::Arc;

use serde_json::{Value, json};

use crate::hosts::{ExecutionHost, HostCommand, HostCommandError, HostFileKind, HostFilesystem};
use crate::projects::{GitRemoteIdentity, ProjectKind, remotes};

use super::{AddInput, RepositoryAuthority, RepositoryError, RepositoryResult};

const COMMAND_OUTPUT_LIMIT_BYTES: usize = 10 * 1024 * 1024;
const GIT_COMMAND_TIMEOUT_MS: u64 = 30_000;

impl RepositoryAuthority {
    pub(crate) async fn add(
        &self,
        expected_revision: i64,
        path: String,
        kind: ProjectKind,
        host_id: Option<String>,
    ) -> Result<RepositoryResult, RepositoryError> {
        self.assert_revision(expected_revision).await?;
        let host_id = host_id.unwrap_or_else(|| "local".to_owned());
        let host = self.hosts.execution_host(&host_id).await?;
        let filesystem = HostFilesystem::new(host.clone());
        if !filesystem.paths().is_absolute(&path) {
            return Err(RepositoryError::Runtime(
                "Project path must be an absolute path".to_owned(),
            ));
        }
        if let Some(existing) = self.find_path(&host_id, &path).await? {
            return Ok(RepositoryResult {
                repo: existing,
                revision: self.list().await?.revision,
            });
        }
        let remotes = if kind == ProjectKind::Git {
            if !crate::projects::is_git_repository(host.clone(), &path).await {
                return Err(RepositoryError::Runtime(format!(
                    "Not a valid git repository: {path}"
                )));
            }
            git_remotes(host.clone(), &path).await?
        } else {
            Vec::new()
        };
        let display_name = filesystem.paths().basename(&path);
        let detected = super::detection::inspect(host.clone(), &path, kind, &remotes).await;
        self.persist_add(AddInput {
            detected,
            expected_revision,
            host_id,
            path,
            display_name,
            kind,
            remotes,
        })
        .await
    }

    pub(crate) async fn create(
        &self,
        expected_revision: i64,
        parent_path: String,
        name: String,
        kind: ProjectKind,
    ) -> Result<Value, RepositoryError> {
        self.assert_revision(expected_revision).await?;
        let name = super::ecmascript::trim(&name).to_owned();
        let parent_path = super::ecmascript::trim(&parent_path).to_owned();
        if name.is_empty() {
            return Ok(json!({ "error": "Name cannot be empty" }));
        }
        if name.contains(['/', '\\']) || matches!(name.as_str(), "." | "..") {
            return Ok(json!({ "error": "Name cannot contain slashes or be \".\" / \"..\"" }));
        }
        if parent_path.is_empty() {
            return Ok(json!({ "error": "Parent directory is required" }));
        }
        let host = self.hosts.execution_host("local").await?;
        let filesystem = HostFilesystem::new(host.clone());
        if !filesystem.paths().is_absolute(&parent_path) {
            return Ok(json!({ "error": "Parent directory must be an absolute path" }));
        }
        if let Err(error) = filesystem.mkdir(&parent_path, true).await {
            return Ok(json!({ "error": format!("Failed to prepare directory: {error}") }));
        }
        let target = filesystem.paths().join(&[&parent_path, &name]);
        if let Some(existing) = self.find_path("local", &target).await? {
            let project_id = existing
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| RepositoryError::Runtime("repo_not_found".to_owned()))?;
            let revision = self
                .record_existing_add(expected_revision, project_id.to_owned())
                .await?;
            return Ok(json!({ "repo": existing, "revision": revision }));
        }
        let existed = filesystem.stat(&target).await?;
        if let Some(stat) = existed.as_ref() {
            if stat.kind != HostFileKind::Directory {
                return Ok(
                    json!({ "error": format!("\"{name}\" already exists at this location and is not a folder.") }),
                );
            }
            if !filesystem.read_dir(&target).await?.is_empty() {
                return Ok(
                    json!({ "error": format!("\"{name}\" already exists at this location and is not empty.") }),
                );
            }
        } else if let Err(error) = filesystem.mkdir(&target, false).await {
            return Ok(json!({ "error": format!("Failed to prepare directory: {error}") }));
        }
        let target_claim =
            crate::project_host_setups::clone_claim::observe(host.clone(), target.clone()).await;
        let target_claim = match target_claim {
            Ok(claim) => claim,
            Err(error) => {
                return Ok(json!({ "error": format!("Failed to prepare directory: {error}") }));
            }
        };
        let git_claim = if kind == ProjectKind::Git {
            let git_path = filesystem.paths().join(&[&target, ".git"]);
            match crate::project_host_setups::clone_claim::claim_new(host.clone(), git_path).await {
                Ok(claim) => Some(claim),
                Err(error) => {
                    return Ok(
                        json!({ "error": format!("Failed to prepare git repository: {error}") }),
                    );
                }
            }
        } else {
            None
        };
        if kind == ProjectKind::Git {
            if let Err(error) = git_checked(host.clone(), &target, ["init"]).await {
                cleanup_create_target(
                    host.clone(),
                    &target_claim,
                    git_claim.as_ref(),
                    existed.is_none(),
                )
                .await;
                return Ok(
                    json!({ "error": format!("Failed to initialize git repository: {error}") }),
                );
            }
            if let Err(error) = git_checked(
                host.clone(),
                &target,
                ["commit", "--allow-empty", "-m", "Initial commit"],
            )
            .await
            {
                cleanup_create_target(
                    host.clone(),
                    &target_claim,
                    git_claim.as_ref(),
                    existed.is_none(),
                )
                .await;
                let detail = error.to_string();
                let message = if identity_missing(&detail) {
                    "Git author identity is not configured. Run `git config --global user.name \"Your Name\"` and `git config --global user.email \"you@example.com\"`, then try again.".to_owned()
                } else {
                    format!("Failed to create initial commit: {detail}")
                };
                return Ok(json!({ "error": message }));
            }
        }
        let remotes = if kind == ProjectKind::Git {
            match git_remotes(host.clone(), &target).await {
                Ok(remotes) => remotes,
                Err(error) => {
                    cleanup_create_target(
                        host,
                        &target_claim,
                        git_claim.as_ref(),
                        existed.is_none(),
                    )
                    .await;
                    return Err(error);
                }
            }
        } else {
            Vec::new()
        };
        let detected = super::detection::inspect(host.clone(), &target, kind, &remotes).await;
        let result = self
            .persist_add(AddInput {
                detected,
                expected_revision,
                host_id: "local".to_owned(),
                path: target,
                display_name: name,
                kind,
                remotes,
            })
            .await;
        match result {
            Ok(result) => Ok(json!({ "repo": result.repo, "revision": result.revision })),
            Err(error) => {
                if kind == ProjectKind::Git || existed.is_none() {
                    cleanup_create_target(
                        host,
                        &target_claim,
                        git_claim.as_ref(),
                        existed.is_none(),
                    )
                    .await;
                }
                Err(error)
            }
        }
    }

    pub(crate) async fn clone_repo(
        &self,
        expected_revision: i64,
        url: String,
        destination: String,
    ) -> Result<RepositoryResult, RepositoryError> {
        self.assert_revision(expected_revision).await?;
        let url = super::ecmascript::trim(&url).to_owned();
        let destination = super::ecmascript::trim(&destination).to_owned();
        if destination.is_empty() {
            return Err(RepositoryError::Runtime(
                "Clone destination is required".to_owned(),
            ));
        }
        let host = self.hosts.execution_host("local").await?;
        let filesystem = HostFilesystem::new(host.clone());
        if !filesystem.paths().is_absolute(&destination) {
            return Err(RepositoryError::Runtime(
                "Clone destination must be an absolute path".to_owned(),
            ));
        }
        let lease = self
            .project_host_setups
            .acquire_clone("local", &url, &destination)
            .await
            .map_err(|error| clone_error(error, ""))?;
        let target = lease.path().to_owned();
        if let Some(existing) = self.find_path("local", &target).await? {
            let project_id = existing
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| RepositoryError::Runtime("repo_not_found".to_owned()))?;
            let revision = self
                .record_existing_add(expected_revision, project_id.to_owned())
                .await?;
            return Ok(RepositoryResult {
                repo: existing,
                revision,
            });
        }
        let completed = self
            .project_host_setups
            .execute_clone(lease, &url)
            .await
            .map_err(|error| clone_error(error, &target))?;
        let persisted = async {
            let remotes = git_remotes(host.clone(), &target).await?;
            let detected =
                super::detection::inspect(host.clone(), &target, ProjectKind::Git, &remotes).await;
            self.persist_add(AddInput {
                detected,
                expected_revision,
                host_id: "local".to_owned(),
                path: target.clone(),
                display_name: filesystem.paths().basename(&target),
                kind: ProjectKind::Git,
                remotes,
            })
            .await
        }
        .await;
        match persisted {
            Ok(result) => {
                completed.commit();
                Ok(result)
            }
            Err(error) => {
                completed.cleanup().await;
                Err(error)
            }
        }
    }

    pub(crate) async fn git_available(&self) -> bool {
        let Ok(host) = self.hosts.execution_host("local").await else {
            return false;
        };
        let mut command = HostCommand::new("git", ["--version"]);
        command.cwd = std::env::current_dir()
            .ok()
            .map(|path| path.to_string_lossy().into_owned());
        command.max_output_bytes = Some(COMMAND_OUTPUT_LIMIT_BYTES);
        command.timeout_ms = Some(3_000);
        host.exec(command)
            .await
            .is_ok_and(|output| output.exit_code == 0)
    }
}

pub(super) async fn git_remotes(
    host: Arc<dyn ExecutionHost>,
    path: &str,
) -> Result<Vec<GitRemoteIdentity>, RepositoryError> {
    let output = git_output(host, path, ["config", "--get-regexp", r"^remote\..*\.url$"]).await?;
    if output.exit_code != 0 {
        return Ok(Vec::new());
    }
    Ok(output
        .stdout
        .lines()
        .filter_map(|line| {
            let (key, url) = line.split_once(char::is_whitespace)?;
            let name = key.strip_prefix("remote.")?.strip_suffix(".url")?;
            remotes::normalize(name, url.trim())
        })
        .collect())
}

async fn git_checked(
    host: Arc<dyn ExecutionHost>,
    cwd: &str,
    args: impl IntoIterator<Item = impl Into<String>>,
) -> Result<String, RepositoryError> {
    let output = git_output(host, cwd, args).await?;
    if output.exit_code == 0 {
        Ok(output.stdout)
    } else {
        let detail = if output.stderr.trim().is_empty() {
            output.stdout.trim()
        } else {
            output.stderr.trim()
        };
        Err(RepositoryError::Runtime(detail.to_owned()))
    }
}

async fn git_output(
    host: Arc<dyn ExecutionHost>,
    cwd: &str,
    args: impl IntoIterator<Item = impl Into<String>>,
) -> Result<crate::hosts::HostCommandOutput, HostCommandError> {
    let mut command = HostCommand::new("git", args);
    command.cwd = Some(cwd.to_owned());
    command.env = vec![
        ("GIT_TERMINAL_PROMPT".to_owned(), "0".to_owned()),
        ("LC_ALL".to_owned(), "C".to_owned()),
    ];
    command.max_output_bytes = Some(COMMAND_OUTPUT_LIMIT_BYTES);
    command.timeout_ms = Some(GIT_COMMAND_TIMEOUT_MS);
    host.exec(command).await
}

async fn cleanup_create_target(
    host: Arc<dyn ExecutionHost>,
    target_claim: &crate::project_host_setups::clone_claim::CloneClaim,
    git_claim: Option<&crate::project_host_setups::clone_claim::CloneClaim>,
    created: bool,
) {
    if created {
        if let Some(git_claim) = git_claim
            && !crate::project_host_setups::clone_claim::is_current(host.clone(), git_claim).await
        {
            return;
        }
        crate::project_host_setups::clone_claim::cleanup(host, target_claim).await;
    } else if let Some(git_claim) = git_claim {
        crate::project_host_setups::clone_claim::cleanup(host, git_claim).await;
    }
}

fn identity_missing(detail: &str) -> bool {
    let detail = detail.to_ascii_lowercase();
    detail.contains("please tell me who you are")
        || detail.contains("user.name")
        || detail.contains("user.email")
}

fn clone_error(
    error: crate::project_host_setups::ProjectHostSetupError,
    target: &str,
) -> RepositoryError {
    match error {
        crate::project_host_setups::ProjectHostSetupError::CloneCancelled => {
            RepositoryError::Runtime("Clone aborted".to_owned())
        }
        crate::project_host_setups::ProjectHostSetupError::Git(detail) => {
            RepositoryError::Runtime(format!("Clone failed: {}", clone_failure(&detail, target)))
        }
        error => RepositoryError::Runtime(error.to_string()),
    }
}

fn clone_failure(stderr: &str, target: &str) -> String {
    for raw in stderr.lines().rev() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if line.contains("already exists and is not an empty directory") {
            return format!(
                "Destination already exists and is not empty: {target}. Choose a different parent folder, delete the existing folder, or add the existing repository instead."
            );
        }
        if line.contains("fatal:") || line.contains("error:") {
            return line.to_owned();
        }
    }
    "unknown error".to_owned()
}
