use std::path::Path;

use serde_json::{Value, json};

use super::ComputerError;

pub(super) const fn platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "windows") {
        "win32"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}

pub(super) async fn status(user_data_path: &Path) -> Result<Value, ComputerError> {
    #[cfg(target_os = "macos")]
    {
        return macos_status(user_data_path).await;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = user_data_path;
        Ok(unsupported_status())
    }
}

pub(super) async fn open(
    user_data_path: &Path,
    permission_id: Option<&str>,
) -> Result<Value, ComputerError> {
    if let Some(permission_id) = permission_id
        && !matches!(permission_id, "accessibility" | "screenshots")
    {
        return Err(ComputerError::domain(
            "invalid_argument",
            "Unknown computer-use permission",
        ));
    }
    #[cfg(target_os = "macos")]
    {
        macos_open(user_data_path, permission_id).await
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = user_data_path;
        Ok(json!({
            "platform": platform(),
            "helperAppPath": null,
            "permissionId": permission_id,
            "openedSettings": false,
            "launchedHelper": false,
            "permissions": permission_states("unsupported"),
            "nextStep": null,
        }))
    }
}

pub(super) async fn reset(user_data_path: &Path) -> Result<Value, ComputerError> {
    #[cfg(target_os = "macos")]
    {
        macos_reset(user_data_path).await
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = user_data_path;
        Ok(json!({
            "platform": platform(),
            "helperAppPath": null,
            "helperUnavailableReason": null,
            "bundleId": null,
            "permissions": permission_states("unsupported"),
        }))
    }
}

/// One of the two macOS privacy grants the Computer Use helper owns.
#[derive(Clone, Copy)]
#[cfg(target_os = "macos")]
pub(crate) enum ComputerUsePermission {
    Accessibility,
    Screenshots,
}

#[cfg(target_os = "macos")]
/// Which helper grants are in place. Anything the helper cannot report reads as
/// not granted, the way the helper's own status document does.
pub(crate) struct ComputerUseGrants {
    pub(crate) accessibility: bool,
    pub(crate) screenshots: bool,
}

#[cfg(target_os = "macos")]
pub(crate) struct ComputerUsePermissionOpen {
    pub(crate) granted: bool,
    pub(crate) opened_settings: bool,
}

#[cfg(target_os = "macos")]
impl ComputerUsePermission {
    pub(super) const fn as_str(self) -> &'static str {
        match self {
            Self::Accessibility => "accessibility",
            Self::Screenshots => "screenshots",
        }
    }
}

#[cfg(target_os = "macos")]
pub(super) fn grants(status: &Value) -> ComputerUseGrants {
    ComputerUseGrants {
        accessibility: is_granted(status, ComputerUsePermission::Accessibility),
        screenshots: is_granted(status, ComputerUsePermission::Screenshots),
    }
}

#[cfg(target_os = "macos")]
pub(super) fn opened(
    result: &Value,
    permission: ComputerUsePermission,
) -> ComputerUsePermissionOpen {
    ComputerUsePermissionOpen {
        granted: is_granted(result, permission),
        opened_settings: result
            .get("openedSettings")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }
}

#[cfg(target_os = "macos")]
fn is_granted(document: &Value, permission: ComputerUsePermission) -> bool {
    document
        .get("permissions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|entry| entry.get("id").and_then(Value::as_str) == Some(permission.as_str()))
        .and_then(|entry| entry.get("status").and_then(Value::as_str))
        == Some("granted")
}

fn permission_states(state: &str) -> Value {
    json!([
        { "id": "accessibility", "status": state },
        { "id": "screenshots", "status": state },
    ])
}

#[cfg(not(target_os = "macos"))]
fn unsupported_status() -> Value {
    json!({
        "platform": platform(),
        "helperAppPath": null,
        "helperUnavailableReason": null,
        "permissions": permission_states("unsupported"),
    })
}

#[cfg(target_os = "macos")]
async fn macos_status(user_data_path: &Path) -> Result<Value, ComputerError> {
    let Some(app_path) = super::macos::resolve_app(user_data_path) else {
        return Ok(unavailable_status(
            None,
            "Yiru Computer Use.app was not found",
        ));
    };
    let executable = app_path
        .join("Contents")
        .join("MacOS")
        .join("yiru-computer-use-macos");
    if !executable.is_file() {
        return Ok(unavailable_status(
            Some(&app_path),
            &format!("{} was not found", executable.display()),
        ));
    }
    let raw = read_status(&app_path).await?;
    Ok(json!({
        "platform": platform(),
        "helperAppPath": app_path,
        "helperUnavailableReason": null,
        "permissions": [
            { "id": "accessibility", "status": permission(&raw, "accessibility") },
            { "id": "screenshots", "status": permission(&raw, "screenshots") },
        ],
    }))
}

#[cfg(target_os = "macos")]
fn unavailable_status(app_path: Option<&Path>, reason: &str) -> Value {
    json!({
        "platform": platform(),
        "helperAppPath": app_path,
        "helperUnavailableReason": reason,
        "permissions": permission_states("not-granted"),
    })
}

#[cfg(target_os = "macos")]
fn permission<'a>(raw: &'a Value, id: &str) -> &'a str {
    match raw.get(id).and_then(Value::as_str) {
        Some("granted") => "granted",
        _ => "not-granted",
    }
}

#[cfg(target_os = "macos")]
async fn read_status(app_path: &Path) -> Result<Value, ComputerError> {
    use std::time::{Duration, SystemTime};
    use tokio::process::Command;
    use tokio::time::{sleep, timeout};

    let stamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_err(|error| ComputerError::domain("accessibility_error", error.to_string()))?
        .as_nanos();
    let directory = std::env::temp_dir().join(format!(
        "yiru-computer-use-permissions-{}-{stamp}",
        std::process::id()
    ));
    tokio::fs::create_dir(&directory)
        .await
        .map_err(permission_error)?;
    let status_path = directory.join("status.json");
    let result = async {
        let mut child = Command::new("/usr/bin/open")
            .arg("-n")
            .arg(app_path)
            .arg("--args")
            .arg("--permission-status-file")
            .arg(&status_path)
            .kill_on_drop(true)
            .spawn()
            .map_err(permission_error)?;
        let exit = timeout(Duration::from_secs(5), child.wait())
            .await
            .map_err(|_| {
                ComputerError::domain(
                    "accessibility_error",
                    "Timed out launching permission helper",
                )
            })?
            .map_err(permission_error)?;
        if !exit.success() {
            return Err(ComputerError::domain(
                "accessibility_error",
                format!("Could not check permissions: {exit}"),
            ));
        }
        for _ in 0..50 {
            if let Ok(bytes) = tokio::fs::read(&status_path).await {
                return serde_json::from_slice(&bytes).map_err(|error| {
                    ComputerError::domain("accessibility_error", error.to_string())
                });
            }
            sleep(Duration::from_millis(100)).await;
        }
        Err(ComputerError::domain(
            "accessibility_error",
            "Timed out checking permissions",
        ))
    }
    .await;
    let _ = tokio::fs::remove_dir_all(directory).await;
    result
}

#[cfg(target_os = "macos")]
async fn macos_open(
    user_data_path: &Path,
    permission_id: Option<&str>,
) -> Result<Value, ComputerError> {
    use std::process::Stdio;
    use tokio::process::Command;

    let app_path = super::macos::resolve_app(user_data_path).ok_or_else(|| {
        ComputerError::domain("accessibility_error", "Yiru Computer Use.app was not found")
    })?;
    let current = macos_status(user_data_path).await?;
    if let Some(reason) = current
        .get("helperUnavailableReason")
        .and_then(Value::as_str)
    {
        return Err(ComputerError::domain("accessibility_error", reason));
    }
    let next_step = next_permission_step(&current);
    if permission_id.is_none() && next_step.is_none() {
        return Ok(json!({
            "platform": platform(),
            "helperAppPath": app_path,
            "openedSettings": false,
            "launchedHelper": false,
            "permissions": current.get("permissions").cloned().unwrap_or(Value::Array(Vec::new())),
            "nextStep": null,
        }));
    }
    close_setup_helpers().await;
    let mut command = Command::new("/usr/bin/open");
    command
        .arg("-n")
        .arg(&app_path)
        .arg("--args")
        .arg(permission_id.map_or("--permissions", |_| "--permission"));
    if let Some(permission_id) = permission_id {
        command.arg(permission_id);
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(permission_error)?;
    Ok(json!({
        "platform": platform(),
        "helperAppPath": app_path,
        "permissionId": permission_id,
        "openedSettings": permission_id.is_some(),
        "launchedHelper": true,
        "permissions": current.get("permissions").cloned().unwrap_or(Value::Array(Vec::new())),
        "nextStep": next_step,
    }))
}

#[cfg(target_os = "macos")]
async fn macos_reset(user_data_path: &Path) -> Result<Value, ComputerError> {
    use tokio::process::Command;

    let app_path = super::macos::resolve_app(user_data_path).ok_or_else(|| {
        ComputerError::domain("accessibility_error", "Yiru Computer Use.app was not found")
    })?;
    let bundle_id = match Command::new("/usr/libexec/PlistBuddy")
        .arg("-c")
        .arg("Print :CFBundleIdentifier")
        .arg(app_path.join("Contents").join("Info.plist"))
        .output()
        .await
    {
        Ok(output) if output.status.success() => {
            let value = String::from_utf8_lossy(&output.stdout).trim().to_owned();
            if value.is_empty() {
                "com.xinyao27.yiru.computer-use".to_owned()
            } else {
                value
            }
        }
        _ => "com.xinyao27.yiru.computer-use".to_owned(),
    };
    close_setup_helpers().await;
    for service in ["Accessibility", "ScreenCapture"] {
        let output = Command::new("/usr/bin/tccutil")
            .arg("reset")
            .arg(service)
            .arg(&bundle_id)
            .output()
            .await
            .map_err(permission_error)?;
        if !output.status.success() {
            return Err(ComputerError::domain(
                "accessibility_error",
                format!(
                    "Could not reset {service}: {}",
                    String::from_utf8_lossy(&output.stderr).trim()
                ),
            ));
        }
    }
    let mut refreshed = macos_status(user_data_path).await?;
    if let Some(object) = refreshed.as_object_mut() {
        object.insert("bundleId".to_owned(), Value::String(bundle_id));
    }
    Ok(refreshed)
}

#[cfg(target_os = "macos")]
async fn close_setup_helpers() {
    use std::process::Stdio;
    use tokio::process::Command;

    for pattern in [
        "yiru-computer-use-macos[[:space:]]+--permission([[:space:]]|$)",
        "yiru-computer-use-macos[[:space:]]+--permissions([[:space:]]|$)",
    ] {
        let _ = Command::new("/usr/bin/pkill")
            .arg("-f")
            .arg(pattern)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await;
    }
}

#[cfg(target_os = "macos")]
fn next_permission_step(status: &Value) -> Option<String> {
    let missing = status
        .get("permissions")?
        .as_array()?
        .iter()
        .find(|permission| permission.get("status").and_then(Value::as_str) != Some("granted"))?;
    let label = match missing.get("id").and_then(Value::as_str) {
        Some("accessibility") => "Accessibility",
        _ => "Screen Recording",
    };
    Some(format!(
        "Grant {label} to Yiru Computer Use, then retry get-app-state."
    ))
}

#[cfg(target_os = "macos")]
fn permission_error(error: std::io::Error) -> ComputerError {
    ComputerError::domain("accessibility_error", error.to_string())
}
