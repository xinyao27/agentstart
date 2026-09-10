use std::env;
use std::path::{Path, PathBuf};

use super::model::{CliInstallMethod, CliInstallerError};

pub(super) const DEVELOPMENT_COMMAND_NAME: &str = "agentstart-dev";
pub(super) const PRODUCTION_COMMAND_NAME: &str = "agentstart";

#[derive(Clone, Copy, Eq, PartialEq)]
pub(super) enum HostPlatform {
    Darwin,
    Linux,
    Windows,
    Unsupported(&'static str),
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum CliEnvironment {
    Development,
    Production,
}

pub(super) struct InstallSpec {
    pub(super) command_path: PathBuf,
    pub(super) install_method: CliInstallMethod,
}

pub(super) struct InstallContext {
    pub(super) platform: HostPlatform,
    pub(super) command_name: &'static str,
    pub(super) command_path_override: Option<PathBuf>,
    pub(super) process_path: Option<String>,
    pub(super) user_data_path: Option<PathBuf>,
    environment: CliEnvironment,
    home_path: Option<PathBuf>,
    local_app_data_path: Option<PathBuf>,
}

impl InstallContext {
    pub(super) fn local() -> Result<Self, CliInstallerError> {
        let platform = HostPlatform::current();
        let environment = CliEnvironment::current();
        let command_path_override =
            trimmed_environment("AGENTSTART_CLI_INSTALL_PATH").map(PathBuf::from);
        let home_path = trimmed_environment("HOME")
            .or_else(|| trimmed_environment("USERPROFILE"))
            .map(PathBuf::from);
        let user_data_path = resolve_user_data_path(platform, environment, home_path.as_deref());
        let local_app_data_path = trimmed_environment("LOCALAPPDATA")
            .map(PathBuf::from)
            .or_else(|| {
                home_path
                    .as_ref()
                    .map(|home| home.join("AppData").join("Local"))
            });
        let command_name =
            if environment == CliEnvironment::Development && command_path_override.is_none() {
                DEVELOPMENT_COMMAND_NAME
            } else {
                PRODUCTION_COMMAND_NAME
            };
        Ok(Self {
            platform,
            command_name,
            command_path_override,
            process_path: trimmed_environment("PATH").or_else(|| trimmed_environment("Path")),
            user_data_path,
            environment,
            home_path,
            local_app_data_path,
        })
    }

    pub(super) fn is_production(&self) -> bool {
        self.environment == CliEnvironment::Production
    }

    pub(super) fn launcher_path(&self) -> Option<PathBuf> {
        env::current_exe()
            .ok()
            .filter(|path| path.metadata().is_ok_and(|metadata| metadata.is_file()))
    }

    pub(super) fn install_spec(
        &self,
        launcher_path: Option<&Path>,
    ) -> Result<Option<InstallSpec>, CliInstallerError> {
        if let Some(command_path) = &self.command_path_override {
            return Ok(Some(InstallSpec {
                command_path: command_path.clone(),
                install_method: if self.platform == HostPlatform::Windows {
                    CliInstallMethod::Wrapper
                } else {
                    CliInstallMethod::Symlink
                },
            }));
        }
        match self.platform {
            HostPlatform::Darwin => Ok(Some(InstallSpec {
                command_path: self.mac_command_path()?,
                install_method: CliInstallMethod::Symlink,
            })),
            HostPlatform::Linux => Ok(Some(InstallSpec {
                command_path: self
                    .home_path()?
                    .join(".local")
                    .join("bin")
                    .join(self.command_name),
                install_method: CliInstallMethod::Symlink,
            })),
            HostPlatform::Windows if self.is_production() => {
                Ok(launcher_path.map(|path| InstallSpec {
                    command_path: path.to_owned(),
                    install_method: CliInstallMethod::Wrapper,
                }))
            }
            HostPlatform::Windows => Ok(Some(InstallSpec {
                command_path: self
                    .local_app_data_path
                    .as_ref()
                    .ok_or(CliInstallerError::PathUnavailable("LOCALAPPDATA"))?
                    .join("Programs")
                    .join("AgentStart Dev")
                    .join("bin")
                    .join("agentstart-dev.cmd"),
                install_method: CliInstallMethod::Wrapper,
            })),
            HostPlatform::Unsupported(_) => Ok(None),
        }
    }

    fn mac_command_path(&self) -> Result<PathBuf, CliInstallerError> {
        let system_path = PathBuf::from("/usr/local/bin").join(self.command_name);
        if !self.is_production() || system_path.parent().is_some_and(Path::exists) {
            return Ok(system_path);
        }
        Ok(self
            .home_path()?
            .join(".local")
            .join("bin")
            .join(self.command_name))
    }

    fn home_path(&self) -> Result<&Path, CliInstallerError> {
        self.home_path
            .as_deref()
            .ok_or(CliInstallerError::PathUnavailable("HOME"))
    }
}

impl HostPlatform {
    pub(super) const fn current() -> Self {
        if cfg!(target_os = "macos") {
            Self::Darwin
        } else if cfg!(target_os = "linux") {
            Self::Linux
        } else if cfg!(target_os = "windows") {
            Self::Windows
        } else {
            Self::Unsupported(std::env::consts::OS)
        }
    }

    pub(super) const fn wire_name(self) -> &'static str {
        match self {
            Self::Darwin => "darwin",
            Self::Linux => "linux",
            Self::Windows => "win32",
            Self::Unsupported(name) => name,
        }
    }
}

impl CliEnvironment {
    fn current() -> Self {
        match trimmed_environment("AGENTSTART_CLI_ENVIRONMENT").as_deref() {
            Some("development") => Self::Development,
            Some("production") => Self::Production,
            _ if cfg!(debug_assertions) => Self::Development,
            _ => Self::Production,
        }
    }
}

fn resolve_user_data_path(
    platform: HostPlatform,
    environment: CliEnvironment,
    home_path: Option<&Path>,
) -> Option<PathBuf> {
    if let Some(path) = trimmed_environment("AGENTSTART_APP_USER_DATA_PATH")
        .or_else(|| trimmed_environment("AGENTSTART_USER_DATA_PATH"))
    {
        return Some(PathBuf::from(path));
    }
    let directory = if environment == CliEnvironment::Development {
        "agentstart-dev"
    } else {
        "agentstart"
    };
    match platform {
        HostPlatform::Darwin => Some(
            home_path?
                .join("Library")
                .join("Application Support")
                .join(directory),
        ),
        HostPlatform::Linux => trimmed_environment("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| home_path.map(|home| home.join(".config")))
            .map(|path| path.join(directory)),
        HostPlatform::Windows => trimmed_environment("APPDATA")
            .map(PathBuf::from)
            .or_else(|| home_path.map(|home| home.join("AppData").join("Roaming")))
            .map(|path| path.join(directory)),
        HostPlatform::Unsupported(_) => None,
    }
}

fn trimmed_environment(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}
