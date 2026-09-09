// Why: every builder here reproduces the exact JSON body the legacy
// `computer.*` methods already accept, so the typed ComputerService reuses
// `ComputerAuthority::invoke` (and every validation rule inside it) instead
// of re-implementing computer-use validation a second time.

use serde_json::{Map, Value, json};
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    ComputerMouseButton, ComputerObserveTarget, ComputerPermissionId, ComputerPoint,
    ComputerScrollDirection, ComputerServiceClickRequest, ComputerServiceDragRequest,
    ComputerServiceGetAppStateRequest, ComputerServiceHotkeyRequest,
    ComputerServiceListWindowsRequest, ComputerServicePasteTextRequest,
    ComputerServicePerformSecondaryActionRequest, ComputerServicePermissionsRequest,
    ComputerServicePressKeyRequest, ComputerServiceScrollRequest, ComputerServiceSetValueRequest,
    ComputerServiceTypeTextRequest, computer_observe_target, computer_service_click_request,
    computer_service_drag_request, computer_service_scroll_request,
};

use crate::rpc::protocol_call::status;

pub(super) fn required<T>(value: Option<T>, message: &str) -> Result<T, Status> {
    value.ok_or_else(|| invalid(message))
}

pub(super) fn invalid(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn enumeration<T>(value: i32, field: &str) -> Result<T, Status>
where
    T: TryFrom<i32>,
{
    T::try_from(value).map_err(|_| invalid(&format!("Computer-use {field} is unknown")))
}

fn target_body(target: &ComputerObserveTarget) -> Map<String, Value> {
    let mut body = Map::new();
    body.insert("app".to_owned(), Value::String(target.app.clone()));
    match &target.namespace {
        Some(computer_observe_target::Namespace::Session(session)) => {
            body.insert("session".to_owned(), Value::String(session.clone()));
        }
        Some(computer_observe_target::Namespace::Worktree(worktree)) => {
            body.insert("worktree".to_owned(), Value::String(worktree.clone()));
        }
        None => {}
    }
    match &target.window {
        Some(computer_observe_target::Window::WindowId(id)) => {
            body.insert("windowId".to_owned(), json!(id));
        }
        Some(computer_observe_target::Window::WindowIndex(index)) => {
            body.insert("windowIndex".to_owned(), json!(index));
        }
        None => {}
    }
    body.insert("noScreenshot".to_owned(), Value::Bool(target.no_screenshot));
    body.insert(
        "restoreWindow".to_owned(),
        Value::Bool(target.restore_window),
    );
    body
}

fn insert_point(body: &mut Map<String, Value>, point: &ComputerPoint) {
    body.insert("x".to_owned(), json!(point.x));
    body.insert("y".to_owned(), json!(point.y));
}

fn mouse_button_str(button: ComputerMouseButton) -> &'static str {
    match button {
        ComputerMouseButton::Left | ComputerMouseButton::Unspecified => "left",
        ComputerMouseButton::Right => "right",
        ComputerMouseButton::Middle => "middle",
    }
}

fn scroll_direction_str(direction: ComputerScrollDirection) -> Result<&'static str, Status> {
    match direction {
        ComputerScrollDirection::Up => Ok("up"),
        ComputerScrollDirection::Down => Ok("down"),
        ComputerScrollDirection::Left => Ok("left"),
        ComputerScrollDirection::Right => Ok("right"),
        ComputerScrollDirection::Unspecified => Err(invalid("Scroll direction is unspecified")),
    }
}

fn permission_id_str(id: ComputerPermissionId) -> Result<&'static str, Status> {
    match id {
        ComputerPermissionId::Accessibility => Ok("accessibility"),
        ComputerPermissionId::Screenshots => Ok("screenshots"),
        ComputerPermissionId::Unspecified => {
            Err(invalid("Computer-use permission id is unspecified"))
        }
    }
}

pub(super) fn list_windows(request: &ComputerServiceListWindowsRequest) -> Value {
    json!({ "app": request.app })
}

pub(super) fn permissions(request: &ComputerServicePermissionsRequest) -> Result<Value, Status> {
    let mut body = Map::new();
    if let Some(id) = request.id {
        let id = enumeration::<ComputerPermissionId>(id, "permission id")?;
        body.insert(
            "id".to_owned(),
            Value::String(permission_id_str(id)?.to_owned()),
        );
    }
    Ok(Value::Object(body))
}

pub(super) fn get_app_state(request: &ComputerServiceGetAppStateRequest) -> Result<Value, Status> {
    let target = required(request.target.as_ref(), "Computer target is missing")?;
    Ok(Value::Object(target_body(target)))
}

pub(super) fn click(request: &ComputerServiceClickRequest) -> Result<Value, Status> {
    let target = required(request.target.as_ref(), "Computer target is missing")?;
    let mut body = target_body(target);
    match &request.locator {
        Some(computer_service_click_request::Locator::ElementIndex(index)) => {
            body.insert("elementIndex".to_owned(), json!(index));
        }
        Some(computer_service_click_request::Locator::Point(point)) => {
            insert_point(&mut body, point);
        }
        None => {}
    }
    if let Some(count) = request.click_count {
        body.insert("clickCount".to_owned(), json!(count));
    }
    if let Some(button) = request.mouse_button {
        let button = enumeration::<ComputerMouseButton>(button, "mouse button")?;
        body.insert(
            "mouseButton".to_owned(),
            Value::String(mouse_button_str(button).to_owned()),
        );
    }
    Ok(Value::Object(body))
}

pub(super) fn perform_secondary_action(
    request: &ComputerServicePerformSecondaryActionRequest,
) -> Result<Value, Status> {
    let target = required(request.target.as_ref(), "Computer target is missing")?;
    let mut body = target_body(target);
    body.insert("elementIndex".to_owned(), json!(request.element_index));
    body.insert("action".to_owned(), Value::String(request.action.clone()));
    Ok(Value::Object(body))
}

pub(super) fn scroll(request: &ComputerServiceScrollRequest) -> Result<Value, Status> {
    let target = required(request.target.as_ref(), "Computer target is missing")?;
    let mut body = target_body(target);
    match &request.locator {
        Some(computer_service_scroll_request::Locator::ElementIndex(index)) => {
            body.insert("elementIndex".to_owned(), json!(index));
        }
        Some(computer_service_scroll_request::Locator::Point(point)) => {
            insert_point(&mut body, point);
        }
        None => {}
    }
    let direction = enumeration::<ComputerScrollDirection>(request.direction, "scroll direction")?;
    body.insert(
        "direction".to_owned(),
        Value::String(scroll_direction_str(direction)?.to_owned()),
    );
    if let Some(pages) = request.pages {
        body.insert("pages".to_owned(), json!(pages));
    }
    Ok(Value::Object(body))
}

pub(super) fn drag(request: &ComputerServiceDragRequest) -> Result<Value, Status> {
    let target = required(request.target.as_ref(), "Computer target is missing")?;
    let mut body = target_body(target);
    match &request.from_locator {
        Some(computer_service_drag_request::FromLocator::FromElementIndex(index)) => {
            body.insert("fromElementIndex".to_owned(), json!(index));
        }
        Some(computer_service_drag_request::FromLocator::FromPoint(point)) => {
            body.insert("fromX".to_owned(), json!(point.x));
            body.insert("fromY".to_owned(), json!(point.y));
        }
        None => {}
    }
    match &request.to_locator {
        Some(computer_service_drag_request::ToLocator::ToElementIndex(index)) => {
            body.insert("toElementIndex".to_owned(), json!(index));
        }
        Some(computer_service_drag_request::ToLocator::ToPoint(point)) => {
            body.insert("toX".to_owned(), json!(point.x));
            body.insert("toY".to_owned(), json!(point.y));
        }
        None => {}
    }
    Ok(Value::Object(body))
}

pub(super) fn type_text(request: &ComputerServiceTypeTextRequest) -> Result<Value, Status> {
    let target = required(request.target.as_ref(), "Computer target is missing")?;
    let mut body = target_body(target);
    body.insert("text".to_owned(), Value::String(request.text.clone()));
    Ok(Value::Object(body))
}

pub(super) fn press_key(request: &ComputerServicePressKeyRequest) -> Result<Value, Status> {
    let target = required(request.target.as_ref(), "Computer target is missing")?;
    let mut body = target_body(target);
    body.insert("key".to_owned(), Value::String(request.key.clone()));
    Ok(Value::Object(body))
}

pub(super) fn hotkey(request: &ComputerServiceHotkeyRequest) -> Result<Value, Status> {
    let target = required(request.target.as_ref(), "Computer target is missing")?;
    let mut body = target_body(target);
    body.insert("key".to_owned(), Value::String(request.key.clone()));
    Ok(Value::Object(body))
}

pub(super) fn paste_text(request: &ComputerServicePasteTextRequest) -> Result<Value, Status> {
    let target = required(request.target.as_ref(), "Computer target is missing")?;
    let mut body = target_body(target);
    body.insert("text".to_owned(), Value::String(request.text.clone()));
    Ok(Value::Object(body))
}

pub(super) fn set_value(request: &ComputerServiceSetValueRequest) -> Result<Value, Status> {
    let target = required(request.target.as_ref(), "Computer target is missing")?;
    let mut body = target_body(target);
    body.insert("elementIndex".to_owned(), json!(request.element_index));
    body.insert("value".to_owned(), Value::String(request.value.clone()));
    Ok(Value::Object(body))
}
