use serde_json::Value;
use thiserror::Error;

use crate::workspace_session::normalize_host_id;

use super::model::{RendererHost, RendererProjection, RendererSnapshot};

const MAX_CONTAINER_ITEMS: usize = 32_768;
const MAX_MOBILE_SNAPSHOTS: usize = 512;
const MAX_NESTING_DEPTH: usize = 96;
const MAX_STRING_BYTES: usize = 256 * 1_024;
const MAX_SYNC_BYTES: usize = 4 * 1_024 * 1_024;
const MAX_TABS_PER_SNAPSHOT: usize = 4_096;

#[derive(Debug, Error)]
#[error("Invalid input: {path}")]
pub(crate) struct SessionTabsValidationError {
    pub(crate) path: String,
}

pub(crate) fn renderer_projection(
    body: Option<&Value>,
) -> Result<RendererProjection, SessionTabsValidationError> {
    let root = object(body.ok_or_else(|| invalid("input"))?, "input")?;
    bounded_json(root)?;
    array(root.get("tabs"), "tabs")?;
    array(root.get("leaves"), "leaves")?;
    let snapshots = match root.get("mobileSessionTabs") {
        None => None,
        Some(value) => {
            let values = array(Some(value), "mobileSessionTabs")?;
            if values.len() > MAX_MOBILE_SNAPSHOTS {
                return Err(invalid("mobileSessionTabs"));
            }
            Some(
                values
                    .iter()
                    .enumerate()
                    .map(|(index, value)| snapshot(value, &format!("mobileSessionTabs.{index}")))
                    .collect::<Result<Vec<_>, _>>()?,
            )
        }
    };
    Ok(RendererProjection { snapshots })
}

fn snapshot(value: &Value, path: &str) -> Result<RendererSnapshot, SessionTabsValidationError> {
    let snapshot = object(value, path)?;
    let worktree = nonempty_string(snapshot.get("worktree"), &format!("{path}.worktree"))?;
    let publication_epoch = nonempty_string(
        snapshot.get("publicationEpoch"),
        &format!("{path}.publicationEpoch"),
    )?;
    let snapshot_version = finite_number(
        snapshot.get("snapshotVersion"),
        &format!("{path}.snapshotVersion"),
    )?;
    let host = match snapshot.get("hostId") {
        None => RendererHost::Unknown,
        Some(Value::String(host_id)) => {
            let host_id =
                normalize_host_id(host_id).ok_or_else(|| invalid(format!("{path}.hostId")))?;
            if host_id == "local" {
                RendererHost::KnownLocal
            } else {
                RendererHost::KnownRemote(host_id)
            }
        }
        Some(_) => return Err(invalid(format!("{path}.hostId"))),
    };
    nullable_string(
        snapshot.get("activeGroupId"),
        &format!("{path}.activeGroupId"),
    )?;
    nullable_string(snapshot.get("activeTabId"), &format!("{path}.activeTabId"))?;
    match snapshot.get("activeTabType") {
        Some(Value::Null) => {}
        Some(Value::String(value))
            if matches!(value.as_str(), "terminal" | "markdown" | "file" | "browser") => {}
        _ => return Err(invalid(format!("{path}.activeTabType"))),
    }
    let tabs = array(snapshot.get("tabs"), &format!("{path}.tabs"))?;
    if tabs.len() > MAX_TABS_PER_SNAPSHOT {
        return Err(invalid(format!("{path}.tabs")));
    }
    for (index, tab) in tabs.iter().enumerate() {
        consumed_tab_shape(tab, &format!("{path}.tabs.{index}"))?;
    }
    Ok(RendererSnapshot {
        host,
        publication_epoch: publication_epoch.to_owned(),
        snapshot_version,
        value: value.clone(),
        worktree: worktree.to_owned(),
    })
}

fn consumed_tab_shape(value: &Value, path: &str) -> Result<(), SessionTabsValidationError> {
    let tab = object(value, path)?;
    nonempty_string(tab.get("id"), &format!("{path}.id"))?;
    boolean(tab.get("isActive"), &format!("{path}.isActive"))?;
    match nonempty_string(tab.get("type"), &format!("{path}.type"))? {
        "terminal" => {
            nonempty_string(tab.get("parentTabId"), &format!("{path}.parentTabId"))?;
            nonempty_string(tab.get("leafId"), &format!("{path}.leafId"))?;
            optional_nullable_string(tab.get("ptyId"), &format!("{path}.ptyId"))?;
        }
        "markdown" | "file" | "browser" => {}
        _ => return Err(invalid(format!("{path}.type"))),
    }
    Ok(())
}

fn bounded_json(root: &serde_json::Map<String, Value>) -> Result<(), SessionTabsValidationError> {
    let mut bytes = object_wire_overhead(root)?;
    let mut items = root.len();
    let mut stack = root
        .values()
        .map(|value| (value, 1_usize))
        .collect::<Vec<_>>();
    while let Some((value, depth)) = stack.pop() {
        if depth > MAX_NESTING_DEPTH {
            return Err(invalid("input"));
        }
        match value {
            Value::Array(values) => {
                items = items.saturating_add(values.len());
                bytes = bytes.saturating_add(container_wire_overhead(values.len()));
                stack.extend(values.iter().map(|value| (value, depth.saturating_add(1))));
            }
            Value::Object(values) => {
                items = items.saturating_add(values.len());
                bytes = bytes.saturating_add(object_wire_overhead(values)?);
                stack.extend(
                    values
                        .values()
                        .map(|value| (value, depth.saturating_add(1))),
                );
            }
            Value::String(value) if value.len() > MAX_STRING_BYTES => {
                return Err(invalid("input"));
            }
            Value::String(value) => bytes = bytes.saturating_add(json_string_bytes(value)),
            Value::Null => bytes = bytes.saturating_add(4),
            Value::Bool(value) => bytes = bytes.saturating_add(if *value { 4 } else { 5 }),
            Value::Number(value) => bytes = bytes.saturating_add(value.to_string().len()),
        }
        if items > MAX_CONTAINER_ITEMS || bytes > MAX_SYNC_BYTES {
            return Err(invalid("input"));
        }
    }
    Ok(())
}

fn object_wire_overhead(
    values: &serde_json::Map<String, Value>,
) -> Result<usize, SessionTabsValidationError> {
    let mut bytes = container_wire_overhead(values.len());
    for key in values.keys() {
        if key.len() > MAX_STRING_BYTES {
            return Err(invalid("input"));
        }
        bytes = bytes
            .saturating_add(json_string_bytes(key))
            .saturating_add(1);
    }
    Ok(bytes)
}

fn container_wire_overhead(items: usize) -> usize {
    2_usize.saturating_add(items.saturating_sub(1))
}

fn json_string_bytes(value: &str) -> usize {
    value.chars().fold(2_usize, |bytes, character| {
        bytes.saturating_add(match character {
            '"' | '\\' | '\u{0008}' | '\t' | '\n' | '\u{000c}' | '\r' => 2,
            character if character <= '\u{001f}' => 6,
            character => character.len_utf8(),
        })
    })
}

fn object<'a>(
    value: &'a Value,
    path: &str,
) -> Result<&'a serde_json::Map<String, Value>, SessionTabsValidationError> {
    value.as_object().ok_or_else(|| invalid(path))
}

fn array<'a>(
    value: Option<&'a Value>,
    path: &str,
) -> Result<&'a Vec<Value>, SessionTabsValidationError> {
    value.and_then(Value::as_array).ok_or_else(|| invalid(path))
}

fn nonempty_string<'a>(
    value: Option<&'a Value>,
    path: &str,
) -> Result<&'a str, SessionTabsValidationError> {
    value
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty() && value.len() <= MAX_STRING_BYTES)
        .ok_or_else(|| invalid(path))
}

fn nullable_string(value: Option<&Value>, path: &str) -> Result<(), SessionTabsValidationError> {
    match value {
        Some(Value::Null) => Ok(()),
        Some(Value::String(value)) if value.len() <= MAX_STRING_BYTES => Ok(()),
        _ => Err(invalid(path)),
    }
}

fn optional_nullable_string(
    value: Option<&Value>,
    path: &str,
) -> Result<(), SessionTabsValidationError> {
    match value {
        None | Some(Value::Null) => Ok(()),
        Some(Value::String(value)) if value.len() <= MAX_STRING_BYTES => Ok(()),
        _ => Err(invalid(path)),
    }
}

fn boolean(value: Option<&Value>, path: &str) -> Result<(), SessionTabsValidationError> {
    value
        .and_then(Value::as_bool)
        .map(|_| ())
        .ok_or_else(|| invalid(path))
}

fn finite_number(value: Option<&Value>, path: &str) -> Result<f64, SessionTabsValidationError> {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .ok_or_else(|| invalid(path))
}

fn invalid(path: impl Into<String>) -> SessionTabsValidationError {
    SessionTabsValidationError { path: path.into() }
}
