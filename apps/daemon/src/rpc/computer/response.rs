// Why: The authority owns command behavior; these builders only encode its results as typed messages.

use std::collections::HashMap;

use base64::Engine as _;
use serde_json::Value;
use yiru_protocol::runtime::v1::{
    ComputerActionMetadata, ComputerActionPath, ComputerActionSupport, ComputerActionUnverified,
    ComputerActionVerification, ComputerActionVerified, ComputerAppInfo, ComputerAppSupport,
    ComputerErrorCode, ComputerJsonNull, ComputerJsonValue, ComputerJsonValueEntry,
    ComputerJsonValueList, ComputerJsonValueObject, ComputerListedApp, ComputerObservationSupport,
    ComputerPermissionId, ComputerPermissionState, ComputerPermissionStatus,
    ComputerScreenshotCaptured, ComputerScreenshotData, ComputerScreenshotEngine,
    ComputerScreenshotFailed, ComputerScreenshotMetadata, ComputerScreenshotSkipped,
    ComputerScreenshotStatus, ComputerServiceActionResponse, ComputerServiceCapabilitiesResponse,
    ComputerServiceGetAppStateResponse, ComputerServiceListAppsResponse,
    ComputerServiceListWindowsResponse, ComputerServicePermissionsResetResponse,
    ComputerServicePermissionsResponse, ComputerServicePermissionsStatusResponse,
    ComputerSnapshotData, ComputerSnapshotTruncation, ComputerSurfaceSupport,
    ComputerUnverifiedReason, ComputerVerifiedProperty, ComputerWindowInfo,
    ComputerWindowListEntry, ComputerWindowSupport, HostPlatform, computer_action_verification,
    computer_json_value, computer_screenshot_status,
};

fn field_str_ref<'a>(value: Option<&'a Value>, key: &str) -> Option<&'a str> {
    value
        .and_then(|value| value.get(key))
        .and_then(Value::as_str)
}

fn field_str(value: Option<&Value>, key: &str) -> Option<String> {
    field_str_ref(value, key).map(str::to_owned)
}

fn str(value: Option<&Value>, key: &str) -> String {
    field_str(value, key).unwrap_or_default()
}

fn field_bool(value: Option<&Value>, key: &str) -> Option<bool> {
    value
        .and_then(|value| value.get(key))
        .and_then(Value::as_bool)
}

fn flag(value: Option<&Value>, key: &str) -> bool {
    field_bool(value, key).unwrap_or(false)
}

fn field_f64(value: Option<&Value>, key: &str) -> Option<f64> {
    value
        .and_then(|value| value.get(key))
        .and_then(Value::as_f64)
}

fn number(value: Option<&Value>, key: &str) -> f64 {
    field_f64(value, key).unwrap_or(0.0)
}

fn field_u32(value: Option<&Value>, key: &str) -> Option<u32> {
    value
        .and_then(|value| value.get(key))
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
}

fn count(value: Option<&Value>, key: &str) -> u32 {
    field_u32(value, key).unwrap_or(0)
}

fn field_i32(value: Option<&Value>, key: &str) -> Option<i32> {
    value
        .and_then(|value| value.get(key))
        .and_then(Value::as_i64)
        .and_then(|value| i32::try_from(value).ok())
}

fn platform_enum(platform: &str) -> HostPlatform {
    match platform {
        "darwin" => HostPlatform::Darwin,
        "linux" => HostPlatform::Linux,
        "win32" => HostPlatform::Windows,
        "unknown" => HostPlatform::Unknown,
        _ => HostPlatform::Unspecified,
    }
}

fn permission_id(id: &str) -> ComputerPermissionId {
    match id {
        "accessibility" => ComputerPermissionId::Accessibility,
        "screenshots" => ComputerPermissionId::Screenshots,
        _ => ComputerPermissionId::Unspecified,
    }
}

fn permission_status(status: &str) -> ComputerPermissionStatus {
    match status {
        "granted" => ComputerPermissionStatus::Granted,
        "not-granted" => ComputerPermissionStatus::NotGranted,
        "unsupported" => ComputerPermissionStatus::Unsupported,
        _ => ComputerPermissionStatus::Unspecified,
    }
}

fn action_path(path: &str) -> ComputerActionPath {
    match path {
        "accessibility" => ComputerActionPath::Accessibility,
        "synthetic" => ComputerActionPath::Synthetic,
        "clipboard" => ComputerActionPath::Clipboard,
        _ => ComputerActionPath::Unspecified,
    }
}

fn verified_property(property: &str) -> ComputerVerifiedProperty {
    match property {
        "focusedText" => ComputerVerifiedProperty::FocusedText,
        "selection" => ComputerVerifiedProperty::Selection,
        "value" => ComputerVerifiedProperty::Value,
        _ => ComputerVerifiedProperty::Unspecified,
    }
}

fn unverified_reason(reason: &str) -> ComputerUnverifiedReason {
    match reason {
        "synthetic_input" => ComputerUnverifiedReason::SyntheticInput,
        "clipboard_paste" => ComputerUnverifiedReason::ClipboardPaste,
        "provider_unavailable" => ComputerUnverifiedReason::ProviderUnavailable,
        "window_changed" => ComputerUnverifiedReason::WindowChanged,
        "value_mismatch" => ComputerUnverifiedReason::ValueMismatch,
        _ => ComputerUnverifiedReason::Unspecified,
    }
}

fn error_code(code: &str) -> ComputerErrorCode {
    match code {
        "app_not_found" => ComputerErrorCode::AppNotFound,
        "app_blocked" => ComputerErrorCode::AppBlocked,
        "window_not_found" => ComputerErrorCode::WindowNotFound,
        "window_not_focused" => ComputerErrorCode::WindowNotFocused,
        "window_stale" => ComputerErrorCode::WindowStale,
        "provider_incompatible" => ComputerErrorCode::ProviderIncompatible,
        "unsupported_capability" => ComputerErrorCode::UnsupportedCapability,
        "permission_denied" => ComputerErrorCode::PermissionDenied,
        "element_not_found" => ComputerErrorCode::ElementNotFound,
        "element_not_clickable" => ComputerErrorCode::ElementNotClickable,
        "action_not_supported" => ComputerErrorCode::ActionNotSupported,
        "value_not_settable" => ComputerErrorCode::ValueNotSettable,
        "invalid_argument" => ComputerErrorCode::InvalidArgument,
        "action_timeout" => ComputerErrorCode::ActionTimeout,
        "screenshot_failed" => ComputerErrorCode::ScreenshotFailed,
        "accessibility_error" => ComputerErrorCode::AccessibilityError,
        _ => ComputerErrorCode::Unspecified,
    }
}

fn screenshot_engine(engine: &str) -> ComputerScreenshotEngine {
    match engine {
        "screenCaptureKit" => ComputerScreenshotEngine::ScreenCaptureKit,
        "cgWindowList" => ComputerScreenshotEngine::CgWindowList,
        _ => ComputerScreenshotEngine::Unknown,
    }
}

// Why: window/app "platform" metadata is genuinely provider-specific (macOS
// layer/alpha, Linux AT-SPI backend/role/runtimeId) with no fixed schema, so
// it is carried as a typed recursive JSON value rather than
// google.protobuf.Struct or a JSON string.
fn json_value(value: &Value) -> ComputerJsonValue {
    let kind = match value {
        Value::Null => computer_json_value::Kind::NullValue(ComputerJsonNull::Value as i32),
        Value::Bool(flag) => computer_json_value::Kind::BoolValue(*flag),
        Value::Number(number) => {
            computer_json_value::Kind::NumberValue(number.as_f64().unwrap_or_default())
        }
        Value::String(text) => computer_json_value::Kind::StringValue(text.clone()),
        Value::Array(items) => computer_json_value::Kind::ListValue(ComputerJsonValueList {
            values: items.iter().map(json_value).collect(),
        }),
        Value::Object(entries) => computer_json_value::Kind::ObjectValue(ComputerJsonValueObject {
            entries: entries
                .iter()
                .map(|(key, value)| ComputerJsonValueEntry {
                    key: key.clone(),
                    value: Some(json_value(value)),
                })
                .collect(),
        }),
    };
    ComputerJsonValue { kind: Some(kind) }
}

fn platform_map(value: Option<&Value>) -> HashMap<String, ComputerJsonValue> {
    value
        .and_then(Value::as_object)
        .map(|object| {
            object
                .iter()
                .map(|(key, value)| (key.clone(), json_value(value)))
                .collect()
        })
        .unwrap_or_default()
}

fn app_info(value: Option<&Value>) -> ComputerAppInfo {
    ComputerAppInfo {
        name: str(value, "name"),
        bundle_id: field_str(value, "bundleId"),
        pid: field_i32(value, "pid").unwrap_or(0),
    }
}

fn window_info(value: Option<&Value>) -> ComputerWindowInfo {
    ComputerWindowInfo {
        id: field_i32(value, "id"),
        index: field_i32(value, "index"),
        title: str(value, "title"),
        x: field_f64(value, "x"),
        y: field_f64(value, "y"),
        width: number(value, "width"),
        height: number(value, "height"),
        is_minimized: field_bool(value, "isMinimized"),
        is_offscreen: field_bool(value, "isOffscreen"),
        screen_index: field_i32(value, "screenIndex"),
        platform: platform_map(value.and_then(|value| value.get("platform"))),
    }
}

fn listed_app(value: &Value) -> ComputerListedApp {
    let value = Some(value);
    ComputerListedApp {
        name: str(value, "name"),
        bundle_id: field_str(value, "bundleId"),
        pid: field_i32(value, "pid").unwrap_or(0),
        is_running: flag(value, "isRunning"),
        last_used_at: field_str(value, "lastUsedAt"),
        use_count: field_i32(value, "useCount"),
    }
}

fn window_list_entry(value: &Value) -> ComputerWindowListEntry {
    let option = Some(value);
    ComputerWindowListEntry {
        window: Some(window_info(option)),
        app: Some(app_info(value.get("app"))),
        index: count(option, "index"),
        is_main: field_bool(option, "isMain"),
    }
}

fn truncation_data(value: Option<&Value>) -> Option<ComputerSnapshotTruncation> {
    let value = value?;
    if value.is_null() {
        return None;
    }
    let option = Some(value);
    Some(ComputerSnapshotTruncation {
        truncated: flag(option, "truncated"),
        max_nodes: field_u32(option, "maxNodes"),
        max_depth: field_u32(option, "maxDepth"),
        max_depth_reached: field_bool(option, "maxDepthReached"),
    })
}

fn snapshot_data(value: Option<&Value>) -> ComputerSnapshotData {
    ComputerSnapshotData {
        id: str(value, "id"),
        app: Some(app_info(value.and_then(|value| value.get("app")))),
        window: Some(window_info(value.and_then(|value| value.get("window")))),
        tree_text: str(value, "treeText"),
        element_count: count(value, "elementCount"),
        focused_element_id: field_u32(value, "focusedElementId"),
        truncation: truncation_data(value.and_then(|value| value.get("truncation"))),
    }
}

fn screenshot_data(value: Option<&Value>) -> Option<ComputerScreenshotData> {
    let value = value?;
    if value.is_null() {
        return None;
    }
    let option = Some(value);
    let data = field_str_ref(option, "data")
        .filter(|text| !text.is_empty())
        .and_then(|text| base64::engine::general_purpose::STANDARD.decode(text).ok());
    Some(ComputerScreenshotData {
        data,
        width: count(option, "width"),
        height: count(option, "height"),
        scale: number(option, "scale"),
        path: field_str(option, "path"),
        data_omitted: flag(option, "dataOmitted"),
        expires_at: field_str(option, "expiresAt"),
    })
}

fn screenshot_metadata(value: Option<&Value>) -> Option<ComputerScreenshotMetadata> {
    let value = value?;
    if value.is_null() {
        return None;
    }
    let option = Some(value);
    Some(ComputerScreenshotMetadata {
        engine: field_str_ref(option, "engine").map(|engine| screenshot_engine(engine) as i32),
        window_id: field_i32(option, "windowId"),
    })
}

fn screenshot_status(value: Option<&Value>) -> ComputerScreenshotStatus {
    let Some(value) = value else {
        return ComputerScreenshotStatus { state: None };
    };
    let option = Some(value);
    let state = field_str_ref(option, "state").unwrap_or("");
    let kind = match state {
        "captured" => computer_screenshot_status::State::Captured(ComputerScreenshotCaptured {
            metadata: screenshot_metadata(value.get("metadata")),
        }),
        "failed" => computer_screenshot_status::State::Failed(ComputerScreenshotFailed {
            code: field_str_ref(option, "code").map_or(ComputerErrorCode::Unspecified, error_code)
                as i32,
            message: str(option, "message"),
            metadata: screenshot_metadata(value.get("metadata")),
        }),
        _ => computer_screenshot_status::State::Skipped(ComputerScreenshotSkipped {}),
    };
    ComputerScreenshotStatus { state: Some(kind) }
}

fn action_verification(value: Option<&Value>) -> Option<ComputerActionVerification> {
    let value = value?;
    if value.is_null() {
        return None;
    }
    let option = Some(value);
    let state = field_str_ref(option, "state")?;
    let kind = match state {
        "verified" => computer_action_verification::State::Verified(ComputerActionVerified {
            property: field_str_ref(option, "property")
                .map_or(ComputerVerifiedProperty::Unspecified, verified_property)
                as i32,
            expected: field_str(option, "expected"),
            actual_preview: field_str(option, "actualPreview"),
        }),
        "unverified" => computer_action_verification::State::Unverified(ComputerActionUnverified {
            reason: field_str_ref(option, "reason")
                .map_or(ComputerUnverifiedReason::Unspecified, unverified_reason)
                as i32,
            expected: field_str(option, "expected"),
            actual_preview: field_str(option, "actualPreview"),
        }),
        _ => return None,
    };
    Some(ComputerActionVerification { state: Some(kind) })
}

fn action_metadata(value: Option<&Value>) -> Option<ComputerActionMetadata> {
    let value = value?;
    if value.is_null() {
        return None;
    }
    let option = Some(value);
    Some(ComputerActionMetadata {
        path: field_str_ref(option, "path").map_or(ComputerActionPath::Unspecified, action_path)
            as i32,
        action_name: field_str(option, "actionName"),
        fallback_reason: field_str(option, "fallbackReason"),
        target_window_id: field_i32(option, "targetWindowId"),
        target_window_index: field_i32(option, "targetWindowIndex"),
        verification: action_verification(value.get("verification")),
    })
}

fn permission_states(value: Option<&Value>) -> Vec<ComputerPermissionState> {
    value
        .and_then(|value| value.get("permissions"))
        .and_then(Value::as_array)
        .map_or_else(Vec::new, |items| {
            items
                .iter()
                .map(|item| ComputerPermissionState {
                    id: field_str_ref(Some(item), "id")
                        .map_or(ComputerPermissionId::Unspecified, permission_id)
                        as i32,
                    status: field_str_ref(Some(item), "status")
                        .map_or(ComputerPermissionStatus::Unspecified, permission_status)
                        as i32,
                })
                .collect()
        })
}

pub(super) fn capabilities_response(value: &Value) -> ComputerServiceCapabilitiesResponse {
    let supports = value.get("supports");
    let section = |name: &str| supports.and_then(|value| value.get(name));
    ComputerServiceCapabilitiesResponse {
        platform: field_str_ref(Some(value), "platform")
            .map_or(HostPlatform::Unspecified, platform_enum) as i32,
        provider: str(Some(value), "provider"),
        provider_version: str(Some(value), "providerVersion"),
        protocol_version: count(Some(value), "protocolVersion"),
        apps: Some(ComputerAppSupport {
            list: flag(section("apps"), "list"),
            bundle_ids: flag(section("apps"), "bundleIds"),
            pids: flag(section("apps"), "pids"),
        }),
        windows: Some(ComputerWindowSupport {
            list: flag(section("windows"), "list"),
            target_by_id: flag(section("windows"), "targetById"),
            target_by_index: flag(section("windows"), "targetByIndex"),
            focus: flag(section("windows"), "focus"),
            move_resize: flag(section("windows"), "moveResize"),
        }),
        observation: Some(ComputerObservationSupport {
            screenshot: flag(section("observation"), "screenshot"),
            annotated_screenshot: flag(section("observation"), "annotatedScreenshot"),
            element_frames: flag(section("observation"), "elementFrames"),
            ocr: flag(section("observation"), "ocr"),
        }),
        actions: Some(ComputerActionSupport {
            click: flag(section("actions"), "click"),
            type_text: flag(section("actions"), "typeText"),
            press_key: flag(section("actions"), "pressKey"),
            hotkey: flag(section("actions"), "hotkey"),
            paste_text: flag(section("actions"), "pasteText"),
            scroll: flag(section("actions"), "scroll"),
            drag: flag(section("actions"), "drag"),
            set_value: flag(section("actions"), "setValue"),
            perform_action: flag(section("actions"), "performAction"),
        }),
        surfaces: Some(ComputerSurfaceSupport {
            menus: flag(section("surfaces"), "menus"),
            dialogs: flag(section("surfaces"), "dialogs"),
            dock: flag(section("surfaces"), "dock"),
            menubar: flag(section("surfaces"), "menubar"),
        }),
    }
}

pub(super) fn list_apps_response(value: &Value) -> ComputerServiceListAppsResponse {
    ComputerServiceListAppsResponse {
        apps: value
            .get("apps")
            .and_then(Value::as_array)
            .map_or_else(Vec::new, |apps| apps.iter().map(listed_app).collect()),
    }
}

pub(super) fn list_windows_response(value: &Value) -> ComputerServiceListWindowsResponse {
    ComputerServiceListWindowsResponse {
        app: Some(app_info(value.get("app"))),
        windows: value
            .get("windows")
            .and_then(Value::as_array)
            .map_or_else(Vec::new, |windows| {
                windows.iter().map(window_list_entry).collect()
            }),
    }
}

pub(super) fn permissions_response(value: &Value) -> ComputerServicePermissionsResponse {
    let option = Some(value);
    ComputerServicePermissionsResponse {
        platform: field_str_ref(option, "platform").map_or(HostPlatform::Unspecified, platform_enum)
            as i32,
        helper_app_path: field_str(option, "helperAppPath"),
        permission_id: field_str_ref(option, "permissionId").map(|id| permission_id(id) as i32),
        opened_settings: flag(option, "openedSettings"),
        launched_helper: flag(option, "launchedHelper"),
        permissions: permission_states(option),
        next_step: field_str(option, "nextStep"),
    }
}

pub(super) fn permissions_status_response(
    value: &Value,
) -> ComputerServicePermissionsStatusResponse {
    let option = Some(value);
    ComputerServicePermissionsStatusResponse {
        platform: field_str_ref(option, "platform").map_or(HostPlatform::Unspecified, platform_enum)
            as i32,
        helper_app_path: field_str(option, "helperAppPath"),
        helper_unavailable_reason: field_str(option, "helperUnavailableReason"),
        permissions: permission_states(option),
    }
}

pub(super) fn permissions_reset_response(value: &Value) -> ComputerServicePermissionsResetResponse {
    let option = Some(value);
    ComputerServicePermissionsResetResponse {
        platform: field_str_ref(option, "platform").map_or(HostPlatform::Unspecified, platform_enum)
            as i32,
        helper_app_path: field_str(option, "helperAppPath"),
        helper_unavailable_reason: field_str(option, "helperUnavailableReason"),
        permissions: permission_states(option),
        bundle_id: field_str(option, "bundleId"),
    }
}

pub(super) fn get_app_state_response(value: &Value) -> ComputerServiceGetAppStateResponse {
    ComputerServiceGetAppStateResponse {
        snapshot: Some(snapshot_data(value.get("snapshot"))),
        screenshot: screenshot_data(value.get("screenshot")),
        screenshot_status: Some(screenshot_status(value.get("screenshotStatus"))),
    }
}

pub(super) fn action_response(value: &Value) -> ComputerServiceActionResponse {
    ComputerServiceActionResponse {
        snapshot: Some(snapshot_data(value.get("snapshot"))),
        screenshot: screenshot_data(value.get("screenshot")),
        screenshot_status: Some(screenshot_status(value.get("screenshotStatus"))),
        action: action_metadata(value.get("action")),
    }
}
