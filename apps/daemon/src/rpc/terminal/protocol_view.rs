use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    TerminalColorSchemeMode, TerminalCursorStyle, TerminalDisplayModeKind,
    TerminalResizeForClientResult as ProtocolResizeResult, TerminalResizeMode,
    TerminalRgb as ProtocolRgb, TerminalServiceGetDisplayModeRequest,
    TerminalServiceGetDisplayModeResponse, TerminalServiceResizeForClientRequest,
    TerminalServiceResizeForClientResponse, TerminalServiceSetDisplayModeRequest,
    TerminalServiceSetDisplayModeResponse, TerminalServiceUpdateViewAttributesRequest,
    TerminalServiceUpdateViewAttributesResponse, TerminalServiceUpdateViewportRequest,
    TerminalServiceUpdateViewportResponse, terminal_service_resize_for_client_request::Mode,
};
use agentstart_protocol::transport::{decode, encode};

use crate::terminal_session::{TerminalClientType, TerminalResizeResult, TerminalSessionAuthority};

use super::protocol::{dimension, internal, invalid, required, terminal_client, terminal_status};

pub(super) fn get_display_mode(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceGetDisplayModeRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    let (mode, is_phone_fitted) = authority
        .display_mode(&request.terminal)
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceGetDisplayModeResponse {
        mode: display_mode_kind(mode)? as i32,
        is_phone_fitted,
    }))
}

pub(super) async fn set_display_mode(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceSetDisplayModeRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    let mode = match TerminalDisplayModeKind::try_from(request.mode) {
        Ok(TerminalDisplayModeKind::Auto) => "auto",
        Ok(TerminalDisplayModeKind::Desktop) => "desktop",
        Ok(TerminalDisplayModeKind::Unspecified) | Err(_) => {
            return Err(invalid("Terminal display mode is invalid"));
        }
    };
    let client = request.client.map(terminal_client).transpose()?;
    let viewport = request
        .viewport
        .map(|viewport| {
            Ok::<(u16, u16), Status>((
                dimension(viewport.cols, 1_000, "Terminal columns")?,
                dimension(viewport.rows, 500, "Terminal rows")?,
            ))
        })
        .transpose()?;
    let seq = authority
        .set_display_mode(&request.terminal, mode, client, viewport)
        .await
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceSetDisplayModeResponse {
        mode: request.mode,
        seq,
    }))
}

pub(super) async fn resize_for_client(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceResizeForClientRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    required(&request.client_id, "Terminal client ID")?;
    let result = match request.mode {
        Some(Mode::Fit(fit)) => {
            let cols = dimension(fit.cols, u16::MAX.into(), "Terminal columns")?;
            let rows = dimension(fit.rows, u16::MAX.into(), "Terminal rows")?;
            authority
                .mobile_fit(&request.terminal, request.client_id, cols, rows)
                .await
                .map_err(terminal_status)?
        }
        Some(Mode::Restore(_)) => authority
            .restore_fit(&request.terminal, &request.client_id)
            .await
            .map_err(terminal_status)?,
        None => return Err(invalid("Terminal resize mode is required")),
    };
    Ok(encode(&TerminalServiceResizeForClientResponse {
        terminal: Some(resize_result(&request.terminal, result)?),
    }))
}

pub(super) async fn update_viewport(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceUpdateViewportRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    let Some(client) = request.client else {
        return Err(invalid("Terminal client is required"));
    };
    let client = terminal_client(client)?;
    if !matches!(
        client.kind,
        TerminalClientType::Mobile | TerminalClientType::Desktop
    ) {
        return Err(invalid("Terminal client kind is invalid"));
    }
    let Some(viewport) = request.viewport else {
        return Err(invalid("Terminal viewport is required"));
    };
    let cols = viewport_dimension(viewport.cols, 20, 240, "Terminal columns")?;
    let rows = viewport_dimension(viewport.rows, 8, 120, "Terminal rows")?;
    let (updated, applied) = authority
        .update_viewport(&request.terminal, client, cols, rows, request.claim)
        .await
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceUpdateViewportResponse {
        applied,
        updated,
    }))
}

pub(super) fn update_view_attributes(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceUpdateViewAttributesRequest>(payload)?;
    if request.ansi.len() != 256 {
        return Err(invalid("Terminal ANSI palette must have 256 colors"));
    }
    let foreground = rgb_triplet(request.foreground, "Terminal foreground color")?;
    let background = rgb_triplet(request.background, "Terminal background color")?;
    let cursor = rgb_triplet(request.cursor, "Terminal cursor color")?;
    let ansi = request
        .ansi
        .into_iter()
        .map(|value| rgb_triplet(Some(value), "Terminal ANSI color"))
        .collect::<Result<Vec<_>, _>>()?;
    let color_scheme_mode = match TerminalColorSchemeMode::try_from(request.color_scheme_mode) {
        Ok(TerminalColorSchemeMode::Dark) => "dark",
        Ok(TerminalColorSchemeMode::Light) => "light",
        Ok(TerminalColorSchemeMode::Unspecified) | Err(_) => {
            return Err(invalid("Terminal color scheme mode is invalid"));
        }
    };
    let cursor_style = match TerminalCursorStyle::try_from(request.cursor_style) {
        Ok(TerminalCursorStyle::Bar) => "bar",
        Ok(TerminalCursorStyle::Block) => "block",
        Ok(TerminalCursorStyle::Underline) => "underline",
        Ok(TerminalCursorStyle::Unspecified) | Err(_) => {
            return Err(invalid("Terminal cursor style is invalid"));
        }
    };
    let attributes = serde_json::json!({
        "foreground": foreground,
        "background": background,
        "cursor": cursor,
        "ansi": ansi,
        "colorSchemeMode": color_scheme_mode,
        "cursorStyle": cursor_style,
        "cursorBlink": request.cursor_blink,
    });
    authority.update_view_attributes(attributes);
    Ok(encode(&TerminalServiceUpdateViewAttributesResponse {
        updated: true,
    }))
}

fn display_mode_kind(mode: &str) -> Result<TerminalDisplayModeKind, Status> {
    match mode {
        "auto" => Ok(TerminalDisplayModeKind::Auto),
        "desktop" => Ok(TerminalDisplayModeKind::Desktop),
        _ => Err(internal("Terminal display mode is invalid")),
    }
}

fn resize_result(
    terminal: &str,
    result: TerminalResizeResult,
) -> Result<ProtocolResizeResult, Status> {
    let mode = match result.mode {
        "mobile-fit" => TerminalResizeMode::MobileFit,
        "desktop-fit" => TerminalResizeMode::DesktopFit,
        _ => return Err(internal("Terminal resize mode is invalid")),
    };
    Ok(ProtocolResizeResult {
        handle: terminal.to_owned(),
        cols: u32::from(result.cols),
        rows: u32::from(result.rows),
        previous_cols: result.previous_cols.map(u32::from),
        previous_rows: result.previous_rows.map(u32::from),
        mode: mode as i32,
    })
}

fn viewport_dimension(value: u32, minimum: u32, maximum: u32, label: &str) -> Result<u16, Status> {
    if value < minimum || value > maximum {
        return Err(invalid(&format!("{label} are invalid")));
    }
    u16::try_from(value).map_err(|_| invalid(&format!("{label} are invalid")))
}

fn rgb_triplet(value: Option<ProtocolRgb>, label: &str) -> Result<[u8; 3], Status> {
    let Some(value) = value else {
        return Err(invalid(&format!("{label} is required")));
    };
    let channel = |channel: u32| -> Result<u8, Status> {
        u8::try_from(channel).map_err(|_| invalid(&format!("{label} is invalid")))
    };
    Ok([
        channel(value.red)?,
        channel(value.green)?,
        channel(value.blue)?,
    ])
}
