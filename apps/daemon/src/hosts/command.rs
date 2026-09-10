use std::io;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::sync::{mpsc, watch};

use super::model::{
    HostCommand, HostCommandError, HostCommandErrorKind, HostCommandOutput,
    HostCommandOutputObserver, HostCommandOutputStream, HostCommandStreamControl,
};

const DEFAULT_COMMAND_TIMEOUT_MS: u64 = 30_000;
pub(super) async fn run(request: HostCommand) -> Result<HostCommandOutput, HostCommandError> {
    let HostCommand {
        args,
        cancel,
        capture_stdout_bytes,
        command: executable,
        cwd,
        disable_timeout,
        env,
        kill_process_tree,
        max_output_bytes,
        retain_stderr,
        retain_stdout,
        stdin,
        output_observer,
        timeout_ms,
    } = request;
    if executable.is_empty() {
        return Err(HostCommandError::new(
            HostCommandErrorKind::Spawn,
            "host_command_empty",
        ));
    }
    let mut command = Command::new(&executable);
    command
        .args(args)
        .envs(env)
        .kill_on_drop(true)
        .stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stderr(Stdio::piped())
        .stdout(Stdio::piped());
    let cwd = cwd.filter(|cwd| !cwd.is_empty());
    if let Some(cwd) = &cwd {
        command.current_dir(cwd);
    }
    #[cfg(unix)]
    if kill_process_tree {
        // Why: wrappers such as npx keep the process doing the write below the
        // direct child. A dedicated group lets cancellation stop the writer too.
        command.process_group(0);
    }
    #[cfg(windows)]
    command.creation_flags(
        windows_sys::Win32::System::Threading::CREATE_NO_WINDOW
            | if kill_process_tree {
                windows_sys::Win32::System::Threading::CREATE_NEW_PROCESS_GROUP
            } else {
                0
            },
    );
    let mut child = command.spawn().map_err(|error| {
        HostCommandError::new(
            HostCommandErrorKind::Spawn,
            spawn_failure(&executable, cwd.as_deref(), &error),
        )
    })?;
    let stdout = child.stdout.take().ok_or_else(|| {
        HostCommandError::new(
            HostCommandErrorKind::Spawn,
            "host_command_stdout_unavailable",
        )
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        HostCommandError::new(
            HostCommandErrorKind::Spawn,
            "host_command_stderr_unavailable",
        )
    })?;
    let child_stdin = child.stdin.take();
    let stdout_capture = Arc::new(Mutex::new(Vec::new()));
    let stderr_capture = Arc::new(Mutex::new(Vec::new()));
    let output_bytes = Arc::new(AtomicUsize::new(0));
    let (termination_sender, mut terminations) = mpsc::unbounded_channel();
    let operation = async {
        tokio::try_join!(
            read_output(
                stdout,
                max_output_bytes,
                retain_stdout,
                OutputAccounting {
                    capture: stdout_capture.clone(),
                    output_bytes: output_bytes.clone(),
                },
                output_observer.clone(),
                HostCommandOutputStream::Stdout,
                termination_sender.clone(),
            ),
            read_output(
                stderr,
                max_output_bytes,
                retain_stderr,
                OutputAccounting {
                    capture: stderr_capture.clone(),
                    output_bytes,
                },
                output_observer,
                HostCommandOutputStream::Stderr,
                termination_sender,
            ),
            write_input(child_stdin, stdin)
        )
        .map(|_| ())
        .map_err(|error| {
            HostCommandError::new(
                HostCommandErrorKind::Wait,
                format!("host command I/O failed: {error}"),
            )
        })
    };
    let outcome = {
        let completion = async {
            let (operation, status) = tokio::join!(operation, child.wait());
            operation?;
            status.map_err(|error| {
                HostCommandError::new(
                    HostCommandErrorKind::Wait,
                    format!("failed to wait for {executable}: {error}"),
                )
            })
        };
        let cancellation = cancellation_requested(cancel);
        tokio::pin!(completion);
        tokio::pin!(cancellation);
        if disable_timeout {
            tokio::select! {
                biased;
                Some(reason) = terminations.recv() => CommandOutcome::Terminated(reason),
                result = &mut completion => CommandOutcome::Completed(result),
                _ = &mut cancellation => CommandOutcome::Cancelled,
            }
        } else {
            let timeout = tokio::time::sleep(Duration::from_millis(
                timeout_ms.unwrap_or(DEFAULT_COMMAND_TIMEOUT_MS),
            ));
            tokio::pin!(timeout);
            tokio::select! {
                biased;
                Some(reason) = terminations.recv() => CommandOutcome::Terminated(reason),
                result = &mut completion => CommandOutcome::Completed(result),
                _ = &mut timeout => CommandOutcome::Timeout,
                _ = &mut cancellation => CommandOutcome::Cancelled,
            }
        }
    };
    match outcome {
        CommandOutcome::Completed(Ok(status)) => {
            let stdout_bytes = take_capture(&stdout_capture);
            let stderr_bytes = take_capture(&stderr_capture);
            let (stdout, stdout_bytes) = if capture_stdout_bytes {
                (String::new(), Some(stdout_bytes))
            } else {
                (decode_output(stdout_bytes), None)
            };
            Ok(HostCommandOutput {
                exit_code: status.code().unwrap_or(-1),
                stderr: decode_output(stderr_bytes),
                stdout,
                stdout_bytes,
            })
        }
        CommandOutcome::Completed(Err(error)) => {
            terminate(&mut child, kill_process_tree).await;
            Err(error.with_partial_stdout(take_capture(&stdout_capture)))
        }
        CommandOutcome::Terminated(CommandTermination::OutputLimit) => {
            terminate(&mut child, kill_process_tree).await;
            Err(HostCommandError::new(
                HostCommandErrorKind::OutputLimit,
                format!(
                    "host command output exceeded {} bytes",
                    max_output_bytes.unwrap_or_default()
                ),
            )
            .with_partial_stdout(take_capture(&stdout_capture)))
        }
        CommandOutcome::Terminated(CommandTermination::Observer) => {
            terminate(&mut child, kill_process_tree).await;
            Err(
                HostCommandError::new(HostCommandErrorKind::Stopped, "host_command_stopped")
                    .with_partial_stdout(take_capture(&stdout_capture)),
            )
        }
        CommandOutcome::Timeout => {
            terminate(&mut child, kill_process_tree).await;
            Err(HostCommandError::new(
                HostCommandErrorKind::Timeout,
                format!(
                    "{executable} timed out after {}ms",
                    timeout_ms.unwrap_or(DEFAULT_COMMAND_TIMEOUT_MS)
                ),
            )
            .with_partial_stdout(take_capture(&stdout_capture)))
        }
        CommandOutcome::Cancelled => {
            terminate(&mut child, kill_process_tree).await;
            Err(
                HostCommandError::new(HostCommandErrorKind::Cancelled, "host_command_cancelled")
                    .with_partial_stdout(take_capture(&stdout_capture)),
            )
        }
    }
}

// Why: a missing working directory spawns as the same ENOENT as a missing
// executable, so naming the executable sends readers hunting for an uninstalled
// git that is in fact installed. Remote hosts fold their cwd into the transport
// command, so this path only ever holds a local directory.
fn spawn_failure(executable: &str, cwd: Option<&str>, error: &io::Error) -> String {
    if error.kind() == io::ErrorKind::NotFound
        && let Some(cwd) = cwd.filter(|cwd| !Path::new(cwd).is_dir())
    {
        return format!("failed to start {executable}: working directory {cwd} no longer exists");
    }
    format!("failed to start {executable}: {error}")
}

async fn terminate(child: &mut tokio::process::Child, process_tree: bool) {
    if process_tree {
        #[cfg(unix)]
        if let Some(pid) = child.id().and_then(|pid| i32::try_from(pid).ok()) {
            let _ = nix::sys::signal::killpg(
                nix::unistd::Pid::from_raw(pid),
                nix::sys::signal::Signal::SIGKILL,
            );
        }
        #[cfg(windows)]
        if let Some(pid) = child.id() {
            let mut command = Command::new("taskkill");
            command
                .args(["/pid", &pid.to_string(), "/t", "/f"])
                .creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            let _ = command.status().await;
        }
    }
    let _ = child.kill().await;
    let _ = child.wait().await;
}

enum CommandOutcome {
    Cancelled,
    Completed(Result<std::process::ExitStatus, HostCommandError>),
    Terminated(CommandTermination),
    Timeout,
}

fn decode_output(bytes: Vec<u8>) -> String {
    match String::from_utf8(bytes) {
        Ok(output) => output,
        Err(error) => String::from_utf8_lossy(error.as_bytes()).into_owned(),
    }
}

struct OutputAccounting {
    capture: Arc<Mutex<Vec<u8>>>,
    output_bytes: Arc<AtomicUsize>,
}

#[derive(Clone, Copy)]
enum CommandTermination {
    Observer,
    OutputLimit,
}

async fn cancellation_requested(cancel: Option<watch::Receiver<bool>>) {
    let Some(mut cancel) = cancel else {
        return std::future::pending::<()>().await;
    };
    if *cancel.borrow() {
        return;
    }
    while cancel.changed().await.is_ok() {
        if *cancel.borrow() {
            return;
        }
    }
    std::future::pending::<()>().await;
}

async fn write_input(
    stdin: Option<tokio::process::ChildStdin>,
    bytes: Option<Vec<u8>>,
) -> Result<(), io::Error> {
    let (Some(mut stdin), Some(bytes)) = (stdin, bytes) else {
        return Ok(());
    };
    stdin.write_all(&bytes).await?;
    stdin.shutdown().await
}

async fn read_output(
    mut reader: impl AsyncRead + Unpin,
    max_output_bytes: Option<usize>,
    retain: bool,
    accounting: OutputAccounting,
    observer: Option<Arc<dyn HostCommandOutputObserver>>,
    stream: HostCommandOutputStream,
    termination: mpsc::UnboundedSender<CommandTermination>,
) -> Result<(), io::Error> {
    let mut buffer = vec![0_u8; 32 * 1_024];
    loop {
        let read = reader.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        let (accepted, reached_limit) =
            reserve_output_bytes(&accounting.output_bytes, max_output_bytes, read);
        if retain {
            let mut bytes = lock(&accounting.capture);
            bytes.extend_from_slice(&buffer[..accepted]);
        }
        if observer.as_ref().is_some_and(|observer| {
            observer.observe(stream, &buffer[..accepted]) == HostCommandStreamControl::Stop
        }) {
            let _ = termination.send(CommandTermination::Observer);
            break;
        }
        if reached_limit {
            let _ = termination.send(CommandTermination::OutputLimit);
            break;
        }
    }
    Ok(())
}

fn reserve_output_bytes(
    output_bytes: &AtomicUsize,
    maximum: Option<usize>,
    requested: usize,
) -> (usize, bool) {
    let Some(maximum) = maximum else {
        return (requested, false);
    };
    let limit = maximum.saturating_add(1);
    loop {
        let current = output_bytes.load(Ordering::Acquire);
        if current >= limit {
            return (0, true);
        }
        let accepted = requested.min(limit - current);
        let next = current + accepted;
        if output_bytes
            .compare_exchange_weak(current, next, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
        {
            return (accepted, next >= limit);
        }
    }
}

fn take_capture(capture: &Mutex<Vec<u8>>) -> Vec<u8> {
    std::mem::take(&mut *lock(capture))
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
