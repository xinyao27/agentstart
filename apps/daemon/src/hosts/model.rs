use std::sync::Arc;

use async_trait::async_trait;
use thiserror::Error;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HostKind {
    Local,
    Ssh,
    Wsl,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HostPlatform {
    Darwin,
    Linux,
    Unknown,
    Windows,
}

#[derive(Clone)]
pub struct HostCommand {
    pub args: Vec<String>,
    pub cancel: Option<tokio::sync::watch::Receiver<bool>>,
    pub capture_stdout_bytes: bool,
    pub command: String,
    pub cwd: Option<String>,
    pub disable_timeout: bool,
    pub env: Vec<(String, String)>,
    pub max_output_bytes: Option<usize>,
    pub kill_process_tree: bool,
    pub retain_stderr: bool,
    pub retain_stdout: bool,
    pub stdin: Option<Vec<u8>>,
    pub output_observer: Option<Arc<dyn HostCommandOutputObserver>>,
    pub timeout_ms: Option<u64>,
}

impl HostCommand {
    pub fn new(
        command: impl Into<String>,
        args: impl IntoIterator<Item = impl Into<String>>,
    ) -> Self {
        Self {
            args: args.into_iter().map(Into::into).collect(),
            cancel: None,
            capture_stdout_bytes: false,
            command: command.into(),
            cwd: None,
            disable_timeout: false,
            env: Vec::new(),
            max_output_bytes: None,
            kill_process_tree: false,
            retain_stderr: true,
            retain_stdout: true,
            stdin: None,
            output_observer: None,
            timeout_ms: None,
        }
    }
}

pub trait HostCommandOutputObserver: Send + Sync {
    fn observe(&self, stream: HostCommandOutputStream, bytes: &[u8]) -> HostCommandStreamControl;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HostCommandOutputStream {
    Stderr,
    Stdout,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HostCommandStreamControl {
    Continue,
    Stop,
}

#[derive(Clone, Debug)]
pub struct HostCommandOutput {
    pub exit_code: i32,
    pub stderr: String,
    pub stdout: String,
    pub stdout_bytes: Option<Vec<u8>>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HostCommandErrorKind {
    Cancelled,
    OutputLimit,
    Spawn,
    Stopped,
    Timeout,
    Wait,
}

#[derive(Debug, Error)]
#[error("{message}")]
pub struct HostCommandError {
    kind: HostCommandErrorKind,
    message: String,
    partial_stdout: Vec<u8>,
}

impl HostCommandError {
    pub fn kind(&self) -> HostCommandErrorKind {
        self.kind
    }

    pub fn partial_stdout(&self) -> &[u8] {
        &self.partial_stdout
    }

    pub(super) fn new(kind: HostCommandErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            partial_stdout: Vec::new(),
        }
    }

    pub(super) fn with_partial_stdout(mut self, partial_stdout: Vec<u8>) -> Self {
        self.partial_stdout = partial_stdout;
        self
    }
}

#[async_trait]
pub trait ExecutionHost: Send + Sync {
    fn id(&self) -> &str;
    fn kind(&self) -> HostKind;
    fn label(&self) -> &str;
    fn platform(&self) -> HostPlatform;
    fn runtime_pid(&self) -> Option<u32>;
    fn target(&self) -> Option<&str>;
    async fn exec(&self, command: HostCommand) -> Result<HostCommandOutput, HostCommandError>;
    async fn terminate(&self, pid: u32) -> Result<(), HostCommandError>;
}

pub(super) fn failed_command(
    output: HostCommandOutput,
    fallback: &'static str,
) -> HostCommandError {
    let detail = if output.stderr.trim().is_empty() {
        output.stdout.trim()
    } else {
        output.stderr.trim()
    };
    HostCommandError::new(
        HostCommandErrorKind::Wait,
        if detail.is_empty() { fallback } else { detail },
    )
}
