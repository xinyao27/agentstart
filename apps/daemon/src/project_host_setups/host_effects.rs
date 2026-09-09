use std::sync::Arc;

use crate::host_progress::{HostProgressAuthority, HostProgressEvent};
use crate::hosts::{
    ExecutionHost, HostCommand, HostCommandOutputObserver, HostCommandOutputStream,
    HostCommandStreamControl, HostFileKind, HostFilesystem, HostFilesystemError, HostKind,
};
use crate::projects::{GitRemoteIdentity, ProjectKind, remotes};

use super::{ProjectHostSetupError, clone_claim::CloneClaim};

const GIT_OUTPUT_LIMIT: usize = 4 * 1024 * 1024;
const GIT_TIMEOUT_MS: u64 = 10 * 60 * 1_000;

pub(crate) struct ClonePlan {
    pub(super) destination: String,
    pub(super) key: String,
    pub(super) path: String,
}

pub(super) struct InspectedFolder {
    pub(super) path: String,
    pub(super) remotes: Vec<GitRemoteIdentity>,
}

pub(super) async fn inspect(
    host: Arc<dyn ExecutionHost>,
    path: &str,
    kind: ProjectKind,
) -> Result<InspectedFolder, ProjectHostSetupError> {
    let filesystem = HostFilesystem::new(host.clone());
    let canonical = filesystem.canonical_directory(path).await?;
    let stat = filesystem.stat(&canonical).await?;
    if !stat.is_some_and(|stat| matches!(stat.kind, HostFileKind::Directory)) {
        return Err(ProjectHostSetupError::PathNotDirectory(canonical));
    }
    let remotes = if kind == ProjectKind::Git {
        assert_git_repository(host.clone(), &canonical).await?;
        read_remotes(host, &canonical).await?
    } else {
        Vec::new()
    };
    Ok(InspectedFolder {
        path: canonical,
        remotes,
    })
}

pub(super) async fn clone_plan(
    host: Arc<dyn ExecutionHost>,
    url: &str,
    destination: &str,
) -> Result<ClonePlan, ProjectHostSetupError> {
    let filesystem = HostFilesystem::new(host.clone());
    let paths = filesystem.paths();
    let destination = crate::repositories::ecmascript::trim(destination);
    if !paths.is_absolute(destination) {
        return Err(ProjectHostSetupError::CloneDestinationNotAbsolute);
    }
    filesystem.mkdir(destination, true).await?;
    let destination = paths.resolve(destination, &[]);
    let name = clone_name(url).ok_or(ProjectHostSetupError::CloneNameInvalid)?;
    let path = paths.join(&[&destination, &name]);
    let comparison_path =
        crate::runtime_path::comparison_key(&paths.resolve(&destination, &[&name]));
    Ok(ClonePlan {
        destination,
        key: format!("{}\0{comparison_path}", host.id()),
        path,
    })
}

pub(super) async fn clone_into(
    host: Arc<dyn ExecutionHost>,
    url: &str,
    destination: &str,
    claim: &CloneClaim,
    cancelled: tokio::sync::watch::Receiver<bool>,
    progress: HostProgressAuthority,
) -> Result<(), ProjectHostSetupError> {
    let observer = Arc::new(CloneOutputObserver::new(progress));
    let mut command = HostCommand::new(
        "git",
        [
            "-c",
            "maintenance.auto=false",
            "clone",
            "--progress",
            "--",
            url,
            claim.path.as_str(),
        ],
    );
    command.cwd = Some(destination.to_owned());
    command.env = vec![
        ("GIT_TERMINAL_PROMPT".to_owned(), "0".to_owned()),
        ("GCM_INTERACTIVE".to_owned(), "Never".to_owned()),
    ];
    command.max_output_bytes = Some(GIT_OUTPUT_LIMIT);
    command.timeout_ms = Some(GIT_TIMEOUT_MS);
    command.cancel = Some(cancelled);
    command.retain_stderr = false;
    command.retain_stdout = false;
    command.output_observer = Some(observer.clone());
    let output = host.exec(command).await;
    match output {
        Ok(output) if output.exit_code == 0 => Ok(()),
        Ok(output) => Err(ProjectHostSetupError::Git(
            observer.detail().unwrap_or_else(|| detail(&output)),
        )),
        Err(error) if error.kind() == crate::hosts::HostCommandErrorKind::Cancelled => {
            Err(ProjectHostSetupError::CloneCancelled)
        }
        Err(error) => Err(ProjectHostSetupError::Git(
            observer.detail().unwrap_or_else(|| error.to_string()),
        )),
    }
}

struct CloneOutputObserver {
    progress: HostProgressAuthority,
    state: std::sync::Mutex<CloneOutputState>,
}

#[derive(Default)]
struct CloneOutputState {
    pending: Vec<u8>,
    stderr_tail: Vec<u8>,
}

impl CloneOutputObserver {
    fn new(progress: HostProgressAuthority) -> Self {
        Self {
            progress,
            state: std::sync::Mutex::new(CloneOutputState::default()),
        }
    }

    fn detail(&self) -> Option<String> {
        let state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let detail = String::from_utf8_lossy(&state.stderr_tail);
        let detail = detail.trim();
        (!detail.is_empty()).then(|| strip_url_credentials(detail))
    }
}

impl HostCommandOutputObserver for CloneOutputObserver {
    fn observe(&self, stream: HostCommandOutputStream, bytes: &[u8]) -> HostCommandStreamControl {
        if stream != HostCommandOutputStream::Stderr {
            return HostCommandStreamControl::Continue;
        }
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        state.stderr_tail.extend_from_slice(bytes);
        truncate_tail(&mut state.stderr_tail, 4_096);
        state.pending.extend_from_slice(bytes);
        while let Some(index) = state
            .pending
            .iter()
            .position(|byte| matches!(*byte, b'\r' | b'\n'))
        {
            let line = String::from_utf8_lossy(&state.pending[..index]).into_owned();
            state.pending.drain(..=index);
            if let Some((phase, percent)) = clone_progress(&line) {
                self.progress
                    .publish(HostProgressEvent::RepoCloneProgress { phase, percent });
            }
        }
        truncate_tail(&mut state.pending, 4_096);
        HostCommandStreamControl::Continue
    }
}

fn clone_progress(line: &str) -> Option<(String, u8)> {
    let (phase, rest) = line.split_once(':')?;
    let phase = phase.trim();
    if phase.is_empty()
        || !phase.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character.is_ascii_whitespace()
        })
    {
        return None;
    }
    let percent = rest.trim_start().split_once('%')?.0.parse::<u8>().ok()?;
    Some((phase.to_owned(), percent))
}

fn truncate_tail(value: &mut Vec<u8>, maximum_bytes: usize) {
    if value.len() <= maximum_bytes {
        return;
    }
    let start = value.len() - maximum_bytes;
    value.drain(..start);
}

pub(crate) async fn prepare_worktree_root(
    host: Arc<dyn ExecutionHost>,
    repo_path: &str,
    base_path: &str,
) {
    if host.kind() != HostKind::Local {
        return;
    }
    let filesystem = HostFilesystem::new(host);
    let paths = filesystem.paths();
    let root = if paths.is_absolute(base_path) {
        paths.resolve(base_path, &[])
    } else {
        paths.resolve(repo_path, &[base_path])
    };
    let _ = filesystem.mkdir(&root, true).await;
}

async fn assert_git_repository(
    host: Arc<dyn ExecutionHost>,
    path: &str,
) -> Result<(), ProjectHostSetupError> {
    let output = git(host, path, ["rev-parse", "--is-inside-work-tree"]).await?;
    if output.exit_code == 0 && output.stdout.trim() == "true" {
        Ok(())
    } else {
        Err(ProjectHostSetupError::NotGitRepository(path.to_owned()))
    }
}

async fn read_remotes(
    host: Arc<dyn ExecutionHost>,
    path: &str,
) -> Result<Vec<GitRemoteIdentity>, ProjectHostSetupError> {
    let names = git(host.clone(), path, ["remote"]).await?;
    if names.exit_code != 0 {
        return Ok(Vec::new());
    }
    let mut identities = Vec::new();
    for name in names
        .stdout
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
    {
        let output = git(host.clone(), path, ["remote", "get-url", "--all", name]).await?;
        if output.exit_code != 0 {
            continue;
        }
        for url in output
            .stdout
            .lines()
            .map(str::trim)
            .filter(|url| !url.is_empty())
        {
            if let Some(identity) = remotes::normalize(name, url) {
                identities.push(identity);
            }
        }
    }
    Ok(identities)
}

async fn git<const N: usize>(
    host: Arc<dyn ExecutionHost>,
    cwd: &str,
    args: [&str; N],
) -> Result<crate::hosts::HostCommandOutput, ProjectHostSetupError> {
    let mut command = HostCommand::new("git", args);
    command.cwd = Some(cwd.to_owned());
    command.max_output_bytes = Some(GIT_OUTPUT_LIMIT);
    command.timeout_ms = Some(GIT_TIMEOUT_MS);
    host.exec(command)
        .await
        .map_err(|error| ProjectHostSetupError::Git(error.to_string()))
}

fn clone_name(url: &str) -> Option<String> {
    let source = crate::repositories::ecmascript::trim(url).trim_end_matches('/');
    let source = source.strip_suffix(".git").unwrap_or(source);
    let name = source.rsplit(['/', '\\', ':']).next()?;
    (!name.is_empty() && !matches!(name, "." | "..") && !name.contains(['/', '\\']))
        .then(|| name.to_owned())
}

fn detail(output: &crate::hosts::HostCommandOutput) -> String {
    let output = if output.stderr.trim().is_empty() {
        output.stdout.trim()
    } else {
        output.stderr.trim()
    };
    let detail = output
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| line.contains("fatal:") || line.contains("error:"))
        .or_else(|| {
            output
                .lines()
                .rev()
                .map(str::trim)
                .find(|line| !line.is_empty())
        });
    let Some(detail) = detail else {
        return "unknown error".to_owned();
    };
    let detail = strip_url_credentials(detail);
    if detail.starts_with("fatal: destination path '")
        && detail.ends_with("' already exists and is not an empty directory.")
    {
        let destination = detail
            .strip_prefix("fatal: destination path '")
            .and_then(|value| value.strip_suffix("' already exists and is not an empty directory."))
            .unwrap_or_default();
        return format!(
            "Destination already exists and is not empty: {destination}. Choose a different parent folder, delete the existing folder, or add the existing repository instead."
        );
    }
    if detail.is_empty() {
        "git_clone_failed".to_owned()
    } else {
        detail
    }
}

fn strip_url_credentials(value: &str) -> String {
    let mut safe = value.to_owned();
    let mut search_from = 0;
    while let Some(relative_scheme) = safe[search_from..].find("://") {
        let authority_start = search_from + relative_scheme + 3;
        let authority_end = safe[authority_start..]
            .find(['/', '?', '#', ' ', '\'', '"'])
            .map_or(safe.len(), |offset| authority_start + offset);
        let Some(relative_at) = safe[authority_start..authority_end].rfind('@') else {
            search_from = authority_end;
            continue;
        };
        let at = authority_start + relative_at;
        safe.replace_range(authority_start..at, "[redacted]");
        search_from = authority_start + "[redacted]@".len();
    }
    safe
}

impl From<HostFilesystemError> for ProjectHostSetupError {
    fn from(error: HostFilesystemError) -> Self {
        Self::Filesystem(error)
    }
}
