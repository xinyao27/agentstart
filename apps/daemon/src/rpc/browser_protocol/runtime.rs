use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::TabCreateCommand;
use yiru_protocol::transport::{decode, encode};

use super::{
    BrowserProtocolRpc, COMMAND_TIMEOUT, ProtocolCallContext, RequestCommand, ResponseResult,
    execute_command, principal_authority_id, resolve_worktree, status,
};

pub(in crate::rpc) async fn create_tab(
    rpc: &BrowserProtocolRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<Vec<u8>, Status> {
    let mut command = decode::<TabCreateCommand>(payload)?;
    let target = command
        .target
        .as_mut()
        .ok_or_else(|| status(StatusCode::InvalidArgument, "browser_worktree_required"))?;
    if target.page.is_some() {
        return Err(status(
            StatusCode::InvalidArgument,
            "browser_create_page_not_allowed",
        ));
    }
    let selector = target
        .worktree
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| status(StatusCode::InvalidArgument, "browser_worktree_required"))?;
    let worktree = resolve_worktree(rpc, selector).await?;
    target.worktree = Some(format!("id:{}", worktree.id));
    let result = execute_command(
        rpc,
        principal_authority_id(context),
        RequestCommand::TabCreate(command),
        context,
        COMMAND_TIMEOUT,
    )
    .await?;
    match result {
        ResponseResult::TabCreate(page) if !page.browser_page_id.trim().is_empty() => {
            Ok(encode(&page))
        }
        _ => Err(status(
            StatusCode::DataLoss,
            "browser_create_response_invalid",
        )),
    }
}
