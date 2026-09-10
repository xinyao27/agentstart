// Why: the settings authority answers its document projection and quick
// commands as `serde_json::Value` trees shared with the legacy JSON surface;
// this is the single place that reads those trees into the typed protobuf
// wire messages.
use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::settings_json_value::Kind as JsonKind;
use agentstart_protocol::runtime::v1::settings_quick_command::Kind as CommandKind;
use agentstart_protocol::runtime::v1::settings_quick_command_scope::Scope as CommandScope;
use agentstart_protocol::runtime::v1::settings_tui_agent_value::Value as AgentValue;
use agentstart_protocol::runtime::v1::{
    SettingsAgentEnv, SettingsAgentPrompt, SettingsDocument, SettingsGhosttyImportPreview,
    SettingsJsonNull, SettingsJsonValue, SettingsJsonValueEntry, SettingsJsonValueList,
    SettingsJsonValueObject, SettingsQuickCommand, SettingsQuickCommandScope,
    SettingsServiceUpdateRequest, SettingsSnapshot, SettingsTerminalCommand, SettingsTuiAgentValue,
    SettingsWarpThemeImportPreview, SettingsWarpThemeMode, SettingsWarpThemePreview,
    SettingsWarpThemeSkippedFile, SettingsWarpThemeSource,
};
use serde_json::{Map, Value};

use crate::settings::quick_commands;

// Why: the document projection answers the workbench's full routing document
// (`client_settings()`), whose nine normalized fields are typed separately in
// `SettingsSnapshot`; listing every other key as ordered typed JSON entries
// keeps a single encoding per key without google.protobuf.Struct.
const SNAPSHOT_KEYS: &[&str] = &[
    "defaultTuiAgent",
    "disabledTuiAgents",
    "agentCmdOverrides",
    "agentDefaultArgs",
    "agentDefaultEnv",
    "agentStatusHooksEnabled",
    "minimaxGroupId",
    "minimaxUsageModels",
    "prBotAuthorOverrides",
];

pub(super) fn settings_snapshot(document: &Value) -> Result<SettingsSnapshot, Status> {
    let object = document
        .as_object()
        .ok_or_else(|| data_loss("Settings document is not an object"))?;
    Ok(SettingsSnapshot {
        default_tui_agent: Some(tui_agent_value(object.get("defaultTuiAgent"))),
        disabled_tui_agents: string_list(object.get("disabledTuiAgents")),
        agent_cmd_overrides: string_map(object.get("agentCmdOverrides")),
        agent_default_args: string_map(object.get("agentDefaultArgs")),
        agent_default_env: env_list(object.get("agentDefaultEnv")),
        agent_status_hooks_enabled: object
            .get("agentStatusHooksEnabled")
            .and_then(Value::as_bool)
            != Some(false),
        minimax_group_id: text(Some(object), "minimaxGroupId"),
        minimax_usage_models: match object.get("minimaxUsageModels").and_then(Value::as_str) {
            Some(value) => value.to_owned(),
            None => "general".to_owned(),
        },
        pr_bot_author_overrides: string_list(object.get("prBotAuthorOverrides")),
    })
}

fn tui_agent_value(value: Option<&Value>) -> SettingsTuiAgentValue {
    SettingsTuiAgentValue {
        value: match value.and_then(Value::as_str) {
            Some(agent) => Some(AgentValue::Agent(agent.to_owned())),
            None => Some(AgentValue::Null(true)),
        },
    }
}

fn string_list(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

fn string_map(value: Option<&Value>) -> std::collections::HashMap<String, String> {
    value
        .and_then(Value::as_object)
        .map(|object| {
            object
                .iter()
                .filter_map(|(key, value)| {
                    value.as_str().map(|value| (key.clone(), value.to_owned()))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn env_list(value: Option<&Value>) -> Vec<SettingsAgentEnv> {
    value
        .and_then(Value::as_object)
        .map(|object| {
            object
                .iter()
                .map(|(agent, vars)| SettingsAgentEnv {
                    agent: agent.clone(),
                    vars: string_map(Some(vars)),
                })
                .collect()
        })
        .unwrap_or_default()
}

// Why: the legacy update verbs persist a string-keyed patch onto the routing
// document, so the typed protobuf update renders into exactly the patch shape
// `SettingsAuthority::update` normalizes — the one shared writer.
pub(super) fn update_patch(request: SettingsServiceUpdateRequest) -> Map<String, Value> {
    let SettingsServiceUpdateRequest {
        default_tui_agent,
        disabled_tui_agents,
        agent_default_args,
        agent_default_env,
        agent_status_hooks_enabled,
        minimax_group_id,
        minimax_usage_models,
        pr_bot_author_overrides,
    } = request;
    let mut patch = Map::new();
    if let Some(agent) = default_tui_agent
        && let Some(value) = agent.value
    {
        patch.insert(
            "defaultTuiAgent".to_owned(),
            match value {
                AgentValue::Null(_) => Value::Null,
                AgentValue::Agent(agent) => Value::String(agent),
            },
        );
    }
    if !disabled_tui_agents.is_empty() {
        patch.insert(
            "disabledTuiAgents".to_owned(),
            Value::Array(disabled_tui_agents.into_iter().map(Value::String).collect()),
        );
    }
    if let Some(args) = agent_default_args {
        patch.insert(
            "agentDefaultArgs".to_owned(),
            Value::Object(
                args.values
                    .into_iter()
                    .map(|(key, value)| (key, Value::String(value)))
                    .collect(),
            ),
        );
    }
    if let Some(env) = agent_default_env {
        patch.insert(
            "agentDefaultEnv".to_owned(),
            Value::Object(
                env.entries
                    .into_iter()
                    .map(|entry| {
                        (
                            entry.agent,
                            Value::Object(
                                entry
                                    .vars
                                    .into_iter()
                                    .map(|(key, value)| (key, Value::String(value)))
                                    .collect(),
                            ),
                        )
                    })
                    .collect(),
            ),
        );
    }
    if let Some(enabled) = agent_status_hooks_enabled {
        patch.insert("agentStatusHooksEnabled".to_owned(), Value::Bool(enabled));
    }
    if let Some(group_id) = minimax_group_id {
        patch.insert("minimaxGroupId".to_owned(), Value::String(group_id));
    }
    if let Some(models) = minimax_usage_models {
        patch.insert("minimaxUsageModels".to_owned(), Value::String(models));
    }
    if let Some(authors) = pr_bot_author_overrides {
        patch.insert(
            "prBotAuthorOverrides".to_owned(),
            Value::Array(authors.authors.into_iter().map(Value::String).collect()),
        );
    }
    patch
}

pub(super) fn quick_commands(commands: &[Value]) -> Vec<SettingsQuickCommand> {
    commands
        .iter()
        .filter_map(|command| {
            let id = command.get("id")?.as_str()?.to_owned();
            let label = command
                .get("label")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            let scope = command.get("scope").and_then(|scope| {
                let scope = scope.as_object()?;
                if scope.get("type").and_then(Value::as_str) == Some("repo") {
                    Some(SettingsQuickCommandScope {
                        scope: Some(CommandScope::RepoId(
                            scope
                                .get("repoId")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_owned(),
                        )),
                    })
                } else {
                    Some(SettingsQuickCommandScope {
                        scope: Some(CommandScope::Global(true)),
                    })
                }
            });
            if command.get("action").and_then(Value::as_str) == Some("agent-prompt") {
                Some(SettingsQuickCommand {
                    id,
                    label,
                    scope,
                    kind: Some(CommandKind::AgentPrompt(SettingsAgentPrompt {
                        agent: command
                            .get("agent")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_owned(),
                        prompt: command
                            .get("prompt")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_owned(),
                    })),
                })
            } else {
                Some(SettingsQuickCommand {
                    id,
                    label,
                    scope,
                    kind: Some(CommandKind::TerminalCommand(SettingsTerminalCommand {
                        command: command
                            .get("command")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_owned(),
                        append_enter: command
                            .get("appendEnter")
                            .and_then(Value::as_bool)
                            .unwrap_or(true),
                    })),
                })
            }
        })
        .collect()
}

pub(super) fn quick_command_mutation(
    mutation: &agentstart_protocol::runtime::v1::SettingsQuickCommandMutation,
) -> Result<Map<String, Value>, Status> {
    let mutation = mutation
        .mutation
        .as_ref()
        .ok_or_else(|| invalid_argument("A quick command mutation is required"))?;
    match mutation {
        agentstart_protocol::runtime::v1::settings_quick_command_mutation::Mutation::Delete(
            delete,
        ) => {
            bounded("id", &delete.id, quick_commands::MAX_ID)?;
            let mut object = Map::new();
            object.insert("type".to_owned(), Value::String("delete".to_owned()));
            object.insert("id".to_owned(), Value::String(delete.id.clone()));
            Ok(object)
        }
        agentstart_protocol::runtime::v1::settings_quick_command_mutation::Mutation::Upsert(
            upsert,
        ) => {
            let command = upsert
                .command
                .as_ref()
                .ok_or_else(|| invalid_argument("A quick command is required"))?;
            bounded("id", &command.id, quick_commands::MAX_ID)?;
            bounded("label", &command.label, quick_commands::MAX_LABEL)?;
            if let Some(SettingsQuickCommandScope {
                scope: Some(CommandScope::RepoId(repo_id)),
            }) = command.scope.as_ref()
            {
                bounded("repoId", repo_id, quick_commands::MAX_REPO_ID)?;
            }
            let mut command_object = Map::new();
            command_object.insert("id".to_owned(), Value::String(command.id.clone()));
            command_object.insert("label".to_owned(), Value::String(command.label.clone()));
            if let Some(scope) = command.scope.as_ref() {
                command_object.insert(
                    "scope".to_owned(),
                    match scope.scope.as_ref() {
                        Some(CommandScope::RepoId(repo_id)) => Value::Object(Map::from_iter([
                            ("type".to_owned(), Value::String("repo".to_owned())),
                            ("repoId".to_owned(), Value::String(repo_id.clone())),
                        ])),
                        _ => Value::Object(Map::from_iter([(
                            "type".to_owned(),
                            Value::String("global".to_owned()),
                        )])),
                    },
                );
            }
            match command.kind.as_ref() {
                Some(CommandKind::AgentPrompt(prompt)) => {
                    if !quick_commands::valid_prompt_agent(&prompt.agent) {
                        return Err(invalid_argument("Quick command agent is invalid"));
                    }
                    bounded("prompt", &prompt.prompt, quick_commands::MAX_AGENT_PROMPT)?;
                    command_object.insert(
                        "action".to_owned(),
                        Value::String("agent-prompt".to_owned()),
                    );
                    command_object.insert("agent".to_owned(), Value::String(prompt.agent.clone()));
                    command_object
                        .insert("prompt".to_owned(), Value::String(prompt.prompt.clone()));
                }
                Some(CommandKind::TerminalCommand(terminal)) => {
                    bounded(
                        "command",
                        &terminal.command,
                        quick_commands::MAX_TERMINAL_TEXT,
                    )?;
                    command_object.insert(
                        "action".to_owned(),
                        Value::String("terminal-command".to_owned()),
                    );
                    command_object.insert(
                        "command".to_owned(),
                        Value::String(terminal.command.clone()),
                    );
                    command_object
                        .insert("appendEnter".to_owned(), Value::Bool(terminal.append_enter));
                }
                None => return Err(invalid_argument("Quick command kind is required")),
            }
            let mut object = Map::new();
            object.insert("type".to_owned(), Value::String("upsert".to_owned()));
            object.insert("command".to_owned(), Value::Object(command_object));
            Ok(object)
        }
    }
}

// Why: the legacy update verb rejected over-long quick command fields with a
// 400 instead of letting the authority's normalizer truncate them, so the
// protobuf surface keeps those bounds as request validation.
fn bounded(field: &str, value: &str, maximum: usize) -> Result<(), Status> {
    if value.is_empty() || quick_commands::utf16_len(value) > maximum {
        return Err(invalid_argument(&format!(
            "Quick command {field} must be 1 to {maximum} characters"
        )));
    }
    Ok(())
}

pub(super) fn ghostty_preview(value: &Value) -> SettingsGhosttyImportPreview {
    let object = value.as_object();
    SettingsGhosttyImportPreview {
        found: object
            .and_then(|object| object.get("found"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        config_path: object
            .and_then(|object| object.get("configPath"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        config_paths: object
            .and_then(|object| object.get("configPaths"))
            .and_then(Value::as_array)
            .map(|paths| {
                paths
                    .iter()
                    .filter_map(|path| path.as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default(),
        diff: json_entries(object.and_then(|object| object.get("diff"))),
        unsupported_keys: object
            .and_then(|object| object.get("unsupportedKeys"))
            .and_then(Value::as_array)
            .map(|keys| {
                keys.iter()
                    .filter_map(|key| key.as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default(),
        error: object
            .and_then(|object| object.get("error"))
            .and_then(Value::as_str)
            .map(str::to_owned),
    }
}

pub(super) fn warp_preview(value: &Value) -> SettingsWarpThemeImportPreview {
    let object = value.as_object();
    SettingsWarpThemeImportPreview {
        found: object
            .and_then(|object| object.get("found"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        canceled: object
            .and_then(|object| object.get("canceled"))
            .and_then(Value::as_bool),
        desktop_only: object
            .and_then(|object| object.get("desktopOnly"))
            .and_then(Value::as_bool),
        source_label: object
            .and_then(|object| object.get("sourceLabel"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        themes: object
            .and_then(|object| object.get("themes"))
            .and_then(Value::as_array)
            .map(|themes| themes.iter().map(warp_theme).collect())
            .unwrap_or_default(),
        skipped_files: object
            .and_then(|object| object.get("skippedFiles"))
            .and_then(Value::as_array)
            .map(|files| {
                files
                    .iter()
                    .map(|file| SettingsWarpThemeSkippedFile {
                        label: text(file.as_object(), "label"),
                        reason: text(file.as_object(), "reason"),
                    })
                    .collect()
            })
            .unwrap_or_default(),
        error: object
            .and_then(|object| object.get("error"))
            .and_then(Value::as_str)
            .map(str::to_owned),
    }
}

fn warp_theme(value: &Value) -> SettingsWarpThemePreview {
    let object = value.as_object();
    SettingsWarpThemePreview {
        id: text(object, "id"),
        name: text(object, "name"),
        source: match text(object, "source").as_str() {
            "warp" => SettingsWarpThemeSource::Warp,
            "ghostty" => SettingsWarpThemeSource::Ghostty,
            "manual" => SettingsWarpThemeSource::Manual,
            _ => SettingsWarpThemeSource::Unspecified,
        } as i32,
        mode: match text(object, "mode").as_str() {
            "dark" => SettingsWarpThemeMode::Dark,
            "light" => SettingsWarpThemeMode::Light,
            "unknown" => SettingsWarpThemeMode::Unknown,
            _ => SettingsWarpThemeMode::Unspecified,
        } as i32,
        terminal: json_entries(object.and_then(|object| object.get("terminal"))),
        imported_at: text(object, "importedAt"),
        source_label: object
            .and_then(|object| object.get("sourceLabel"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        unsupported_features: object
            .and_then(|object| object.get("unsupportedFeatures"))
            .and_then(Value::as_array)
            .map(|features| {
                features
                    .iter()
                    .filter_map(|feature| feature.as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default(),
        selection_value: text(object, "selectionValue"),
    }
}

fn json_entries(value: Option<&Value>) -> Vec<SettingsJsonValueEntry> {
    value
        .and_then(Value::as_object)
        .map(|object| {
            object
                .iter()
                .map(|(key, value)| SettingsJsonValueEntry {
                    key: key.clone(),
                    value: Some(json_value(value)),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn json_value(value: &Value) -> SettingsJsonValue {
    let kind = match value {
        Value::Null => JsonKind::NullValue(SettingsJsonNull::Value as i32),
        Value::Bool(value) => JsonKind::BoolValue(*value),
        Value::Number(value) => JsonKind::NumberValue(value.as_f64().unwrap_or_default()),
        Value::String(value) => JsonKind::StringValue(value.clone()),
        Value::Array(values) => JsonKind::ListValue(SettingsJsonValueList {
            values: values.iter().map(json_value).collect(),
        }),
        Value::Object(object) => JsonKind::ObjectValue(SettingsJsonValueObject {
            entries: object
                .iter()
                .map(
                    |(key, value)| agentstart_protocol::runtime::v1::SettingsJsonValueEntry {
                        key: key.clone(),
                        value: Some(json_value(value)),
                    },
                )
                .collect(),
        }),
    };
    SettingsJsonValue { kind: Some(kind) }
}

pub(super) fn protocol_document(document: Value) -> Result<SettingsDocument, Status> {
    let object = document
        .as_object()
        .ok_or_else(|| data_loss("Settings document is not an object"))?;
    let fields = object
        .iter()
        .filter(|(key, _)| !SNAPSHOT_KEYS.contains(&key.as_str()))
        .map(|(key, value)| SettingsJsonValueEntry {
            key: key.clone(),
            value: Some(json_value(value)),
        })
        .collect();
    Ok(SettingsDocument {
        settings: Some(settings_snapshot(&document)?),
        fields,
    })
}

// Why: `shell.settings.set` accepted any routing-document key and let the
// authority's normalizer strip retired or unknown keys, so the typed updates
// render into exactly the patch shape `SettingsAuthority::update_global`
// normalizes — the one shared writer.
pub(super) fn set_document_updates(
    updates: Vec<SettingsJsonValueEntry>,
) -> Result<Map<String, Value>, Status> {
    Ok(updates
        .into_iter()
        .map(|entry| {
            (
                entry.key,
                entry.value.map(json_from_value).unwrap_or(Value::Null),
            )
        })
        .collect())
}

fn json_from_value(value: SettingsJsonValue) -> Value {
    match value.kind {
        Some(JsonKind::NullValue(_)) | None => Value::Null,
        Some(JsonKind::BoolValue(value)) => Value::Bool(value),
        Some(JsonKind::NumberValue(value)) => {
            serde_json::Number::from_f64(value).map_or(Value::Null, Value::Number)
        }
        Some(JsonKind::StringValue(value)) => Value::String(value),
        Some(JsonKind::ListValue(value)) => {
            Value::Array(value.values.into_iter().map(json_from_value).collect())
        }
        Some(JsonKind::ObjectValue(value)) => Value::Object(
            value
                .entries
                .into_iter()
                .map(|entry| {
                    (
                        entry.key,
                        entry.value.map(json_from_value).unwrap_or(Value::Null),
                    )
                })
                .collect(),
        ),
    }
}

fn text(object: Option<&Map<String, Value>>, field: &str) -> String {
    object
        .and_then(|object| object.get(field))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

fn data_loss(message: &str) -> Status {
    status(StatusCode::DataLoss, message)
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
