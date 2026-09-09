use std::env;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufStream};
use tokio::net::UnixStream;
use tokio::process::{Child, Command};
use tokio::time::{sleep, timeout};

use super::ComputerError;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const CALL_TIMEOUT: Duration = Duration::from_secs(60);
const PROTOCOL_VERSION: u64 = 1;

pub(super) struct MacProvider {
    capabilities: Option<Value>,
    child: Child,
    next_id: u64,
    socket: BufStream<UnixStream>,
    socket_directory: PathBuf,
    token: String,
}

impl MacProvider {
    pub(super) async fn start(user_data_path: &Path) -> Result<Self, ComputerError> {
        ensure_supported_macos().await?;
        let executable = resolve_executable(user_data_path).ok_or_else(|| {
            ComputerError::domain("accessibility_error", "Yiru Computer Use.app was not found")
        })?;
        let socket_directory = create_socket_directory().await?;
        let socket_path = socket_directory.join("provider.sock");
        let token_path = socket_directory.join("provider.token");
        let token = random_token()?;
        write_private_file(&token_path, token.as_bytes()).await?;
        let mut command = Command::new(&executable);
        command
            .arg("--agent")
            .arg(&socket_path)
            .arg("--token-file")
            .arg(&token_path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        let child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                remove_directory(&socket_directory).await;
                return Err(ComputerError::domain(
                    "accessibility_error",
                    format!("native macOS helper app failed to start: {error}"),
                ));
            }
        };
        let stream = match connect(&socket_path).await {
            Ok(stream) => stream,
            Err(error) => {
                remove_directory(&socket_directory).await;
                return Err(error);
            }
        };
        let _ = tokio::fs::remove_file(&token_path).await;
        Ok(Self {
            capabilities: None,
            child,
            next_id: 1,
            socket: BufStream::new(stream),
            socket_directory,
            token,
        })
    }

    pub(super) async fn call(
        &mut self,
        method: &str,
        params: Value,
    ) -> Result<Value, ComputerError> {
        if method == "handshake"
            && let Some(capabilities) = &self.capabilities
        {
            return Ok(capabilities.clone());
        }
        if method != "handshake" {
            self.ensure_compatible().await?;
            if method == "listWindows" {
                self.ensure_capability("/supports/windows/list", "windows.list")?;
            }
            self.ensure_action_supported(method)?;
        }
        let output = self.send(method, params).await?;
        if method == "handshake" {
            validate_protocol(&output)?;
            self.capabilities = Some(output.clone());
        }
        Ok(output)
    }

    async fn ensure_compatible(&mut self) -> Result<(), ComputerError> {
        if self.capabilities.is_some() {
            return Ok(());
        }
        let capabilities = self.send("handshake", json!({})).await?;
        validate_protocol(&capabilities)?;
        self.capabilities = Some(capabilities);
        Ok(())
    }

    fn ensure_action_supported(&self, method: &str) -> Result<(), ComputerError> {
        let Some(capability) = action_capability(method) else {
            return Ok(());
        };
        if self
            .capabilities
            .as_ref()
            .and_then(|value| value.pointer(&format!("/supports/actions/{capability}")))
            .and_then(Value::as_bool)
            == Some(true)
        {
            return Ok(());
        }
        Err(ComputerError::domain(
            "unsupported_capability",
            format!("native macOS provider does not support actions.{capability}"),
        ))
    }

    fn ensure_capability(&self, pointer: &str, name: &str) -> Result<(), ComputerError> {
        if self
            .capabilities
            .as_ref()
            .and_then(|value| value.pointer(pointer))
            .and_then(Value::as_bool)
            == Some(true)
        {
            return Ok(());
        }
        Err(ComputerError::domain(
            "unsupported_capability",
            format!("native macOS provider does not support {name}"),
        ))
    }

    async fn send(&mut self, method: &str, params: Value) -> Result<Value, ComputerError> {
        let id = self.next_id;
        self.next_id += 1;
        let mut payload = serde_json::to_vec(&json!({
            "id": id,
            "method": method,
            "params": params,
            "token": self.token,
        }))
        .map_err(|error| ComputerError::domain("invalid_argument", error.to_string()))?;
        payload.push(b'\n');
        timeout(CALL_TIMEOUT, self.socket.write_all(&payload))
            .await
            .map_err(|_| timeout_error(method))?
            .map_err(socket_error)?;
        timeout(CALL_TIMEOUT, self.socket.flush())
            .await
            .map_err(|_| timeout_error(method))?
            .map_err(socket_error)?;
        let mut line = String::new();
        let bytes = timeout(CALL_TIMEOUT, self.socket.read_line(&mut line))
            .await
            .map_err(|_| timeout_error(method))?
            .map_err(socket_error)?;
        if bytes == 0 {
            return Err(ComputerError::domain(
                "accessibility_error",
                "native macOS helper app connection closed",
            ));
        }
        parse_response(id, &line)
    }

    pub(super) async fn shutdown(&mut self) {
        let _ = self.send("terminate", json!({})).await;
        if timeout(Duration::from_secs(2), self.child.wait())
            .await
            .is_err()
        {
            let _ = self.child.kill().await;
        }
        remove_directory(&self.socket_directory).await;
    }
}

impl Drop for MacProvider {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
        let _ = std::fs::remove_dir_all(&self.socket_directory);
    }
}

fn parse_response(id: u64, line: &str) -> Result<Value, ComputerError> {
    let response: Value = serde_json::from_str(line).map_err(|error| {
        ComputerError::domain(
            "accessibility_error",
            format!("native macOS provider returned invalid JSON: {error}"),
        )
    })?;
    if response.get("id").and_then(Value::as_u64) != Some(id) {
        return Err(ComputerError::domain(
            "accessibility_error",
            "native macOS provider returned an unexpected response id",
        ));
    }
    if response.get("ok").and_then(Value::as_bool) == Some(true) {
        return Ok(response.get("result").cloned().unwrap_or(Value::Null));
    }
    let code = response
        .pointer("/error/code")
        .and_then(Value::as_str)
        .and_then(known_error_code)
        .unwrap_or("accessibility_error");
    let message = response
        .pointer("/error/message")
        .and_then(Value::as_str)
        .unwrap_or("native macOS provider request failed");
    Err(ComputerError::domain(code, message))
}

fn known_error_code(code: &str) -> Option<&'static str> {
    match code {
        "app_not_found" => Some("app_not_found"),
        "app_blocked" => Some("app_blocked"),
        "window_not_found" => Some("window_not_found"),
        "window_not_focused" => Some("window_not_focused"),
        "window_stale" => Some("window_stale"),
        "provider_incompatible" => Some("provider_incompatible"),
        "unsupported_capability" => Some("unsupported_capability"),
        "permission_denied" => Some("permission_denied"),
        "element_not_found" => Some("element_not_found"),
        "element_not_clickable" => Some("element_not_clickable"),
        "action_not_supported" => Some("action_not_supported"),
        "value_not_settable" => Some("value_not_settable"),
        "invalid_argument" => Some("invalid_argument"),
        "action_timeout" => Some("action_timeout"),
        "screenshot_failed" => Some("screenshot_failed"),
        "accessibility_error" => Some("accessibility_error"),
        _ => None,
    }
}

fn action_capability(method: &str) -> Option<&str> {
    match method {
        "click" => Some("click"),
        "performSecondaryAction" => Some("performAction"),
        "scroll" => Some("scroll"),
        "drag" => Some("drag"),
        "typeText" => Some("typeText"),
        "pressKey" => Some("pressKey"),
        "hotkey" => Some("hotkey"),
        "pasteText" => Some("pasteText"),
        "setValue" => Some("setValue"),
        _ => None,
    }
}

fn validate_protocol(capabilities: &Value) -> Result<(), ComputerError> {
    let actual = capabilities.get("protocolVersion").and_then(Value::as_u64);
    if actual == Some(PROTOCOL_VERSION) {
        return Ok(());
    }
    Err(ComputerError::domain(
        "provider_incompatible",
        format!(
            "native macOS provider protocol {} is incompatible with required protocol {PROTOCOL_VERSION}",
            actual.map_or_else(|| "unknown".to_owned(), |value| value.to_string())
        ),
    ))
}

async fn ensure_supported_macos() -> Result<(), ComputerError> {
    let output = Command::new("/usr/bin/sw_vers")
        .arg("-productVersion")
        .output()
        .await
        .map_err(|error| ComputerError::domain("unsupported_capability", error.to_string()))?;
    let version = String::from_utf8_lossy(&output.stdout);
    let major = version
        .trim()
        .split('.')
        .next()
        .and_then(|value| value.parse::<u32>().ok());
    if output.status.success() && major.is_some_and(|value| value >= 14) {
        Ok(())
    } else {
        Err(ComputerError::domain(
            "unsupported_capability",
            "native computer-use requires macOS 14 or newer",
        ))
    }
}

fn resolve_executable(user_data_path: &Path) -> Option<PathBuf> {
    resolve_app(user_data_path)
        .map(|path| {
            path.join("Contents")
                .join("MacOS")
                .join("yiru-computer-use-macos")
        })
        .filter(|path| path.is_file())
}

pub(super) fn resolve_app(user_data_path: &Path) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(override_path) = env::var_os("YIRU_COMPUTER_MACOS_HELPER_APP_PATH") {
        candidates.push(PathBuf::from(override_path));
    }
    candidates.push(
        user_data_path
            .join("native")
            .join("computer-use")
            .join("Yiru Computer Use.app"),
    );
    if let Ok(executable) = env::current_exe()
        && let Some(directory) = executable.parent()
    {
        candidates.push(
            directory
                .join("..")
                .join("Resources")
                .join("Yiru Computer Use.app"),
        );
        candidates.push(
            directory
                .join("..")
                .join("libexec")
                .join("Yiru Computer Use.app"),
        );
    }
    if let Ok(cwd) = env::current_dir() {
        candidates.push(
            cwd.join("apps")
                .join("computer-use-macos")
                .join(".build")
                .join("release")
                .join("Yiru Computer Use.app"),
        );
    }
    candidates.into_iter().find(|path| path.is_dir())
}

async fn connect(socket_path: &Path) -> Result<UnixStream, ComputerError> {
    let deadline = tokio::time::Instant::now() + CONNECT_TIMEOUT;
    let mut last_error = None;
    while tokio::time::Instant::now() < deadline {
        match UnixStream::connect(socket_path).await {
            Ok(stream) => return Ok(stream),
            Err(error) => last_error = Some(error),
        }
        sleep(Duration::from_millis(100)).await;
    }
    Err(ComputerError::domain(
        "action_timeout",
        format!(
            "native macOS helper app did not open its socket: {}",
            last_error.map_or_else(|| "timed out".to_owned(), |error| error.to_string())
        ),
    ))
}

async fn create_socket_directory() -> Result<PathBuf, ComputerError> {
    for _ in 0..8 {
        let path = env::temp_dir().join(format!("yiru-computer-use-{}", random_token()?));
        match tokio::fs::create_dir(&path).await {
            Ok(()) => {
                set_private_permissions(&path, true)?;
                return Ok(path);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(socket_error(error)),
        }
    }
    Err(ComputerError::domain(
        "accessibility_error",
        "could not allocate computer-use socket directory",
    ))
}

async fn write_private_file(path: &Path, contents: &[u8]) -> Result<(), ComputerError> {
    tokio::fs::write(path, contents)
        .await
        .map_err(socket_error)?;
    set_private_permissions(path, false)
}

#[cfg(unix)]
fn set_private_permissions(path: &Path, directory: bool) -> Result<(), ComputerError> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(
        path,
        std::fs::Permissions::from_mode(if directory { 0o700 } else { 0o600 }),
    )
    .map_err(socket_error)
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path, _directory: bool) -> Result<(), ComputerError> {
    Ok(())
}

fn random_token() -> Result<String, ComputerError> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).map_err(|error| {
        ComputerError::domain(
            "accessibility_error",
            format!("random token failed: {error}"),
        )
    })?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn socket_error(error: std::io::Error) -> ComputerError {
    ComputerError::domain("accessibility_error", error.to_string())
}

fn timeout_error(method: &str) -> ComputerError {
    ComputerError::domain(
        "action_timeout",
        format!("native macOS provider {method} timed out"),
    )
}

async fn remove_directory(path: &Path) {
    let _ = tokio::fs::remove_dir_all(path).await;
}
