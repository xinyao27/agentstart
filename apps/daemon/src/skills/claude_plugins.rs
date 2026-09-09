use std::collections::BTreeMap;

use futures_util::future::join_all;
use serde_json::Value;

use crate::hosts::HostFilesystem;

use super::SourceRoot;

const MAX_METADATA_BYTES: usize = 4 * 1024 * 1024;

struct PluginInstall {
    install_path: String,
    project_path: Option<String>,
    scope: &'static str,
    timestamp: i64,
}

pub(super) async fn discover(
    filesystem: &HostFilesystem,
    home: &str,
    cwd: &str,
) -> Vec<SourceRoot> {
    let paths = [
        filesystem
            .paths()
            .join(&[home, ".claude", "plugins", "installed_plugins.json"]),
        filesystem.paths().join(&[home, ".claude", "settings.json"]),
        filesystem.paths().join(&[cwd, ".claude", "settings.json"]),
        filesystem
            .paths()
            .join(&[cwd, ".claude", "settings.local.json"]),
    ];
    let mut contents = join_all(paths.iter().map(|path| read(filesystem, path))).await;
    let Some(installed) = contents.remove(0) else {
        return Vec::new();
    };
    let enabled = enabled_plugins(contents.into_iter().flatten());
    let Some(plugins) = installed.get("plugins").and_then(Value::as_object) else {
        return Vec::new();
    };
    let mut roots = BTreeMap::new();
    for (plugin_id, raw_installs) in plugins {
        if enabled.get(plugin_id) != Some(&true) {
            continue;
        }
        let Some(installs) = raw_installs.as_array() else {
            continue;
        };
        let Some(install) = select_install(filesystem, installs, cwd) else {
            continue;
        };
        let path = filesystem.paths().join(&[&install.install_path, "skills"]);
        roots.entry(path.clone()).or_insert_with(|| {
            let id = format!("claude-plugin-{}", super::stable_id(&path));
            SourceRoot::new(
                id.clone(),
                format!("Claude plugin {}", safe_label(filesystem, plugin_id)),
                path,
                "plugin",
                vec!["claude"],
                Some("claude"),
                format!("plugin:{id}"),
            )
        });
    }
    roots.into_values().collect()
}

async fn read(filesystem: &HostFilesystem, path: &str) -> Option<Value> {
    let bytes = filesystem.read(path, MAX_METADATA_BYTES).await.ok()??;
    serde_json::from_slice(&bytes).ok()
}

fn enabled_plugins(settings: impl IntoIterator<Item = Value>) -> BTreeMap<String, bool> {
    let mut enabled = BTreeMap::new();
    for setting in settings {
        for (plugin, value) in setting
            .get("enabledPlugins")
            .and_then(Value::as_object)
            .into_iter()
            .flatten()
        {
            if let Some(value) = value.as_bool() {
                enabled.insert(plugin.clone(), value);
            }
        }
    }
    enabled
}

fn select_install(
    filesystem: &HostFilesystem,
    values: &[Value],
    cwd: &str,
) -> Option<PluginInstall> {
    let mut installs = values
        .iter()
        .filter_map(parse_install)
        .filter(|install| {
            filesystem.paths().is_absolute(&install.install_path)
                && applicable(filesystem, install, cwd)
        })
        .collect::<Vec<_>>();
    installs.sort_by(|left, right| {
        priority(right.scope)
            .cmp(&priority(left.scope))
            .then_with(|| {
                right
                    .project_path
                    .as_deref()
                    .unwrap_or_default()
                    .len()
                    .cmp(&left.project_path.as_deref().unwrap_or_default().len())
            })
            .then_with(|| right.timestamp.cmp(&left.timestamp))
    });
    installs.into_iter().next()
}

fn parse_install(value: &Value) -> Option<PluginInstall> {
    let object = value.as_object()?;
    let scope = match object.get("scope").and_then(Value::as_str)? {
        "user" => "user",
        "project" => "project",
        "local" => "local",
        _ => return None,
    };
    let install_path = object.get("installPath")?.as_str()?.to_owned();
    let project_path = object
        .get("projectPath")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let timestamp = object
        .get("lastUpdated")
        .or_else(|| object.get("installedAt"))
        .and_then(Value::as_str)
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .map_or(0, |value| value.timestamp_millis());
    Some(PluginInstall {
        install_path,
        project_path,
        scope,
        timestamp,
    })
}

fn applicable(filesystem: &HostFilesystem, install: &PluginInstall, cwd: &str) -> bool {
    if install.scope == "user" {
        return true;
    }
    let Some(project) = install
        .project_path
        .as_deref()
        .filter(|path| filesystem.paths().is_absolute(path))
    else {
        return false;
    };
    let relative = filesystem.paths().relative(project, cwd);
    relative.is_empty()
        || relative != ".."
            && !relative.starts_with("../")
            && !relative.starts_with("..\\")
            && !filesystem.paths().is_absolute(&relative)
}

fn priority(scope: &str) -> u8 {
    match scope {
        "local" => 2,
        "project" => 1,
        _ => 0,
    }
}

fn safe_label(filesystem: &HostFilesystem, plugin_id: &str) -> String {
    let candidate = plugin_id
        .split('@')
        .next()
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| filesystem.paths().basename(plugin_id));
    let label = candidate
        .chars()
        .filter(|character| !character.is_control())
        .take(80)
        .collect::<String>();
    if label.is_empty() {
        "plugin".to_owned()
    } else {
        label
    }
}
