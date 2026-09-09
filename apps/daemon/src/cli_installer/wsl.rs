mod command;
mod distro;
mod scripts;

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, Weak};

use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};

use crate::host_registry::SystemHostCapabilities;

use super::context::{HostPlatform, InstallContext};
use super::inspection;
use super::model::{
    CliInstallMethod, CliInstallState, CliInstallStatus, CliInstallUnsupportedReason,
    CliInstallerError,
};
use command::run;
use scripts::{
    BRIDGE_MANAGED_MARKER, MANAGED_MARKER, bridge_path, build_bridge, build_launcher,
    build_registration_command, build_safe_remove_command, parse_managed_launcher_target,
    posix_dirname, quote_shell,
};

const WSL_COMMAND_NAME: &str = "yiru";

#[derive(Clone)]
pub(super) struct WslCliInstaller {
    locks: OperationLocks,
    system: SystemHostCapabilities,
}

#[derive(Clone, Default)]
struct OperationLocks {
    entries: Arc<Mutex<HashMap<String, Weak<AsyncMutex<()>>>>>,
}

struct ReadyState {
    bridge_path: String,
    command_path: String,
    distro: String,
    launcher_path: String,
    path_configured: bool,
}

enum CommandFile {
    Missing,
    NotFile,
    Text(String),
}

impl WslCliInstaller {
    pub(super) fn new(system: SystemHostCapabilities) -> Self {
        Self {
            locks: OperationLocks::default(),
            system,
        }
    }

    pub(super) async fn status(
        &self,
        requested_distro: Option<&str>,
    ) -> Result<CliInstallStatus, CliInstallerError> {
        let distro = self.resolve_distro(requested_distro).await;
        self.status_for(distro.as_deref()).await
    }

    pub(super) async fn install(
        &self,
        requested_distro: Option<&str>,
    ) -> Result<CliInstallStatus, CliInstallerError> {
        let distro = self.resolve_distro(requested_distro).await;
        let _guard = self.lock(distro.as_deref()).await;
        let status = self.status_for(distro.as_deref()).await?;
        if !status.supported
            || status.command_path.is_none()
            || status.launcher_path.is_none()
            || status.path_directory.is_none()
            || distro.is_none()
        {
            return Err(CliInstallerError::Refused(status.detail.unwrap_or_else(
                || "WSL CLI registration is unavailable.".to_owned(),
            )));
        }
        let command_path = status.command_path.as_deref().unwrap_or_default();
        if status.state == CliInstallState::Conflict {
            return Err(CliInstallerError::Refused(format!(
                "Refusing to replace non-Yiru command at {command_path}."
            )));
        }
        let launcher_path = status.launcher_path.as_deref().unwrap_or_default();
        let path_directory = status.path_directory.as_deref().unwrap_or_default();
        run(
            distro.as_deref().unwrap_or_default(),
            &build_registration_command(command_path, launcher_path, path_directory),
        )
        .await?;
        self.status_for(distro.as_deref()).await
    }

    pub(super) async fn remove(
        &self,
        requested_distro: Option<&str>,
    ) -> Result<CliInstallStatus, CliInstallerError> {
        let distro = self.resolve_distro(requested_distro).await;
        let _guard = self.lock(distro.as_deref()).await;
        let status = self.status_for(distro.as_deref()).await?;
        if !status.supported || status.command_path.is_none() {
            return Ok(status);
        }
        if status.state == CliInstallState::NotInstalled {
            return Ok(status);
        }
        let command_path = status.command_path.as_deref().unwrap_or_default();
        if status.state == CliInstallState::Conflict {
            return Err(CliInstallerError::Refused(format!(
                "Refusing to remove non-Yiru command at {command_path}."
            )));
        }
        let Some(distro) = distro.as_deref() else {
            return Ok(status);
        };
        run(distro, &build_safe_remove_command(command_path)).await?;
        self.status_for(Some(distro)).await
    }

    async fn status_for(
        &self,
        distro: Option<&str>,
    ) -> Result<CliInstallStatus, CliInstallerError> {
        let ready = match self.ready_state(distro).await? {
            Ok(ready) => ready,
            Err(status) => return Ok(status),
        };
        let content = match read_command_file(&ready.distro, &ready.command_path).await? {
            CommandFile::Missing => {
                return Ok(ready.status(
                    CliInstallState::NotInstalled,
                    None,
                    format!("Register {} to use Yiru from WSL.", ready.command_path),
                ));
            }
            CommandFile::NotFile => {
                return Ok(ready.status(
                    CliInstallState::Conflict,
                    None,
                    format!(
                        "{} exists but is not a Yiru launcher script.",
                        ready.command_path
                    ),
                ));
            }
            CommandFile::Text(content) => content,
        };
        let expected = build_launcher(&ready.launcher_path, &ready.bridge_path);
        let managed = content.contains(MANAGED_MARKER);
        let current_target = managed
            .then(|| parse_managed_launcher_target(&content))
            .flatten();
        if managed_script_matches(&content, &expected, managed) {
            let bridge_content = read_command_file(&ready.distro, &ready.bridge_path).await?;
            let bridge_managed = matches!(
                &bridge_content,
                CommandFile::Text(content) if content.contains(BRIDGE_MANAGED_MARKER)
            );
            if matches!(
                &bridge_content,
                CommandFile::Text(content)
                    if managed_script_matches(content, build_bridge(), bridge_managed)
            ) {
                return Ok(ready.status(
                    CliInstallState::Installed,
                    current_target,
                    format!("Registered in {} at {}.", ready.distro, ready.command_path),
                ));
            }
            let is_stale = matches!(bridge_content, CommandFile::Missing) || bridge_managed;
            return Ok(ready.status(
                if is_stale {
                    CliInstallState::Stale
                } else {
                    CliInstallState::Conflict
                },
                current_target,
                if is_stale {
                    format!("{} is missing its PowerShell bridge.", ready.command_path)
                } else {
                    format!("{} exists but is not managed by Yiru.", ready.bridge_path)
                },
            ));
        }
        let bridge_conflict =
            managed && is_bridge_conflict(&ready.distro, &ready.bridge_path).await?;
        Ok(ready.status(
            if managed && !bridge_conflict {
                CliInstallState::Stale
            } else {
                CliInstallState::Conflict
            },
            current_target,
            if !managed {
                format!("{} exists but is not managed by Yiru.", ready.command_path)
            } else if bridge_conflict {
                format!("{} exists but is not managed by Yiru.", ready.bridge_path)
            } else {
                format!(
                    "{} points to a different Yiru launcher.",
                    ready.command_path
                )
            },
        ))
    }

    async fn ready_state(
        &self,
        distro: Option<&str>,
    ) -> Result<Result<ReadyState, CliInstallStatus>, CliInstallerError> {
        if HostPlatform::current() != HostPlatform::Windows {
            return Ok(Err(unsupported(
                CliInstallUnsupportedReason::PlatformNotSupported,
                "WSL CLI registration is only available on Windows.",
            )));
        }
        let Some(distro) = distro else {
            return Ok(Err(unsupported(
                CliInstallUnsupportedReason::PlatformNotSupported,
                "No WSL distribution is available.",
            )));
        };
        let host_status = inspection::status(&InstallContext::local()?).await?;
        let Some(launcher_path) = host_status.launcher_path else {
            return Ok(Err(unsupported(
                host_status
                    .unsupported_reason
                    .unwrap_or(CliInstallUnsupportedReason::LauncherMissing),
                host_status
                    .detail
                    .as_deref()
                    .unwrap_or("The Windows Yiru CLI launcher is missing."),
            )));
        };
        let home = run(distro, "printf %s \"$HOME\"").await?.trim().to_owned();
        if !home.starts_with('/') {
            return Ok(Err(unsupported(
                CliInstallUnsupportedReason::LauncherMissing,
                "Unable to resolve the WSL home directory.",
            )));
        }
        let interop_ready = run(
            distro,
            "{ command -v powershell.exe >/dev/null 2>&1 || [ -x /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe ]; } && command -v wslpath >/dev/null 2>&1 && printf yes || printf no",
        )
        .await?
        .trim()
            == "yes";
        if !interop_ready {
            return Ok(Err(unsupported(
                CliInstallUnsupportedReason::LauncherMissing,
                "WSL Windows interop is unavailable; Yiru cannot launch the Windows CLI from WSL.",
            )));
        }
        let path_directory = format!("{home}/.local/bin");
        let command_path = format!("{path_directory}/{WSL_COMMAND_NAME}");
        let path_configured = run(
            distro,
            &format!(
                "case \":$PATH:\" in *:{}:*) printf yes ;; *) printf no ;; esac",
                quote_shell(&path_directory)
            ),
        )
        .await?
        .trim()
            == "yes";
        Ok(Ok(ReadyState {
            bridge_path: bridge_path(&command_path),
            command_path,
            distro: distro.to_owned(),
            launcher_path,
            path_configured,
        }))
    }

    async fn resolve_distro(&self, requested: Option<&str>) -> Option<String> {
        match distro::requested(requested) {
            Some(distro) => Some(distro.to_owned()),
            None => self.system.list_wsl_distros().await.into_iter().next(),
        }
    }

    async fn lock(&self, distro: Option<&str>) -> Option<OwnedMutexGuard<()>> {
        let distro = distro?;
        Some(
            self.locks
                .entry(distro.trim().to_lowercase())
                .lock_owned()
                .await,
        )
    }
}

impl OperationLocks {
    fn entry(&self, key: String) -> Arc<AsyncMutex<()>> {
        let mut entries = lock(&self.entries);
        if let Some(entry) = entries.get(&key).and_then(Weak::upgrade) {
            return entry;
        }
        let entry = Arc::new(AsyncMutex::new(()));
        entries.insert(key, Arc::downgrade(&entry));
        entry
    }
}

impl ReadyState {
    fn status(
        &self,
        state: CliInstallState,
        current_target: Option<String>,
        detail: String,
    ) -> CliInstallStatus {
        CliInstallStatus {
            platform: "linux".to_owned(),
            command_name: WSL_COMMAND_NAME.to_owned(),
            command_path: Some(self.command_path.clone()),
            path_directory: Some(posix_dirname(&self.command_path)),
            path_configured: self.path_configured,
            launcher_path: Some(self.launcher_path.clone()),
            install_method: Some(CliInstallMethod::Wrapper),
            supported: true,
            state,
            current_target,
            unsupported_reason: None,
            detail: Some(
                if state == CliInstallState::Installed && !self.path_configured {
                    format!(
                        "{} is registered, but {} is not on PATH in {}.",
                        self.command_path,
                        posix_dirname(&self.command_path),
                        self.distro
                    )
                } else {
                    detail
                },
            ),
        }
    }
}

async fn read_command_file(distro: &str, path: &str) -> Result<CommandFile, CliInstallerError> {
    let output = run(
        distro,
        &[
            format!("if [ -L {} ]; then", quote_shell(path)),
            "  printf __YIRU_NOT_FILE__".to_owned(),
            format!("elif [ ! -e {} ]; then", quote_shell(path)),
            "  printf __YIRU_MISSING__".to_owned(),
            format!("elif [ ! -f {} ]; then", quote_shell(path)),
            "  printf __YIRU_NOT_FILE__".to_owned(),
            "else".to_owned(),
            format!("  cat {}", quote_shell(path)),
            "fi".to_owned(),
        ]
        .join("\n"),
    )
    .await?;
    Ok(match output.as_str() {
        "__YIRU_MISSING__" => CommandFile::Missing,
        "__YIRU_NOT_FILE__" => CommandFile::NotFile,
        _ => CommandFile::Text(output),
    })
}

async fn is_bridge_conflict(distro: &str, bridge_path: &str) -> Result<bool, CliInstallerError> {
    Ok(match read_command_file(distro, bridge_path).await? {
        CommandFile::Missing => false,
        CommandFile::NotFile => true,
        CommandFile::Text(content) => !content.contains(BRIDGE_MANAGED_MARKER),
    })
}

fn managed_script_matches(content: &str, expected: &str, managed: bool) -> bool {
    content == expected || managed && normalize_managed_script(content) == expected
}

fn normalize_managed_script(content: &str) -> String {
    if content.ends_with('\n') {
        format!("{}\n", content.trim_end_matches('\n'))
    } else {
        content.to_owned()
    }
}

fn unsupported(reason: CliInstallUnsupportedReason, detail: &str) -> CliInstallStatus {
    CliInstallStatus {
        platform: "linux".to_owned(),
        command_name: WSL_COMMAND_NAME.to_owned(),
        command_path: None,
        path_directory: None,
        path_configured: false,
        launcher_path: None,
        install_method: None,
        supported: false,
        state: CliInstallState::Unsupported,
        current_target: None,
        unsupported_reason: Some(reason),
        detail: Some(detail.to_owned()),
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
