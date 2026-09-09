use serde_json::{Map, Value};

use crate::hosts::HostFilesystemError;

use super::setup_imports::{
    RepoFiles, candidate, command_value, parse_json_object, unsupported_fields,
};

pub(super) async fn superset(files: &RepoFiles<'_>) -> Result<Option<Value>, HostFilesystemError> {
    let Some(config) = parse_json_object(files.read(".superset/config.json").await?) else {
        return Ok(None);
    };
    let local = parse_json_object(files.read(".superset/config.local.json").await?);
    let mut unsupported = unsupported_fields(&config, &["run", "cwd"]);
    if let Some(local) = local.as_ref() {
        unsupported.extend(
            unsupported_fields(local, &["run", "cwd"])
                .into_iter()
                .map(|field| format!("config.local.{field}")),
        );
    }
    let setup = superset_script(
        config.get("setup"),
        local.as_ref().and_then(|local| local.get("setup")),
        "setup",
        &mut unsupported,
    );
    if setup.is_empty() {
        return Ok(None);
    }
    collect_script_object_fields(config.get("setup"), "setup", &mut unsupported);
    collect_script_object_fields(config.get("teardown"), "teardown", &mut unsupported);
    let archive = superset_script(
        config.get("teardown"),
        local.as_ref().and_then(|local| local.get("teardown")),
        "teardown",
        &mut unsupported,
    );
    let config_files = if local.is_some() {
        vec![".superset/config.json", ".superset/config.local.json"]
    } else {
        vec![".superset/config.json"]
    };
    Ok(Some(candidate(
        "superset",
        "Superset",
        config_files,
        setup,
        (!archive.is_empty()).then_some(archive),
        unsupported,
    )))
}

pub(super) async fn conductor(files: &RepoFiles<'_>) -> Result<Option<Value>, HostFilesystemError> {
    let Some(config) = parse_json_object(files.read("conductor.json").await?) else {
        return Ok(None);
    };
    let Some(scripts) = config.get("scripts").and_then(Value::as_object) else {
        return Ok(None);
    };
    let setup = command_value(scripts.get("setup"));
    if setup.is_empty() {
        return Ok(None);
    }
    let mut unsupported = unsupported_fields(&config, &["enterpriseDataPrivacy", "runScriptMode"]);
    for field in ["run", "teardown"] {
        if !command_value(scripts.get(field)).is_empty() {
            unsupported.push(format!("scripts.{field}"));
        }
    }
    let archive = command_value(scripts.get("archive"));
    Ok(Some(candidate(
        "conductor",
        "Conductor",
        vec!["conductor.json"],
        setup,
        (!archive.is_empty()).then_some(archive),
        unsupported,
    )))
}

pub(super) async fn cmux(files: &RepoFiles<'_>) -> Result<Option<Value>, HostFilesystemError> {
    for path in [".cmux/cmux.json", "cmux.json"] {
        let Some(config) = parse_json_object(files.read(path).await?) else {
            continue;
        };
        let commands = config
            .get("commands")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for (index, command) in commands.iter().enumerate() {
            let Some(command) = command.as_object() else {
                continue;
            };
            if !is_cmux_setup(command) {
                continue;
            }
            let setup = command_value(command.get("command"));
            if setup.is_empty() {
                continue;
            }
            let supported = ["name", "title", "description", "keywords", "command"];
            let unsupported = command
                .keys()
                .filter(|field| !supported.contains(&field.as_str()))
                .map(|field| format!("commands.{index}.{field}"))
                .collect();
            return Ok(Some(candidate(
                "cmux",
                "cmux",
                vec![path],
                setup,
                None,
                unsupported,
            )));
        }
    }
    Ok(None)
}

fn superset_script(
    base: Option<&Value>,
    local: Option<&Value>,
    key: &str,
    unsupported: &mut Vec<String>,
) -> String {
    let base = command_value(base);
    let Some(local) = local else {
        return base;
    };
    if local.is_string() || local.is_array() {
        return command_value(Some(local));
    }
    let Some(local) = local.as_object() else {
        unsupported.push(format!("config.local.{key}"));
        return base;
    };
    for field in local
        .keys()
        .filter(|field| !matches!(field.as_str(), "before" | "after"))
    {
        unsupported.push(format!("config.local.{key}.{field}"));
    }
    [
        command_value(local.get("before")),
        base,
        command_value(local.get("after")),
    ]
    .into_iter()
    .filter(|value| !value.is_empty())
    .collect::<Vec<_>>()
    .join("\n")
}

fn collect_script_object_fields(
    value: Option<&Value>,
    prefix: &str,
    unsupported: &mut Vec<String>,
) {
    let Some(value) = value.and_then(Value::as_object) else {
        return;
    };
    for field in ["before", "after"] {
        if value.contains_key(field) {
            unsupported.push(format!("{prefix}.{field}"));
        }
    }
}

fn is_cmux_setup(command: &Map<String, Value>) -> bool {
    let command_text = command
        .get("command")
        .and_then(Value::as_str)
        .map(super::ecmascript::trim)
        .unwrap_or_default();
    if command_text.is_empty() {
        return false;
    }
    let labels = ["name", "title"]
        .into_iter()
        .filter_map(|field| command.get(field).and_then(Value::as_str))
        .map(normalize_match)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if labels.iter().any(|label| {
        matches!(
            label.as_str(),
            "setup" | "project setup" | "workspace setup" | "repository setup"
        )
    }) {
        return true;
    }
    let has_keyword = command
        .get("keywords")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(normalize_match)
        .any(|keyword| {
            matches!(
                keyword.as_str(),
                "setup" | "init" | "initialize" | "install"
            )
        });
    has_keyword
        && (labels.iter().any(|label| label.contains("setup")) || contains_setup_word(command_text))
}

fn contains_setup_word(value: &str) -> bool {
    value
        .split(|character: char| !character.is_ascii_alphanumeric() && character != '_')
        .any(|word| word.eq_ignore_ascii_case("setup"))
}

fn normalize_match(value: &str) -> String {
    super::ecmascript::trim(value)
        .split(super::ecmascript::is_whitespace)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
}
