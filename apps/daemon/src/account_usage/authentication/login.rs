use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt as _};
use tokio::process::{Child, Command};

use super::{AccountsError, CODEX_LOGIN_TIMEOUT, COMMAND_EXIT_GRACE, read_bounded};

pub(super) async fn run_codex(
    mut command: Command,
    auth_path: &Path,
    initial_auth: Option<&[u8]>,
    detect_auth_write: bool,
    call_cancelled: impl Future<Output = ()>,
) -> Result<(), AccountsError> {
    configure_process_group(&mut command);
    let mut child = command
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| AccountsError::LoginUnavailable)?;
    let started = tokio::time::Instant::now();
    let mut authenticated_at = None;
    let mut cancelled = Box::pin(call_cancelled);
    loop {
        if detect_auth_write
            && authenticated_at
                .is_some_and(|at: tokio::time::Instant| at.elapsed() >= Duration::from_secs(5))
        {
            terminate_process_tree(&mut child).await;
            return Ok(());
        }
        if started.elapsed() >= CODEX_LOGIN_TIMEOUT {
            terminate_process_tree(&mut child).await;
            return Err(AccountsError::LoginTimedOut);
        }
        tokio::select! {
            result = child.wait() => {
                return match result {
                    Ok(status) if status.success() => Ok(()),
                    Ok(_) | Err(_) => Err(AccountsError::LoginFailed),
                };
            }
            () = &mut cancelled => {
                terminate_process_tree(&mut child).await;
                return Err(AccountsError::LoginCancelled);
            }
            () = tokio::time::sleep(Duration::from_millis(400)) => {
                if detect_auth_write
                    && authenticated_at.is_none()
                    && read_bounded(auth_path)
                        .await?
                        .as_deref()
                        .is_some_and(|contents| Some(contents) != initial_auth && !contents.is_empty())
                {
                    authenticated_at = Some(tokio::time::Instant::now());
                }
            }
        }
    }
}

pub(super) async fn run(
    mut command: Command,
    timeout: Duration,
    explicit_cancelled: impl Future<Output = ()>,
    call_cancelled: impl Future<Output = ()>,
) -> Result<(), AccountsError> {
    configure_process_group(&mut command);
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| AccountsError::LoginUnavailable)?;
    let (denied_sender, mut denied) = tokio::sync::mpsc::channel(1);
    if let Some(stdout) = child.stdout.take() {
        tokio::spawn(scan_access_denied(stdout, denied_sender.clone()));
    }
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(scan_access_denied(stderr, denied_sender));
    }
    let outcome = tokio::select! {
        result = child.wait() => result.map(Some).map_err(|_| AccountsError::LoginFailed),
        () = tokio::time::sleep(timeout) => Ok(None),
        () = explicit_cancelled => Err(AccountsError::LoginCancelled),
        () = call_cancelled => Err(AccountsError::LoginCancelled),
        Some(()) = denied.recv() => Err(AccountsError::LoginFailed),
    };
    match outcome {
        Ok(Some(status)) if status.success() => Ok(()),
        Ok(Some(_)) => Err(AccountsError::LoginFailed),
        Ok(None) => {
            terminate_process_tree(&mut child).await;
            Err(AccountsError::LoginTimedOut)
        }
        Err(error) => {
            terminate_process_tree(&mut child).await;
            Err(error)
        }
    }
}

async fn scan_access_denied(
    mut reader: impl AsyncRead + Unpin,
    sender: tokio::sync::mpsc::Sender<()>,
) {
    let mut buffer = [0_u8; 512];
    let mut tail = Vec::with_capacity(1024);
    loop {
        let Ok(read) = reader.read(&mut buffer).await else {
            return;
        };
        if read == 0 {
            return;
        }
        tail.extend(buffer[..read].iter().map(u8::to_ascii_lowercase));
        if contains_authorization_denial(&tail) {
            let _ = sender.send(()).await;
            return;
        }
        if tail.len() > 1024 {
            tail.drain(..tail.len() - 128);
        }
    }
}

fn contains_authorization_denial(value: &[u8]) -> bool {
    const PATTERNS: [&[u8]; 10] = [
        b"access_denied",
        b"authorization denied",
        b"authorization was denied",
        b"authorization request denied",
        b"authorization request was denied",
        b"sign-in denied",
        b"sign-in was denied",
        b"signin denied",
        b"signin was denied",
        b"login denied",
    ];
    PATTERNS.iter().any(|pattern| {
        value
            .windows(pattern.len())
            .any(|candidate| candidate == *pattern)
    }) || value
        .windows(b"login was denied".len())
        .any(|candidate| candidate == b"login was denied")
}

#[cfg(unix)]
fn configure_process_group(command: &mut Command) {
    use std::os::unix::process::CommandExt as _;
    command.as_std_mut().process_group(0);
}

#[cfg(not(unix))]
fn configure_process_group(_command: &mut Command) {}

async fn terminate_process_tree(child: &mut Child) {
    let pid = child.id();
    #[cfg(unix)]
    if let Some(pid) = pid.and_then(|pid| i32::try_from(pid).ok()) {
        let _ =
            nix::sys::signal::killpg(nix::unistd::Pid::from_raw(pid), nix::sys::signal::SIGTERM);
    }
    #[cfg(windows)]
    if let Some(pid) = pid {
        let _ = tokio::time::timeout(
            COMMAND_EXIT_GRACE,
            Command::new("taskkill.exe")
                .args(["/pid", &pid.to_string(), "/t", "/f"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status(),
        )
        .await;
    }
    let _ = child.start_kill();
    let _ = tokio::time::timeout(COMMAND_EXIT_GRACE, child.wait()).await;
}
