use std::collections::HashSet;

use serde_json::{Value, json};

use crate::hosts::{HostFileKind, HostFilesystem, HostPlatform};

use super::runner::{GitRunOptions, GitRunner, command_failure};
use super::scope::{GitAuthority, GitAuthorityError};

const GITIGNORE_MAX_BYTES: usize = 2 * 1_024 * 1_024;
const CHECK_IGNORE_CHUNK_BYTES: usize = 1_024 * 1_024;
const CHECK_IGNORE_TIMEOUT_MS: u64 = 15_000;
const KNOWN_HUGE_FOLDERS: [&str; 6] =
    ["node_modules", ".next", "dist", "build", "target", "vendor"];

impl GitAuthority {
    pub(crate) async fn conflict_operation(
        &self,
        worktree: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        Ok(Value::String(
            detect_conflict(&scope.runner).await.to_owned(),
        ))
    }

    pub(crate) async fn check_ignored(
        &self,
        worktree: &str,
        paths: Vec<String>,
    ) -> Result<Value, GitAuthorityError> {
        if paths.len() > 2_000 {
            return Err(GitAuthorityError::InvalidInput("too many paths"));
        }
        let scope = self.scope(worktree).await?;
        if paths.is_empty() {
            return Ok(json!([]));
        }
        let mut ignored = Vec::new();
        let mut seen = HashSet::new();
        for chunk in check_ignore_chunks(paths) {
            let mut stdin = chunk.join("\0").into_bytes();
            stdin.push(0);
            let output = scope
                .runner
                .probe_with_input(
                    strings([
                        "-c",
                        "core.quotePath=false",
                        "check-ignore",
                        "-z",
                        "--stdin",
                    ]),
                    stdin,
                    GitRunOptions {
                        max_output_bytes: 10 * 1_024 * 1_024,
                        timeout_ms: Some(CHECK_IGNORE_TIMEOUT_MS),
                    },
                )
                .await?;
            if !matches!(output.exit_code, 0 | 1) {
                return Err(command_failure(output).into());
            }
            for path in output.stdout.split('\0').filter(|path| !path.is_empty()) {
                if seen.insert(path.to_owned()) {
                    ignored.push(path.to_owned());
                }
            }
        }
        Ok(serde_json::to_value(ignored)?)
    }

    pub(crate) async fn find_huge_folders(
        &self,
        worktree: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let filesystem = HostFilesystem::new(scope.host);
        let paths = filesystem.paths();
        let mut existing = Vec::new();
        for folder in KNOWN_HUGE_FOLDERS {
            let path = paths.resolve(&scope.runner.cwd, &[folder]);
            if filesystem
                .stat(&path)
                .await
                .ok()
                .flatten()
                .is_some_and(|stat| stat.kind == HostFileKind::Directory)
            {
                existing.push(folder.to_owned());
            }
        }
        if existing.is_empty() {
            return Ok(json!([]));
        }
        let ignored = match self.check_ignored(worktree, existing.clone()).await {
            Ok(value) => value
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|value| value.as_str().map(str::to_owned))
                .collect::<HashSet<_>>(),
            Err(_) => HashSet::new(),
        };
        existing.retain(|path| !ignored.contains(path));
        Ok(serde_json::to_value(existing)?)
    }

    pub(crate) async fn append_gitignore(
        &self,
        worktree: &str,
        folder_name: &str,
    ) -> Result<Value, GitAuthorityError> {
        let folder = folder_name.trim();
        if !KNOWN_HUGE_FOLDERS.contains(&folder) || folder.contains(['/', '\\', '\r', '\n']) {
            return Err(GitAuthorityError::Operation(format!(
                "Refusing to add unrecognized folder to .gitignore: {folder_name}"
            )));
        }
        let scope = self.scope(worktree).await?;
        let host_id = scope.host.id().to_owned();
        let host_platform = scope.host.platform();
        let filesystem = HostFilesystem::new(scope.host);
        let path = filesystem
            .paths()
            .resolve(&scope.runner.cwd, &[".gitignore"]);
        let comparison_path = if host_platform == HostPlatform::Windows {
            path.to_lowercase()
        } else {
            path.clone()
        };
        let _write_guard = self
            .lock_gitignore(format!("{host_id}\0{comparison_path}"))
            .await;
        let existing = filesystem
            .read_text(&path, GITIGNORE_MAX_BYTES)
            .await
            .ok()
            .flatten()
            .unwrap_or_default();
        let line = format!("{folder}/");
        if existing
            .lines()
            .any(|existing| existing.trim() == folder || existing.trim() == line)
        {
            return Ok(Value::Bool(false));
        }
        let leading = if !existing.is_empty() && !existing.ends_with('\n') {
            "\n"
        } else {
            ""
        };
        filesystem
            .append(&path, format!("{leading}{line}\n").as_bytes())
            .await?;
        Ok(Value::Bool(true))
    }

    pub(crate) async fn local_branches(&self, worktree: &str) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let output = scope
            .runner
            .read(strings([
                "for-each-ref",
                "--format=%(refname:short)%00%(HEAD)",
                "refs/heads",
            ]))
            .await?;
        let mut branches = Vec::new();
        let mut current = None;
        for line in output.lines() {
            let (name, head) = line.split_once('\0').unwrap_or((line, ""));
            if name.is_empty() {
                continue;
            }
            branches.push(name.to_owned());
            if head.trim() == "*" {
                current = Some(name.to_owned());
            }
        }
        if let Some(current) = current.as_deref()
            && let Some(index) = branches.iter().position(|branch| branch == current)
        {
            branches[..=index].rotate_right(1);
        }
        Ok(json!({ "current": current, "branches": branches }))
    }
}

pub(super) async fn detect_conflict(runner: &GitRunner) -> &'static str {
    let output = runner
        .read(strings([
            "rev-parse",
            "--git-path",
            "MERGE_HEAD",
            "--git-path",
            "rebase-merge",
            "--git-path",
            "rebase-apply",
            "--git-path",
            "CHERRY_PICK_HEAD",
            "--git-path",
            "REVERT_HEAD",
        ]))
        .await
        .unwrap_or_default();
    let filesystem = HostFilesystem::new(runner.host.clone());
    let host_paths = filesystem.paths();
    let paths = output.lines().collect::<Vec<_>>();
    for (index, path) in paths.iter().enumerate() {
        let path = if host_paths.is_absolute(path) {
            (*path).to_owned()
        } else {
            host_paths.resolve(&runner.cwd, &[path])
        };
        if filesystem.exists(&path).await.unwrap_or(false) {
            return match index {
                0 => "merge",
                1 | 2 => "rebase",
                3 => "cherry-pick",
                4 => "revert",
                _ => "unknown",
            };
        }
    }
    "unknown"
}

fn check_ignore_chunks(paths: Vec<String>) -> Vec<Vec<String>> {
    let mut chunks = Vec::new();
    let mut chunk = Vec::new();
    let mut chunk_bytes = 0;
    for path in paths {
        let path_bytes = path.len() + 1;
        if !chunk.is_empty() && chunk_bytes + path_bytes > CHECK_IGNORE_CHUNK_BYTES {
            chunks.push(std::mem::take(&mut chunk));
            chunk_bytes = 0;
        }
        chunk_bytes += path_bytes;
        chunk.push(path);
    }
    if !chunk.is_empty() {
        chunks.push(chunk);
    }
    chunks
}

fn strings<const N: usize>(values: [&str; N]) -> Vec<String> {
    values.into_iter().map(str::to_owned).collect()
}
