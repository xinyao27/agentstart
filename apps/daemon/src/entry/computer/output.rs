// Why: Typed service responses retain the camelCase JSON shape consumed by existing CLI integrations.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::Duration;

use agentstart_protocol::runtime::v1::{
    ComputerActionMetadata, ComputerActionPath, ComputerActionVerification, ComputerAppInfo,
    ComputerErrorCode, ComputerJsonValue, ComputerListedApp, ComputerPermissionId,
    ComputerPermissionState, ComputerPermissionStatus, ComputerScreenshotData,
    ComputerScreenshotEngine, ComputerScreenshotMetadata, ComputerScreenshotStatus,
    ComputerServiceActionResponse, ComputerServiceCapabilitiesResponse,
    ComputerServiceGetAppStateResponse, ComputerServiceListAppsResponse,
    ComputerServiceListWindowsResponse, ComputerServicePermissionsResetResponse,
    ComputerServicePermissionsResponse, ComputerServicePermissionsStatusResponse,
    ComputerSnapshotData, ComputerSnapshotTruncation, ComputerUnverifiedReason,
    ComputerVerifiedProperty, ComputerWindowInfo, ComputerWindowListEntry, HostPlatform,
    computer_action_verification, computer_json_value, computer_screenshot_status,
};
use base64::Engine as _;
use chrono::{SecondsFormat, Utc};
use serde_json::{Map, Value, json};

const SCREENSHOT_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const SCREENSHOT_CLEANUP_INTERVAL: Duration = Duration::from_secs(60 * 60);
const SCREENSHOT_CLEANUP_MARKER: &str = ".last-cleanup";
const SCREENSHOT_TMPDIR_ENV: &str = "AGENTSTART_COMPUTER_SCREENSHOT_TMPDIR";

pub(super) fn write_output(json_mode: bool, result: Value, summary: &str) {
    if !json_mode {
        println!("{summary}");
        return;
    }
    let prepared = prepare_result(result);
    println!("{}", json!({ "ok": true, "result": prepared }));
}

pub(super) fn platform_str(value: i32) -> &'static str {
    match HostPlatform::try_from(value) {
        Ok(HostPlatform::Darwin) => "darwin",
        Ok(HostPlatform::Linux) => "linux",
        Ok(HostPlatform::Windows) => "win32",
        Ok(HostPlatform::Unknown | HostPlatform::Unspecified) | Err(_) => "unknown",
    }
}

pub(super) fn permissions_summary(permissions: &[ComputerPermissionState]) -> String {
    if permissions.is_empty() {
        return "Permission status is unavailable".to_owned();
    }
    permissions
        .iter()
        .map(|permission| {
            format!(
                "{}={}",
                permission_id_str(permission.id),
                permission_status_str(permission.status)
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub(super) fn capabilities_json(response: &ComputerServiceCapabilitiesResponse) -> Value {
    let apps = response.apps.as_ref();
    let windows = response.windows.as_ref();
    let observation = response.observation.as_ref();
    let actions = response.actions.as_ref();
    let surfaces = response.surfaces.as_ref();
    json!({
        "platform": platform_str(response.platform),
        "provider": response.provider,
        "providerVersion": response.provider_version,
        "protocolVersion": response.protocol_version,
        "supports": {
            "apps": {
                "list": apps.is_some_and(|apps| apps.list),
                "bundleIds": apps.is_some_and(|apps| apps.bundle_ids),
                "pids": apps.is_some_and(|apps| apps.pids),
            },
            "windows": {
                "list": windows.is_some_and(|windows| windows.list),
                "targetById": windows.is_some_and(|windows| windows.target_by_id),
                "targetByIndex": windows.is_some_and(|windows| windows.target_by_index),
                "focus": windows.is_some_and(|windows| windows.focus),
                "moveResize": windows.is_some_and(|windows| windows.move_resize),
            },
            "observation": {
                "screenshot": observation.is_some_and(|observation| observation.screenshot),
                "annotatedScreenshot": observation
                    .is_some_and(|observation| observation.annotated_screenshot),
                "elementFrames": observation.is_some_and(|observation| observation.element_frames),
                "ocr": observation.is_some_and(|observation| observation.ocr),
            },
            "actions": {
                "click": actions.is_some_and(|actions| actions.click),
                "typeText": actions.is_some_and(|actions| actions.type_text),
                "pressKey": actions.is_some_and(|actions| actions.press_key),
                "hotkey": actions.is_some_and(|actions| actions.hotkey),
                "pasteText": actions.is_some_and(|actions| actions.paste_text),
                "scroll": actions.is_some_and(|actions| actions.scroll),
                "drag": actions.is_some_and(|actions| actions.drag),
                "setValue": actions.is_some_and(|actions| actions.set_value),
                "performAction": actions.is_some_and(|actions| actions.perform_action),
            },
            "surfaces": {
                "menus": surfaces.is_some_and(|surfaces| surfaces.menus),
                "dialogs": surfaces.is_some_and(|surfaces| surfaces.dialogs),
                "dock": surfaces.is_some_and(|surfaces| surfaces.dock),
                "menubar": surfaces.is_some_and(|surfaces| surfaces.menubar),
            },
        }
    })
}

pub(super) fn list_apps_json(response: &ComputerServiceListAppsResponse) -> Value {
    json!({ "apps": response.apps.iter().map(listed_app_json).collect::<Vec<_>>() })
}

pub(super) fn permissions_setup_json(response: &ComputerServicePermissionsResponse) -> Value {
    json!({
        "platform": platform_str(response.platform),
        "helperAppPath": response.helper_app_path,
        "permissionId": response.permission_id.map(permission_id_str),
        "openedSettings": response.opened_settings,
        "launchedHelper": response.launched_helper,
        "permissions": permission_states_json(&response.permissions),
        "nextStep": response.next_step,
    })
}

pub(super) fn permissions_status_json(
    response: &ComputerServicePermissionsStatusResponse,
) -> Value {
    json!({
        "platform": platform_str(response.platform),
        "helperAppPath": response.helper_app_path,
        "helperUnavailableReason": response.helper_unavailable_reason,
        "permissions": permission_states_json(&response.permissions),
    })
}

pub(super) fn permissions_reset_json(response: &ComputerServicePermissionsResetResponse) -> Value {
    json!({
        "platform": platform_str(response.platform),
        "helperAppPath": response.helper_app_path,
        "helperUnavailableReason": response.helper_unavailable_reason,
        "permissions": permission_states_json(&response.permissions),
        "bundleId": response.bundle_id,
    })
}

pub(super) fn list_windows_json(response: &ComputerServiceListWindowsResponse) -> Value {
    json!({
        "app": app_info_json(response.app.as_ref()),
        "windows": response.windows.iter().map(window_list_entry_json).collect::<Vec<_>>(),
    })
}

pub(super) fn get_app_state_json(response: &ComputerServiceGetAppStateResponse) -> Value {
    json!({
        "snapshot": snapshot_data_json(response.snapshot.as_ref()),
        "screenshot": screenshot_data_json(response.screenshot.as_ref()),
        "screenshotStatus": screenshot_status_json(response.screenshot_status.as_ref()),
    })
}

pub(super) fn action_json(response: &ComputerServiceActionResponse) -> Value {
    let mut value = json!({
        "snapshot": snapshot_data_json(response.snapshot.as_ref()),
        "screenshot": screenshot_data_json(response.screenshot.as_ref()),
        "screenshotStatus": screenshot_status_json(response.screenshot_status.as_ref()),
    });
    if let Some(action) = action_metadata_json(response.action.as_ref())
        && let Value::Object(map) = &mut value
    {
        map.insert("action".to_owned(), action);
    }
    value
}

fn app_info_json(app: Option<&ComputerAppInfo>) -> Value {
    let Some(app) = app else { return Value::Null };
    json!({ "name": app.name, "bundleId": app.bundle_id, "pid": app.pid })
}

fn window_info_json(window: Option<&ComputerWindowInfo>) -> Value {
    let Some(window) = window else {
        return Value::Null;
    };
    let mut platform = Map::new();
    for (key, value) in &window.platform {
        platform.insert(key.clone(), json_value_json(value));
    }
    json!({
        "id": window.id,
        "index": window.index,
        "title": window.title,
        "x": window.x,
        "y": window.y,
        "width": window.width,
        "height": window.height,
        "isMinimized": window.is_minimized,
        "isOffscreen": window.is_offscreen,
        "screenIndex": window.screen_index,
        "platform": Value::Object(platform),
    })
}

fn json_value_json(value: &ComputerJsonValue) -> Value {
    match &value.kind {
        None | Some(computer_json_value::Kind::NullValue(_)) => Value::Null,
        Some(computer_json_value::Kind::BoolValue(value)) => Value::Bool(*value),
        Some(computer_json_value::Kind::NumberValue(value)) => {
            serde_json::Number::from_f64(*value).map_or(Value::Null, Value::Number)
        }
        Some(computer_json_value::Kind::StringValue(value)) => Value::String(value.clone()),
        Some(computer_json_value::Kind::ListValue(list)) => {
            Value::Array(list.values.iter().map(json_value_json).collect())
        }
        Some(computer_json_value::Kind::ObjectValue(object)) => {
            let mut map = Map::new();
            for entry in &object.entries {
                if let Some(value) = &entry.value {
                    map.insert(entry.key.clone(), json_value_json(value));
                }
            }
            Value::Object(map)
        }
    }
}

fn listed_app_json(app: &ComputerListedApp) -> Value {
    json!({
        "name": app.name,
        "bundleId": app.bundle_id,
        "pid": app.pid,
        "isRunning": app.is_running,
        "lastUsedAt": app.last_used_at,
        "useCount": app.use_count,
    })
}

fn window_list_entry_json(entry: &ComputerWindowListEntry) -> Value {
    let mut value = window_info_json(entry.window.as_ref());
    if let Value::Object(map) = &mut value {
        map.insert("app".to_owned(), app_info_json(entry.app.as_ref()));
        map.insert("index".to_owned(), json!(entry.index));
        map.insert("isMain".to_owned(), json!(entry.is_main));
    }
    value
}

fn truncation_json(truncation: Option<&ComputerSnapshotTruncation>) -> Option<Value> {
    let truncation = truncation?;
    Some(json!({
        "truncated": truncation.truncated,
        "maxNodes": truncation.max_nodes,
        "maxDepth": truncation.max_depth,
        "maxDepthReached": truncation.max_depth_reached,
    }))
}

fn snapshot_data_json(snapshot: Option<&ComputerSnapshotData>) -> Value {
    let Some(snapshot) = snapshot else {
        return Value::Null;
    };
    json!({
        "id": snapshot.id,
        "app": app_info_json(snapshot.app.as_ref()),
        "window": window_info_json(snapshot.window.as_ref()),
        "coordinateSpace": "window",
        "treeText": snapshot.tree_text,
        "elementCount": snapshot.element_count,
        "focusedElementId": snapshot.focused_element_id,
        "truncation": truncation_json(snapshot.truncation.as_ref()),
    })
}

fn screenshot_data_json(screenshot: Option<&ComputerScreenshotData>) -> Value {
    let Some(screenshot) = screenshot else {
        return Value::Null;
    };
    json!({
        "data": screenshot
            .data
            .as_ref()
            .map(|bytes| base64::engine::general_purpose::STANDARD.encode(bytes)),
        "format": "png",
        "width": screenshot.width,
        "height": screenshot.height,
        "scale": screenshot.scale,
        "path": screenshot.path,
        "dataOmitted": screenshot.data_omitted,
        "expiresAt": screenshot.expires_at,
    })
}

fn screenshot_engine_str(engine: i32) -> &'static str {
    match ComputerScreenshotEngine::try_from(engine) {
        Ok(ComputerScreenshotEngine::ScreenCaptureKit) => "screenCaptureKit",
        Ok(ComputerScreenshotEngine::CgWindowList) => "cgWindowList",
        Ok(ComputerScreenshotEngine::Unknown | ComputerScreenshotEngine::Unspecified) | Err(_) => {
            "unknown"
        }
    }
}

fn screenshot_metadata_json(metadata: Option<&ComputerScreenshotMetadata>) -> Option<Value> {
    let metadata = metadata?;
    Some(json!({
        "engine": metadata.engine.map(screenshot_engine_str),
        "windowId": metadata.window_id,
    }))
}

fn error_code_str(code: i32) -> &'static str {
    match ComputerErrorCode::try_from(code) {
        Ok(ComputerErrorCode::AppNotFound) => "app_not_found",
        Ok(ComputerErrorCode::AppBlocked) => "app_blocked",
        Ok(ComputerErrorCode::WindowNotFound) => "window_not_found",
        Ok(ComputerErrorCode::WindowNotFocused) => "window_not_focused",
        Ok(ComputerErrorCode::WindowStale) => "window_stale",
        Ok(ComputerErrorCode::ProviderIncompatible) => "provider_incompatible",
        Ok(ComputerErrorCode::UnsupportedCapability) => "unsupported_capability",
        Ok(ComputerErrorCode::PermissionDenied) => "permission_denied",
        Ok(ComputerErrorCode::ElementNotFound) => "element_not_found",
        Ok(ComputerErrorCode::ElementNotClickable) => "element_not_clickable",
        Ok(ComputerErrorCode::ActionNotSupported) => "action_not_supported",
        Ok(ComputerErrorCode::ValueNotSettable) => "value_not_settable",
        Ok(ComputerErrorCode::InvalidArgument) => "invalid_argument",
        Ok(ComputerErrorCode::ActionTimeout) => "action_timeout",
        Ok(ComputerErrorCode::ScreenshotFailed) => "screenshot_failed",
        Ok(ComputerErrorCode::AccessibilityError) => "accessibility_error",
        Ok(ComputerErrorCode::Unspecified) | Err(_) => "invalid_argument",
    }
}

fn screenshot_status_json(status: Option<&ComputerScreenshotStatus>) -> Value {
    let Some(state) = status.and_then(|status| status.state.as_ref()) else {
        return json!({ "state": "skipped", "reason": "no_screenshot_flag" });
    };
    match state {
        computer_screenshot_status::State::Captured(captured) => {
            let mut value = json!({ "state": "captured" });
            if let Some(metadata) = screenshot_metadata_json(captured.metadata.as_ref())
                && let Value::Object(map) = &mut value
            {
                map.insert("metadata".to_owned(), metadata);
            }
            value
        }
        computer_screenshot_status::State::Skipped(_) => {
            json!({ "state": "skipped", "reason": "no_screenshot_flag" })
        }
        computer_screenshot_status::State::Failed(failed) => {
            let mut value = json!({
                "state": "failed",
                "code": error_code_str(failed.code),
                "message": failed.message,
            });
            if let Some(metadata) = screenshot_metadata_json(failed.metadata.as_ref())
                && let Value::Object(map) = &mut value
            {
                map.insert("metadata".to_owned(), metadata);
            }
            value
        }
    }
}

fn verified_property_str(value: i32) -> &'static str {
    match ComputerVerifiedProperty::try_from(value) {
        Ok(ComputerVerifiedProperty::FocusedText) => "focusedText",
        Ok(ComputerVerifiedProperty::Selection) => "selection",
        Ok(ComputerVerifiedProperty::Value | ComputerVerifiedProperty::Unspecified) | Err(_) => {
            "value"
        }
    }
}

fn unverified_reason_str(value: i32) -> &'static str {
    match ComputerUnverifiedReason::try_from(value) {
        Ok(ComputerUnverifiedReason::SyntheticInput) => "synthetic_input",
        Ok(ComputerUnverifiedReason::ClipboardPaste) => "clipboard_paste",
        Ok(ComputerUnverifiedReason::WindowChanged) => "window_changed",
        Ok(ComputerUnverifiedReason::ValueMismatch) => "value_mismatch",
        Ok(
            ComputerUnverifiedReason::ProviderUnavailable | ComputerUnverifiedReason::Unspecified,
        )
        | Err(_) => "provider_unavailable",
    }
}

fn action_verification_json(verification: Option<&ComputerActionVerification>) -> Option<Value> {
    let state = verification?.state.as_ref()?;
    Some(match state {
        computer_action_verification::State::Verified(verified) => json!({
            "state": "verified",
            "property": verified_property_str(verified.property),
            "expected": verified.expected,
            "actualPreview": verified.actual_preview,
        }),
        computer_action_verification::State::Unverified(unverified) => json!({
            "state": "unverified",
            "reason": unverified_reason_str(unverified.reason),
            "expected": unverified.expected,
            "actualPreview": unverified.actual_preview,
        }),
    })
}

fn action_path_str(value: i32) -> &'static str {
    match ComputerActionPath::try_from(value) {
        Ok(ComputerActionPath::Accessibility) => "accessibility",
        Ok(ComputerActionPath::Clipboard) => "clipboard",
        Ok(ComputerActionPath::Synthetic | ComputerActionPath::Unspecified) | Err(_) => "synthetic",
    }
}

fn action_metadata_json(action: Option<&ComputerActionMetadata>) -> Option<Value> {
    let action = action?;
    let mut value = json!({
        "path": action_path_str(action.path),
        "actionName": action.action_name,
        "fallbackReason": action.fallback_reason,
        "targetWindowId": action.target_window_id,
        "targetWindowIndex": action.target_window_index,
    });
    if let Some(verification) = action_verification_json(action.verification.as_ref())
        && let Value::Object(map) = &mut value
    {
        map.insert("verification".to_owned(), verification);
    }
    Some(value)
}

fn permission_id_str(value: i32) -> &'static str {
    match ComputerPermissionId::try_from(value) {
        Ok(ComputerPermissionId::Accessibility | ComputerPermissionId::Unspecified) | Err(_) => {
            "accessibility"
        }
        Ok(ComputerPermissionId::Screenshots) => "screenshots",
    }
}

fn permission_status_str(value: i32) -> &'static str {
    match ComputerPermissionStatus::try_from(value) {
        Ok(ComputerPermissionStatus::Granted) => "granted",
        Ok(ComputerPermissionStatus::Unsupported) => "unsupported",
        Ok(ComputerPermissionStatus::NotGranted | ComputerPermissionStatus::Unspecified)
        | Err(_) => "not-granted",
    }
}

fn permission_states_json(states: &[ComputerPermissionState]) -> Value {
    Value::Array(
        states
            .iter()
            .map(|state| {
                json!({
                    "id": permission_id_str(state.id),
                    "status": permission_status_str(state.status),
                })
            })
            .collect(),
    )
}

// Why: mirrors the legacy CLI's `prepareComputerResult` — inline screenshot
// bytes are an ergonomics trap in a JSON payload meant for a terminal or an
// agent transcript, so `--json` output always exports them to a private temp
// file instead.
fn prepare_result(mut result: Value) -> Value {
    let Some(data) = result
        .get("screenshot")
        .and_then(|screenshot| screenshot.get("data"))
        .and_then(Value::as_str)
        .filter(|data| !data.is_empty())
        .map(str::to_owned)
    else {
        return result;
    };
    let Ok((path, expires_at)) = extract_screenshot(&data) else {
        return result;
    };
    if let Some(screenshot) = result.get_mut("screenshot").and_then(Value::as_object_mut) {
        screenshot.remove("data");
        screenshot.insert("dataOmitted".to_owned(), Value::Bool(true));
        screenshot.insert("expiresAt".to_owned(), Value::String(expires_at));
        screenshot.insert("path".to_owned(), Value::String(path));
    }
    result
}

fn extract_screenshot(data_base64: &str) -> io::Result<(String, String)> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(io::Error::other)?;
    let directory = screenshot_directory();
    cleanup_screenshots(&directory);
    let path = directory.join(format!("{}-screenshot.png", random_hex_id()));
    crate::transport::secure_file::write_bytes(&path, &bytes).map_err(io::Error::other)?;
    let expires_at = (Utc::now() + chrono::Duration::from_std(SCREENSHOT_TTL).unwrap_or_default())
        .to_rfc3339_opts(SecondsFormat::Millis, true);
    Ok((path.to_string_lossy().into_owned(), expires_at))
}

fn screenshot_directory() -> PathBuf {
    std::env::var(SCREENSHOT_TMPDIR_ENV)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("agentstart-computer-use"))
}

fn cleanup_screenshots(directory: &Path) {
    let marker = directory.join(SCREENSHOT_CLEANUP_MARKER);
    if fs::metadata(&marker)
        .and_then(|metadata| metadata.modified())
        .and_then(|modified| modified.elapsed().map_err(io::Error::other))
        .is_ok_and(|elapsed| elapsed < SCREENSHOT_CLEANUP_INTERVAL)
    {
        return;
    }
    if let Ok(entries) = fs::read_dir(directory) {
        for entry in entries.flatten() {
            let path = entry.path();
            let is_stale = path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.ends_with("-screenshot.png"))
                && fs::metadata(&path)
                    .and_then(|metadata| metadata.modified())
                    .and_then(|modified| modified.elapsed().map_err(io::Error::other))
                    .is_ok_and(|elapsed| elapsed > SCREENSHOT_TTL);
            if is_stale {
                let _ = fs::remove_file(&path);
            }
        }
    }
    let _ = fs::write(&marker, Utc::now().timestamp_millis().to_string());
}

fn random_hex_id() -> String {
    let mut bytes = [0_u8; 16];
    let _ = getrandom::fill(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
