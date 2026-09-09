// AI-assisted commit message and pull-request field generation, plus
// cancellation. See packages/protocol/proto/yiru/runtime/v1/git_generation.proto
// (GitGenerationService). The typed GitGenerationParams path is what a
// protobuf caller should send; commit_message_ai/source_control_ai exist only
// to carry the same "commitMessageAi"/"sourceControlAi" settings snapshot
// GitAuthority::resolve_generation_params reads out of GenerationOverrides'
// legacy_settings/source_settings JSON blobs (see src/git/generation/mod.rs's
// params_from_settings), now typed instead of passed through as JSON.

use std::collections::HashMap;

use serde_json::{Map, Value, json};

use yiru_protocol::protocol::v1::Status;
use yiru_protocol::runtime::v1::{
    GitAiActionOverride, GitAiCapability, GitAiCapabilityList, GitAiCapabilityListByHost,
    GitAiModelOverride, GitAiPrCreationDefaults, GitAiStringMap, GitCommitMessageAiSettings,
    GitGenerationOverrides, GitGenerationParams,
    GitGenerationServiceCancelGenerateCommitMessageRequest,
    GitGenerationServiceCancelGenerateCommitMessageResponse,
    GitGenerationServiceCancelGeneratePullRequestFieldsRequest,
    GitGenerationServiceCancelGeneratePullRequestFieldsResponse,
    GitGenerationServiceGenerateCommitMessageRequest,
    GitGenerationServiceGenerateCommitMessageResponse,
    GitGenerationServiceGeneratePullRequestFieldsRequest,
    GitGenerationServiceGeneratePullRequestFieldsResponse, GitPullRequestFields,
    GitSourceControlAiSettings,
};
use yiru_protocol::transport::{decode, encode};

use crate::git::{GenerationOverrides, GenerationParams, PullRequestGenerationInput};

use super::super::GitRpc;
use super::support::{authority_status, string_field};

pub(in crate::rpc) async fn generate_commit_message(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitGenerationServiceGenerateCommitMessageRequest>(payload)?;
    let overrides = generation_overrides(request.overrides);
    let result = rpc
        .git
        .generate_commit_message(&request.worktree, overrides)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitGenerationServiceGenerateCommitMessageResponse {
        success: bool_field(&result, "success"),
        message: string_field(&result, "message"),
        agent_label: string_field(&result, "agentLabel"),
        error: string_field(&result, "error"),
        canceled: result.get("canceled").and_then(Value::as_bool),
    }))
}

pub(in crate::rpc) async fn cancel_generate_commit_message(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitGenerationServiceCancelGenerateCommitMessageRequest>(payload)?;
    rpc.git
        .cancel_generate_commit_message(&request.worktree)
        .await
        .map_err(authority_status)?;
    Ok(encode(
        &GitGenerationServiceCancelGenerateCommitMessageResponse { ok: true },
    ))
}

pub(in crate::rpc) async fn generate_pull_request_fields(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitGenerationServiceGeneratePullRequestFieldsRequest>(payload)?;
    let overrides = generation_overrides(request.overrides);
    let result = rpc
        .git
        .generate_pull_request_fields(
            &request.worktree,
            PullRequestGenerationInput {
                base: request.base,
                body: request.body,
                draft: request.draft,
                title: request.title,
                use_template: request.use_template,
            },
            overrides,
        )
        .await
        .map_err(authority_status)?;
    let fields = result.get("fields").map(|value| GitPullRequestFields {
        base: string_field(value, "base").unwrap_or_default(),
        title: string_field(value, "title").unwrap_or_default(),
        body: string_field(value, "body").unwrap_or_default(),
        draft: bool_field(value, "draft"),
    });
    Ok(encode(
        &GitGenerationServiceGeneratePullRequestFieldsResponse {
            success: bool_field(&result, "success"),
            fields,
            agent_label: string_field(&result, "agentLabel"),
            branch_changed_by_preparation: bool_field(&result, "branchChangedByPreparation"),
            error: string_field(&result, "error"),
            canceled: result.get("canceled").and_then(Value::as_bool),
        },
    ))
}

pub(in crate::rpc) async fn cancel_generate_pull_request_fields(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitGenerationServiceCancelGeneratePullRequestFieldsRequest>(payload)?;
    rpc.git
        .cancel_generate_pull_request_fields(&request.worktree)
        .await
        .map_err(authority_status)?;
    Ok(encode(
        &GitGenerationServiceCancelGeneratePullRequestFieldsResponse { ok: true },
    ))
}

fn generation_overrides(overrides: Option<GitGenerationOverrides>) -> GenerationOverrides {
    let Some(overrides) = overrides else {
        return GenerationOverrides {
            agent_commands: HashMap::new(),
            discovery_host_key: None,
            legacy_settings: None,
            params: None,
            source_settings: None,
        };
    };
    GenerationOverrides {
        agent_commands: overrides.agent_commands,
        discovery_host_key: overrides.discovery_host_key,
        legacy_settings: overrides.commit_message_ai.map(commit_message_ai_settings),
        params: overrides.resolved_params.map(generation_params),
        source_settings: overrides.source_control_ai.map(source_control_ai_settings),
    }
}

fn generation_params(value: GitGenerationParams) -> GenerationParams {
    GenerationParams {
        agent_args: value.agent_args,
        agent_command_override: value.agent_command_override,
        agent_id: value.agent_id,
        command_input_template: value.command_input_template,
        custom_agent_command: value.custom_agent_command,
        custom_prompt: value.custom_prompt,
        model: value.model,
        thinking_level: value.thinking_level,
    }
}

fn commit_message_ai_settings(value: GitCommitMessageAiSettings) -> Value {
    let mut output = Map::new();
    output.insert("enabled".to_owned(), Value::Bool(value.enabled));
    output.insert("agentId".to_owned(), nullable_string(value.agent_id));
    output.insert(
        "selectedModelByAgent".to_owned(),
        string_map(value.selected_model_by_agent),
    );
    output.insert(
        "selectedModelByAgentByHost".to_owned(),
        nested_string_map(value.selected_model_by_agent_by_host),
    );
    output.insert(
        "discoveredModelsByAgent".to_owned(),
        capability_map(value.discovered_models_by_agent),
    );
    output.insert(
        "discoveredModelsByAgentByHost".to_owned(),
        nested_capability_map(value.discovered_models_by_agent_by_host),
    );
    output.insert(
        "selectedThinkingByModel".to_owned(),
        string_map(value.selected_thinking_by_model),
    );
    output.insert(
        "customPrompt".to_owned(),
        Value::String(value.custom_prompt),
    );
    output.insert(
        "customAgentCommand".to_owned(),
        Value::String(value.custom_agent_command),
    );
    Value::Object(output)
}

fn source_control_ai_settings(value: GitSourceControlAiSettings) -> Value {
    let mut output = Map::new();
    output.insert("enabled".to_owned(), Value::Bool(value.enabled));
    output.insert("agentId".to_owned(), nullable_string(value.agent_id));
    output.insert(
        "selectedModelByAgent".to_owned(),
        string_map(value.selected_model_by_agent),
    );
    output.insert(
        "selectedModelByAgentByHost".to_owned(),
        nested_string_map(value.selected_model_by_agent_by_host),
    );
    output.insert(
        "discoveredModelsByAgent".to_owned(),
        capability_map(value.discovered_models_by_agent),
    );
    output.insert(
        "discoveredModelsByAgentByHost".to_owned(),
        nested_capability_map(value.discovered_models_by_agent_by_host),
    );
    output.insert(
        "selectedThinkingByModel".to_owned(),
        string_map(value.selected_thinking_by_model),
    );
    output.insert(
        "customAgentCommand".to_owned(),
        Value::String(value.custom_agent_command),
    );
    output.insert("actions".to_owned(), action_map(value.actions));
    output.insert(
        "instructionsByOperation".to_owned(),
        string_map(value.instructions_by_operation),
    );
    output.insert(
        "modelOverridesByOperation".to_owned(),
        model_override_map(value.model_overrides_by_operation),
    );
    if let Some(defaults) = value.pr_creation_defaults {
        output.insert(
            "prCreationDefaults".to_owned(),
            pr_creation_defaults(defaults),
        );
    }
    output.insert(
        "launchActionDefaults".to_owned(),
        action_map(value.launch_action_defaults),
    );
    Value::Object(output)
}

fn nullable_string(value: Option<String>) -> Value {
    value.map_or(Value::Null, Value::String)
}

fn string_map(values: HashMap<String, String>) -> Value {
    Value::Object(
        values
            .into_iter()
            .map(|(key, value)| (key, Value::String(value)))
            .collect(),
    )
}

fn nested_string_map(values: HashMap<String, GitAiStringMap>) -> Value {
    Value::Object(
        values
            .into_iter()
            .map(|(host, values)| (host, string_map(values.values)))
            .collect(),
    )
}

fn capability_list(value: GitAiCapabilityList) -> Value {
    Value::Array(value.capabilities.into_iter().map(capability).collect())
}

fn capability(value: GitAiCapability) -> Value {
    let mut output = Map::new();
    output.insert("id".to_owned(), Value::String(value.id));
    output.insert("label".to_owned(), Value::String(value.label));
    output.insert(
        "thinkingLevels".to_owned(),
        Value::Array(
            value
                .thinking_levels
                .into_iter()
                .map(|level| json!({ "id": level.id, "label": level.label }))
                .collect(),
        ),
    );
    if let Some(default) = value.default_thinking_level {
        output.insert("defaultThinkingLevel".to_owned(), Value::String(default));
    }
    Value::Object(output)
}

fn capability_map(values: HashMap<String, GitAiCapabilityList>) -> Value {
    Value::Object(
        values
            .into_iter()
            .map(|(agent, list)| (agent, capability_list(list)))
            .collect(),
    )
}

fn nested_capability_map(values: HashMap<String, GitAiCapabilityListByHost>) -> Value {
    Value::Object(
        values
            .into_iter()
            .map(|(agent, by_host)| (agent, capability_map(by_host.by_host)))
            .collect(),
    )
}

fn action_override(value: GitAiActionOverride) -> Value {
    let mut output = Map::new();
    output.insert("agentId".to_owned(), nullable_string(value.agent_id));
    if let Some(template) = value.command_input_template {
        output.insert("commandInputTemplate".to_owned(), Value::String(template));
    }
    if let Some(args) = value.agent_args {
        output.insert("agentArgs".to_owned(), Value::String(args));
    }
    Value::Object(output)
}

fn action_map(values: HashMap<String, GitAiActionOverride>) -> Value {
    Value::Object(
        values
            .into_iter()
            .map(|(operation, action)| (operation, action_override(action)))
            .collect(),
    )
}

fn model_override(value: GitAiModelOverride) -> Value {
    let mut output = Map::new();
    output.insert(
        "selectedModelByAgent".to_owned(),
        string_map(value.selected_model_by_agent),
    );
    output.insert(
        "selectedModelByAgentByHost".to_owned(),
        nested_string_map(value.selected_model_by_agent_by_host),
    );
    output.insert(
        "selectedThinkingByModel".to_owned(),
        string_map(value.selected_thinking_by_model),
    );
    Value::Object(output)
}

fn model_override_map(values: HashMap<String, GitAiModelOverride>) -> Value {
    Value::Object(
        values
            .into_iter()
            .map(|(operation, value)| (operation, model_override(value)))
            .collect(),
    )
}

fn pr_creation_defaults(value: GitAiPrCreationDefaults) -> Value {
    let mut output = Map::new();
    if let Some(draft) = value.draft {
        output.insert("draft".to_owned(), Value::Bool(draft));
    }
    if let Some(use_template) = value.use_template {
        output.insert("useTemplate".to_owned(), Value::Bool(use_template));
    }
    if let Some(generate) = value.generate_details_on_open {
        output.insert("generateDetailsOnOpen".to_owned(), Value::Bool(generate));
    }
    if let Some(open_after_create) = value.open_after_create {
        output.insert("openAfterCreate".to_owned(), Value::Bool(open_after_create));
    }
    Value::Object(output)
}

fn bool_field(value: &Value, field: &str) -> bool {
    value.get(field).and_then(Value::as_bool).unwrap_or(false)
}
