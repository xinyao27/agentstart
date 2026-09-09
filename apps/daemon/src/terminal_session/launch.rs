use std::env;

use crate::host_registry::git_bash_executable;
use crate::hosts::{ExecutionHost, HostKind, HostPlatform};

use super::model::{TerminalCreateRequest, TerminalStartupCommandDelivery};

pub(super) struct TerminalLaunch {
    pub(super) args: Vec<String>,
    pub(super) cwd: Option<String>,
    pub(super) env: Vec<(String, String)>,
    pub(super) env_to_delete: Vec<String>,
    pub(super) executable: String,
}

pub(super) fn build(
    host: &dyn ExecutionHost,
    request: &TerminalCreateRequest,
    cwd: String,
    windows_shell: Option<&str>,
) -> TerminalLaunch {
    match host.kind() {
        HostKind::Local => local(host.platform(), request, cwd, windows_shell),
        HostKind::Ssh => remote_ssh(host.target().unwrap_or_default(), request, cwd),
        HostKind::Wsl => remote_wsl(host.target().unwrap_or_default(), request, cwd),
    }
}

fn local(
    platform: HostPlatform,
    request: &TerminalCreateRequest,
    cwd: String,
    windows_shell: Option<&str>,
) -> TerminalLaunch {
    let shell = default_shell(platform, windows_shell);
    let args = if platform == HostPlatform::Windows {
        match request.command.as_deref() {
            command if is_wsl(&shell) => wsl_args(command),
            Some(command) if is_cmd(&shell) => vec![
                "/d".to_owned(),
                "/s".to_owned(),
                "/c".to_owned(),
                command.to_owned(),
            ],
            command if is_posix_shell(&shell) => {
                posix_args(command, request.startup_command_delivery)
            }
            Some(command) => vec![
                "-NoLogo".to_owned(),
                "-NoProfile".to_owned(),
                "-Command".to_owned(),
                command.to_owned(),
            ],
            None => Vec::new(),
        }
    } else {
        posix_args(request.command.as_deref(), request.startup_command_delivery)
    };
    TerminalLaunch {
        args,
        cwd: Some(cwd),
        env: request.env.clone(),
        env_to_delete: request.env_to_delete.clone(),
        executable: shell,
    }
}

fn remote_ssh(target: &str, request: &TerminalCreateRequest, cwd: String) -> TerminalLaunch {
    TerminalLaunch {
        args: vec![
            "-tt".to_owned(),
            "-o".to_owned(),
            "BatchMode=yes".to_owned(),
            "-o".to_owned(),
            "ConnectTimeout=10".to_owned(),
            "--".to_owned(),
            target.to_owned(),
            remote_command(request, cwd),
        ],
        cwd: None,
        env: Vec::new(),
        env_to_delete: Vec::new(),
        executable: "ssh".to_owned(),
    }
}

fn remote_wsl(distribution: &str, request: &TerminalCreateRequest, cwd: String) -> TerminalLaunch {
    TerminalLaunch {
        args: vec![
            "--distribution".to_owned(),
            distribution.to_owned(),
            "--exec".to_owned(),
            "sh".to_owned(),
            "-lc".to_owned(),
            remote_command(request, cwd),
        ],
        cwd: None,
        env: Vec::new(),
        env_to_delete: Vec::new(),
        executable: "wsl.exe".to_owned(),
    }
}

fn remote_command(request: &TerminalCreateRequest, cwd: String) -> String {
    let mut environment = request
        .env
        .iter()
        .filter(|(name, _)| is_environment_name(name))
        .map(|(name, value)| format!("{name}={}", quote(value)))
        .collect::<Vec<_>>();
    environment.push("TERM='xterm-256color'".to_owned());
    let removals = request
        .env_to_delete
        .iter()
        .filter(|name| is_environment_name(name))
        .map(|name| format!("unset {name};"))
        .collect::<Vec<_>>()
        .join(" ");
    let invocation = request.command.as_ref().map_or_else(
        || "exec \"${SHELL:-/bin/sh}\" -l".to_owned(),
        |command| format!("exec \"${{SHELL:-/bin/sh}}\" -lc {}", quote(command)),
    );
    format!(
        "cd -- {} && {removals} exec env {} {invocation}",
        quote(&cwd),
        environment.join(" ")
    )
}

fn default_shell(platform: HostPlatform, configured: Option<&str>) -> String {
    if platform == HostPlatform::Windows {
        if let Some(configured) = configured.map(str::trim).filter(|value| !value.is_empty()) {
            if configured == "git-bash" {
                return git_bash_executable().unwrap_or_else(|| "bash.exe".to_owned());
            }
            return configured.to_owned();
        }
        env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_owned())
    } else {
        env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_owned())
    }
}

fn posix_args(
    command: Option<&str>,
    _delivery: Option<TerminalStartupCommandDelivery>,
) -> Vec<String> {
    match command {
        Some(command) => vec!["-lc".to_owned(), command.to_owned()],
        None => vec!["-l".to_owned()],
    }
}

fn wsl_args(command: Option<&str>) -> Vec<String> {
    let mut args = vec!["--exec".to_owned(), "sh".to_owned()];
    match command {
        Some(command) => args.extend(["-lc".to_owned(), command.to_owned()]),
        None => args.push("-l".to_owned()),
    }
    args
}

fn is_cmd(shell: &str) -> bool {
    shell
        .rsplit(['/', '\\'])
        .next()
        .is_some_and(|name| name.eq_ignore_ascii_case("cmd.exe"))
}

fn is_wsl(shell: &str) -> bool {
    shell
        .rsplit(['/', '\\'])
        .next()
        .is_some_and(|name| matches!(name.to_ascii_lowercase().as_str(), "wsl" | "wsl.exe"))
}

fn is_posix_shell(shell: &str) -> bool {
    shell.rsplit(['/', '\\']).next().is_some_and(|name| {
        matches!(
            name.to_ascii_lowercase().as_str(),
            "bash" | "bash.exe" | "sh" | "sh.exe" | "zsh" | "zsh.exe"
        )
    })
}

fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn is_environment_name(name: &str) -> bool {
    let mut bytes = name.bytes();
    bytes
        .next()
        .is_some_and(|byte| byte == b'_' || byte.is_ascii_alphabetic())
        && bytes.all(|byte| byte == b'_' || byte.is_ascii_alphanumeric())
}
