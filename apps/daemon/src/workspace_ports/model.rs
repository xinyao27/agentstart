use std::fmt;

use async_trait::async_trait;
use serde::Serialize;
use thiserror::Error;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspacePortPlatform {
    Aix,
    Android,
    Darwin,
    Freebsd,
    Haiku,
    Linux,
    Netbsd,
    Openbsd,
    Sunos,
    Unknown,
    #[serde(rename = "win32")]
    Windows,
    Cygwin,
}

#[derive(Clone, Debug)]
pub struct WorkspacePortProbe {
    pub display_name: String,
    pub host_id: String,
    pub path: String,
    pub repo_id: String,
    pub worktree_id: String,
}

#[derive(Clone, Debug)]
pub struct RawWorkspacePort {
    pub bind_host: String,
    pub command_line: Option<String>,
    pub cwd: Option<String>,
    pub pid: Option<u32>,
    pub port: u16,
    pub process_name: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspacePortProtocol {
    Http,
    Https,
    Unknown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspacePortAttributionConfidence {
    Command,
    Cwd,
    None,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePortOwner {
    pub confidence: WorkspacePortAttributionConfidence,
    pub display_name: String,
    pub path: String,
    pub repo_id: String,
    pub worktree_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum WorkspacePortClassification {
    Workspace {
        owner: WorkspacePortOwner,
        #[serde(rename = "advertisedUrl", skip_serializing_if = "Option::is_none")]
        advertised_url: Option<String>,
    },
    Container,
    External,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePort {
    pub bind_host: String,
    #[serde(flatten)]
    pub classification: WorkspacePortClassification,
    pub connect_host: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    pub port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub process_name: Option<String>,
    pub protocol: WorkspacePortProtocol,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePortScanResult {
    pub platform: WorkspacePortPlatform,
    pub ports: Vec<WorkspacePort>,
    pub scanned_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unavailable_reason: Option<String>,
}

#[derive(Clone, Copy, Debug)]
pub struct WorkspacePortKillRequest {
    pub pid: f64,
    pub port: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct WorkspacePortKillResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WorkspacePortHostFailureKind {
    Timeout,
    Unavailable,
}

#[derive(Debug, Error)]
#[error("{message}")]
pub struct WorkspacePortHostError {
    kind: WorkspacePortHostFailureKind,
    message: String,
}

#[async_trait]
pub trait WorkspacePortHost: Send + Sync {
    fn id(&self) -> &str;
    fn platform(&self) -> WorkspacePortPlatform;
    fn runtime_pid(&self) -> Option<u32>;
    async fn scan_listeners(&self) -> Result<Vec<RawWorkspacePort>, WorkspacePortHostError>;
    async fn terminate(&self, pid: u32) -> Result<(), WorkspacePortHostError>;
}

impl WorkspacePortHostError {
    pub fn timeout(message: impl Into<String>) -> Self {
        Self {
            kind: WorkspacePortHostFailureKind::Timeout,
            message: message.into(),
        }
    }

    pub fn unavailable(message: impl Into<String>) -> Self {
        Self {
            kind: WorkspacePortHostFailureKind::Unavailable,
            message: message.into(),
        }
    }

    pub fn kind(&self) -> WorkspacePortHostFailureKind {
        self.kind
    }
}

impl fmt::Display for WorkspacePortPlatform {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Aix => "aix",
            Self::Android => "android",
            Self::Cygwin => "cygwin",
            Self::Darwin => "darwin",
            Self::Freebsd => "freebsd",
            Self::Haiku => "haiku",
            Self::Linux => "linux",
            Self::Netbsd => "netbsd",
            Self::Openbsd => "openbsd",
            Self::Sunos => "sunos",
            Self::Unknown => "unknown",
            Self::Windows => "win32",
        })
    }
}
