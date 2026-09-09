use std::sync::atomic::Ordering;

use serde_json::Value;
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::skill_manage_scope::Scope as ManageScope;
use yiru_protocol::runtime::v1::skills_service_manage_events_subscribe_response::Event;
use yiru_protocol::runtime::v1::{
    SkillDiscoverRuntime, SkillEventsEnd, SkillEventsReady,
    SkillManageScope as ProtocolSkillManageScope, SkillsServiceDiscoverRequest,
    SkillsServiceDiscoverResponse, SkillsServiceManageAcknowledgeUpdateRunRequest,
    SkillsServiceManageAcknowledgeUpdateRunResponse, SkillsServiceManageCancelUpdateRunRequest,
    SkillsServiceManageCancelUpdateRunResponse, SkillsServiceManageEventsSubscribeRequest,
    SkillsServiceManageEventsSubscribeResponse, SkillsServiceManageFreshnessInventoryRequest,
    SkillsServiceManageFreshnessInventoryResponse, SkillsServiceManageGetUpdateRunRequest,
    SkillsServiceManageGetUpdateRunResponse, SkillsServiceManageListSkillFilesRequest,
    SkillsServiceManageListSkillFilesResponse, SkillsServiceManageReadSkillDirFileRequest,
    SkillsServiceManageReadSkillDirFileResponse, SkillsServiceManageStartInstallRunRequest,
    SkillsServiceManageStartInstallRunResponse, SkillsServiceManageStartRemoveRunRequest,
    SkillsServiceManageStartRemoveRunResponse, SkillsServiceManageStartUpdateRunRequest,
    SkillsServiceManageStartUpdateRunResponse,
};
use yiru_protocol::transport::{decode, encode};

use crate::rpc::protocol_call::ProtocolCallContext;
use crate::skills::{SkillDiscoverRequest, SkillManageScope, SkillRunOperation, SkillRunStart};

use super::SUBSCRIPTION_SEQUENCE;
use super::SkillsRpc;
use super::protocol_values::{
    directory_listing, discovered_skill, discovery_source, file_read_result,
    freshness_inventory as protocol_freshness_inventory, internal_error, skill_update_run,
    start_outcome,
};

pub(in crate::rpc) async fn discover(rpc: &SkillsRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<SkillsServiceDiscoverRequest>(payload)?;
    if request.cwd.as_deref().is_some_and(str::is_empty) {
        return Err(invalid_argument("Working directory must not be empty"));
    }
    let wsl_runtime =
        SkillDiscoverRuntime::try_from(request.runtime) == Ok(SkillDiscoverRuntime::Wsl);
    let output = rpc
        .authority
        .discover_for(SkillDiscoverRequest {
            execution_host_id: request.execution_host_id,
            wsl_runtime,
            cwd: request.cwd,
        })
        .await
        .map_err(|_| internal_error())?;
    Ok(encode(&discover_response(&output)?))
}

pub(in crate::rpc) async fn freshness_inventory(
    rpc: &SkillsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<SkillsServiceManageFreshnessInventoryRequest>(payload)?;
    let output = rpc
        .authority
        .freshness()
        .await
        .map_err(|_| internal_error())?;
    Ok(encode(&SkillsServiceManageFreshnessInventoryResponse {
        inventory: Some(protocol_freshness_inventory(&output)),
    }))
}

pub(in crate::rpc) async fn start_update_run(
    rpc: &SkillsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<SkillsServiceManageStartUpdateRunRequest>(payload)?;
    let outcome = rpc
        .authority
        .start_run(SkillRunStart {
            operation: SkillRunOperation::Update,
            names: request.names,
            source: None,
            scope: Some(SkillManageScope::Global),
        })
        .await;
    Ok(encode(&SkillsServiceManageStartUpdateRunResponse {
        result: Some(start_outcome(outcome)),
    }))
}

pub(in crate::rpc) async fn start_install_run(
    rpc: &SkillsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<SkillsServiceManageStartInstallRunRequest>(payload)?;
    let scope = request
        .scope
        .as_ref()
        .ok_or_else(|| invalid_argument("A skill scope is required"))?;
    let scope = manage_scope(scope)?;
    let outcome = rpc
        .authority
        .start_run(SkillRunStart {
            operation: SkillRunOperation::Install,
            names: request.skill_names,
            source: Some(request.source),
            scope: Some(scope),
        })
        .await;
    Ok(encode(&SkillsServiceManageStartInstallRunResponse {
        result: Some(start_outcome(outcome)),
    }))
}

pub(in crate::rpc) async fn start_remove_run(
    rpc: &SkillsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<SkillsServiceManageStartRemoveRunRequest>(payload)?;
    let scope = request
        .scope
        .as_ref()
        .ok_or_else(|| invalid_argument("A skill scope is required"))?;
    let scope = manage_scope(scope)?;
    let outcome = rpc
        .authority
        .start_run(SkillRunStart {
            operation: SkillRunOperation::Remove,
            names: request.names,
            source: None,
            scope: Some(scope),
        })
        .await;
    Ok(encode(&SkillsServiceManageStartRemoveRunResponse {
        result: Some(start_outcome(outcome)),
    }))
}

pub(in crate::rpc) async fn list_skill_files(
    rpc: &SkillsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<SkillsServiceManageListSkillFilesRequest>(payload)?;
    required(&request.directory_path, "Directory path must not be empty")?;
    let listing = rpc.authority.list_files(&request.directory_path).await;
    Ok(encode(&SkillsServiceManageListSkillFilesResponse {
        listing: Some(directory_listing(&listing)),
    }))
}

pub(in crate::rpc) async fn read_skill_dir_file(
    rpc: &SkillsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<SkillsServiceManageReadSkillDirFileRequest>(payload)?;
    required(&request.directory_path, "Directory path must not be empty")?;
    let result = rpc
        .authority
        .read_file(&request.directory_path, &request.relative_path)
        .await;
    Ok(encode(&SkillsServiceManageReadSkillDirFileResponse {
        result: Some(file_read_result(&result)),
    }))
}

pub(in crate::rpc) async fn cancel_update_run(
    rpc: &SkillsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<SkillsServiceManageCancelUpdateRunRequest>(payload)?;
    let run = rpc.authority.cancel().await;
    Ok(encode(&SkillsServiceManageCancelUpdateRunResponse {
        run: Some(skill_update_run(run)),
    }))
}

pub(in crate::rpc) async fn acknowledge_update_run(
    rpc: &SkillsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<SkillsServiceManageAcknowledgeUpdateRunRequest>(payload)?;
    let run = rpc.authority.acknowledge().await;
    Ok(encode(&SkillsServiceManageAcknowledgeUpdateRunResponse {
        run: Some(skill_update_run(run)),
    }))
}

pub(in crate::rpc) async fn get_update_run(
    rpc: &SkillsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<SkillsServiceManageGetUpdateRunRequest>(payload)?;
    let run = rpc.authority.state().await;
    Ok(encode(&SkillsServiceManageGetUpdateRunResponse {
        run: Some(skill_update_run(run)),
    }))
}

pub(in crate::rpc) async fn subscribe(
    rpc: &SkillsRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    decode::<SkillsServiceManageEventsSubscribeRequest>(payload)?;
    let mut receiver = rpc.authority.subscribe();
    let sequence = SUBSCRIPTION_SEQUENCE.fetch_add(1, Ordering::Relaxed) + 1;
    let ready = Event::Ready(SkillEventsReady {
        subscription_id: format!("skill-update-run-events-inproc-{sequence}"),
    });
    context
        .send_stream_payload(encode(&SkillsServiceManageEventsSubscribeResponse {
            event: Some(ready),
        }))
        .await?;
    loop {
        match receiver.recv().await {
            Ok(run) => {
                context
                    .send_stream_payload(encode(&SkillsServiceManageEventsSubscribeResponse {
                        event: Some(Event::Run(skill_update_run(run))),
                    }))
                    .await?;
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
        }
    }
    context
        .send_stream_payload(encode(&SkillsServiceManageEventsSubscribeResponse {
            event: Some(Event::End(SkillEventsEnd {})),
        }))
        .await
}

fn discover_response(output: &Value) -> Result<SkillsServiceDiscoverResponse, Status> {
    let object = output
        .as_object()
        .ok_or_else(|| data_loss("Skill discovery result is not an object"))?;
    Ok(SkillsServiceDiscoverResponse {
        skills: object
            .get("skills")
            .and_then(Value::as_array)
            .map(|skills| skills.iter().map(discovered_skill).collect())
            .unwrap_or_default(),
        sources: object
            .get("sources")
            .and_then(Value::as_array)
            .map(|sources| sources.iter().map(discovery_source).collect())
            .unwrap_or_default(),
        scanned_at: object
            .get("scannedAt")
            .and_then(Value::as_i64)
            .unwrap_or_default(),
    })
}

fn manage_scope(scope: &ProtocolSkillManageScope) -> Result<SkillManageScope, Status> {
    match scope.scope.as_ref() {
        Some(ManageScope::Global(_)) => Ok(SkillManageScope::Global),
        Some(ManageScope::Project(project)) => {
            if project.repo_path.is_empty() {
                Err(invalid_argument("Project scope needs a repository path"))
            } else {
                Ok(SkillManageScope::Project {
                    repo_path: project.repo_path.clone(),
                })
            }
        }
        None => Err(invalid_argument("Skill scope is invalid")),
    }
}

fn required(value: &str, message: &str) -> Result<(), Status> {
    if value.is_empty() {
        return Err(status(StatusCode::InvalidArgument, message));
    }
    Ok(())
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn data_loss(message: &str) -> Status {
    status(StatusCode::DataLoss, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
