use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    RateLimitHit, RateLimitResumeProvider as ProtocolProvider, RateLimitResumeSchedule,
    RateLimitResumeServiceCancelRequest, RateLimitResumeServiceCancelResponse,
    RateLimitResumeServiceInspectCodexRequest, RateLimitResumeServiceInspectCodexResponse,
    RateLimitResumeServiceListRequest, RateLimitResumeServiceListResponse,
    RateLimitResumeServiceMarkFailedRequest, RateLimitResumeServiceMarkFailedResponse,
    RateLimitResumeServiceMarkFiredRequest, RateLimitResumeServiceMarkFiredResponse,
    RateLimitResumeServiceMarkStaleRequest, RateLimitResumeServiceMarkStaleResponse,
    RateLimitResumeServiceRendererReadyRequest, RateLimitResumeServiceRendererReadyResponse,
    RateLimitResumeServiceRunNowRequest, RateLimitResumeServiceRunNowResponse,
    RateLimitResumeServiceScheduleRequest, RateLimitResumeServiceScheduleResponse,
    RateLimitResumeStatus as ProtocolStatus, RateLimitResumeWindow as ProtocolWindow,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::{Map, Value};

use crate::account_usage::RateLimitResumeError;

impl super::RateLimitResumeRpc {
    pub(in crate::rpc) async fn protocol_inspect_codex(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, Status> {
        let request = decode::<RateLimitResumeServiceInspectCodexRequest>(payload)?;
        let input = Map::from_iter([
            ("ptyId".to_owned(), Value::String(request.pty_id)),
            ("tabId".to_owned(), Value::String(request.tab_id)),
            ("paneKey".to_owned(), Value::String(request.pane_key)),
            ("worktreeId".to_owned(), Value::String(request.worktree_id)),
            ("sessionId".to_owned(), Value::String(request.session_id)),
            (
                "transcriptPath".to_owned(),
                Value::String(request.transcript_path),
            ),
            ("turnId".to_owned(), Value::String(request.turn_id)),
            ("prompt".to_owned(), Value::String(request.prompt)),
        ]);
        let limits = self.accounts.authority().rate_limits().snapshot();
        let result = self
            .authority
            .inspect_codex(&input, limits.get("codex"))
            .await
            .map_err(rate_limit_resume_status)?;
        let response = RateLimitResumeServiceInspectCodexResponse {
            hit: json_to_hit(&result),
        };
        Ok(encode(&response))
    }

    pub(in crate::rpc) async fn protocol_list(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        decode::<RateLimitResumeServiceListRequest>(payload)?;
        let schedules = self
            .authority
            .list()
            .into_iter()
            .filter_map(|value| json_to_schedule(&value))
            .collect();
        let response = RateLimitResumeServiceListResponse { schedules };
        Ok(encode(&response))
    }

    pub(in crate::rpc) async fn protocol_schedule(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, Status> {
        let request = decode::<RateLimitResumeServiceScheduleRequest>(payload)?;
        let input = Map::from_iter([
            ("agent".to_owned(), Value::String(request.agent)),
            ("ptyId".to_owned(), Value::String(request.pty_id)),
            ("tabId".to_owned(), Value::String(request.tab_id)),
            ("paneKey".to_owned(), Value::String(request.pane_key)),
            ("worktreeId".to_owned(), Value::String(request.worktree_id)),
            ("prompt".to_owned(), Value::String(request.prompt)),
            ("provider".to_owned(), provider_to_string(request.provider)),
            (
                "detectedAt".to_owned(),
                serde_json::Number::from_f64(request.detected_at)
                    .map_or(Value::Null, Value::Number),
            ),
            (
                "resetsAt".to_owned(),
                request
                    .resets_at
                    .and_then(serde_json::Number::from_f64)
                    .map_or(Value::Null, Value::Number),
            ),
            (
                "resetDescription".to_owned(),
                request
                    .reset_description
                    .filter(|value| !value.is_empty())
                    .map_or(Value::Null, Value::String),
            ),
            ("window".to_owned(), window_to_string(request.window)),
        ]);
        let value = self
            .authority
            .schedule(&input)
            .await
            .map_err(rate_limit_resume_status)?;
        let response = RateLimitResumeServiceScheduleResponse {
            schedule: json_to_schedule(&value),
        };
        Ok(encode(&response))
    }

    pub(in crate::rpc) async fn protocol_cancel(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        let request = decode::<RateLimitResumeServiceCancelRequest>(payload)?;
        let value = self
            .authority
            .update(&request.id, "cancelled", None)
            .await
            .map_err(rate_limit_resume_status)?;
        let response = RateLimitResumeServiceCancelResponse {
            schedule: json_to_schedule(&value),
        };
        Ok(encode(&response))
    }

    pub(in crate::rpc) async fn protocol_run_now(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        let request = decode::<RateLimitResumeServiceRunNowRequest>(payload)?;
        let value = self
            .authority
            .run_now(&request.id)
            .await
            .map_err(rate_limit_resume_status)?;
        let response = RateLimitResumeServiceRunNowResponse {
            schedule: json_to_schedule(&value),
        };
        Ok(encode(&response))
    }

    pub(in crate::rpc) async fn protocol_mark_fired(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, Status> {
        let request = decode::<RateLimitResumeServiceMarkFiredRequest>(payload)?;
        let value = self
            .authority
            .update(&request.id, "fired", None)
            .await
            .map_err(rate_limit_resume_status)?;
        let response = RateLimitResumeServiceMarkFiredResponse {
            schedule: json_to_schedule(&value),
        };
        Ok(encode(&response))
    }

    pub(in crate::rpc) async fn protocol_mark_failed(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, Status> {
        let request = decode::<RateLimitResumeServiceMarkFailedRequest>(payload)?;
        let value = self
            .authority
            .update(&request.id, "failed", Some(request.reason))
            .await
            .map_err(rate_limit_resume_status)?;
        let response = RateLimitResumeServiceMarkFailedResponse {
            schedule: json_to_schedule(&value),
        };
        Ok(encode(&response))
    }

    pub(in crate::rpc) async fn protocol_mark_stale(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, Status> {
        let request = decode::<RateLimitResumeServiceMarkStaleRequest>(payload)?;
        let value = self
            .authority
            .update(&request.id, "stale", None)
            .await
            .map_err(rate_limit_resume_status)?;
        let response = RateLimitResumeServiceMarkStaleResponse {
            schedule: json_to_schedule(&value),
        };
        Ok(encode(&response))
    }

    pub(in crate::rpc) async fn protocol_renderer_ready(
        &self,
        payload: &[u8],
        connection_id: &str,
    ) -> Result<Vec<u8>, Status> {
        decode::<RateLimitResumeServiceRendererReadyRequest>(payload)?;
        // Why: The renderer binding comes from the authenticated reverse connection, never a caller-supplied connection ID.
        self.authority
            .renderer_ready(connection_id)
            .await
            .map_err(rate_limit_resume_status)?;
        let response = RateLimitResumeServiceRendererReadyResponse {};
        Ok(encode(&response))
    }
}

fn provider_to_string(provider: i32) -> Value {
    match ProtocolProvider::try_from(provider) {
        Ok(ProtocolProvider::Unspecified) => Value::Null,
        Ok(ProtocolProvider::Claude) => Value::String("claude".to_owned()),
        Ok(ProtocolProvider::Codex) => Value::String("codex".to_owned()),
        Ok(ProtocolProvider::Cursor) => Value::String("cursor".to_owned()),
        Ok(ProtocolProvider::Gemini) => Value::String("gemini".to_owned()),
        Ok(ProtocolProvider::OpenCodeGo) => Value::String("opencodeGo".to_owned()),
        Ok(ProtocolProvider::Kimi) => Value::String("kimi".to_owned()),
        Ok(ProtocolProvider::Antigravity) => Value::String("antigravity".to_owned()),
        Ok(ProtocolProvider::Minimax) => Value::String("minimax".to_owned()),
        Ok(ProtocolProvider::Grok) => Value::String("grok".to_owned()),
        Err(_) => Value::Null,
    }
}

fn window_to_string(window: i32) -> Value {
    match ProtocolWindow::try_from(window) {
        Ok(ProtocolWindow::Unspecified) => Value::Null,
        Ok(ProtocolWindow::Session) => Value::String("session".to_owned()),
        Ok(ProtocolWindow::Weekly) => Value::String("weekly".to_owned()),
        Err(_) => Value::Null,
    }
}

fn string_to_provider(s: Option<&str>) -> i32 {
    match s {
        Some("claude") => ProtocolProvider::Claude as i32,
        Some("codex") => ProtocolProvider::Codex as i32,
        Some("cursor") => ProtocolProvider::Cursor as i32,
        Some("gemini") => ProtocolProvider::Gemini as i32,
        Some("opencodeGo") => ProtocolProvider::OpenCodeGo as i32,
        Some("kimi") => ProtocolProvider::Kimi as i32,
        Some("antigravity") => ProtocolProvider::Antigravity as i32,
        Some("minimax") => ProtocolProvider::Minimax as i32,
        Some("grok") => ProtocolProvider::Grok as i32,
        _ => ProtocolProvider::Unspecified as i32,
    }
}

fn string_to_window(s: Option<&str>) -> i32 {
    match s {
        Some("session") => ProtocolWindow::Session as i32,
        Some("weekly") => ProtocolWindow::Weekly as i32,
        _ => ProtocolWindow::Unspecified as i32,
    }
}

fn string_to_status(s: &str) -> i32 {
    match s {
        "scheduled" => ProtocolStatus::Scheduled as i32,
        "fired" => ProtocolStatus::Fired as i32,
        "cancelled" => ProtocolStatus::Cancelled as i32,
        "stale" => ProtocolStatus::Stale as i32,
        "failed" => ProtocolStatus::Failed as i32,
        _ => ProtocolStatus::Unspecified as i32,
    }
}

fn json_to_hit(value: &Value) -> Option<RateLimitHit> {
    let obj = value.as_object()?;
    Some(RateLimitHit {
        agent: obj
            .get("agent")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned(),
        pty_id: obj
            .get("ptyId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned(),
        tab_id: obj
            .get("tabId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned(),
        pane_key: obj
            .get("paneKey")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned(),
        worktree_id: obj
            .get("worktreeId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned(),
        prompt: obj
            .get("prompt")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned(),
        provider: string_to_provider(obj.get("provider").and_then(|v| v.as_str())),
        detected_at: obj
            .get("detectedAt")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0),
        resets_at: obj.get("resetsAt").and_then(|v| v.as_f64()),
        reset_description: obj
            .get("resetDescription")
            .and_then(|v| v.as_str())
            .map(|s| s.to_owned()),
        window: string_to_window(obj.get("window").and_then(|v| v.as_str())),
    })
}

pub(crate) fn json_to_schedule(value: &Value) -> Option<RateLimitResumeSchedule> {
    let obj = value.as_object()?;
    Some(RateLimitResumeSchedule {
        agent: obj
            .get("agent")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned(),
        pty_id: obj
            .get("ptyId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned(),
        tab_id: obj
            .get("tabId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned(),
        pane_key: obj
            .get("paneKey")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned(),
        worktree_id: obj
            .get("worktreeId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned(),
        prompt: obj
            .get("prompt")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned(),
        provider: string_to_provider(obj.get("provider").and_then(|v| v.as_str())),
        detected_at: obj
            .get("detectedAt")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0),
        resets_at: obj.get("resetsAt").and_then(|v| v.as_f64()),
        reset_description: obj
            .get("resetDescription")
            .and_then(|v| v.as_str())
            .map(|s| s.to_owned()),
        window: string_to_window(obj.get("window").and_then(|v| v.as_str())),
        id: obj
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned(),
        resume_at: obj.get("resumeAt").and_then(|v| v.as_f64()).unwrap_or(0.0),
        status: string_to_status(obj.get("status").and_then(|v| v.as_str()).unwrap_or("")),
        created_at: obj.get("createdAt").and_then(|v| v.as_f64()).unwrap_or(0.0),
        fired_at: obj.get("firedAt").and_then(|v| v.as_f64()),
        failure_reason: obj
            .get("failureReason")
            .and_then(|v| v.as_str())
            .map(|s| s.to_owned()),
    })
}

fn rate_limit_resume_status(error: RateLimitResumeError) -> Status {
    match error {
        RateLimitResumeError::Input(field) => status(
            StatusCode::InvalidArgument,
            &format!("Input validation failed: {}", field),
        ),
        RateLimitResumeError::NotFound => {
            status(StatusCode::NotFound, "Rate-limit resume not found")
        }
        RateLimitResumeError::MissingReset => {
            status(StatusCode::InvalidArgument, "Missing reset time")
        }
        RateLimitResumeError::ShellUnavailable => {
            status(StatusCode::Unavailable, "Renderer unavailable")
        }
        RateLimitResumeError::Io(_)
        | RateLimitResumeError::Json(_)
        | RateLimitResumeError::Clock(_)
        | RateLimitResumeError::Random(_) => status(StatusCode::Internal, "Internal error"),
    }
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
