use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    RepoAgentStartHooks, RepoAgentStartHooksDefaultTab, RepoAgentStartHooksScripts,
    RepoAgentStartHooksWorktree, RepoHooksCheckStatus, RepoHooksSource,
    RepoServiceHooksCheckRequest, RepoServiceHooksCheckResponse, RepoServiceHooksRequest,
    RepoServiceHooksResponse, RepoServiceRemoveSparsePresetRequest,
    RepoServiceRemoveSparsePresetResponse, RepoServiceSaveSparsePresetRequest,
    RepoServiceSaveSparsePresetResponse, RepoServiceSetupScriptImportsRequest,
    RepoServiceSetupScriptImportsResponse, RepoServiceSparsePresetsRequest,
    RepoServiceSparsePresetsResponse, RepoSetupRunPolicy, RepoSetupScriptImportCandidate,
    RepoSetupTrust, RepoSparsePreset,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::Value;

use crate::repositories::SparsePresetSaveInput;

use super::RepoRpc;
use super::protocol::{repository_status, status};

pub(in crate::rpc) async fn hooks(rpc: &RepoRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<RepoServiceHooksRequest>(payload)?;
    let selector = required_repo(&request.repo)?;
    let value = rpc
        .repositories
        .hooks(selector)
        .await
        .map_err(repository_status)?;
    let object = value.as_object();
    Ok(encode(&RepoServiceHooksResponse {
        has_hooks_file: object
            .and_then(|object| object.get("hasHooksFile"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        hooks: object
            .and_then(|object| object.get("hooks"))
            .and_then(agentstart_hooks_message),
        setup_run_policy: object
            .and_then(|object| object.get("setupRunPolicy"))
            .and_then(Value::as_str)
            .map(setup_run_policy)
            .transpose()?
            .unwrap_or(RepoSetupRunPolicy::Unspecified) as i32,
        source: object
            .and_then(|object| object.get("source"))
            .and_then(Value::as_str)
            .map(hooks_source)
            .transpose()?
            .unwrap_or(RepoHooksSource::Unspecified) as i32,
        setup_trust: object
            .and_then(|object| object.get("setupTrust"))
            .and_then(setup_trust_message),
    }))
}

pub(in crate::rpc) async fn hooks_check(rpc: &RepoRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<RepoServiceHooksCheckRequest>(payload)?;
    let selector = required_repo(&request.repo)?;
    let host_id = optional_host_id(request.host_id.as_deref())?;
    let value = rpc.repositories.hooks_check(selector, host_id).await;
    let object = value.as_object();
    let status = match object
        .and_then(|object| object.get("status"))
        .and_then(Value::as_str)
    {
        Some("ok") => RepoHooksCheckStatus::Ok,
        _ => RepoHooksCheckStatus::Error,
    };
    Ok(encode(&RepoServiceHooksCheckResponse {
        status: status as i32,
        has_hooks: object
            .and_then(|object| object.get("hasHooks"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        hooks: object
            .and_then(|object| object.get("hooks"))
            .and_then(agentstart_hooks_message),
        may_need_update: object
            .and_then(|object| object.get("mayNeedUpdate"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }))
}

pub(in crate::rpc) async fn setup_script_imports(
    rpc: &RepoRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<RepoServiceSetupScriptImportsRequest>(payload)?;
    let selector = required_repo(&request.repo)?;
    let candidates = rpc
        .repositories
        .setup_script_imports(selector)
        .await
        .map_err(repository_status)?;
    Ok(encode(&RepoServiceSetupScriptImportsResponse {
        candidates: candidates
            .iter()
            .filter_map(setup_script_import_candidate)
            .collect(),
    }))
}

pub(in crate::rpc) async fn sparse_presets(
    rpc: &RepoRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<RepoServiceSparsePresetsRequest>(payload)?;
    let selector = required_repo(&request.repo)?.to_owned();
    let presets = rpc
        .repositories
        .list_sparse_presets(selector)
        .await
        .map_err(repository_status)?;
    Ok(encode(&RepoServiceSparsePresetsResponse {
        presets: presets.iter().filter_map(sparse_preset_message).collect(),
    }))
}

pub(in crate::rpc) async fn save_sparse_preset(
    rpc: &RepoRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<RepoServiceSaveSparsePresetRequest>(payload)?;
    let selector = required_repo(&request.repo)?.to_owned();
    if request.name.is_empty() {
        return Err(status(StatusCode::InvalidArgument, "Missing preset name"));
    }
    let preset = rpc
        .repositories
        .save_sparse_preset(SparsePresetSaveInput {
            directories: request.directories,
            host_id: "local".to_owned(),
            id: request.id.filter(|id| !id.is_empty()),
            name: request.name,
            selector,
        })
        .await
        .map_err(repository_status)?;
    Ok(encode(&RepoServiceSaveSparsePresetResponse {
        preset: sparse_preset_message(&preset),
    }))
}

pub(in crate::rpc) async fn remove_sparse_preset(
    rpc: &RepoRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<RepoServiceRemoveSparsePresetRequest>(payload)?;
    let selector = required_repo(&request.repo)?.to_owned();
    if request.preset_id.is_empty() {
        return Err(status(StatusCode::InvalidArgument, "Missing presetId"));
    }
    rpc.repositories
        .remove_sparse_preset(selector, request.preset_id)
        .await
        .map_err(repository_status)?;
    Ok(encode(&RepoServiceRemoveSparsePresetResponse {
        removed: true,
    }))
}

fn agentstart_hooks_message(value: &Value) -> Option<RepoAgentStartHooks> {
    if value.is_null() {
        return None;
    }
    let object = value.as_object()?;
    let scripts = object.get("scripts").and_then(Value::as_object);
    let default_tabs = object
        .get("defaultTabs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tab| {
            let tab = tab.as_object()?;
            Some(RepoAgentStartHooksDefaultTab {
                title: tab.get("title").and_then(Value::as_str).map(str::to_owned),
                color: tab.get("color").and_then(Value::as_str).map(str::to_owned),
                command: tab
                    .get("command")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
            })
        })
        .collect();
    let worktree = object
        .get("worktree")
        .and_then(Value::as_object)
        .and_then(|worktree| worktree.get("sharedDirectories"))
        .and_then(Value::as_array)
        .map(|directories| RepoAgentStartHooksWorktree {
            shared_directories: directories
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect(),
        });
    Some(RepoAgentStartHooks {
        scripts: Some(RepoAgentStartHooksScripts {
            setup: scripts
                .and_then(|scripts| scripts.get("setup"))
                .and_then(Value::as_str)
                .map(str::to_owned),
            archive: scripts
                .and_then(|scripts| scripts.get("archive"))
                .and_then(Value::as_str)
                .map(str::to_owned),
        }),
        default_tabs,
        worktree,
    })
}

fn setup_trust_message(value: &Value) -> Option<RepoSetupTrust> {
    let object = value.as_object()?;
    Some(RepoSetupTrust {
        content_hash: object.get("contentHash")?.as_str()?.to_owned(),
        script_content: object.get("scriptContent")?.as_str()?.to_owned(),
    })
}

fn setup_script_import_candidate(value: &Value) -> Option<RepoSetupScriptImportCandidate> {
    let object = value.as_object()?;
    Some(RepoSetupScriptImportCandidate {
        provider: object.get("provider")?.as_str()?.to_owned(),
        label: object.get("label")?.as_str()?.to_owned(),
        files: object
            .get("files")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
        setup: object.get("setup")?.as_str()?.to_owned(),
        archive: object
            .get("archive")
            .and_then(Value::as_str)
            .map(str::to_owned),
        unsupported_fields: object
            .get("unsupportedFields")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
    })
}

fn sparse_preset_message(value: &Value) -> Option<RepoSparsePreset> {
    let object = value.as_object()?;
    Some(RepoSparsePreset {
        id: object.get("id")?.as_str()?.to_owned(),
        repo_id: object.get("repoId")?.as_str()?.to_owned(),
        name: object.get("name")?.as_str()?.to_owned(),
        directories: object
            .get("directories")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
        created_at: object.get("createdAt")?.as_i64()?,
        updated_at: object.get("updatedAt")?.as_i64()?,
    })
}

fn setup_run_policy(value: &str) -> Result<RepoSetupRunPolicy, Status> {
    match value {
        "ask" => Ok(RepoSetupRunPolicy::Ask),
        "run-by-default" => Ok(RepoSetupRunPolicy::RunByDefault),
        "skip-by-default" => Ok(RepoSetupRunPolicy::SkipByDefault),
        _ => Err(status(
            StatusCode::DataLoss,
            "Repository setup policy is invalid",
        )),
    }
}

fn hooks_source(value: &str) -> Result<RepoHooksSource, Status> {
    match value {
        "agentstart.yaml" => Ok(RepoHooksSource::AgentStartYaml),
        "legacy" => Ok(RepoHooksSource::Legacy),
        _ => Err(status(
            StatusCode::DataLoss,
            "Repository hooks source is invalid",
        )),
    }
}

fn required_repo(value: &str) -> Result<&str, Status> {
    if value.is_empty() {
        Err(status(StatusCode::InvalidArgument, "Missing repo selector"))
    } else {
        Ok(value)
    }
}

fn optional_host_id(value: Option<&str>) -> Result<Option<&str>, Status> {
    match value {
        None => Ok(None),
        Some(value) if is_host_id(value) => Ok(Some(value)),
        Some(_) => Err(status(StatusCode::InvalidArgument, "host_id_invalid")),
    }
}

fn is_host_id(value: &str) -> bool {
    value == "local"
        || ["runtime:", "ssh:", "wsl:"].iter().any(|prefix| {
            value
                .strip_prefix(prefix)
                .is_some_and(|value| !value.is_empty())
        })
}
