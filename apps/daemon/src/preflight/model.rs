use serde::Serialize;

#[derive(Clone, Debug, Default)]
pub(crate) struct PreflightContext {
    pub(crate) project_runtime: Option<ProjectRuntime>,
    pub(crate) wsl_default: bool,
    pub(crate) wsl_distro: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) enum ProjectRuntime {
    RepairRequired { reason: String },
    Resolved(ResolvedRuntime),
}

#[derive(Clone, Debug)]
pub(crate) enum ResolvedRuntime {
    Local,
    Windows,
    Wsl { distro: String },
}

#[derive(Clone, Debug)]
pub(crate) enum PreflightRequest {
    Check {
        context: PreflightContext,
        force: bool,
    },
    DetectAgents(PreflightContext),
    DetectRemoteAgents,
    RefreshAgents(PreflightContext),
}

#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub(crate) enum PreflightResponse {
    Agents(Vec<String>),
    Refresh(RefreshAgentsResult),
    Status(PreflightStatus),
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct InstalledStatus {
    pub(crate) installed: bool,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct CliAuthStatus {
    pub(crate) installed: bool,
    pub(crate) authenticated: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreflightStatus {
    pub(crate) git: InstalledStatus,
    pub(crate) gh: CliAuthStatus,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ShellHydrationFailureReason {
    None,
    NoShell,
    Timeout,
    SpawnError,
    EmptyPath,
}

#[derive(Clone, Debug)]
pub(super) struct ShellHydration {
    pub(super) failure_reason: ShellHydrationFailureReason,
    pub(super) segments: Vec<String>,
}

impl ShellHydration {
    pub(super) fn is_ok(&self) -> bool {
        self.failure_reason == ShellHydrationFailureReason::None
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RefreshAgentsResult {
    pub(crate) agents: Vec<String>,
    pub(crate) added_path_segments: Vec<String>,
    pub(crate) shell_hydration_ok: bool,
    pub(crate) path_source: &'static str,
    pub(crate) path_failure_reason: ShellHydrationFailureReason,
}
