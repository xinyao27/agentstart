use yiru_protocol::protocol::v1::{ErrorDetail, Status, StatusCode};
use yiru_protocol::runtime::v1::{
    LayoutAgentPane, LayoutAppliedPane as ProtocolLayoutAppliedPane, LayoutCommandPane,
    LayoutPane as ProtocolLayoutPane, LayoutRecipe as ProtocolLayoutRecipe, LayoutRevisionConflict,
    LayoutServiceApplyRequest, LayoutServiceApplyResponse, LayoutServiceListRequest,
    LayoutServiceListResponse, LayoutShellPane, layout_pane,
};
use yiru_protocol::transport::{decode, encode};

use crate::layouts::{LayoutAppliedPane, LayoutAuthorityError, LayoutPane, LayoutRecipe};
// Why: rpc::layout::protocol is a descendant of rpc, so it can name this module-private sibling
// directly (see rpc/layout.rs's own Why comment for the same reasoning).
use crate::rpc::agent_session::AgentSessionLaunchError;
use crate::terminal_session::TerminalSessionError;
use crate::worktrees::WorktreeCatalogError;

use super::LayoutRpc;

pub(in crate::rpc) async fn list(rpc: &LayoutRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<LayoutServiceListRequest>(payload)?;
    let recipes = rpc
        .authority
        .list(&request.worktree)
        .await
        .map_err(layout_status)?;
    Ok(encode(&LayoutServiceListResponse {
        recipes: recipes.into_iter().map(protocol_recipe).collect(),
    }))
}

pub(in crate::rpc) async fn apply(rpc: &LayoutRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<LayoutServiceApplyRequest>(payload)?;
    let (panes, revision) = rpc
        .authority
        .apply(&request.worktree, request.expected_revision, &request.name)
        .await
        .map_err(layout_status)?;
    Ok(encode(&LayoutServiceApplyResponse {
        panes: panes.into_iter().map(protocol_applied_pane).collect(),
        revision,
    }))
}

fn protocol_recipe(recipe: LayoutRecipe) -> ProtocolLayoutRecipe {
    ProtocolLayoutRecipe {
        name: recipe.name,
        panes: recipe.panes.into_iter().map(protocol_pane).collect(),
    }
}

fn protocol_pane(pane: LayoutPane) -> ProtocolLayoutPane {
    match pane {
        LayoutPane::Agent {
            agent,
            prompt,
            title,
        } => ProtocolLayoutPane {
            title,
            kind: Some(layout_pane::Kind::Agent(LayoutAgentPane { agent, prompt })),
        },
        LayoutPane::Command { command, title } => ProtocolLayoutPane {
            title,
            kind: Some(layout_pane::Kind::Command(LayoutCommandPane { command })),
        },
        LayoutPane::Shell { title } => ProtocolLayoutPane {
            title,
            kind: Some(layout_pane::Kind::Shell(LayoutShellPane {})),
        },
    }
}

fn protocol_applied_pane(pane: LayoutAppliedPane) -> ProtocolLayoutAppliedPane {
    ProtocolLayoutAppliedPane {
        terminal_handle: pane.terminal_handle,
        title: pane.title,
        session_id: pane.session_id,
    }
}

fn layout_status(error: LayoutAuthorityError) -> Status {
    match error {
        LayoutAuthorityError::RevisionConflict {
            actual_revision,
            expected_revision,
            scope,
        } => Status {
            code: StatusCode::Aborted as i32,
            message: "workspaceRevisionConflict".to_owned(),
            details: vec![ErrorDetail {
                type_name: "yiru.runtime.v1.LayoutRevisionConflict".to_owned(),
                value: encode(&LayoutRevisionConflict {
                    expected_revision,
                    actual_revision,
                    scope: scope.to_owned(),
                }),
            }],
        },
        LayoutAuthorityError::RecipeNotFound => {
            status(StatusCode::NotFound, "layout_recipe_not_found")
        }
        LayoutAuthorityError::Worktree(WorktreeCatalogError::NotFound) => {
            status(StatusCode::NotFound, "worktree_not_found")
        }
        LayoutAuthorityError::Worktree(WorktreeCatalogError::AmbiguousSelector) => status(
            StatusCode::FailedPrecondition,
            "worktree_selector_ambiguous",
        ),
        LayoutAuthorityError::Worktree(error) => status(StatusCode::Internal, &error.to_string()),
        LayoutAuthorityError::Terminal(error) => terminal_status(error),
        LayoutAuthorityError::AgentLaunch(error) => agent_launch_status(error),
        LayoutAuthorityError::Host(error) => status(StatusCode::Internal, &error.to_string()),
        LayoutAuthorityError::Filesystem(error) => status(StatusCode::Internal, &error.to_string()),
        LayoutAuthorityError::Journal(error) => status(StatusCode::Internal, &error.to_string()),
    }
}

fn agent_launch_status(error: AgentSessionLaunchError) -> Status {
    let code = match &error {
        AgentSessionLaunchError::UnknownProvider => StatusCode::InvalidArgument,
        AgentSessionLaunchError::ProviderUnavailable(_) => StatusCode::FailedPrecondition,
        AgentSessionLaunchError::TerminalMissing
        | AgentSessionLaunchError::InvalidSessionRow(_)
        | AgentSessionLaunchError::Store(_) => StatusCode::Internal,
        AgentSessionLaunchError::Filesystem(_)
        | AgentSessionLaunchError::Host(_)
        | AgentSessionLaunchError::Worktree(_) => StatusCode::InvalidArgument,
        AgentSessionLaunchError::Terminal(_) => StatusCode::Internal,
    };
    status(code, &error.to_string())
}

fn terminal_status(error: TerminalSessionError) -> Status {
    let code = match &error {
        TerminalSessionError::InvalidInput(_) => StatusCode::InvalidArgument,
        TerminalSessionError::NotFound => StatusCode::NotFound,
        TerminalSessionError::NotWritable => StatusCode::FailedPrecondition,
        TerminalSessionError::WaitTimeout => StatusCode::DeadlineExceeded,
        TerminalSessionError::Host(_)
        | TerminalSessionError::HostFilesystem(_)
        | TerminalSessionError::Project(_)
        | TerminalSessionError::Worktree(_) => StatusCode::InvalidArgument,
        TerminalSessionError::LaunchPreparation(_)
        | TerminalSessionError::Process(_)
        | TerminalSessionError::ProcessTask(_)
        | TerminalSessionError::Settings(_)
        | TerminalSessionError::WorkspaceSession(_) => StatusCode::Internal,
    };
    status(code, &error.to_string())
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
