use std::sync::Arc;

use crate::hosts::{ExecutionHost, HostCommand, HostCommandOutput, HostPlatform};

use super::PreflightError;
use super::model::{PreflightContext, ProjectRuntime, ResolvedRuntime};

const COMMAND_TIMEOUT_MS: u64 = 5_000;

#[derive(Clone)]
pub(super) enum ProbeTarget {
    Host(Arc<dyn ExecutionHost>),
    Wsl {
        distro: Option<String>,
        windows: Arc<dyn ExecutionHost>,
    },
}

impl ProbeTarget {
    pub(super) fn is_wsl(&self) -> bool {
        matches!(self, Self::Wsl { .. })
    }

    pub(super) fn platform(&self) -> HostPlatform {
        match self {
            Self::Host(host) => host.platform(),
            Self::Wsl { .. } => HostPlatform::Linux,
        }
    }

    pub(super) async fn command(
        &self,
        executable: &str,
        args: &[&str],
        path: Option<&str>,
    ) -> Result<HostCommandOutput, PreflightError> {
        match self {
            Self::Host(host) => {
                let mut command = HostCommand::new(executable, args.iter().copied());
                command.timeout_ms = Some(COMMAND_TIMEOUT_MS);
                if let Some(path) = path {
                    command
                        .env
                        .push((path_name(host.platform()).to_owned(), path.to_owned()));
                }
                host.exec(command).await.map_err(PreflightError::Command)
            }
            Self::Wsl { distro, windows } => {
                let command = shell_words(executable, args);
                self.wsl_script(windows, distro.as_deref(), &command, COMMAND_TIMEOUT_MS)
                    .await
            }
        }
    }

    pub(super) async fn script(
        &self,
        script: &str,
        timeout_ms: u64,
    ) -> Result<HostCommandOutput, PreflightError> {
        match self {
            Self::Host(host) => {
                let mut command = HostCommand::new("sh", ["-lc", script]);
                command.timeout_ms = Some(timeout_ms);
                host.exec(command).await.map_err(PreflightError::Command)
            }
            Self::Wsl { distro, windows } => {
                self.wsl_script(windows, distro.as_deref(), script, timeout_ms)
                    .await
            }
        }
    }

    async fn wsl_script(
        &self,
        windows: &Arc<dyn ExecutionHost>,
        distro: Option<&str>,
        script: &str,
        timeout_ms: u64,
    ) -> Result<HostCommandOutput, PreflightError> {
        let mut args = Vec::new();
        if let Some(distro) = distro {
            args.extend(["-d".to_owned(), distro.to_owned()]);
        }
        args.extend([
            "--".to_owned(),
            "sh".to_owned(),
            "-c".to_owned(),
            escape_wsl_dollars(&wsl_login_script(script)),
        ]);
        let mut command = HostCommand::new("wsl.exe", args);
        command.timeout_ms = Some(timeout_ms);
        windows.exec(command).await.map_err(PreflightError::Command)
    }
}

pub(super) fn select_target(
    host: Arc<dyn ExecutionHost>,
    context: &PreflightContext,
) -> Result<ProbeTarget, PreflightError> {
    if host.platform() != HostPlatform::Windows {
        return Ok(ProbeTarget::Host(host));
    }
    if let Some(runtime) = &context.project_runtime {
        return match runtime {
            ProjectRuntime::RepairRequired { reason } => {
                Err(PreflightError::RuntimeRepair(reason.clone()))
            }
            ProjectRuntime::Resolved(ResolvedRuntime::Wsl { distro }) => Ok(ProbeTarget::Wsl {
                distro: Some(distro.clone()),
                windows: host,
            }),
            ProjectRuntime::Resolved(ResolvedRuntime::Local | ResolvedRuntime::Windows) => {
                Ok(ProbeTarget::Host(host))
            }
        };
    }
    if let Some(distro) = context
        .wsl_distro
        .as_deref()
        .map(str::trim)
        .filter(|distro| !distro.is_empty())
    {
        return Ok(ProbeTarget::Wsl {
            distro: Some(distro.to_owned()),
            windows: host,
        });
    }
    if context.wsl_default {
        return Ok(ProbeTarget::Wsl {
            distro: None,
            windows: host,
        });
    }
    Ok(ProbeTarget::Host(host))
}

pub(super) fn path_name(platform: HostPlatform) -> &'static str {
    if platform == HostPlatform::Windows {
        "Path"
    } else {
        "PATH"
    }
}

pub(super) fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn shell_words(executable: &str, args: &[&str]) -> String {
    std::iter::once(executable)
        .chain(args.iter().copied())
        .map(shell_quote)
        .collect::<Vec<_>>()
        .join(" ")
}

fn escape_wsl_dollars(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    let mut previous = None;
    for character in value.chars() {
        if character == '$' && previous != Some('\\') {
            escaped.push('\\');
        }
        escaped.push(character);
        previous = Some(character);
    }
    escaped
}

fn wsl_login_script(command: &str) -> String {
    format!(
        "_agentstart_wsl_shell=$(getent passwd \"$(id -un)\" 2>/dev/null | cut -d: -f7)\n\
         if [ -z \"$_agentstart_wsl_shell\" ] || [ ! -x \"$_agentstart_wsl_shell\" ]; then _agentstart_wsl_shell=\"${{SHELL:-/bin/bash}}\"; fi\n\
         if [ -z \"$_agentstart_wsl_shell\" ] || [ ! -x \"$_agentstart_wsl_shell\" ]; then _agentstart_wsl_shell=/bin/sh; fi\n\
         _agentstart_wsl_shell_name=$(basename \"$_agentstart_wsl_shell\" | tr \"[:upper:]\" \"[:lower:]\")\n\
         case \"$_agentstart_wsl_shell_name\" in\n\
         sh|dash) exec \"$_agentstart_wsl_shell\" -lc {} ;;\n\
         bash|zsh|ksh|mksh|ash) exec \"$_agentstart_wsl_shell\" -ilc {} ;;\n\
         *) exec /bin/sh -lc {} ;;\n\
         esac",
        shell_quote(command),
        shell_quote(command),
        shell_quote(command)
    )
}
