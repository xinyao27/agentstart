use serde_json::Value;

use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    ProviderUsageBreakdown as ProtocolBreakdown, ProviderUsageDailyData as ProtocolDailyData,
    ProviderUsageGetScanStateResponse as ProtocolScanStateResponse,
    ProviderUsageGetSnapshotResponse as ProtocolSnapshotResponse,
    ProviderUsageProvider as ProtocolProvider,
    ProviderUsageRefreshResponse as ProtocolRefreshResponse,
    ProviderUsageScanState as ProtocolScanState, ProviderUsageScope as ProtocolScope,
    ProviderUsageSession as ProtocolSession, ProviderUsageSummary as ProtocolSummary,
};
use yiru_protocol::transport::{decode, encode};

use crate::provider_usage::{Provider, ProviderUsageError};

use super::ProviderUsageRpc;

impl ProviderUsageRpc {
    pub(in crate::rpc) async fn protocol_get_scan_state(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, Status> {
        let request =
            decode::<yiru_protocol::runtime::v1::ProviderUsageGetScanStateRequest>(payload)?;
        let provider = parse_provider(request.provider)?;
        let state = self
            .authority
            .scan_state(provider)
            .await
            .map_err(provider_usage_status)?;
        let response = ProtocolScanStateResponse {
            scan_state: Some(to_protocol_scan_state(&state)),
        };
        Ok(encode(&response))
    }

    pub(in crate::rpc) async fn protocol_set_enabled(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, Status> {
        let request =
            decode::<yiru_protocol::runtime::v1::ProviderUsageSetEnabledRequest>(payload)?;
        let provider = parse_provider(request.provider)?;
        let state = self
            .authority
            .set_enabled(provider, request.enabled)
            .await
            .map_err(provider_usage_status)?;
        let response = ProtocolScanStateResponse {
            scan_state: Some(to_protocol_scan_state(&state)),
        };
        Ok(encode(&response))
    }

    pub(in crate::rpc) async fn protocol_refresh(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        let request = decode::<yiru_protocol::runtime::v1::ProviderUsageRefreshRequest>(payload)?;
        let provider = parse_provider(request.provider)?;
        let state = self
            .authority
            .refresh(provider, request.force)
            .await
            .map_err(provider_usage_status)?;
        let response = ProtocolRefreshResponse {
            scan_state: Some(to_protocol_scan_state(&state)),
        };
        Ok(encode(&response))
    }

    pub(in crate::rpc) async fn protocol_get_snapshot(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, Status> {
        let request =
            decode::<yiru_protocol::runtime::v1::ProviderUsageGetSnapshotRequest>(payload)?;
        let provider = parse_provider(request.provider)?;
        let scope = parse_scope(request.scope)?;
        let range = parse_range(request.range)?;
        let snapshot = self
            .authority
            .snapshot(provider, &scope, &range, request.limit)
            .await
            .map_err(provider_usage_status)?;
        let response = to_protocol_snapshot(&snapshot);
        Ok(encode(&response))
    }
}

fn parse_provider(provider: i32) -> Result<Provider, Status> {
    match ProtocolProvider::try_from(provider) {
        Ok(ProtocolProvider::Claude) => Ok(Provider::Claude),
        Ok(ProtocolProvider::Codex) => Ok(Provider::Codex),
        Ok(ProtocolProvider::OpenCode) => Ok(Provider::OpenCode),
        Ok(ProtocolProvider::Unspecified) | Err(_) => Err(status(
            StatusCode::InvalidArgument,
            "Provider usage provider is invalid",
        )),
    }
}

fn parse_scope(scope: i32) -> Result<String, Status> {
    match ProtocolScope::try_from(scope) {
        Ok(ProtocolScope::Yiru) => Ok("yiru".to_string()),
        Ok(ProtocolScope::All) => Ok("all".to_string()),
        Ok(ProtocolScope::Unspecified) | Err(_) => Err(status(
            StatusCode::InvalidArgument,
            "Provider usage scope is invalid",
        )),
    }
}

fn parse_range(range: i32) -> Result<String, Status> {
    use yiru_protocol::runtime::v1::ProviderUsageRange;
    match ProviderUsageRange::try_from(range) {
        Ok(ProviderUsageRange::SevenDays) => Ok("7d".to_string()),
        Ok(ProviderUsageRange::ThirtyDays) => Ok("30d".to_string()),
        Ok(ProviderUsageRange::NinetyDays) => Ok("90d".to_string()),
        Ok(ProviderUsageRange::All) => Ok("all".to_string()),
        Ok(ProviderUsageRange::Unspecified) | Err(_) => Err(status(
            StatusCode::InvalidArgument,
            "Provider usage range is invalid",
        )),
    }
}

fn to_protocol_scan_state(state: &Value) -> ProtocolScanState {
    ProtocolScanState {
        enabled: state
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(true),
        is_scanning: state
            .get("isScanning")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        last_scan_started_at: state.get("lastScanStartedAt").and_then(Value::as_i64),
        last_scan_completed_at: state.get("lastScanCompletedAt").and_then(Value::as_i64),
        last_scan_error: state
            .get("lastScanError")
            .and_then(Value::as_str)
            .map(String::from),
        has_any_claude_data: state
            .get("hasAnyClaudeData")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        has_any_codex_data: state
            .get("hasAnyCodexData")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        has_any_open_code_data: state
            .get("hasAnyOpenCodeData")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }
}

fn to_protocol_snapshot(snapshot: &Value) -> ProtocolSnapshotResponse {
    let scan_state = snapshot
        .get("scanState")
        .map(to_protocol_scan_state)
        .unwrap_or_default();

    let summary = snapshot
        .get("summary")
        .map(to_protocol_summary)
        .unwrap_or_default();

    let daily = snapshot
        .get("daily")
        .and_then(Value::as_array)
        .map(|items| items.iter().map(to_protocol_daily_data).collect())
        .unwrap_or_default();

    let model_breakdown = snapshot
        .get("modelBreakdown")
        .and_then(Value::as_array)
        .map(|items| items.iter().map(to_protocol_breakdown).collect())
        .unwrap_or_default();

    let project_breakdown = snapshot
        .get("projectBreakdown")
        .and_then(Value::as_array)
        .map(|items| items.iter().map(to_protocol_breakdown).collect())
        .unwrap_or_default();

    let recent_sessions = snapshot
        .get("recentSessions")
        .and_then(Value::as_array)
        .map(|items| items.iter().map(to_protocol_session).collect())
        .unwrap_or_default();

    ProtocolSnapshotResponse {
        scan_state: Some(scan_state),
        summary: Some(summary),
        daily,
        model_breakdown,
        project_breakdown,
        recent_sessions,
    }
}

fn to_protocol_summary(summary: &Value) -> ProtocolSummary {
    ProtocolSummary {
        scope: summary
            .get("scope")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        range: summary
            .get("range")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        sessions: summary.get("sessions").and_then(Value::as_u64).unwrap_or(0),
        turns: summary.get("turns").and_then(Value::as_u64).unwrap_or(0),
        zero_cache_read_turns: summary
            .get("zeroCacheReadTurns")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        input_tokens: summary
            .get("inputTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        output_tokens: summary
            .get("outputTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cached_input_tokens: summary
            .get("cachedInputTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cache_read_tokens: summary
            .get("cacheReadTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cache_write_tokens: summary
            .get("cacheWriteTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        reasoning_output_tokens: summary
            .get("reasoningOutputTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        total_tokens: summary
            .get("totalTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        events: summary.get("events").and_then(Value::as_u64).unwrap_or(0),
        cache_reuse_rate: summary
            .get("cacheReuseRate")
            .and_then(Value::as_f64)
            .filter(|v| v.is_finite()),
        estimated_cost_usd: summary
            .get("estimatedCostUsd")
            .and_then(Value::as_f64)
            .filter(|v| v.is_finite()),
        top_model: summary
            .get("topModel")
            .and_then(Value::as_str)
            .map(String::from),
        top_project: summary
            .get("topProject")
            .and_then(Value::as_str)
            .map(String::from),
        has_any_claude_data: summary
            .get("hasAnyClaudeData")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        has_any_codex_data: summary
            .get("hasAnyCodexData")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        has_any_open_code_data: summary
            .get("hasAnyOpenCodeData")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }
}

fn to_protocol_daily_data(data: &Value) -> ProtocolDailyData {
    ProtocolDailyData {
        day: data
            .get("day")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        input_tokens: data.get("inputTokens").and_then(Value::as_u64).unwrap_or(0),
        output_tokens: data
            .get("outputTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cached_input_tokens: data
            .get("cachedInputTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cache_read_tokens: data
            .get("cacheReadTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cache_write_tokens: data
            .get("cacheWriteTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        reasoning_output_tokens: data
            .get("reasoningOutputTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        total_tokens: data.get("totalTokens").and_then(Value::as_u64).unwrap_or(0),
        unpriced_tokens: data
            .get("unpricedTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        estimated_cost_usd: data
            .get("estimatedCostUsd")
            .and_then(Value::as_f64)
            .filter(|v| v.is_finite()),
    }
}

fn to_protocol_breakdown(breakdown: &Value) -> ProtocolBreakdown {
    ProtocolBreakdown {
        key: breakdown
            .get("key")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        label: breakdown
            .get("label")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        sessions: breakdown
            .get("sessions")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        turns: breakdown.get("turns").and_then(Value::as_u64).unwrap_or(0),
        events: breakdown.get("events").and_then(Value::as_u64).unwrap_or(0),
        input_tokens: breakdown
            .get("inputTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        output_tokens: breakdown
            .get("outputTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cached_input_tokens: breakdown
            .get("cachedInputTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cache_read_tokens: breakdown
            .get("cacheReadTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cache_write_tokens: breakdown
            .get("cacheWriteTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        reasoning_output_tokens: breakdown
            .get("reasoningOutputTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        total_tokens: breakdown
            .get("totalTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        estimated_cost_usd: breakdown
            .get("estimatedCostUsd")
            .and_then(Value::as_f64)
            .filter(|v| v.is_finite()),
        has_inferred_pricing: breakdown
            .get("hasInferredPricing")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }
}

fn to_protocol_session(session: &Value) -> ProtocolSession {
    ProtocolSession {
        session_id: session
            .get("sessionId")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        last_active_at: session
            .get("lastActiveAt")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        duration_minutes: session
            .get("durationMinutes")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        project_label: session
            .get("projectLabel")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        turns: session.get("turns").and_then(Value::as_u64).unwrap_or(0),
        events: session.get("events").and_then(Value::as_u64).unwrap_or(0),
        input_tokens: session
            .get("inputTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cached_input_tokens: session
            .get("cachedInputTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        output_tokens: session
            .get("outputTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        reasoning_output_tokens: session
            .get("reasoningOutputTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        total_tokens: session
            .get("totalTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cache_read_tokens: session
            .get("cacheReadTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cache_write_tokens: session
            .get("cacheWriteTokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        branch: session
            .get("branch")
            .and_then(Value::as_str)
            .map(String::from),
        model: session
            .get("model")
            .and_then(Value::as_str)
            .map(String::from),
        has_inferred_pricing: session
            .get("hasInferredPricing")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }
}

fn provider_usage_status(error: ProviderUsageError) -> Status {
    match error {
        ProviderUsageError::Input => status(
            StatusCode::InvalidArgument,
            "Provider usage input is invalid",
        ),
        ProviderUsageError::Read(_) | ProviderUsageError::Replace(_) => status(
            StatusCode::Internal,
            "Provider usage state could not be read",
        ),
        ProviderUsageError::Scan(message) => status(StatusCode::Internal, &message),
        ProviderUsageError::Json(_) => {
            status(StatusCode::Internal, "Provider usage state is invalid")
        }
    }
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
