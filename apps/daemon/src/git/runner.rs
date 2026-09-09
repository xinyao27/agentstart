use std::sync::Arc;

use thiserror::Error;

use crate::hosts::{
    ExecutionHost, HostCommand, HostCommandError, HostCommandErrorKind, HostCommandOutput,
    HostCommandOutputObserver,
};

use super::command_trace::{GitCommandSpan, GitCommandTrace};

const DEFAULT_OUTPUT_LIMIT_BYTES: usize = 10 * 1_024 * 1_024;
const DEFAULT_TIMEOUT_MS: u64 = 120_000;

#[derive(Clone, Copy)]
pub(super) struct GitRunOptions {
    pub(super) max_output_bytes: usize,
    pub(super) timeout_ms: Option<u64>,
}

impl Default for GitRunOptions {
    fn default() -> Self {
        Self {
            max_output_bytes: DEFAULT_OUTPUT_LIMIT_BYTES,
            timeout_ms: Some(DEFAULT_TIMEOUT_MS),
        }
    }
}

#[derive(Clone)]
pub(super) struct GitRunner {
    pub(super) cwd: String,
    pub(super) host: Arc<dyn ExecutionHost>,
    trace: GitCommandTrace,
}

#[derive(Debug, Error)]
pub(crate) enum GitError {
    #[error("git command was canceled")]
    Canceled,
    #[error("{0}")]
    Command(String),
    #[error("git command output exceeded the safety limit")]
    OutputLimit,
    #[error("git command stopped after its bounded result was complete")]
    Stopped,
    #[error("git command timed out")]
    Timeout,
}

impl GitRunner {
    pub(super) fn new(host: Arc<dyn ExecutionHost>, cwd: String, trace: GitCommandTrace) -> Self {
        Self { cwd, host, trace }
    }

    pub(super) fn for_cwd(&self, host: Arc<dyn ExecutionHost>, cwd: String) -> Self {
        Self::new(host, cwd, self.trace.clone())
    }

    pub(super) async fn checked(&self, args: Vec<String>) -> Result<String, GitError> {
        self.checked_with_options(args, GitRunOptions::default())
            .await
    }

    pub(super) async fn checked_with_options(
        &self,
        args: Vec<String>,
        options: GitRunOptions,
    ) -> Result<String, GitError> {
        let output = self.output(args, None, options, false).await?;
        if output.exit_code == 0 {
            return Ok(output.stdout);
        }
        Err(command_failure(output))
    }

    pub(super) async fn run(
        &self,
        args: Vec<String>,
        options: GitRunOptions,
    ) -> Result<HostCommandOutput, GitError> {
        self.output(args, None, options, false).await
    }

    pub(super) async fn read_bytes(
        &self,
        args: Vec<String>,
        options: GitRunOptions,
    ) -> Result<HostCommandOutput, GitError> {
        self.output(args, None, options, true).await
    }

    pub(super) async fn stream(
        &self,
        args: Vec<String>,
        options: GitRunOptions,
        observer: Arc<dyn HostCommandOutputObserver>,
    ) -> Result<HostCommandOutput, GitError> {
        let mut trace = self.trace.start(&args, &self.cwd);
        let mut command = command(&self.cwd, args);
        command
            .env
            .push(("GIT_OPTIONAL_LOCKS".to_owned(), "0".to_owned()));
        command.max_output_bytes = Some(options.max_output_bytes);
        command.output_observer = Some(observer);
        command.retain_stdout = false;
        command.disable_timeout = options.timeout_ms.is_none();
        command.timeout_ms = options.timeout_ms;
        let result = self.host.exec(command).await;
        finish_trace(&mut trace, &result);
        result.map_err(map_host_error)
    }

    pub(super) async fn probe_with_input(
        &self,
        args: Vec<String>,
        input: Vec<u8>,
        options: GitRunOptions,
    ) -> Result<HostCommandOutput, GitError> {
        self.output(args, Some(input), options, false).await
    }

    pub(super) async fn read(&self, args: Vec<String>) -> Result<String, GitError> {
        let output = self.read_probe(args).await?;
        if output.exit_code == 0 {
            return Ok(output.stdout);
        }
        Err(command_failure(output))
    }

    pub(super) async fn read_probe(
        &self,
        args: Vec<String>,
    ) -> Result<HostCommandOutput, GitError> {
        let mut trace = self.trace.start(&args, &self.cwd);
        let mut command = command(&self.cwd, args);
        command
            .env
            .push(("GIT_OPTIONAL_LOCKS".to_owned(), "0".to_owned()));
        let result = self.host.exec(command).await;
        finish_trace(&mut trace, &result);
        result.map_err(map_host_error)
    }

    async fn output(
        &self,
        args: Vec<String>,
        stdin: Option<Vec<u8>>,
        options: GitRunOptions,
        capture_stdout_bytes: bool,
    ) -> Result<HostCommandOutput, GitError> {
        self.output_with_cancel(args, stdin, options, capture_stdout_bytes, None)
            .await
    }

    async fn output_with_cancel(
        &self,
        args: Vec<String>,
        stdin: Option<Vec<u8>>,
        options: GitRunOptions,
        capture_stdout_bytes: bool,
        cancel: Option<tokio::sync::watch::Receiver<bool>>,
    ) -> Result<HostCommandOutput, GitError> {
        let mut trace = self.trace.start(&args, &self.cwd);
        let mut command = command(&self.cwd, args);
        command.cancel = cancel;
        command.capture_stdout_bytes = capture_stdout_bytes;
        command.stdin = stdin;
        command.max_output_bytes = Some(options.max_output_bytes);
        command.disable_timeout = options.timeout_ms.is_none();
        command.timeout_ms = options.timeout_ms;
        let result = self.host.exec(command).await;
        finish_trace(&mut trace, &result);
        result.map_err(map_host_error)
    }
}

fn finish_trace(trace: &mut GitCommandSpan, result: &Result<HostCommandOutput, HostCommandError>) {
    match result {
        Ok(output) if output.exit_code == 0 => trace.success(Some(output.exit_code)),
        Ok(output) => trace.failure("git exited unsuccessfully", Some(output.exit_code)),
        Err(error) if error.kind() == HostCommandErrorKind::Cancelled => {
            trace.interrupt("git command canceled")
        }
        Err(error) if error.kind() == HostCommandErrorKind::Stopped => trace.success(None),
        Err(error) if error.kind() == HostCommandErrorKind::OutputLimit => {
            trace.failure("git output limit exceeded", None)
        }
        Err(error) if error.kind() == HostCommandErrorKind::Timeout => {
            trace.failure("git command timed out", None)
        }
        Err(error) if error.kind() == HostCommandErrorKind::Spawn => {
            trace.failure("git command could not start", None)
        }
        Err(_) => trace.failure("git command wait failed", None),
    }
}

fn command(cwd: &str, args: Vec<String>) -> HostCommand {
    let mut command = HostCommand::new("git", args);
    command.cwd = Some(cwd.to_owned());
    command.env = vec![
        ("GIT_TERMINAL_PROMPT".to_owned(), "0".to_owned()),
        ("LC_ALL".to_owned(), "C".to_owned()),
    ];
    command.max_output_bytes = Some(DEFAULT_OUTPUT_LIMIT_BYTES);
    command.disable_timeout = true;
    command
}

fn map_host_error(error: HostCommandError) -> GitError {
    match error.kind() {
        HostCommandErrorKind::Cancelled => GitError::Canceled,
        HostCommandErrorKind::OutputLimit => GitError::OutputLimit,
        HostCommandErrorKind::Timeout => GitError::Timeout,
        HostCommandErrorKind::Stopped => GitError::Stopped,
        HostCommandErrorKind::Spawn | HostCommandErrorKind::Wait => {
            GitError::Command(error.to_string())
        }
    }
}

pub(super) fn command_failure(output: HostCommandOutput) -> GitError {
    let detail = if output.stderr.trim().is_empty() {
        output.stdout.trim()
    } else {
        output.stderr.trim()
    };
    GitError::Command(if detail.is_empty() {
        format!("git exited with status {}", output.exit_code)
    } else {
        detail.to_owned()
    })
}
