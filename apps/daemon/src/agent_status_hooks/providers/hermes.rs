use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Map, Value};

use super::{ProviderContext, ProviderResult};
use crate::agent_status_hooks::storage;

const MARKER: &str = "Managed by Yiru. Do not edit; changes may be overwritten.";
const PLUGIN_NAME: &str = "yiru-status";
const MANIFEST: &str = include_str!("../assets/hermes-plugin.yaml");
const PLUGIN: &str = include_str!("../assets/hermes-plugin.py");

pub(super) fn apply(context: &ProviderContext, enabled: bool) -> ProviderResult {
    let home = std::env::var("HERMES_HOME")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| context.home_path.join(".hermes"));
    let config_path = home.join("config.yaml");
    let plugin_path = home.join("plugins").join(PLUGIN_NAME);
    let mut document = read_yaml(&config_path)?;
    update_plugins(&mut document, enabled);
    if enabled {
        storage::write_text(&plugin_path.join("plugin.yaml"), MANIFEST)?;
        storage::write_text(&plugin_path.join("__init__.py"), PLUGIN)?;
    } else if plugin_is_managed(&plugin_path) {
        fs::remove_dir_all(&plugin_path)?;
    }
    write_yaml(&config_path, &document)
}

fn read_yaml(
    path: &Path,
) -> Result<Map<String, Value>, crate::agent_status_hooks::AgentStatusHooksError> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Map::new()),
        Err(error) => return Err(error.into()),
    };
    if text.trim().is_empty() {
        return Ok(Map::new());
    }
    serde_saphyr::from_str::<Value>(&text)
        .map_err(|error| invalid_yaml(path, error))?
        .as_object()
        .cloned()
        .ok_or_else(|| invalid_yaml(path, "root must be a mapping"))
}

fn write_yaml(path: &Path, document: &Map<String, Value>) -> ProviderResult {
    let text = serde_saphyr::to_string(document).map_err(|error| invalid_yaml(path, error))?;
    storage::write_text(path, &format!("{}\n", text.trim_end()))
}

fn update_plugins(document: &mut Map<String, Value>, enabled: bool) {
    if !enabled && !document.get("plugins").is_some_and(Value::is_object) {
        return;
    }
    let mut plugins = document
        .get("plugins")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut enabled_plugins = string_list(plugins.get("enabled")).unwrap_or_default();
    if enabled {
        if !enabled_plugins.iter().any(|name| name == PLUGIN_NAME) {
            enabled_plugins.push(PLUGIN_NAME.to_owned());
            enabled_plugins.sort();
        }
        if let Some(disabled_value) = plugins.get("disabled") {
            match string_list(Some(disabled_value)) {
                None => {
                    plugins.insert("disabled".to_owned(), Value::Array(Vec::new()));
                }
                Some(disabled) if disabled.iter().any(|name| name == PLUGIN_NAME) => {
                    plugins.insert(
                        "disabled".to_owned(),
                        Value::Array(
                            disabled
                                .into_iter()
                                .filter(|name| name != PLUGIN_NAME)
                                .map(Value::String)
                                .collect(),
                        ),
                    );
                }
                Some(_) => {}
            }
        }
    } else {
        if plugins
            .get("enabled")
            .is_some_and(|value| string_list(Some(value)).is_none())
        {
            return;
        }
        enabled_plugins.retain(|name| name != PLUGIN_NAME);
    }
    plugins.insert(
        "enabled".to_owned(),
        Value::Array(enabled_plugins.into_iter().map(Value::String).collect()),
    );
    document.insert("plugins".to_owned(), Value::Object(plugins));
}

fn string_list(value: Option<&Value>) -> Option<Vec<String>> {
    let values = value?.as_array()?;
    values
        .iter()
        .map(|value| value.as_str().map(str::to_owned))
        .collect()
}

fn plugin_is_managed(path: &Path) -> bool {
    [path.join("plugin.yaml"), path.join("__init__.py")]
        .iter()
        .all(|file| fs::read_to_string(file).is_ok_and(|content| content.contains(MARKER)))
}

fn invalid_yaml(
    path: &Path,
    error: impl std::fmt::Display,
) -> crate::agent_status_hooks::AgentStatusHooksError {
    std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        format!("could not parse {} as Hermes YAML: {error}", path.display()),
    )
    .into()
}
