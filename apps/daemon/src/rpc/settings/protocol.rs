use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    SettingsServiceGetDocumentRequest, SettingsServiceGetDocumentResponse,
    SettingsServiceGetRequest, SettingsServiceGetResponse,
    SettingsServiceGetTerminalQuickCommandsRequest, SettingsServiceListFontsRequest,
    SettingsServiceListFontsResponse, SettingsServicePreviewGhosttyImportRequest,
    SettingsServicePreviewWarpThemeImportRequest, SettingsServiceSetDocumentRequest,
    SettingsServiceTerminalQuickCommandsResponse, SettingsServiceUpdatePrBotAuthorOverrideRequest,
    SettingsServiceUpdateRequest, SettingsServiceUpdateTerminalQuickCommandsRequest,
    SettingsWarpImportKind,
};
use agentstart_protocol::transport::{decode, encode};

use crate::settings::SettingsError;

use super::SettingsRpc;
use super::protocol_values::{
    ghostty_preview, protocol_document, quick_command_mutation, quick_commands,
    set_document_updates, settings_snapshot, update_patch, warp_preview,
};

pub(in crate::rpc) async fn get(rpc: &SettingsRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    decode::<SettingsServiceGetRequest>(payload)?;
    Ok(encode(&SettingsServiceGetResponse {
        settings: Some(settings_snapshot(&rpc.authority.get())?),
    }))
}

pub(in crate::rpc) async fn update(rpc: &SettingsRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<SettingsServiceUpdateRequest>(payload)?;
    let patch = update_patch(request);
    let document = rpc.authority.update(patch).await.map_err(settings_status)?;
    Ok(encode(&SettingsServiceGetResponse {
        settings: Some(settings_snapshot(&document)?),
    }))
}

pub(in crate::rpc) async fn get_document(
    rpc: &SettingsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<SettingsServiceGetDocumentRequest>(payload)?;
    Ok(encode(&SettingsServiceGetDocumentResponse {
        document: Some(protocol_document(rpc.authority.get())?),
    }))
}

pub(in crate::rpc) async fn set_document(
    rpc: &SettingsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<SettingsServiceSetDocumentRequest>(payload)?;
    let updates = set_document_updates(request.updates)?;
    let document = rpc
        .authority
        .update_global(updates)
        .await
        .map_err(settings_status)?;
    Ok(encode(&SettingsServiceGetDocumentResponse {
        document: Some(protocol_document(document)?),
    }))
}

pub(in crate::rpc) async fn get_terminal_quick_commands(
    rpc: &SettingsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<SettingsServiceGetTerminalQuickCommandsRequest>(payload)?;
    Ok(encode(&SettingsServiceTerminalQuickCommandsResponse {
        terminal_quick_commands: quick_commands(&rpc.authority.terminal_quick_commands()),
    }))
}

pub(in crate::rpc) async fn update_terminal_quick_commands(
    rpc: &SettingsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<SettingsServiceUpdateTerminalQuickCommandsRequest>(payload)?;
    let mutation = quick_command_mutation(
        request
            .mutation
            .as_ref()
            .ok_or_else(|| invalid_argument("A quick command mutation is required"))?,
    )?;
    let commands = rpc
        .authority
        .update_terminal_quick_commands(&mutation)
        .map_err(settings_status)?;
    Ok(encode(&SettingsServiceTerminalQuickCommandsResponse {
        terminal_quick_commands: quick_commands(&commands),
    }))
}

pub(in crate::rpc) async fn update_pr_bot_author_override(
    rpc: &SettingsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<SettingsServiceUpdatePrBotAuthorOverrideRequest>(payload)?;
    let document = rpc
        .authority
        .update_pr_bot_author(&request.author, request.is_bot)
        .map_err(settings_status)?;
    Ok(encode(&SettingsServiceGetResponse {
        settings: Some(settings_snapshot(&document)?),
    }))
}

pub(in crate::rpc) async fn list_fonts(
    rpc: &SettingsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<SettingsServiceListFontsRequest>(payload)?;
    Ok(encode(&SettingsServiceListFontsResponse {
        fonts: rpc.authority.list_fonts().await,
    }))
}

pub(in crate::rpc) async fn preview_ghostty_import(
    rpc: &SettingsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<SettingsServicePreviewGhosttyImportRequest>(payload)?;
    Ok(encode(&ghostty_preview(
        &rpc.authority.preview_ghostty().await,
    )))
}

pub(in crate::rpc) async fn preview_warp_theme_import(
    rpc: &SettingsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<SettingsServicePreviewWarpThemeImportRequest>(payload)?;
    let kind = match request.kind() {
        SettingsWarpImportKind::Auto => "auto",
        SettingsWarpImportKind::ChooseFile => "chooseFile",
        SettingsWarpImportKind::ChooseFolder => "chooseFolder",
        SettingsWarpImportKind::Unspecified => {
            return Err(invalid_argument("Warp import kind is invalid"));
        }
    };
    Ok(encode(&warp_preview(
        &rpc.authority.preview_warp(kind).await,
    )))
}

// Why: the legacy settings verbs answered every authority failure with a bare
// 500, so the protobuf surface mirrors that instead of inventing finer
// statuses the client never saw.
fn settings_status(error: SettingsError) -> Status {
    status(StatusCode::Internal, &error.to_string())
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
