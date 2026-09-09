use serde_json::{Map, Value};

use crate::workspace_session::normalize_host_id;
use crate::workspace_session::wire::{WireFailure, repair_session_input, validate_input};

pub(super) struct SetInput {
    pub(super) host_id: Option<String>,
    pub(super) session: Value,
}

pub(super) struct PatchInput {
    pub(super) host_id: Option<String>,
    pub(super) patch: Map<String, Value>,
}

#[derive(Debug)]
pub(super) struct SessionInputFailure;

pub(super) fn parse_flush(body: Option<&Value>) -> Result<(), SessionInputFailure> {
    if body.is_none() {
        Ok(())
    } else {
        Err(SessionInputFailure)
    }
}

pub(super) fn parse_get(body: Option<&Value>) -> Result<Option<String>, SessionInputFailure> {
    let input = body.cloned().unwrap_or_else(|| Value::Object(Map::new()));
    let value = validate_input("shell.session.get", &input)?;
    parse_host(value.get("hostId"))
}

pub(super) fn parse_set(body: Option<&Value>) -> Result<SetInput, SessionInputFailure> {
    let mut input = body.cloned().unwrap_or(Value::Null);
    repair_session_input(&mut input, "session");
    let value = validate_input("shell.session.set", &input)?;
    Ok(SetInput {
        host_id: parse_host(value.get("hostId"))?,
        session: value.get("session").cloned().unwrap_or(Value::Null),
    })
}

pub(super) fn parse_patch(body: Option<&Value>) -> Result<PatchInput, SessionInputFailure> {
    let mut input = body.cloned().unwrap_or(Value::Null);
    repair_session_input(&mut input, "patch");
    let value = validate_input("shell.session.patch", &input)?;
    Ok(PatchInput {
        host_id: parse_host(value.get("hostId"))?,
        patch: value
            .get("patch")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default(),
    })
}

fn parse_host(value: Option<&Value>) -> Result<Option<String>, SessionInputFailure> {
    let Some(value) = value else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }
    let Some(host_id) = value.as_str() else {
        unreachable!("manifest validation accepted a non-string host id")
    };
    if let Some(host_id) = normalize_host_id(host_id) {
        return Ok(Some(host_id));
    }
    Err(SessionInputFailure)
}

impl From<WireFailure> for SessionInputFailure {
    fn from(_failure: WireFailure) -> Self {
        Self
    }
}

impl std::fmt::Display for SessionInputFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("workspace session input validation failed")
    }
}

impl std::error::Error for SessionInputFailure {}
