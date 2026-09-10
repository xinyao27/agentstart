use std::collections::HashMap;

use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    Repo, RepoCommandSourcePolicy, RepoExternalWorktreeVisibility, RepoForgeRemotePreference,
    RepoForkSyncMode, RepoGitRemoteIdentity, RepoHookSettings, RepoHookSettingsMode,
    RepoHostStringMap, RepoIcon, RepoIconImageSource, RepoImageIcon, RepoKind, RepoNullableBool,
    RepoNullableGitRemoteIdentity, RepoNullableIcon, RepoNullableString, RepoNullableStringMap,
    RepoNullableUpstream, RepoProjectHostSetupMethod, RepoSetupAgentStartupPolicy,
    RepoSetupRunPolicy, RepoSourceControlActionOverride, RepoSourceControlActionOverrideMap,
    RepoSourceControlAiOverrides, RepoSourceControlModelChoice, RepoSourceControlModelChoiceMap,
    RepoSourceControlPrCreationDefaults, RepoStringList, RepoStringMap, RepoUpstream, repo_icon,
    repo_nullable_bool, repo_nullable_git_remote_identity, repo_nullable_icon,
    repo_nullable_string, repo_nullable_upstream,
};
use serde_json::{Map, Value, json};

pub(super) fn protocol_repo(value: Value) -> Result<Repo, Status> {
    let object = value
        .as_object()
        .ok_or_else(|| data_loss("Stored repository is not an object"))?;
    Ok(Repo {
        id: required_string(object, "id")?,
        path: required_string(object, "path")?,
        display_name: required_string(object, "displayName")?,
        badge_color: required_string(object, "badgeColor")?,
        repo_icon: optional_nullable(object, "repoIcon", nullable_icon)?,
        upstream: optional_nullable(object, "upstream", nullable_upstream)?,
        added_at: required_integer(object, "addedAt")?,
        kind: optional_enum(object, "kind", repo_kind)? as i32,
        git_username: optional_string(object, "gitUsername")?,
        worktree_base_ref: optional_string(object, "worktreeBaseRef")?,
        worktree_base_path: optional_string(object, "worktreeBasePath")?,
        hook_settings: optional_object(object, "hookSettings", hook_settings)?,
        connection_id: optional_nullable(object, "connectionId", nullable_string)?,
        execution_host_id: optional_nullable(object, "executionHostId", nullable_string)?,
        forge_remote_preference: optional_enum(
            object,
            "forgeRemotePreference",
            forge_remote_preference,
        )? as i32,
        fork_sync_mode: optional_enum(object, "forkSyncMode", fork_sync_mode)? as i32,
        git_remote_identity: optional_nullable(
            object,
            "gitRemoteIdentity",
            nullable_remote_identity,
        )?,
        external_worktree_visibility: optional_enum(
            object,
            "externalWorktreeVisibility",
            external_worktree_visibility,
        )? as i32,
        external_worktree_visibility_legacy: optional_bool(
            object,
            "externalWorktreeVisibilityLegacy",
        )?,
        external_worktree_visibility_prompt_dismissed_at: optional_number(
            object,
            "externalWorktreeVisibilityPromptDismissedAt",
        )?,
        external_worktree_inbox_baseline_paths: optional_string_list(
            object,
            "externalWorktreeInboxBaselinePaths",
        )?,
        imported_external_worktree_paths: optional_string_list(
            object,
            "importedExternalWorktreePaths",
        )?,
        external_worktree_discovery_suppressed_at: optional_number(
            object,
            "externalWorktreeDiscoverySuppressedAt",
        )?,
        symlink_paths: optional_string_list(object, "symlinkPaths")?,
        project_group_id: optional_nullable(object, "projectGroupId", nullable_string)?,
        project_group_order: optional_number(object, "projectGroupOrder")?,
        source_control_ai: optional_object(object, "sourceControlAi", source_control_ai)?,
        project_host_setup_method: optional_enum(
            object,
            "projectHostSetupMethod",
            project_host_setup_method,
        )? as i32,
    })
}

pub(crate) fn repo_value(repo: Repo) -> Result<Value, Status> {
    let mut value = Map::new();
    value.insert("id".to_owned(), json!(repo.id));
    value.insert("path".to_owned(), json!(repo.path));
    value.insert("displayName".to_owned(), json!(repo.display_name));
    value.insert("badgeColor".to_owned(), json!(repo.badge_color));
    insert_optional(
        &mut value,
        "repoIcon",
        repo.repo_icon.map(icon_value).transpose()?,
    );
    insert_optional(
        &mut value,
        "upstream",
        repo.upstream.map(upstream_value).transpose()?,
    );
    value.insert("addedAt".to_owned(), json!(repo.added_at));
    insert_enum(&mut value, "kind", repo.kind, repo_kind_value)?;
    insert_optional(
        &mut value,
        "gitUsername",
        repo.git_username.map(Value::String),
    );
    insert_optional(
        &mut value,
        "worktreeBaseRef",
        repo.worktree_base_ref.map(Value::String),
    );
    insert_optional(
        &mut value,
        "worktreeBasePath",
        repo.worktree_base_path.map(Value::String),
    );
    insert_optional(
        &mut value,
        "hookSettings",
        repo.hook_settings.map(hook_settings_value).transpose()?,
    );
    insert_optional(
        &mut value,
        "connectionId",
        repo.connection_id.map(nullable_string_value).transpose()?,
    );
    insert_optional(
        &mut value,
        "executionHostId",
        repo.execution_host_id
            .map(nullable_string_value)
            .transpose()?,
    );
    insert_enum(
        &mut value,
        "forgeRemotePreference",
        repo.forge_remote_preference,
        forge_remote_preference_value,
    )?;
    insert_enum(
        &mut value,
        "forkSyncMode",
        repo.fork_sync_mode,
        fork_sync_mode_value,
    )?;
    insert_optional(
        &mut value,
        "gitRemoteIdentity",
        repo.git_remote_identity
            .map(remote_identity_value)
            .transpose()?,
    );
    insert_enum(
        &mut value,
        "externalWorktreeVisibility",
        repo.external_worktree_visibility,
        external_worktree_visibility_value,
    )?;
    insert_optional(
        &mut value,
        "externalWorktreeVisibilityLegacy",
        repo.external_worktree_visibility_legacy.map(Value::Bool),
    );
    insert_optional(
        &mut value,
        "externalWorktreeVisibilityPromptDismissedAt",
        repo.external_worktree_visibility_prompt_dismissed_at
            .map(Value::from),
    );
    insert_string_list(
        &mut value,
        "externalWorktreeInboxBaselinePaths",
        repo.external_worktree_inbox_baseline_paths,
    );
    insert_string_list(
        &mut value,
        "importedExternalWorktreePaths",
        repo.imported_external_worktree_paths,
    );
    insert_optional(
        &mut value,
        "externalWorktreeDiscoverySuppressedAt",
        repo.external_worktree_discovery_suppressed_at
            .map(Value::from),
    );
    insert_string_list(&mut value, "symlinkPaths", repo.symlink_paths);
    insert_optional(
        &mut value,
        "projectGroupId",
        repo.project_group_id
            .map(nullable_string_value)
            .transpose()?,
    );
    insert_optional(
        &mut value,
        "projectGroupOrder",
        repo.project_group_order.map(Value::from),
    );
    insert_optional(
        &mut value,
        "sourceControlAi",
        repo.source_control_ai
            .map(source_control_ai_value)
            .transpose()?,
    );
    insert_enum(
        &mut value,
        "projectHostSetupMethod",
        repo.project_host_setup_method,
        project_host_setup_method_value,
    )?;
    Ok(Value::Object(value))
}

pub(crate) fn icon_value(value: RepoNullableIcon) -> Result<Value, Status> {
    match value.value {
        Some(repo_nullable_icon::Value::Null(_)) => Ok(Value::Null),
        Some(repo_nullable_icon::Value::Icon(icon)) => match icon.value {
            Some(repo_icon::Value::LucideName(name)) => Ok(json!({ "type":"lucide", "name":name })),
            Some(repo_icon::Value::Emoji(emoji)) => Ok(json!({ "type":"emoji", "emoji":emoji })),
            Some(repo_icon::Value::Image(image)) => {
                let source = icon_source_value(image.source)?;
                let mut value = Map::from_iter([
                    ("type".to_owned(), json!("image")),
                    ("src".to_owned(), json!(image.src)),
                    ("source".to_owned(), json!(source)),
                ]);
                insert_optional(&mut value, "label", image.label.map(Value::String));
                Ok(Value::Object(value))
            }
            None => Err(data_loss("Repository icon value is missing")),
        },
        None => Err(data_loss("Repository icon field is missing")),
    }
}

pub(crate) fn upstream_value(value: RepoNullableUpstream) -> Result<Value, Status> {
    match value.value {
        Some(repo_nullable_upstream::Value::Null(_)) => Ok(Value::Null),
        Some(repo_nullable_upstream::Value::Upstream(upstream)) => {
            Ok(json!({ "owner":upstream.owner, "repo":upstream.repo }))
        }
        None => Err(data_loss("Repository upstream field is missing")),
    }
}

fn nullable_string_value(value: RepoNullableString) -> Result<Value, Status> {
    match value.value {
        Some(repo_nullable_string::Value::Text(value)) => Ok(Value::String(value)),
        Some(repo_nullable_string::Value::Null(_)) => Ok(Value::Null),
        None => Err(data_loss("Repository nullable string is missing")),
    }
}

// Why: `repo.update`'s partial-update semantics silently drop a field set to
// an empty string (leave untouched) rather than clearing it — only an
// explicit null clears — so this mirrors `project_group_id()` in
// input/update.rs instead of reusing `nullable_string_value`'s always-insert
// shape.
pub(crate) fn nullable_string_update_value(
    value: RepoNullableString,
) -> Result<Option<Value>, Status> {
    match value.value {
        Some(repo_nullable_string::Value::Null(_)) => Ok(Some(Value::Null)),
        Some(repo_nullable_string::Value::Text(text)) => {
            Ok((!text.is_empty()).then_some(Value::String(text)))
        }
        None => Err(data_loss("Repository nullable string is missing")),
    }
}

fn remote_identity_value(value: RepoNullableGitRemoteIdentity) -> Result<Value, Status> {
    match value.value {
        Some(repo_nullable_git_remote_identity::Value::Null(_)) => Ok(Value::Null),
        Some(repo_nullable_git_remote_identity::Value::Identity(identity)) => Ok(json!({
            "canonicalKey": identity.canonical_key,
            "remoteName": identity.remote_name,
            "remoteUrl": identity.remote_url,
        })),
        None => Err(data_loss("Repository remote identity field is missing")),
    }
}

pub(crate) fn hook_settings_value(value: RepoHookSettings) -> Result<Value, Status> {
    let mut output = Map::new();
    output.insert("mode".to_owned(), json!(hook_mode_value(value.mode)?));
    insert_enum(
        &mut output,
        "setupRunPolicy",
        value.setup_run_policy,
        setup_run_policy_value,
    )?;
    insert_enum(
        &mut output,
        "setupAgentStartupPolicy",
        value.setup_agent_startup_policy,
        setup_agent_startup_policy_value,
    )?;
    insert_enum(
        &mut output,
        "commandSourcePolicy",
        value.command_source_policy,
        command_source_policy_value,
    )?;
    output.insert(
        "scripts".to_owned(),
        json!({ "setup":value.setup_script, "archive":value.archive_script }),
    );
    Ok(Value::Object(output))
}

pub(crate) fn source_control_ai_value(
    value: RepoSourceControlAiOverrides,
) -> Result<Value, Status> {
    let mut output = Map::new();
    insert_optional(&mut output, "enabled", value.enabled.map(Value::Bool));
    insert_optional(
        &mut output,
        "customAgentCommand",
        value.custom_agent_command.map(Value::String),
    );
    insert_optional_map(
        &mut output,
        "modelOverridesByOperation",
        value
            .model_overrides_by_operation
            .map(|values| values.values),
        source_control_model_choice_value,
    )?;
    insert_optional_map(
        &mut output,
        "instructionsByOperation",
        value.instructions_by_operation.map(|values| values.values),
        nullable_string_value,
    )?;
    insert_optional_map(
        &mut output,
        "actionOverrides",
        value.action_overrides.map(|values| values.values),
        source_control_action_value,
    )?;
    insert_optional(
        &mut output,
        "prCreationDefaults",
        value
            .pr_creation_defaults
            .map(source_control_pr_defaults_value)
            .transpose()?,
    );
    Ok(Value::Object(output))
}

fn source_control_model_choice_value(value: RepoSourceControlModelChoice) -> Result<Value, Status> {
    let mut output = Map::new();
    insert_optional_string_map(
        &mut output,
        "selectedModelByAgent",
        value.selected_model_by_agent,
    );
    if let Some(host_values) = value.selected_model_by_agent_by_host {
        let hosts = host_values
            .values
            .into_iter()
            .map(|(host, values)| (host, string_map_value(values.values)))
            .collect();
        output.insert(
            "selectedModelByAgentByHost".to_owned(),
            Value::Object(hosts),
        );
    }
    insert_optional_string_map(
        &mut output,
        "selectedThinkingByModel",
        value.selected_thinking_by_model,
    );
    Ok(Value::Object(output))
}

fn source_control_action_value(value: RepoSourceControlActionOverride) -> Result<Value, Status> {
    let mut output = Map::new();
    insert_optional(
        &mut output,
        "agentId",
        value.agent_id.map(nullable_string_value).transpose()?,
    );
    insert_optional(
        &mut output,
        "commandInputTemplate",
        value
            .command_input_template
            .map(nullable_string_value)
            .transpose()?,
    );
    insert_optional(
        &mut output,
        "agentArgs",
        value.agent_args.map(nullable_string_value).transpose()?,
    );
    Ok(Value::Object(output))
}

fn source_control_pr_defaults_value(
    value: RepoSourceControlPrCreationDefaults,
) -> Result<Value, Status> {
    let mut output = Map::new();
    insert_optional(
        &mut output,
        "draft",
        value.draft.map(nullable_bool_value).transpose()?,
    );
    insert_optional(
        &mut output,
        "useTemplate",
        value.use_template.map(nullable_bool_value).transpose()?,
    );
    insert_optional(
        &mut output,
        "generateDetailsOnOpen",
        value
            .generate_details_on_open
            .map(nullable_bool_value)
            .transpose()?,
    );
    insert_optional(
        &mut output,
        "openAfterCreate",
        value
            .open_after_create
            .map(nullable_bool_value)
            .transpose()?,
    );
    Ok(Value::Object(output))
}

pub(crate) fn nullable_bool_value(value: RepoNullableBool) -> Result<Value, Status> {
    match value.value {
        Some(repo_nullable_bool::Value::Boolean(value)) => Ok(Value::Bool(value)),
        Some(repo_nullable_bool::Value::Null(_)) => Ok(Value::Null),
        None => Err(data_loss("Repository nullable boolean is missing")),
    }
}

fn insert_optional(object: &mut Map<String, Value>, field: &str, value: Option<Value>) {
    if let Some(value) = value {
        object.insert(field.to_owned(), value);
    }
}

fn insert_enum<T>(
    object: &mut Map<String, Value>,
    field: &str,
    value: i32,
    convert: impl FnOnce(i32) -> Result<Option<T>, Status>,
) -> Result<(), Status>
where
    T: Into<Value>,
{
    insert_optional(object, field, convert(value)?.map(Into::into));
    Ok(())
}

fn insert_string_list(object: &mut Map<String, Value>, field: &str, value: Option<RepoStringList>) {
    insert_optional(
        object,
        field,
        value.map(|value| Value::Array(value.values.into_iter().map(Value::String).collect())),
    );
}

fn insert_optional_map<T>(
    object: &mut Map<String, Value>,
    field: &str,
    value: Option<HashMap<String, T>>,
    convert: impl Fn(T) -> Result<Value, Status>,
) -> Result<(), Status> {
    let Some(value) = value else {
        return Ok(());
    };
    object.insert(
        field.to_owned(),
        Value::Object(
            value
                .into_iter()
                .map(|(key, value)| convert(value).map(|value| (key, value)))
                .collect::<Result<Map<_, _>, _>>()?,
        ),
    );
    Ok(())
}

fn insert_optional_string_map(
    object: &mut Map<String, Value>,
    field: &str,
    value: Option<RepoStringMap>,
) {
    if let Some(value) = value {
        object.insert(field.to_owned(), string_map_value(value.values));
    }
}

fn string_map_value(value: HashMap<String, String>) -> Value {
    Value::Object(
        value
            .into_iter()
            .map(|(key, value)| (key, Value::String(value)))
            .collect(),
    )
}

fn nullable_string(value: &Value) -> Result<RepoNullableString, Status> {
    let value = match value {
        Value::Null => repo_nullable_string::Value::Null(true),
        Value::String(value) => repo_nullable_string::Value::Text(value.clone()),
        _ => return Err(data_loss("Stored repository nullable string is invalid")),
    };
    Ok(RepoNullableString { value: Some(value) })
}

fn nullable_icon(value: &Value) -> Result<RepoNullableIcon, Status> {
    let value = match value {
        Value::Null => repo_nullable_icon::Value::Null(true),
        Value::Object(object) => {
            let kind = required_string(object, "type")?;
            let icon = match kind.as_str() {
                "lucide" => RepoIcon {
                    value: Some(repo_icon::Value::LucideName(required_string(
                        object, "name",
                    )?)),
                },
                "emoji" => RepoIcon {
                    value: Some(repo_icon::Value::Emoji(required_string(object, "emoji")?)),
                },
                "image" => RepoIcon {
                    value: Some(repo_icon::Value::Image(RepoImageIcon {
                        src: required_string(object, "src")?,
                        source: icon_source(&required_string(object, "source")?)? as i32,
                        label: optional_string(object, "label")?,
                    })),
                },
                _ => return Err(data_loss("Stored repository icon kind is invalid")),
            };
            repo_nullable_icon::Value::Icon(icon)
        }
        _ => return Err(data_loss("Stored repository icon is invalid")),
    };
    Ok(RepoNullableIcon { value: Some(value) })
}

fn nullable_upstream(value: &Value) -> Result<RepoNullableUpstream, Status> {
    let value = match value {
        Value::Null => repo_nullable_upstream::Value::Null(true),
        Value::Object(object) => repo_nullable_upstream::Value::Upstream(RepoUpstream {
            owner: required_string(object, "owner")?,
            repo: required_string(object, "repo")?,
        }),
        _ => return Err(data_loss("Stored repository upstream is invalid")),
    };
    Ok(RepoNullableUpstream { value: Some(value) })
}

fn nullable_remote_identity(value: &Value) -> Result<RepoNullableGitRemoteIdentity, Status> {
    let value = match value {
        Value::Null => repo_nullable_git_remote_identity::Value::Null(true),
        Value::Object(object) => {
            repo_nullable_git_remote_identity::Value::Identity(RepoGitRemoteIdentity {
                canonical_key: required_string(object, "canonicalKey")?,
                remote_name: required_string(object, "remoteName")?,
                remote_url: required_string(object, "remoteUrl")?,
            })
        }
        _ => return Err(data_loss("Stored repository remote identity is invalid")),
    };
    Ok(RepoNullableGitRemoteIdentity { value: Some(value) })
}

fn hook_settings(object: &Map<String, Value>) -> Result<RepoHookSettings, Status> {
    let scripts = required_object(object, "scripts")?;
    Ok(RepoHookSettings {
        mode: hook_mode(&required_string(object, "mode")?)? as i32,
        setup_run_policy: optional_enum(object, "setupRunPolicy", setup_run_policy)? as i32,
        setup_agent_startup_policy: optional_enum(
            object,
            "setupAgentStartupPolicy",
            setup_agent_startup_policy,
        )? as i32,
        command_source_policy: optional_enum(object, "commandSourcePolicy", command_source_policy)?
            as i32,
        setup_script: required_string(scripts, "setup")?,
        archive_script: required_string(scripts, "archive")?,
    })
}

fn source_control_ai(object: &Map<String, Value>) -> Result<RepoSourceControlAiOverrides, Status> {
    Ok(RepoSourceControlAiOverrides {
        enabled: optional_bool(object, "enabled")?,
        custom_agent_command: optional_string(object, "customAgentCommand")?,
        model_overrides_by_operation: optional_map(
            object,
            "modelOverridesByOperation",
            source_control_model_choice,
        )?
        .map(|values| RepoSourceControlModelChoiceMap { values }),
        instructions_by_operation: optional_map(
            object,
            "instructionsByOperation",
            nullable_string,
        )?
        .map(|values| RepoNullableStringMap { values }),
        action_overrides: optional_map(object, "actionOverrides", source_control_action)?
            .map(|values| RepoSourceControlActionOverrideMap { values }),
        pr_creation_defaults: optional_object(
            object,
            "prCreationDefaults",
            source_control_pr_defaults,
        )?,
    })
}

fn source_control_model_choice(value: &Value) -> Result<RepoSourceControlModelChoice, Status> {
    let object = value
        .as_object()
        .ok_or_else(|| data_loss("Stored repository model choice is invalid"))?;
    Ok(RepoSourceControlModelChoice {
        selected_model_by_agent: optional_string_map(object, "selectedModelByAgent")?
            .map(|values| RepoStringMap { values }),
        selected_model_by_agent_by_host: optional_map(
            object,
            "selectedModelByAgentByHost",
            |value| {
                let object = value
                    .as_object()
                    .ok_or_else(|| data_loss("Stored repository host model choice is invalid"))?;
                Ok(RepoStringMap {
                    values: string_map(object)?,
                })
            },
        )?
        .map(|values| RepoHostStringMap { values }),
        selected_thinking_by_model: optional_string_map(object, "selectedThinkingByModel")?
            .map(|values| RepoStringMap { values }),
    })
}

fn source_control_action(value: &Value) -> Result<RepoSourceControlActionOverride, Status> {
    let object = value
        .as_object()
        .ok_or_else(|| data_loss("Stored repository action override is invalid"))?;
    Ok(RepoSourceControlActionOverride {
        agent_id: optional_nullable(object, "agentId", nullable_string)?,
        command_input_template: optional_nullable(object, "commandInputTemplate", nullable_string)?,
        agent_args: optional_nullable(object, "agentArgs", nullable_string)?,
    })
}

fn source_control_pr_defaults(
    object: &Map<String, Value>,
) -> Result<RepoSourceControlPrCreationDefaults, Status> {
    Ok(RepoSourceControlPrCreationDefaults {
        draft: optional_nullable(object, "draft", nullable_bool)?,
        use_template: optional_nullable(object, "useTemplate", nullable_bool)?,
        generate_details_on_open: optional_nullable(
            object,
            "generateDetailsOnOpen",
            nullable_bool,
        )?,
        open_after_create: optional_nullable(object, "openAfterCreate", nullable_bool)?,
    })
}

fn nullable_bool(value: &Value) -> Result<RepoNullableBool, Status> {
    let value = match value {
        Value::Null => repo_nullable_bool::Value::Null(true),
        Value::Bool(value) => repo_nullable_bool::Value::Boolean(*value),
        _ => return Err(data_loss("Stored repository nullable boolean is invalid")),
    };
    Ok(RepoNullableBool { value: Some(value) })
}

fn optional_nullable<T>(
    object: &Map<String, Value>,
    field: &str,
    convert: impl FnOnce(&Value) -> Result<T, Status>,
) -> Result<Option<T>, Status> {
    object.get(field).map(convert).transpose()
}

fn optional_object<T>(
    object: &Map<String, Value>,
    field: &str,
    convert: impl FnOnce(&Map<String, Value>) -> Result<T, Status>,
) -> Result<Option<T>, Status> {
    object
        .get(field)
        .map(|value| {
            value
                .as_object()
                .ok_or_else(|| data_loss("Stored repository object field is invalid"))
                .and_then(convert)
        })
        .transpose()
}

fn optional_map<T>(
    object: &Map<String, Value>,
    field: &str,
    convert: impl Fn(&Value) -> Result<T, Status>,
) -> Result<Option<HashMap<String, T>>, Status> {
    let Some(value) = object.get(field) else {
        return Ok(None);
    };
    value
        .as_object()
        .ok_or_else(|| data_loss("Stored repository map field is invalid"))?
        .iter()
        .map(|(key, value)| convert(value).map(|value| (key.clone(), value)))
        .collect::<Result<HashMap<_, _>, _>>()
        .map(Some)
}

fn optional_string_map(
    object: &Map<String, Value>,
    field: &str,
) -> Result<Option<HashMap<String, String>>, Status> {
    match object.get(field) {
        Some(value) => string_map(
            value
                .as_object()
                .ok_or_else(|| data_loss("Stored repository string map is invalid"))?,
        )
        .map(Some),
        None => Ok(None),
    }
}

fn string_map(object: &Map<String, Value>) -> Result<HashMap<String, String>, Status> {
    object
        .iter()
        .map(|(key, value)| {
            value
                .as_str()
                .map(|value| (key.clone(), value.to_owned()))
                .ok_or_else(|| data_loss("Stored repository string map value is invalid"))
        })
        .collect()
}

fn optional_string_list(
    object: &Map<String, Value>,
    field: &str,
) -> Result<Option<RepoStringList>, Status> {
    object
        .get(field)
        .map(|value| {
            let values = value
                .as_array()
                .ok_or_else(|| data_loss("Stored repository string list is invalid"))?
                .iter()
                .map(|value| {
                    value
                        .as_str()
                        .map(str::to_owned)
                        .ok_or_else(|| data_loss("Stored repository string list value is invalid"))
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(RepoStringList { values })
        })
        .transpose()
}

fn required_object<'a>(
    object: &'a Map<String, Value>,
    field: &str,
) -> Result<&'a Map<String, Value>, Status> {
    object
        .get(field)
        .and_then(Value::as_object)
        .ok_or_else(|| data_loss("Stored repository required object is invalid"))
}

fn required_string(object: &Map<String, Value>, field: &str) -> Result<String, Status> {
    object
        .get(field)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| data_loss("Stored repository required string is invalid"))
}

fn optional_string(object: &Map<String, Value>, field: &str) -> Result<Option<String>, Status> {
    object
        .get(field)
        .map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| data_loss("Stored repository optional string is invalid"))
        })
        .transpose()
}

fn required_integer(object: &Map<String, Value>, field: &str) -> Result<i64, Status> {
    object
        .get(field)
        .and_then(Value::as_i64)
        .ok_or_else(|| data_loss("Stored repository required integer is invalid"))
}

fn optional_number(object: &Map<String, Value>, field: &str) -> Result<Option<f64>, Status> {
    object
        .get(field)
        .map(|value| {
            value
                .as_f64()
                .filter(|value| value.is_finite())
                .ok_or_else(|| data_loss("Stored repository optional number is invalid"))
        })
        .transpose()
}

fn optional_bool(object: &Map<String, Value>, field: &str) -> Result<Option<bool>, Status> {
    object
        .get(field)
        .map(|value| {
            value
                .as_bool()
                .ok_or_else(|| data_loss("Stored repository optional boolean is invalid"))
        })
        .transpose()
}

fn optional_enum<T>(
    object: &Map<String, Value>,
    field: &str,
    convert: impl FnOnce(&str) -> Result<T, Status>,
) -> Result<T, Status>
where
    T: Copy + Into<i32> + TryFrom<i32>,
{
    match object.get(field) {
        Some(Value::String(value)) => convert(value),
        Some(_) => Err(data_loss("Stored repository enum is invalid")),
        None => T::try_from(0).map_err(|_| data_loss("Repository enum has no unspecified value")),
    }
}

fn repo_kind(value: &str) -> Result<RepoKind, Status> {
    match value {
        "git" => Ok(RepoKind::Git),
        "folder" => Ok(RepoKind::Folder),
        _ => Err(data_loss("Stored repository kind is invalid")),
    }
}

fn icon_source(value: &str) -> Result<RepoIconImageSource, Status> {
    match value {
        "upload" => Ok(RepoIconImageSource::Upload),
        "file" => Ok(RepoIconImageSource::File),
        "favicon" => Ok(RepoIconImageSource::Favicon),
        "github" => Ok(RepoIconImageSource::Github),
        _ => Err(data_loss("Stored repository icon source is invalid")),
    }
}

fn hook_mode(value: &str) -> Result<RepoHookSettingsMode, Status> {
    match value {
        "auto" => Ok(RepoHookSettingsMode::Auto),
        "override" => Ok(RepoHookSettingsMode::Override),
        _ => Err(data_loss("Stored repository hook mode is invalid")),
    }
}

fn setup_run_policy(value: &str) -> Result<RepoSetupRunPolicy, Status> {
    match value {
        "ask" => Ok(RepoSetupRunPolicy::Ask),
        "run-by-default" => Ok(RepoSetupRunPolicy::RunByDefault),
        "skip-by-default" => Ok(RepoSetupRunPolicy::SkipByDefault),
        _ => Err(data_loss("Stored repository setup run policy is invalid")),
    }
}

fn setup_agent_startup_policy(value: &str) -> Result<RepoSetupAgentStartupPolicy, Status> {
    match value {
        "start-immediately" => Ok(RepoSetupAgentStartupPolicy::StartImmediately),
        "wait-for-setup" => Ok(RepoSetupAgentStartupPolicy::WaitForSetup),
        _ => Err(data_loss(
            "Stored repository setup startup policy is invalid",
        )),
    }
}

fn command_source_policy(value: &str) -> Result<RepoCommandSourcePolicy, Status> {
    match value {
        "shared-only" => Ok(RepoCommandSourcePolicy::SharedOnly),
        "local-only" => Ok(RepoCommandSourcePolicy::LocalOnly),
        "run-both" => Ok(RepoCommandSourcePolicy::RunBoth),
        _ => Err(data_loss(
            "Stored repository command source policy is invalid",
        )),
    }
}

fn forge_remote_preference(value: &str) -> Result<RepoForgeRemotePreference, Status> {
    match value {
        "auto" => Ok(RepoForgeRemotePreference::Auto),
        "upstream" => Ok(RepoForgeRemotePreference::Upstream),
        "origin" => Ok(RepoForgeRemotePreference::Origin),
        _ => Err(data_loss(
            "Stored repository forge remote preference is invalid",
        )),
    }
}

fn fork_sync_mode(value: &str) -> Result<RepoForkSyncMode, Status> {
    match value {
        "ask" => Ok(RepoForkSyncMode::Ask),
        "safe-auto" => Ok(RepoForkSyncMode::SafeAuto),
        "off" => Ok(RepoForkSyncMode::Off),
        _ => Err(data_loss("Stored repository fork sync mode is invalid")),
    }
}

fn external_worktree_visibility(value: &str) -> Result<RepoExternalWorktreeVisibility, Status> {
    match value {
        "hide" => Ok(RepoExternalWorktreeVisibility::Hide),
        "show" => Ok(RepoExternalWorktreeVisibility::Show),
        _ => Err(data_loss(
            "Stored repository worktree visibility is invalid",
        )),
    }
}

fn project_host_setup_method(value: &str) -> Result<RepoProjectHostSetupMethod, Status> {
    match value {
        "imported-existing-folder" => Ok(RepoProjectHostSetupMethod::ImportedExistingFolder),
        "cloned" => Ok(RepoProjectHostSetupMethod::Cloned),
        _ => Err(data_loss("Stored repository host setup method is invalid")),
    }
}

fn repo_kind_value(value: i32) -> Result<Option<&'static str>, Status> {
    match RepoKind::try_from(value) {
        Ok(RepoKind::Git) => Ok(Some("git")),
        Ok(RepoKind::Folder) => Ok(Some("folder")),
        Ok(RepoKind::Unspecified) => Ok(None),
        Err(_) => Err(data_loss("Repository kind is unknown")),
    }
}

fn icon_source_value(value: i32) -> Result<&'static str, Status> {
    match RepoIconImageSource::try_from(value) {
        Ok(RepoIconImageSource::Upload) => Ok("upload"),
        Ok(RepoIconImageSource::File) => Ok("file"),
        Ok(RepoIconImageSource::Favicon) => Ok("favicon"),
        Ok(RepoIconImageSource::Github) => Ok("github"),
        Ok(RepoIconImageSource::Unspecified) | Err(_) => {
            Err(data_loss("Repository icon source is invalid"))
        }
    }
}

fn hook_mode_value(value: i32) -> Result<&'static str, Status> {
    match RepoHookSettingsMode::try_from(value) {
        Ok(RepoHookSettingsMode::Auto) => Ok("auto"),
        Ok(RepoHookSettingsMode::Override) => Ok("override"),
        Ok(RepoHookSettingsMode::Unspecified) | Err(_) => {
            Err(data_loss("Repository hook mode is invalid"))
        }
    }
}

fn setup_run_policy_value(value: i32) -> Result<Option<&'static str>, Status> {
    match RepoSetupRunPolicy::try_from(value) {
        Ok(RepoSetupRunPolicy::Ask) => Ok(Some("ask")),
        Ok(RepoSetupRunPolicy::RunByDefault) => Ok(Some("run-by-default")),
        Ok(RepoSetupRunPolicy::SkipByDefault) => Ok(Some("skip-by-default")),
        Ok(RepoSetupRunPolicy::Unspecified) => Ok(None),
        Err(_) => Err(data_loss("Repository setup run policy is unknown")),
    }
}

fn setup_agent_startup_policy_value(value: i32) -> Result<Option<&'static str>, Status> {
    match RepoSetupAgentStartupPolicy::try_from(value) {
        Ok(RepoSetupAgentStartupPolicy::StartImmediately) => Ok(Some("start-immediately")),
        Ok(RepoSetupAgentStartupPolicy::WaitForSetup) => Ok(Some("wait-for-setup")),
        Ok(RepoSetupAgentStartupPolicy::Unspecified) => Ok(None),
        Err(_) => Err(data_loss("Repository setup startup policy is unknown")),
    }
}

fn command_source_policy_value(value: i32) -> Result<Option<&'static str>, Status> {
    match RepoCommandSourcePolicy::try_from(value) {
        Ok(RepoCommandSourcePolicy::SharedOnly) => Ok(Some("shared-only")),
        Ok(RepoCommandSourcePolicy::LocalOnly) => Ok(Some("local-only")),
        Ok(RepoCommandSourcePolicy::RunBoth) => Ok(Some("run-both")),
        Ok(RepoCommandSourcePolicy::Unspecified) => Ok(None),
        Err(_) => Err(data_loss("Repository command source policy is unknown")),
    }
}

fn forge_remote_preference_value(value: i32) -> Result<Option<&'static str>, Status> {
    match RepoForgeRemotePreference::try_from(value) {
        Ok(RepoForgeRemotePreference::Auto) => Ok(Some("auto")),
        Ok(RepoForgeRemotePreference::Upstream) => Ok(Some("upstream")),
        Ok(RepoForgeRemotePreference::Origin) => Ok(Some("origin")),
        Ok(RepoForgeRemotePreference::Unspecified) => Ok(None),
        Err(_) => Err(data_loss("Repository forge remote preference is unknown")),
    }
}

fn fork_sync_mode_value(value: i32) -> Result<Option<&'static str>, Status> {
    match RepoForkSyncMode::try_from(value) {
        Ok(RepoForkSyncMode::Ask) => Ok(Some("ask")),
        Ok(RepoForkSyncMode::SafeAuto) => Ok(Some("safe-auto")),
        Ok(RepoForkSyncMode::Off) => Ok(Some("off")),
        Ok(RepoForkSyncMode::Unspecified) => Ok(None),
        Err(_) => Err(data_loss("Repository fork sync mode is unknown")),
    }
}

fn external_worktree_visibility_value(value: i32) -> Result<Option<&'static str>, Status> {
    match RepoExternalWorktreeVisibility::try_from(value) {
        Ok(RepoExternalWorktreeVisibility::Hide) => Ok(Some("hide")),
        Ok(RepoExternalWorktreeVisibility::Show) => Ok(Some("show")),
        Ok(RepoExternalWorktreeVisibility::Unspecified) => Ok(None),
        Err(_) => Err(data_loss("Repository worktree visibility is unknown")),
    }
}

fn project_host_setup_method_value(value: i32) -> Result<Option<&'static str>, Status> {
    match RepoProjectHostSetupMethod::try_from(value) {
        Ok(RepoProjectHostSetupMethod::ImportedExistingFolder) => {
            Ok(Some("imported-existing-folder"))
        }
        Ok(RepoProjectHostSetupMethod::Cloned) => Ok(Some("cloned")),
        Ok(RepoProjectHostSetupMethod::Unspecified) => Ok(None),
        Err(_) => Err(data_loss("Repository host setup method is unknown")),
    }
}

fn data_loss(message: &str) -> Status {
    Status {
        code: StatusCode::DataLoss as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
