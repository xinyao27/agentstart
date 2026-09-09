use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex, MutexGuard, Weak};

use thiserror::Error;
use tokio::sync::Mutex as AsyncMutex;

use crate::hosts::{ExecutionHost, HostCommand, HostCommandOutput};

const WORKTREE_SCAN_TIMEOUT_MS: u64 = 30_000;
const WORKTREE_SCAN_MAX_OUTPUT_BYTES: usize = 4 * 1_024 * 1_024;

#[derive(Clone)]
pub(super) struct GitWorktreeScanner {
    hosts: Arc<Mutex<HashMap<String, HostScanState>>>,
}

#[derive(Clone, Debug)]
pub(crate) struct GitWorktreeEntry {
    pub(super) branch: String,
    pub(super) head: String,
    pub(super) is_bare: bool,
    pub(super) is_main_worktree: bool,
    pub(super) is_sparse: bool,
    pub(super) lock_reason: Option<String>,
    pub(super) path: String,
    pub(super) prunable_reason: Option<String>,
}

struct HostScanState {
    capability: Arc<AsyncMutex<NulCapability>>,
    host: Weak<dyn ExecutionHost>,
}

#[derive(Clone, Copy)]
enum NulCapability {
    Supported,
    Unknown,
    Unsupported,
}

static UNSUPPORTED_NUL: LazyLock<Option<regex::Regex>> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)(?:unknown|invalid|unrecognized) (?:switch|option).*`?-?z'?").ok()
});

#[derive(Debug, Error)]
pub(crate) enum GitWorktreeScanError {
    #[error("git worktree list failed: {0}")]
    Command(String),
    #[error(transparent)]
    Host(#[from] crate::hosts::HostCommandError),
}

impl GitWorktreeScanner {
    pub(super) fn new() -> Self {
        Self {
            hosts: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub(super) async fn scan(
        &self,
        host: Arc<dyn ExecutionHost>,
        project_path: &str,
    ) -> Result<Vec<GitWorktreeEntry>, GitWorktreeScanError> {
        let capability = self.capability_for(host.clone());
        let mut capability = capability.lock().await;
        match *capability {
            NulCapability::Supported => {
                drop(capability);
                return run(host, project_path, true).await;
            }
            NulCapability::Unsupported => {
                drop(capability);
                return run(host, project_path, false).await;
            }
            NulCapability::Unknown => {}
        }
        match run_command(host.clone(), project_path, true).await? {
            output if output.exit_code == 0 => {
                *capability = NulCapability::Supported;
                Ok(parse_nul(&output.stdout))
            }
            output if is_unsupported_nul(&output) => {
                *capability = NulCapability::Unsupported;
                drop(capability);
                run(host, project_path, false).await
            }
            output => Err(command_error(output)),
        }
    }

    fn capability_for(&self, host: Arc<dyn ExecutionHost>) -> Arc<AsyncMutex<NulCapability>> {
        let mut hosts = lock(&self.hosts);
        hosts.retain(|_, state| state.host.strong_count() > 0);
        if let Some(state) = hosts.get(host.id())
            && state
                .host
                .upgrade()
                .is_some_and(|cached| Arc::ptr_eq(&cached, &host))
        {
            return state.capability.clone();
        }
        let capability = Arc::new(AsyncMutex::new(NulCapability::Unknown));
        hosts.insert(
            host.id().to_owned(),
            HostScanState {
                capability: capability.clone(),
                host: Arc::downgrade(&host),
            },
        );
        capability
    }
}

async fn run(
    host: Arc<dyn ExecutionHost>,
    project_path: &str,
    nul_delimited: bool,
) -> Result<Vec<GitWorktreeEntry>, GitWorktreeScanError> {
    let output = run_command(host, project_path, nul_delimited).await?;
    if output.exit_code != 0 {
        return Err(command_error(output));
    }
    Ok(if nul_delimited {
        parse_nul(&output.stdout)
    } else {
        parse_lines(&output.stdout)
    })
}

async fn run_command(
    host: Arc<dyn ExecutionHost>,
    project_path: &str,
    nul_delimited: bool,
) -> Result<HostCommandOutput, crate::hosts::HostCommandError> {
    let mut args = vec!["worktree", "list", "--porcelain"];
    if nul_delimited {
        args.push("-z");
    }
    let mut command = HostCommand::new("git", args);
    command.cwd = Some(project_path.to_owned());
    command.max_output_bytes = Some(WORKTREE_SCAN_MAX_OUTPUT_BYTES);
    command.timeout_ms = Some(WORKTREE_SCAN_TIMEOUT_MS);
    host.exec(command).await
}

fn parse_nul(output: &str) -> Vec<GitWorktreeEntry> {
    parse_fields(output.split('\0'))
}

fn parse_lines(output: &str) -> Vec<GitWorktreeEntry> {
    parse_fields(
        output
            .lines()
            .map(|line| line.strip_suffix('\r').unwrap_or(line)),
    )
}

fn parse_fields<'a>(fields: impl IntoIterator<Item = &'a str>) -> Vec<GitWorktreeEntry> {
    let mut entries = Vec::new();
    let mut current = None;
    for field in fields {
        if field.is_empty() {
            if let Some(entry) = current.take() {
                entries.push(entry);
            }
            continue;
        }
        let (key, value) = field.split_once(' ').unwrap_or((field, ""));
        if key == "worktree" {
            if let Some(mut entry) = current.replace(GitWorktreeEntry {
                branch: String::new(),
                head: String::new(),
                is_bare: false,
                is_main_worktree: entries.is_empty(),
                is_sparse: false,
                lock_reason: None,
                path: value.to_owned(),
                prunable_reason: None,
            }) {
                entry.is_main_worktree = entries.is_empty();
                entries.push(entry);
            }
            continue;
        }
        let Some(entry) = current.as_mut() else {
            continue;
        };
        match key {
            "HEAD" => entry.head = value.to_owned(),
            "branch" => {
                entry.branch = value
                    .strip_prefix("refs/heads/")
                    .unwrap_or(value)
                    .to_owned();
            }
            "bare" => entry.is_bare = true,
            "detached" => entry.branch = "(detached)".to_owned(),
            "sparse" => entry.is_sparse = true,
            "locked" => {
                entry.lock_reason = Some(value.to_owned()).filter(|value| !value.is_empty())
            }
            "prunable" => {
                entry.prunable_reason = Some(value.to_owned()).filter(|value| !value.is_empty());
            }
            _ => {}
        }
    }
    if let Some(mut entry) = current {
        entry.is_main_worktree = entries.is_empty();
        entries.push(entry);
    }
    entries
}

fn is_unsupported_nul(output: &HostCommandOutput) -> bool {
    output.exit_code == 129
        || UNSUPPORTED_NUL
            .as_ref()
            .is_some_and(|regex| regex.is_match(&format!("{}\n{}", output.stderr, output.stdout)))
}

fn command_error(output: HostCommandOutput) -> GitWorktreeScanError {
    let detail = if output.stderr.trim().is_empty() {
        output.stdout.trim()
    } else {
        output.stderr.trim()
    };
    GitWorktreeScanError::Command(if detail.is_empty() {
        format!("git exited with status {}", output.exit_code)
    } else {
        detail.to_owned()
    })
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
