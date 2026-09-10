// Why: CLI flag names and validation are stable inputs for installed agent skills.

use std::ffi::{OsStr, OsString};
use std::io::Read as _;

use agentstart_protocol::runtime::v1::{
    ComputerMouseButton, ComputerObserveTarget, ComputerPermissionId, ComputerPoint,
    ComputerScrollDirection, ComputerServiceClickRequest, ComputerServiceDragRequest,
    ComputerServiceGetAppStateRequest, ComputerServiceHotkeyRequest,
    ComputerServiceListWindowsRequest, ComputerServicePasteTextRequest,
    ComputerServicePerformSecondaryActionRequest, ComputerServicePermissionsRequest,
    ComputerServicePressKeyRequest, ComputerServiceScrollRequest, ComputerServiceSetValueRequest,
    ComputerServiceTypeTextRequest, computer_observe_target, computer_service_click_request,
    computer_service_drag_request, computer_service_scroll_request,
};

use super::ComputerCommandError;

pub(super) fn list_windows(
    args: &[OsString],
) -> Result<ComputerServiceListWindowsRequest, ComputerCommandError> {
    Ok(ComputerServiceListWindowsRequest {
        app: required_flag(args, "--app")?,
    })
}

pub(super) fn permissions(
    args: &[OsString],
) -> Result<ComputerServicePermissionsRequest, ComputerCommandError> {
    Ok(ComputerServicePermissionsRequest {
        id: permission_id(args)?,
    })
}

pub(super) fn get_app_state(
    args: &[OsString],
) -> Result<ComputerServiceGetAppStateRequest, ComputerCommandError> {
    Ok(ComputerServiceGetAppStateRequest {
        target: Some(target(args)?),
    })
}

pub(super) fn click(
    args: &[OsString],
) -> Result<ComputerServiceClickRequest, ComputerCommandError> {
    let target = target(args)?;
    let locator = match (
        optional_u32(args, "--element-index")?,
        optional_point(args)?,
    ) {
        (Some(index), _) => Some(computer_service_click_request::Locator::ElementIndex(index)),
        (None, Some(point)) => Some(computer_service_click_request::Locator::Point(point)),
        (None, None) => None,
    };
    let mouse_button = match optional_flag(args, "--mouse-button") {
        Some(value) => Some(mouse_button_from_str(&value)? as i32),
        None => None,
    };
    Ok(ComputerServiceClickRequest {
        target: Some(target),
        locator,
        click_count: optional_u32(args, "--click-count")?,
        mouse_button,
    })
}

pub(super) fn perform_secondary_action(
    args: &[OsString],
) -> Result<ComputerServicePerformSecondaryActionRequest, ComputerCommandError> {
    Ok(ComputerServicePerformSecondaryActionRequest {
        target: Some(target(args)?),
        element_index: required_u32(args, "--element-index")?,
        action: required_flag(args, "--action")?,
    })
}

pub(super) fn scroll(
    args: &[OsString],
) -> Result<ComputerServiceScrollRequest, ComputerCommandError> {
    let target = target(args)?;
    let locator = match (
        optional_u32(args, "--element-index")?,
        optional_point(args)?,
    ) {
        (Some(index), _) => Some(computer_service_scroll_request::Locator::ElementIndex(
            index,
        )),
        (None, Some(point)) => Some(computer_service_scroll_request::Locator::Point(point)),
        (None, None) => None,
    };
    let direction = scroll_direction_from_str(&required_flag(args, "--direction")?)?;
    Ok(ComputerServiceScrollRequest {
        target: Some(target),
        locator,
        direction: direction as i32,
        pages: optional_f64(args, "--pages")?,
    })
}

pub(super) fn drag(args: &[OsString]) -> Result<ComputerServiceDragRequest, ComputerCommandError> {
    let target = target(args)?;
    let from_locator = match (
        optional_u32(args, "--from-element-index")?,
        optional_named_point(args, "--from-x", "--from-y")?,
    ) {
        (Some(index), _) => {
            Some(computer_service_drag_request::FromLocator::FromElementIndex(index))
        }
        (None, Some(point)) => Some(computer_service_drag_request::FromLocator::FromPoint(point)),
        (None, None) => None,
    };
    let to_locator = match (
        optional_u32(args, "--to-element-index")?,
        optional_named_point(args, "--to-x", "--to-y")?,
    ) {
        (Some(index), _) => Some(computer_service_drag_request::ToLocator::ToElementIndex(
            index,
        )),
        (None, Some(point)) => Some(computer_service_drag_request::ToLocator::ToPoint(point)),
        (None, None) => None,
    };
    Ok(ComputerServiceDragRequest {
        target: Some(target),
        from_locator,
        to_locator,
    })
}

pub(super) fn type_text(
    args: &[OsString],
) -> Result<ComputerServiceTypeTextRequest, ComputerCommandError> {
    Ok(ComputerServiceTypeTextRequest {
        target: Some(target(args)?),
        text: text_payload(args, "--text", "--text-stdin")?,
    })
}

pub(super) fn press_key(
    args: &[OsString],
) -> Result<ComputerServicePressKeyRequest, ComputerCommandError> {
    Ok(ComputerServicePressKeyRequest {
        target: Some(target(args)?),
        key: required_flag(args, "--key")?,
    })
}

pub(super) fn hotkey(
    args: &[OsString],
) -> Result<ComputerServiceHotkeyRequest, ComputerCommandError> {
    Ok(ComputerServiceHotkeyRequest {
        target: Some(target(args)?),
        key: required_flag(args, "--key")?,
    })
}

pub(super) fn paste_text(
    args: &[OsString],
) -> Result<ComputerServicePasteTextRequest, ComputerCommandError> {
    Ok(ComputerServicePasteTextRequest {
        target: Some(target(args)?),
        text: text_payload(args, "--text", "--text-stdin")?,
    })
}

pub(super) fn set_value(
    args: &[OsString],
) -> Result<ComputerServiceSetValueRequest, ComputerCommandError> {
    Ok(ComputerServiceSetValueRequest {
        target: Some(target(args)?),
        element_index: required_u32(args, "--element-index")?,
        value: text_payload(args, "--value", "--value-stdin")?,
    })
}

fn target(args: &[OsString]) -> Result<ComputerObserveTarget, ComputerCommandError> {
    let namespace = match (
        optional_flag(args, "--session"),
        optional_flag(args, "--worktree"),
    ) {
        (Some(session), _) => Some(computer_observe_target::Namespace::Session(session)),
        (None, Some(worktree)) => Some(computer_observe_target::Namespace::Worktree(worktree)),
        (None, None) => None,
    };
    let window = match (
        optional_u32(args, "--window-id")?,
        optional_u32(args, "--window-index")?,
    ) {
        (Some(id), _) => Some(computer_observe_target::Window::WindowId(id)),
        (None, Some(index)) => Some(computer_observe_target::Window::WindowIndex(index)),
        (None, None) => None,
    };
    Ok(ComputerObserveTarget {
        app: required_flag(args, "--app")?,
        namespace,
        window,
        no_screenshot: has_flag(args, "--no-screenshot"),
        restore_window: has_flag(args, "--restore-window"),
    })
}

fn permission_id(args: &[OsString]) -> Result<Option<i32>, ComputerCommandError> {
    match optional_flag(args, "--id").as_deref() {
        None => Ok(None),
        Some("accessibility") => Ok(Some(ComputerPermissionId::Accessibility as i32)),
        Some("screenshots") => Ok(Some(ComputerPermissionId::Screenshots as i32)),
        Some(_) => Err(ComputerCommandError::InvalidFlag(
            "--id must be accessibility or screenshots",
        )),
    }
}

fn mouse_button_from_str(value: &str) -> Result<ComputerMouseButton, ComputerCommandError> {
    match value {
        "left" => Ok(ComputerMouseButton::Left),
        "right" => Ok(ComputerMouseButton::Right),
        "middle" => Ok(ComputerMouseButton::Middle),
        _ => Err(ComputerCommandError::InvalidFlag(
            "--mouse-button must be left, right, or middle",
        )),
    }
}

fn scroll_direction_from_str(value: &str) -> Result<ComputerScrollDirection, ComputerCommandError> {
    match value {
        "up" => Ok(ComputerScrollDirection::Up),
        "down" => Ok(ComputerScrollDirection::Down),
        "left" => Ok(ComputerScrollDirection::Left),
        "right" => Ok(ComputerScrollDirection::Right),
        _ => Err(ComputerCommandError::InvalidFlag(
            "--direction must be up, down, left, or right",
        )),
    }
}

fn optional_point(args: &[OsString]) -> Result<Option<ComputerPoint>, ComputerCommandError> {
    optional_named_point(args, "--x", "--y")
}

fn optional_named_point(
    args: &[OsString],
    x_flag: &'static str,
    y_flag: &'static str,
) -> Result<Option<ComputerPoint>, ComputerCommandError> {
    match (optional_f64(args, x_flag)?, optional_f64(args, y_flag)?) {
        (Some(x), Some(y)) => Ok(Some(ComputerPoint { x, y })),
        (None, None) => Ok(None),
        (Some(_), None) => Err(ComputerCommandError::MissingFlag(y_flag)),
        (None, Some(_)) => Err(ComputerCommandError::MissingFlag(x_flag)),
    }
}

// Why: mirrors `readTextPayload` in the legacy CLI — a value can arrive as a
// flag or over stdin, but never both, so large text payloads don't have to
// survive shell quoting.
fn text_payload(
    args: &[OsString],
    flag: &'static str,
    stdin_flag: &'static str,
) -> Result<String, ComputerCommandError> {
    if has_flag(args, stdin_flag) {
        if optional_flag(args, flag).is_some() {
            return Err(ComputerCommandError::InvalidFlag(stdin_flag));
        }
        let mut payload = String::new();
        std::io::stdin().read_to_string(&mut payload)?;
        return Ok(payload);
    }
    required_flag(args, flag)
}

fn required_flag(args: &[OsString], name: &'static str) -> Result<String, ComputerCommandError> {
    optional_flag(args, name).ok_or(ComputerCommandError::MissingFlag(name))
}

fn optional_flag(args: &[OsString], name: &str) -> Option<String> {
    read_flag(args, name)
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn required_u32(args: &[OsString], name: &'static str) -> Result<u32, ComputerCommandError> {
    optional_u32(args, name)?.ok_or(ComputerCommandError::MissingFlag(name))
}

fn optional_u32(
    args: &[OsString],
    name: &'static str,
) -> Result<Option<u32>, ComputerCommandError> {
    let Some(value) = optional_flag(args, name) else {
        return Ok(None);
    };
    value
        .parse::<u32>()
        .map(Some)
        .map_err(|_| ComputerCommandError::InvalidFlag(name))
}

fn optional_f64(
    args: &[OsString],
    name: &'static str,
) -> Result<Option<f64>, ComputerCommandError> {
    let Some(value) = optional_flag(args, name) else {
        return Ok(None);
    };
    value
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())
        .map(Some)
        .ok_or(ComputerCommandError::InvalidFlag(name))
}

fn has_flag(args: &[OsString], name: &str) -> bool {
    args.iter().any(|argument| argument == name)
}

fn read_flag<'a>(args: &'a [OsString], name: &str) -> Option<&'a OsStr> {
    let index = args.iter().position(|argument| argument == name)?;
    let value = args.get(index + 1)?;
    (!value.to_string_lossy().starts_with("--")).then_some(value)
}
