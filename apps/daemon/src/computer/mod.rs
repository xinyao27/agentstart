#[cfg(target_os = "macos")]
mod macos;
mod permissions;
#[cfg(not(target_os = "macos"))]
mod script;
#[cfg(not(target_os = "macos"))]
mod script_resource;

use std::path::PathBuf;
use std::sync::Arc;

use serde_json::{Value, json};
use thiserror::Error;
use tokio::sync::Mutex;

#[cfg(target_os = "macos")]
pub(crate) use permissions::{ComputerUseGrants, ComputerUsePermission, ComputerUsePermissionOpen};

#[cfg(target_os = "macos")]
use macos::MacProvider as PlatformProvider;
#[cfg(not(target_os = "macos"))]
use script::ScriptProvider as PlatformProvider;

#[derive(Clone)]
pub(crate) struct ComputerAuthority {
    inner: Arc<ComputerInner>,
}

struct ComputerInner {
    provider: Mutex<Option<PlatformProvider>>,
    user_data_path: PathBuf,
}

#[derive(Debug, Error)]
#[error("{message}")]
pub(crate) struct ComputerError {
    code: &'static str,
    message: String,
}

impl ComputerError {
    pub(crate) fn domain(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub(crate) fn rpc_parts(&self) -> (&'static str, &str) {
        (self.code, &self.message)
    }
}

impl ComputerAuthority {
    pub(crate) fn new(user_data_path: PathBuf) -> Self {
        Self {
            inner: Arc::new(ComputerInner {
                provider: Mutex::new(None),
                user_data_path,
            }),
        }
    }

    pub(crate) async fn invoke(
        &self,
        method: &str,
        body: Value,
    ) -> Result<Option<Value>, ComputerError> {
        match method {
            "computer.permissionsStatus" => {
                Ok(Some(permissions::status(&self.inner.user_data_path).await?))
            }
            "computer.permissions" => Ok(Some(
                permissions::open(
                    &self.inner.user_data_path,
                    body.get("id").and_then(Value::as_str),
                )
                .await?,
            )),
            "computer.permissionsReset" => {
                Ok(Some(permissions::reset(&self.inner.user_data_path).await?))
            }
            "computer.capabilities" => Ok(Some(self.provider_call("handshake", json!({})).await?)),
            "computer.listApps" => Ok(Some(self.provider_call("listApps", json!({})).await?)),
            "computer.listWindows" => {
                validate_app(&body)?;
                Ok(Some(self.provider_call("listWindows", body).await?))
            }
            "computer.getAppState" => {
                validate_target(&body)?;
                Ok(Some(self.provider_call("getAppState", body).await?))
            }
            "computer.click" => {
                validate_click(&body)?;
                Ok(Some(self.provider_call("click", body).await?))
            }
            "computer.performSecondaryAction" => {
                validate_target(&body)?;
                require_index(&body, "elementIndex", "Missing element index")?;
                require_nonempty(&body, "action", "Missing action")?;
                Ok(Some(
                    self.provider_call("performSecondaryAction", body).await?,
                ))
            }
            "computer.scroll" => {
                validate_scroll(&body)?;
                Ok(Some(self.provider_call("scroll", body).await?))
            }
            "computer.drag" => {
                validate_drag(&body)?;
                Ok(Some(self.provider_call("drag", body).await?))
            }
            "computer.typeText" | "computer.pasteText" => {
                validate_target(&body)?;
                require_nonempty(&body, "text", "Missing text")?;
                Ok(Some(self.provider_call(short_method(method), body).await?))
            }
            "computer.pressKey" => {
                validate_target(&body)?;
                let key = require_nonempty(&body, "key", "Missing key")?;
                if key != "+" && key.contains('+') {
                    return Err(invalid("Press-key accepts one key only"));
                }
                Ok(Some(self.provider_call("pressKey", body).await?))
            }
            "computer.hotkey" => {
                validate_target(&body)?;
                validate_hotkey(require_nonempty(&body, "key", "Missing key")?)?;
                Ok(Some(self.provider_call("hotkey", body).await?))
            }
            "computer.setValue" => {
                validate_target(&body)?;
                require_index(&body, "elementIndex", "Missing element index")?;
                if !body.get("value").is_some_and(Value::is_string) {
                    return Err(invalid("Missing value"));
                }
                Ok(Some(self.provider_call("setValue", body).await?))
            }
            _ => Ok(None),
        }
    }

    async fn provider_call(&self, method: &str, body: Value) -> Result<Value, ComputerError> {
        let mut provider = self.inner.provider.lock().await;
        if provider.is_none() {
            *provider = Some(PlatformProvider::start(&self.inner.user_data_path).await?);
        }
        let Some(client) = provider.as_mut() else {
            return Err(ComputerError::domain(
                "accessibility_error",
                "computer provider failed to initialize",
            ));
        };
        match client.call(method, body).await {
            Ok(output) => Ok(output),
            Err(error) => {
                if matches!(
                    error.code,
                    "accessibility_error" | "action_timeout" | "provider_incompatible"
                ) {
                    *provider = None;
                }
                Err(error)
            }
        }
    }

    #[cfg(target_os = "macos")]
    /// Read the Computer Use helper's privacy grants. The developer-permission
    /// authority reads these rather than re-deriving them, so the helper
    /// protocol keeps one owner.
    pub(crate) async fn computer_use_grants(&self) -> Result<ComputerUseGrants, ComputerError> {
        let status = permissions::status(&self.inner.user_data_path).await?;
        Ok(permissions::grants(&status))
    }

    #[cfg(target_os = "macos")]
    pub(crate) async fn open_computer_use_permission(
        &self,
        permission: ComputerUsePermission,
    ) -> Result<ComputerUsePermissionOpen, ComputerError> {
        let result =
            permissions::open(&self.inner.user_data_path, Some(permission.as_str())).await?;
        Ok(permissions::opened(&result, permission))
    }

    pub(crate) async fn shutdown(&self) {
        let mut provider = self.inner.provider.lock().await;
        if let Some(mut client) = provider.take() {
            client.shutdown().await;
        }
    }
}

fn short_method(method: &str) -> &str {
    method.strip_prefix("computer.").unwrap_or(method)
}

fn invalid(message: impl Into<String>) -> ComputerError {
    ComputerError::domain("invalid_argument", message)
}

fn object(body: &Value) -> Result<&serde_json::Map<String, Value>, ComputerError> {
    body.as_object()
        .ok_or_else(|| invalid("Invalid computer-use input"))
}

fn validate_app(body: &Value) -> Result<(), ComputerError> {
    object(body)?;
    require_nonempty(body, "app", "Missing app")?;
    Ok(())
}

fn validate_target(body: &Value) -> Result<(), ComputerError> {
    validate_app(body)?;
    if body.get("session").is_some_and(Value::is_string)
        && body.get("worktree").is_some_and(Value::is_string)
    {
        return Err(invalid(
            "Computer-use targeting accepts either session or worktree, not both",
        ));
    }
    if body.get("windowId").is_some() && body.get("windowIndex").is_some() {
        return Err(invalid(
            "Window targeting accepts either windowId or windowIndex, not both",
        ));
    }
    for key in ["windowId", "windowIndex"] {
        if let Some(value) = body.get(key)
            && value.as_u64().is_none()
        {
            return Err(invalid(format!("{key} must be a non-negative integer")));
        }
    }
    Ok(())
}

fn require_nonempty<'a>(
    body: &'a Value,
    key: &str,
    message: &str,
) -> Result<&'a str, ComputerError> {
    body.get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| invalid(message))
}

fn require_index(body: &Value, key: &str, message: &str) -> Result<u64, ComputerError> {
    body.get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| invalid(message))
}

fn finite(body: &Value, key: &str) -> bool {
    body.get(key)
        .and_then(Value::as_f64)
        .is_some_and(f64::is_finite)
}

fn validate_click(body: &Value) -> Result<(), ComputerError> {
    validate_target(body)?;
    validate_element_or_point(body, "elementIndex", "x", "y", "Click")?;
    if let Some(count) = body.get("clickCount")
        && count.as_u64().filter(|value| *value > 0).is_none()
    {
        return Err(invalid("clickCount must be a positive integer"));
    }
    if let Some(button) = body.get("mouseButton")
        && !matches!(button.as_str(), Some("left" | "right" | "middle"))
    {
        return Err(invalid(
            "Unsupported mouseButton; expected left, right, or middle",
        ));
    }
    Ok(())
}

fn validate_scroll(body: &Value) -> Result<(), ComputerError> {
    validate_target(body)?;
    validate_element_or_point(body, "elementIndex", "x", "y", "Scroll")?;
    if !matches!(
        body.get("direction").and_then(Value::as_str),
        Some("up" | "down" | "left" | "right")
    ) {
        return Err(invalid("Invalid scroll direction"));
    }
    if let Some(pages) = body.get("pages")
        && pages
            .as_f64()
            .filter(|value| value.is_finite() && *value > 0.0)
            .is_none()
    {
        return Err(invalid("pages must be positive"));
    }
    Ok(())
}

fn validate_element_or_point(
    body: &Value,
    element: &str,
    x: &str,
    y: &str,
    operation: &str,
) -> Result<(), ComputerError> {
    let has_element = body.get(element).and_then(Value::as_u64).is_some();
    let has_x = finite(body, x);
    let has_y = finite(body, y);
    if has_element == (has_x && has_y) {
        return Err(invalid(format!(
            "{operation} requires either {element} or both {x} and {y}"
        )));
    }
    if has_x != has_y {
        return Err(invalid(format!(
            "{operation} coordinates require both {x} and {y}"
        )));
    }
    Ok(())
}

fn validate_drag(body: &Value) -> Result<(), ComputerError> {
    validate_target(body)?;
    let elements = ["fromElementIndex", "toElementIndex"];
    let coordinates = ["fromX", "fromY", "toX", "toY"];
    let element_count = elements
        .iter()
        .filter(|key| body.get(**key).and_then(Value::as_u64).is_some())
        .count();
    let coordinate_count = coordinates.iter().filter(|key| finite(body, key)).count();
    if (element_count, coordinate_count) == (2, 0) || (element_count, coordinate_count) == (0, 4) {
        return Ok(());
    }
    Err(invalid(
        "Drag requires both element indexes or all four coordinates, but not both",
    ))
}

fn validate_hotkey(key: &str) -> Result<(), ComputerError> {
    let parts: Vec<_> = key.split('+').map(str::trim).collect();
    const MODIFIERS: &[&str] = &[
        "alt",
        "cmd",
        "cmdorctrl",
        "command",
        "commandorcontrol",
        "control",
        "ctrl",
        "meta",
        "option",
        "shift",
        "super",
        "win",
    ];
    let keys = parts
        .iter()
        .filter(|part| {
            let normalized = part.to_ascii_lowercase().replace([' ', '_', '-'], "");
            !MODIFIERS.contains(&normalized.as_str())
        })
        .count();
    if parts.len() < 2 || parts.iter().any(|part| part.is_empty()) || keys != 1 {
        return Err(invalid("Hotkey requires a modifier and one key"));
    }
    Ok(())
}
