use serde_json::Value;

use crate::hosts::{ExecutionHost, HostCommand, HostFilesystem, HostPlatform};

use super::authority::WorktreeArchiveAuthorityError;

const ARCHIVE_HOOK_TIMEOUT_MS: u64 = 10 * 60 * 1_000;
const MAX_HOOK_BYTES: usize = 1_024 * 1_024;

pub(super) async fn run(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    worktree_path: &str,
) -> Result<(), WorktreeArchiveAuthorityError> {
    run_script(filesystem, host, worktree_path, None, "archive").await
}

pub(crate) async fn run_effective(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    worktree_path: &str,
    repo: &Value,
) -> Result<bool, WorktreeArchiveAuthorityError> {
    run_script(filesystem, host, worktree_path, Some(repo), "archive")
        .await
        .map(|_| true)
}

pub(crate) async fn run_setup(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    worktree_path: &str,
    repo: &Value,
) -> Result<bool, WorktreeArchiveAuthorityError> {
    run_script(filesystem, host, worktree_path, Some(repo), "setup")
        .await
        .map(|_| true)
}

async fn run_script(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    worktree_path: &str,
    repo: Option<&Value>,
    script_name: &str,
) -> Result<(), WorktreeArchiveAuthorityError> {
    let path = filesystem.paths().join(&[worktree_path, "agentstart.yaml"]);
    let shared = match filesystem.read_text(&path, MAX_HOOK_BYTES).await? {
        Some(text) => match serde_saphyr::from_str::<Value>(&text) {
            Ok(value) => value
                .as_object()
                .and_then(|object| object.get("scripts"))
                .and_then(Value::as_object)
                .and_then(|scripts| scripts.get(script_name))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|command| !command.is_empty())
                .map(str::to_owned),
            Err(_error) if repo.is_some() => None,
            Err(error) => {
                return Err(WorktreeArchiveAuthorityError::Operation(error.to_string()));
            }
        },
        None => None,
    };
    let command = effective_command(shared.as_deref(), repo, script_name);
    let Some(command) = command else {
        return Ok(());
    };
    let (executable, args) = if host.platform() == HostPlatform::Windows {
        ("cmd.exe", vec!["/D", "/S", "/C", command.as_str()])
    } else {
        ("sh", vec!["-lc", command.as_str()])
    };
    let mut request = HostCommand::new(executable, args);
    request.cwd = Some(worktree_path.to_owned());
    request.timeout_ms = Some(ARCHIVE_HOOK_TIMEOUT_MS);
    if let Some(repo) = repo {
        let root = repo.get("path").and_then(Value::as_str).unwrap_or_default();
        let workspace_name = filesystem.paths().basename(worktree_path);
        request.env = vec![
            ("AGENTSTART_ROOT_PATH".to_owned(), root.to_owned()),
            (
                "AGENTSTART_WORKTREE_PATH".to_owned(),
                worktree_path.to_owned(),
            ),
            (
                "AGENTSTART_WORKSPACE_NAME".to_owned(),
                workspace_name.clone(),
            ),
            ("CONDUCTOR_ROOT_PATH".to_owned(), root.to_owned()),
            ("GHOSTX_ROOT_PATH".to_owned(), root.to_owned()),
            (
                "AGENTSTART_INTERNAL_TERMINAL_GIT_CREDENTIAL_GUARD_POLICY".to_owned(),
                "guard".to_owned(),
            ),
        ];
    }
    let output = host
        .exec(request)
        .await
        .map_err(|error| WorktreeArchiveAuthorityError::Operation(error.to_string()))?;
    if output.exit_code != 0 {
        let detail = if output.stderr.trim().is_empty() {
            output.stdout.trim()
        } else {
            output.stderr.trim()
        };
        return Err(WorktreeArchiveAuthorityError::Operation(
            if detail.is_empty() {
                "worktree_archive_hook_failed".to_owned()
            } else {
                detail.to_owned()
            },
        ));
    }
    Ok(())
}

fn effective_command(
    shared: Option<&str>,
    repo: Option<&Value>,
    script_name: &str,
) -> Option<String> {
    let local = repo
        .and_then(|repo| repo.get("hookSettings"))
        .and_then(Value::as_object)
        .and_then(|settings| settings.get("scripts"))
        .and_then(Value::as_object)
        .and_then(|scripts| scripts.get(script_name))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|command| !command.is_empty());
    let policy = repo
        .map(|repo| crate::repositories::hooks::command_source_policy(repo, local.is_some()))
        .unwrap_or("shared-only");
    match policy {
        "local-only" => local.map(str::to_owned),
        "run-both" => combine(shared, local),
        _ => shared.map(str::to_owned),
    }
}

fn combine(shared: Option<&str>, local: Option<&str>) -> Option<String> {
    let commands = [shared, local]
        .into_iter()
        .flatten()
        .map(str::to_owned)
        .collect::<Vec<_>>();
    (!commands.is_empty()).then(|| commands.join("\n"))
}
