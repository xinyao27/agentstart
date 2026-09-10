use std::future::Future;
use std::pin::Pin;
use std::process::Stdio;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use super::model::{AppServerInvocation, GrantError};

const STDERR_TAIL_MAX_BYTES: usize = 8 * 1_024;
const STDOUT_LINE_MAX_BYTES: usize = 1_024 * 1_024;
const SHUTDOWN_GRACE: Duration = Duration::from_millis(1_500);
const KILL_GRACE: Duration = Duration::from_millis(1_000);
const RESPONSE_QUEUE_CAPACITY: usize = 32;

pub(super) struct AppServerRpc {
    next_request_id: u64,
    responses: mpsc::Receiver<ReaderEvent>,
    stdin: ChildStdin,
}

struct AppServerSession {
    child: Child,
    rpc: AppServerRpc,
    stderr: Arc<Mutex<Vec<u8>>>,
    stderr_task: JoinHandle<()>,
    stdout_task: JoinHandle<()>,
}

#[derive(Debug, Deserialize)]
struct RpcResponse {
    error: Option<RpcError>,
    id: Option<u64>,
    result: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct RpcError {
    code: Option<i64>,
    message: Option<String>,
}

enum ReaderEvent {
    End,
    Failure(String),
    OutputLimit,
    Response(RpcResponse),
}

pub(super) async fn run<T>(
    invocation: AppServerInvocation,
    operation: impl for<'a> FnOnce(
        &'a mut AppServerRpc,
    )
        -> Pin<Box<dyn Future<Output = Result<T, GrantError>> + Send + 'a>>,
) -> Result<T, GrantError> {
    let timeout_ms = invocation.timeout_ms;
    let command = invocation.command.clone();
    let mut session = AppServerSession::open(invocation).await?;
    let result = match tokio::time::timeout(Duration::from_millis(timeout_ms), async {
        session
            .rpc
            .request(
                "initialize",
                Some(json!({
                    "clientInfo": {
                        "name": "agentstart_desktop",
                        "title": "AgentStart",
                        "version": "0.0.0"
                    }
                })),
            )
            .await?;
        session.rpc.notify("initialized", None).await?;
        operation(&mut session.rpc).await
    })
    .await
    {
        Ok(result) => result,
        Err(_) => Err(GrantError::Timeout(format!(
            "codex app-server session exceeded {timeout_ms}ms ({command})"
        ))),
    };
    session.finish(result).await
}

impl AppServerSession {
    async fn open(invocation: AppServerInvocation) -> Result<Self, GrantError> {
        if invocation.command.is_empty() {
            return Err(GrantError::Message(
                "codex app-server command is empty".to_owned(),
            ));
        }
        let mut command = Command::new(&invocation.command);
        command
            .args(invocation.args)
            .envs(invocation.env)
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for key in invocation.env_to_delete {
            command.env_remove(key);
        }
        #[cfg(windows)]
        command.creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW);
        let mut child = command.spawn().map_err(|error| {
            GrantError::Message(format!(
                "failed to start codex app-server ({}): {error}",
                invocation.command
            ))
        })?;
        let stdin = child.stdin.take().ok_or_else(|| {
            GrantError::Message("codex app-server stdin is unavailable".to_owned())
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            GrantError::Message("codex app-server stdout is unavailable".to_owned())
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            GrantError::Message("codex app-server stderr is unavailable".to_owned())
        })?;
        let stderr_tail = Arc::new(Mutex::new(Vec::new()));
        let stderr_task = tokio::spawn(read_stderr(stderr, stderr_tail.clone()));
        let (responses, response_receiver) = mpsc::channel(RESPONSE_QUEUE_CAPACITY);
        let stdout_task = tokio::spawn(read_stdout(stdout, responses));
        Ok(Self {
            child,
            rpc: AppServerRpc {
                next_request_id: 1,
                responses: response_receiver,
                stdin,
            },
            stderr: stderr_tail,
            stderr_task,
            stdout_task,
        })
    }

    async fn finish<T>(mut self, result: Result<T, GrantError>) -> Result<T, GrantError> {
        let force_kill = matches!(
            result,
            Err(GrantError::OutputLimit(_) | GrantError::Timeout(_))
        );
        drop(self.rpc);
        let should_kill = force_kill
            || tokio::time::timeout(SHUTDOWN_GRACE, self.child.wait())
                .await
                .is_err();
        if should_kill {
            kill_process_tree(&mut self.child).await;
        }
        if self.child.try_wait().ok().flatten().is_none() {
            let _ = tokio::time::timeout(KILL_GRACE, self.child.wait()).await;
        }
        finish_reader(&mut self.stdout_task).await;
        finish_reader(&mut self.stderr_task).await;
        let stderr = String::from_utf8_lossy(&lock(&self.stderr)).into_owned();
        match result {
            Err(GrantError::EarlyExit) => Err(classify_early_exit(&stderr)),
            Err(GrantError::Message(_)) if indicates_missing_app_server(&stderr) => {
                Err(GrantError::Unsupported(format!(
                    "codex CLI does not support the app-server subcommand: {}",
                    tail_text(&stderr)
                )))
            }
            result => result,
        }
    }
}

impl AppServerRpc {
    pub(super) async fn request(
        &mut self,
        method: &str,
        params: Option<Value>,
    ) -> Result<Value, GrantError> {
        let id = self.next_request_id;
        self.next_request_id = self.next_request_id.saturating_add(1);
        let mut payload = serde_json::Map::new();
        payload.insert("method".to_owned(), Value::String(method.to_owned()));
        payload.insert("id".to_owned(), Value::from(id));
        if let Some(params) = params {
            payload.insert("params".to_owned(), params);
        }
        self.send(Value::Object(payload)).await?;
        loop {
            match self.responses.recv().await {
                Some(ReaderEvent::Response(response)) if response.id == Some(id) => {
                    if let Some(error) = response.error {
                        let message = error.message.unwrap_or_else(|| "unknown error".to_owned());
                        if error.code == Some(-32601)
                            || message.to_ascii_lowercase().contains("method not found")
                        {
                            return Err(GrantError::Unsupported(format!(
                                "codex app-server does not support {method}: {message}"
                            )));
                        }
                        return Err(GrantError::Message(format!(
                            "codex app-server {method} failed: {message}"
                        )));
                    }
                    return Ok(response.result.unwrap_or(Value::Null));
                }
                Some(ReaderEvent::Response(_)) => {}
                Some(ReaderEvent::Failure(message)) => {
                    return Err(GrantError::Message(message));
                }
                Some(ReaderEvent::OutputLimit) => {
                    return Err(GrantError::OutputLimit(
                        "codex app-server emitted an oversized JSONL response".to_owned(),
                    ));
                }
                Some(ReaderEvent::End) | None => return Err(GrantError::EarlyExit),
            }
        }
    }

    pub(super) async fn notify(
        &mut self,
        method: &str,
        params: Option<Value>,
    ) -> Result<(), GrantError> {
        let mut payload = serde_json::Map::new();
        payload.insert("method".to_owned(), Value::String(method.to_owned()));
        if let Some(params) = params {
            payload.insert("params".to_owned(), params);
        }
        self.send(Value::Object(payload)).await
    }

    async fn send(&mut self, payload: Value) -> Result<(), GrantError> {
        let mut line = serde_json::to_vec(&payload)?;
        line.push(b'\n');
        self.stdin.write_all(&line).await?;
        self.stdin.flush().await?;
        Ok(())
    }
}

async fn read_stdout(mut stdout: impl AsyncRead + Unpin, sender: mpsc::Sender<ReaderEvent>) {
    let mut pending = Vec::new();
    let mut chunk = vec![0_u8; 32 * 1_024];
    loop {
        let read = match stdout.read(&mut chunk).await {
            Ok(0) => {
                drop(sender.send(ReaderEvent::End).await);
                return;
            }
            Ok(read) => read,
            Err(error) => {
                drop(sender.send(ReaderEvent::Failure(error.to_string())).await);
                return;
            }
        };
        pending.extend_from_slice(&chunk[..read]);
        while let Some(newline) = pending.iter().position(|byte| *byte == b'\n') {
            if newline > STDOUT_LINE_MAX_BYTES {
                drop(sender.send(ReaderEvent::OutputLimit).await);
                return;
            }
            let remainder = pending.split_off(newline + 1);
            pending.truncate(newline);
            let line = trim_ascii(&pending);
            if !line.is_empty()
                && let Ok(response) = serde_json::from_slice::<RpcResponse>(line)
                && response.id.is_some()
                && sender.send(ReaderEvent::Response(response)).await.is_err()
            {
                return;
            }
            pending = remainder;
        }
        if pending.len() > STDOUT_LINE_MAX_BYTES {
            drop(sender.send(ReaderEvent::OutputLimit).await);
            return;
        }
    }
}

async fn read_stderr(mut stderr: impl AsyncRead + Unpin, tail: Arc<Mutex<Vec<u8>>>) {
    let mut chunk = vec![0_u8; 8 * 1_024];
    loop {
        let read = match stderr.read(&mut chunk).await {
            Ok(0) | Err(_) => return,
            Ok(read) => read,
        };
        let mut tail = lock(&tail);
        tail.extend_from_slice(&chunk[..read]);
        if tail.len() > STDERR_TAIL_MAX_BYTES {
            let excess = tail.len() - STDERR_TAIL_MAX_BYTES;
            tail.drain(..excess);
        }
    }
}

async fn finish_reader(task: &mut JoinHandle<()>) {
    if tokio::time::timeout(KILL_GRACE, &mut *task).await.is_err() {
        task.abort();
        let _ = task.await;
    }
}

async fn kill_process_tree(child: &mut Child) {
    #[cfg(windows)]
    if let Some(pid) = child.id() {
        let mut command = Command::new("taskkill");
        command
            .args(["/pid", &pid.to_string(), "/t", "/f"])
            .creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if command.status().await.is_ok_and(|status| status.success()) {
            let _ = tokio::time::timeout(KILL_GRACE, child.wait()).await;
            return;
        }
    }
    let _ = child.kill().await;
}

fn classify_early_exit(stderr: &str) -> GrantError {
    if indicates_missing_app_server(stderr) {
        return GrantError::Unsupported(format!(
            "codex CLI does not support the app-server subcommand: {}",
            tail_text(stderr)
        ));
    }
    GrantError::Message(format!(
        "codex app-server exited before completing the session{}",
        if stderr.is_empty() {
            String::new()
        } else {
            format!(": {}", tail_text(stderr))
        }
    ))
}

fn indicates_missing_app_server(stderr: &str) -> bool {
    stderr.lines().any(|line| {
        let line = line.to_ascii_lowercase();
        line.contains("app-server")
            && [
                "unrecognized subcommand",
                "unexpected argument",
                "invalid subcommand",
            ]
            .iter()
            .any(|signal| line.contains(signal))
    })
}

fn tail_text(value: &str) -> String {
    value.trim().chars().take(400).collect()
}

fn trim_ascii(mut bytes: &[u8]) -> &[u8] {
    while bytes.first().is_some_and(u8::is_ascii_whitespace) {
        bytes = &bytes[1..];
    }
    while bytes.last().is_some_and(u8::is_ascii_whitespace) {
        bytes = &bytes[..bytes.len() - 1];
    }
    bytes
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
