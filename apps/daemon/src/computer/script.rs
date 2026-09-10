use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};

use serde_json::{Map, Value, json};
use tokio::process::Command;
use tokio::time::timeout;

use super::ComputerError;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const SNAPSHOT_TTL: Duration = Duration::from_secs(120);
const MAX_SNAPSHOTS: usize = 32;

pub(super) struct ScriptProvider {
    capabilities: Option<Value>,
    script_path: PathBuf,
    snapshots: VecDeque<CachedSnapshot>,
}

struct CachedSnapshot {
    app: String,
    created_at: Instant,
    namespace: String,
    snapshot: Value,
    window_id: Option<u64>,
    window_index: Option<u64>,
}

impl ScriptProvider {
    pub(super) async fn start(user_data_path: &Path) -> Result<Self, ComputerError> {
        let user_data_path = user_data_path.to_owned();
        let script_path = tokio::task::spawn_blocking(move || {
            super::script_resource::materialize(&user_data_path)
        })
        .await
        .map_err(|error| bridge_io(std::io::Error::other(error)))??;
        Ok(Self {
            capabilities: None,
            script_path,
            snapshots: VecDeque::new(),
        })
    }

    pub(super) async fn call(&mut self, method: &str, body: Value) -> Result<Value, ComputerError> {
        match method {
            "handshake" => self.capabilities().await,
            "listApps" => self.list_apps().await,
            "listWindows" => self.list_windows(&body).await,
            "getAppState" => self.snapshot(&body).await,
            "click"
            | "performSecondaryAction"
            | "scroll"
            | "drag"
            | "typeText"
            | "pressKey"
            | "hotkey"
            | "pasteText"
            | "setValue" => self.action(method, &body).await,
            _ => Err(ComputerError::domain(
                "invalid_argument",
                format!("unknown computer-use method {method}"),
            )),
        }
    }

    pub(super) async fn shutdown(&mut self) {
        self.snapshots.clear();
        self.capabilities = None;
    }

    async fn capabilities(&mut self) -> Result<Value, ComputerError> {
        if let Some(capabilities) = &self.capabilities {
            return Ok(capabilities.clone());
        }
        let response = self.bridge(json!({ "tool": "handshake" })).await?;
        let capabilities = response.get("capabilities").cloned().ok_or_else(|| {
            ComputerError::domain(
                "accessibility_error",
                "platform script provider returned no capabilities",
            )
        })?;
        self.capabilities = Some(capabilities.clone());
        Ok(capabilities)
    }

    async fn list_apps(&self) -> Result<Value, ComputerError> {
        let response = self.bridge(json!({ "tool": "list_apps" })).await?;
        let apps = response
            .get("apps")
            .and_then(Value::as_array)
            .map_or_else(Vec::new, |apps| {
                apps.iter().filter_map(render_listed_app).collect()
            });
        Ok(json!({ "apps": apps }))
    }

    async fn list_windows(&mut self, body: &Value) -> Result<Value, ComputerError> {
        self.ensure_capability("/supports/windows/list", "windows.list")
            .await?;
        let app = required_string(body, "app")?;
        let response = self
            .bridge(json!({ "tool": "list_windows", "app": app }))
            .await?;
        let rendered_app = render_app(response.get("app"))?;
        let windows = response
            .get("windows")
            .and_then(Value::as_array)
            .map_or_else(Vec::new, |windows| {
                windows
                    .iter()
                    .filter_map(|window| render_window(window).ok())
                    .collect()
            });
        Ok(json!({ "app": rendered_app, "windows": windows }))
    }

    async fn snapshot(&mut self, body: &Value) -> Result<Value, ComputerError> {
        let app = required_string(body, "app")?;
        let request = json!({
            "tool": "get_app_state", "app": app,
            "windowId": body.get("windowId"), "windowIndex": body.get("windowIndex"),
            "noScreenshot": body.get("noScreenshot").and_then(Value::as_bool) == Some(true),
            "restoreWindow": body.get("restoreWindow").and_then(Value::as_bool) == Some(true),
        });
        let response = self.bridge(request).await?;
        self.remember(app, body, &response)?;
        render_snapshot(&response, body)
    }

    async fn action(&mut self, method: &str, body: &Value) -> Result<Value, ComputerError> {
        let capability = action_capability(method);
        self.ensure_capability(
            &format!("/supports/actions/{capability}"),
            &format!("actions.{capability}"),
        )
        .await?;
        let app = required_string(body, "app")?;
        let snapshot = self.cached(app, body);
        let element = cached_element(snapshot, body, "elementIndex")?;
        let from_element = cached_element(snapshot, body, "fromElementIndex")?;
        let to_element = cached_element(snapshot, body, "toElementIndex")?;
        let window_id = body
            .get("windowId")
            .cloned()
            .or_else(|| snapshot.and_then(|value| value.get("windowId").cloned()));
        let window_index = body
            .get("windowIndex")
            .cloned()
            .or_else(|| snapshot.and_then(|value| value.get("windowIndex").cloned()));
        let request = json!({
            "tool": action_tool(method), "app": app,
            "element": element, "fromElement": from_element, "toElement": to_element,
            "x": body.get("x"), "y": body.get("y"),
            "from_x": body.get("fromX"), "from_y": body.get("fromY"),
            "to_x": body.get("toX"), "to_y": body.get("toY"),
            "click_count": body.get("clickCount"), "mouse_button": body.get("mouseButton"),
            "action": body.get("action"), "direction": body.get("direction"),
            "pages": body.get("pages"), "text": body.get("text"), "key": body.get("key"),
            "value": body.get("value"), "windowId": window_id.clone(), "windowIndex": window_index.clone(),
            "noScreenshot": body.get("noScreenshot").and_then(Value::as_bool) == Some(true),
            "restoreWindow": body.get("restoreWindow").and_then(Value::as_bool) == Some(true),
        });
        let response = self.bridge(request).await?;
        self.remember(app, body, &response)?;
        let mut result = render_snapshot(&response, body)?;
        let action = response
            .get("action")
            .cloned()
            .unwrap_or_else(|| default_action(method, window_id, window_index));
        if let Some(result) = result.as_object_mut() {
            result.insert("action".to_owned(), normalize_verification(method, action));
        }
        Ok(result)
    }

    async fn ensure_capability(&mut self, pointer: &str, name: &str) -> Result<(), ComputerError> {
        let capabilities = self.capabilities().await?;
        if capabilities.pointer(pointer).and_then(Value::as_bool) == Some(true) {
            Ok(())
        } else {
            Err(ComputerError::domain(
                "unsupported_capability",
                format!(
                    "{} does not support {name}",
                    capabilities
                        .get("provider")
                        .and_then(Value::as_str)
                        .unwrap_or("platform script provider")
                ),
            ))
        }
    }

    async fn bridge(&self, request: Value) -> Result<Value, ComputerError> {
        let operation_directory = create_operation_directory().await?;
        let operation_path = operation_directory.join("operation.json");
        let result = async {
            let operation_bytes = serde_json::to_vec(&request)
                .map_err(|error| ComputerError::domain("invalid_argument", error.to_string()))?;
            let write_path = operation_path.clone();
            tokio::task::spawn_blocking(move || {
                crate::transport::secure_file::write_bytes(&write_path, &operation_bytes)
            })
            .await
            .map_err(|error| bridge_io(std::io::Error::other(error)))?
            .map_err(|error| bridge_io(std::io::Error::other(error)))?;
            let mut command = bridge_command(&self.script_path);
            command.arg(&operation_path);
            command.stdin(Stdio::null()).kill_on_drop(true);
            let output = timeout(REQUEST_TIMEOUT, command.output())
                .await
                .map_err(|_| {
                    ComputerError::domain(
                        "action_timeout",
                        "platform script provider timed out after 30000ms",
                    )
                })?
                .map_err(bridge_io)?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !output.status.success() {
                return Err(map_bridge_error(if stderr.trim().is_empty() {
                    &stdout
                } else {
                    &stderr
                }));
            }
            let response: Value = serde_json::from_str(&stdout).map_err(|error| {
                ComputerError::domain(
                    "accessibility_error",
                    format!("platform script provider returned invalid JSON: {error}"),
                )
            })?;
            if response.get("ok").and_then(Value::as_bool) != Some(true) {
                return Err(map_bridge_error(
                    response
                        .get("error")
                        .and_then(Value::as_str)
                        .unwrap_or(stderr.trim()),
                ));
            }
            Ok(response)
        }
        .await;
        let _ = tokio::fs::remove_dir_all(operation_directory).await;
        result
    }

    fn remember(&mut self, app: &str, body: &Value, response: &Value) -> Result<(), ComputerError> {
        let mut snapshot = response.get("snapshot").cloned().ok_or_else(|| {
            ComputerError::domain(
                "accessibility_error",
                "platform script provider returned no snapshot",
            )
        })?;
        if let Some(snapshot) = snapshot.as_object_mut() {
            snapshot.insert("screenshotPngBase64".to_owned(), Value::Null);
        }
        self.snapshots.push_back(CachedSnapshot {
            app: app.to_ascii_lowercase(),
            created_at: Instant::now(),
            namespace: namespace(body),
            window_id: snapshot.get("windowId").and_then(Value::as_u64),
            window_index: snapshot.get("windowIndex").and_then(Value::as_u64),
            snapshot,
        });
        self.prune();
        Ok(())
    }

    fn cached(&mut self, app: &str, body: &Value) -> Option<&Value> {
        self.prune();
        let app = app.to_ascii_lowercase();
        let namespace = namespace(body);
        let window_id = body.get("windowId").and_then(Value::as_u64);
        let window_index = body.get("windowIndex").and_then(Value::as_u64);
        self.snapshots
            .iter()
            .rev()
            .find(|entry| {
                entry.app == app
                    && entry.namespace == namespace
                    && window_id.is_none_or(|id| entry.window_id == Some(id))
                    && window_index.is_none_or(|index| entry.window_index == Some(index))
            })
            .map(|entry| &entry.snapshot)
    }

    fn prune(&mut self) {
        while self.snapshots.len() > MAX_SNAPSHOTS
            || self
                .snapshots
                .front()
                .is_some_and(|entry| entry.created_at.elapsed() > SNAPSHOT_TTL)
        {
            self.snapshots.pop_front();
        }
    }
}

fn render_snapshot(response: &Value, body: &Value) -> Result<Value, ComputerError> {
    let snapshot = response.get("snapshot").ok_or_else(|| {
        ComputerError::domain(
            "accessibility_error",
            "platform script provider returned no snapshot",
        )
    })?;
    let app = render_app(snapshot.get("app"))?;
    let bounds = snapshot.get("windowBounds").and_then(Value::as_object);
    let no_screenshot = body.get("noScreenshot").and_then(Value::as_bool) == Some(true);
    let screenshot_data = snapshot.get("screenshotPngBase64").and_then(Value::as_str);
    let screenshot = screenshot_data.map(|data| {
        json!({
            "data": data, "format": "png",
            "width": positive_dimension(snapshot.get("screenshotWidth"), bounds, "width"),
            "height": positive_dimension(snapshot.get("screenshotHeight"), bounds, "height"),
            "scale": snapshot.get("screenshotScale").and_then(Value::as_f64).filter(|v| *v > 0.0).unwrap_or(1.0),
        })
    });
    let screenshot_status = if screenshot.is_some() {
        json!({ "state": "captured", "metadata": { "engine": "unknown", "windowId": snapshot.get("windowId") } })
    } else if no_screenshot {
        json!({ "state": "skipped", "reason": "no_screenshot_flag" })
    } else {
        json!({
            "state": "failed", "code": "screenshot_failed",
            "message": snapshot.pointer("/screenshotError/message").and_then(Value::as_str)
                .unwrap_or("platform script provider returned no image; grant screen capture permission or pass --no-screenshot to inspect accessibility state only.")
        })
    };
    let elements = snapshot
        .get("elements")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let focused = snapshot
        .get("focusedElementId")
        .and_then(Value::as_u64)
        .filter(|focused| {
            snapshot
                .get("elements")
                .and_then(Value::as_array)
                .is_some_and(|elements| {
                    elements.iter().any(|element| {
                        element.get("index").and_then(Value::as_u64) == Some(*focused)
                    })
                })
        });
    Ok(json!({
        "snapshot": {
            "id": snapshot.get("snapshotId").and_then(Value::as_str).map(str::to_owned).unwrap_or_else(|| fallback_snapshot_id(snapshot)),
            "app": app,
            "window": {
                "title": snapshot.get("windowTitle").and_then(Value::as_str).unwrap_or_else(|| snapshot.pointer("/app/name").and_then(Value::as_str).unwrap_or("")),
                "id": snapshot.get("windowId"), "index": snapshot.get("windowIndex"),
                "x": bounds.and_then(|bounds| bounds.get("x")), "y": bounds.and_then(|bounds| bounds.get("y")),
                "width": dimension(bounds, "width"), "height": dimension(bounds, "height"),
                "isMinimized": null, "isOffscreen": null, "screenIndex": null,
            },
            "coordinateSpace": "window", "treeText": tree_text(snapshot),
            "elementCount": elements, "focusedElementId": focused,
            "truncation": {
                "truncated": snapshot.pointer("/truncation/truncated").and_then(Value::as_bool) == Some(true),
                "maxNodes": snapshot.pointer("/truncation/maxNodes"), "maxDepth": snapshot.pointer("/truncation/maxDepth"),
                "maxDepthReached": snapshot.pointer("/truncation/maxDepthReached").and_then(Value::as_bool) == Some(true),
            }
        },
        "screenshot": screenshot, "screenshotStatus": screenshot_status,
    }))
}

fn render_listed_app(app: &Value) -> Option<Value> {
    Some(json!({
        "name": app.get("name")?.as_str()?,
        "bundleId": app.get("bundleId").or_else(|| app.get("bundleIdentifier")).and_then(Value::as_str),
        "pid": app.get("pid")?.as_u64()?, "isRunning": true,
        "lastUsedAt": null, "useCount": null,
    }))
}

fn render_app(app: Option<&Value>) -> Result<Value, ComputerError> {
    let app = app.ok_or_else(|| {
        ComputerError::domain(
            "accessibility_error",
            "platform script provider returned no app",
        )
    })?;
    Ok(json!({
        "name": app.get("name").and_then(Value::as_str).unwrap_or(""),
        "bundleId": app.get("bundleId").or_else(|| app.get("bundleIdentifier")).and_then(Value::as_str),
        "pid": app.get("pid").and_then(Value::as_u64).unwrap_or(0),
    }))
}

fn render_window(window: &Value) -> Result<Value, ComputerError> {
    Ok(json!({
        "index": window.get("index").and_then(Value::as_u64).unwrap_or(0),
        "app": render_app(window.get("app"))?, "id": window.get("id"),
        "title": window.get("title").and_then(Value::as_str).unwrap_or(""),
        "x": window.get("x"), "y": window.get("y"),
        "width": window.get("width").and_then(Value::as_f64).unwrap_or(0.0),
        "height": window.get("height").and_then(Value::as_f64).unwrap_or(0.0),
        "isMinimized": window.get("isMinimized"), "isOffscreen": window.get("isOffscreen"),
        "screenIndex": window.get("screenIndex"), "platform": window.get("platform"),
    }))
}

fn cached_element(
    snapshot: Option<&Value>,
    body: &Value,
    key: &str,
) -> Result<Option<Value>, ComputerError> {
    let Some(index) = body.get(key).and_then(Value::as_u64) else {
        return Ok(None);
    };
    snapshot
        .and_then(|snapshot| snapshot.get("elements"))
        .and_then(Value::as_array)
        .and_then(|elements| {
            elements
                .iter()
                .find(|element| element.get("index").and_then(Value::as_u64) == Some(index))
        })
        .cloned()
        .map(Some)
        .ok_or_else(|| {
            ComputerError::domain(
                "element_not_found",
                format!("element {index} is not in the current cached snapshot; run get-app-state again and use a fresh element index"),
            )
        })
}

fn tree_text(snapshot: &Value) -> String {
    let app = snapshot
        .pointer("/app/name")
        .and_then(Value::as_str)
        .unwrap_or("");
    let app_ref = snapshot
        .pointer("/app/bundleId")
        .or_else(|| snapshot.pointer("/app/bundleIdentifier"))
        .and_then(Value::as_str)
        .unwrap_or(app);
    let pid = snapshot
        .pointer("/app/pid")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let title = sanitize(
        snapshot
            .get("windowTitle")
            .and_then(Value::as_str)
            .unwrap_or(app),
    );
    let mut lines = vec![
        format!("App={app_ref} (pid {pid})"),
        format!("Window: \"{title}\", App: {}.", sanitize(app)),
        String::new(),
    ];
    if let Some(tree_lines) = snapshot.get("treeLines").and_then(Value::as_array) {
        lines.extend(
            tree_lines
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned),
        );
    }
    if let Some(selected) = snapshot.get("selectedText").and_then(Value::as_str) {
        lines.extend([
            String::new(),
            format!("Selected text: [{}]", sanitize(selected)),
        ]);
    } else if let Some(focused) = snapshot.get("focusedSummary").and_then(Value::as_str) {
        lines.extend([
            String::new(),
            format!("The focused UI element is {}.", sanitize(focused)),
        ]);
    }
    lines.join("\n")
}

fn default_action(method: &str, window_id: Option<Value>, window_index: Option<Value>) -> Value {
    let path = if method == "pasteText" {
        "clipboard"
    } else if matches!(method, "setValue" | "performSecondaryAction") {
        "accessibility"
    } else {
        "synthetic"
    };
    json!({
        "path": path, "actionName": method, "fallbackReason": null,
        "targetWindowId": window_id, "targetWindowIndex": window_index,
    })
}

fn normalize_verification(method: &str, mut action: Value) -> Value {
    if action.get("verification").is_none()
        && matches!(method, "typeText" | "pressKey" | "hotkey" | "pasteText")
        && let Some(action) = action.as_object_mut()
    {
        action.insert(
            "verification".to_owned(),
            json!({
                "state": "unverified",
                "reason": if method == "pasteText" { "clipboard_paste" } else { "synthetic_input" },
            }),
        );
    }
    action
}

fn required_string<'a>(body: &'a Value, key: &str) -> Result<&'a str, ComputerError> {
    body.get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ComputerError::domain("invalid_argument", format!("Missing {key}")))
}

fn namespace(body: &Value) -> String {
    body.get("session")
        .and_then(Value::as_str)
        .map(|value| format!("session:{value}"))
        .or_else(|| {
            body.get("worktree")
                .and_then(Value::as_str)
                .map(|value| format!("worktree:{value}"))
        })
        .unwrap_or_else(|| "default".to_owned())
}

fn action_tool(method: &str) -> &str {
    match method {
        "performSecondaryAction" => "perform_secondary_action",
        "typeText" => "type_text",
        "pressKey" => "press_key",
        "pasteText" => "paste_text",
        "setValue" => "set_value",
        value => value,
    }
}

fn action_capability(method: &str) -> &str {
    if method == "performSecondaryAction" {
        "performAction"
    } else {
        method
    }
}

fn fallback_snapshot_id(snapshot: &Value) -> String {
    format!(
        "{}:{}:{}",
        snapshot
            .pointer("/app/name")
            .and_then(Value::as_str)
            .unwrap_or("app"),
        snapshot
            .pointer("/app/pid")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        snapshot
            .get("windowId")
            .and_then(Value::as_u64)
            .map_or_else(|| "window".to_owned(), |value| value.to_string())
    )
}

fn dimension(bounds: Option<&Map<String, Value>>, key: &str) -> u64 {
    bounds
        .and_then(|bounds| bounds.get(key))
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value > 0.0)
        .map_or(0, |value| value.round() as u64)
}

fn positive_dimension(
    value: Option<&Value>,
    bounds: Option<&Map<String, Value>>,
    key: &str,
) -> u64 {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value > 0.0)
        .map_or_else(
            || dimension(bounds, key).max(1),
            |value| value.round() as u64,
        )
}

fn sanitize(value: &str) -> String {
    value.replace(['\n', '\r'], " ")
}

fn bridge_command(script_path: &Path) -> Command {
    let mut command = if cfg!(windows) {
        let mut command = Command::new("powershell.exe");
        command.args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ]);
        command
    } else {
        Command::new("python3")
    };
    command.arg(script_path);
    command
}

async fn create_operation_directory() -> Result<PathBuf, ComputerError> {
    let mut random = [0_u8; 16];
    getrandom::fill(&mut random)
        .map_err(|error| bridge_io(std::io::Error::other(error.to_string())))?;
    let suffix = random
        .into_iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let path = std::env::temp_dir().join(format!("agentstart-computer-use-{suffix}"));
    create_private_directory(&path)?;
    Ok(path)
}

#[cfg(unix)]
fn create_private_directory(path: &Path) -> Result<(), ComputerError> {
    use std::os::unix::fs::DirBuilderExt;

    let mut builder = std::fs::DirBuilder::new();
    builder.mode(0o700).create(path).map_err(bridge_io)
}

#[cfg(not(unix))]
fn create_private_directory(path: &Path) -> Result<(), ComputerError> {
    std::fs::create_dir(path).map_err(bridge_io)?;
    crate::transport::secure_file::ensure_secure_directory(path)
        .map_err(|error| bridge_io(std::io::Error::other(error)))
}

fn bridge_io(error: std::io::Error) -> ComputerError {
    ComputerError::domain("accessibility_error", error.to_string())
}

fn map_bridge_error(message: &str) -> ComputerError {
    let text = message.trim();
    let lower = text.to_ascii_lowercase();
    let code = if lower.contains("appnotfound") || lower.contains("app not found") {
        "app_not_found"
    } else if lower.contains("appblocked") || lower.contains("app blocked") {
        "app_blocked"
    } else if lower.contains("module not found")
        || lower.contains("unsupported capability")
        || lower.contains("pygobject")
        || lower.contains("python3-gi")
    {
        "unsupported_capability"
    } else if lower.contains("not settable") {
        "value_not_settable"
    } else if lower.contains("not supported") && lower.contains("action") {
        "action_not_supported"
    } else if lower.contains("stale element") || lower.contains("fresh element index") {
        "element_not_found"
    } else if lower.contains("window stale") || lower.contains("windowstale") {
        "window_stale"
    } else if lower.contains("window_not_focused")
        || lower.contains("target window") && lower.contains("focused")
    {
        "window_not_focused"
    } else if lower.contains("window_not_found") || lower.contains("no top-level") {
        "window_not_found"
    } else if lower.contains("screenshot") || lower.contains("screen recording") {
        "screenshot_failed"
    } else if lower.contains("permission")
        || lower.contains("desktop session")
        || lower.contains("dbus")
    {
        "permission_denied"
    } else {
        "accessibility_error"
    };
    ComputerError::domain(
        code,
        if text.is_empty() {
            "platform script provider failed"
        } else {
            text
        },
    )
}
