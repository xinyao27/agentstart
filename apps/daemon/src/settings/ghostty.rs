mod current;
mod mapping;

use std::path::{Path, PathBuf};

use serde_json::{Map, Value, json};

use crate::paths::resolve_local_home_path;

const MAX_CONFIG_BYTES: u64 = 1_000_000;
const MAX_THEME_BYTES: u64 = 262_144;

pub(super) async fn preview(current: &Map<String, Value>) -> Value {
    let paths = config_paths()
        .into_iter()
        .filter(|path| path.is_file())
        .collect::<Vec<_>>();
    if paths.is_empty() {
        return empty();
    }
    let mut parsed = Map::new();
    for path in &paths {
        let size = match tokio::fs::metadata(path).await {
            Ok(metadata) => metadata.len(),
            Err(error) => return read_error(error),
        };
        if size > MAX_CONFIG_BYTES {
            return json!({
                "found": false, "diff": {}, "unsupportedKeys": [],
                "error": format!("Config file is too large to import ({size} bytes, limit {MAX_CONFIG_BYTES}).")
            });
        }
        let content = match tokio::fs::read_to_string(path).await {
            Ok(content) => content,
            Err(error) => return read_error(error),
        };
        merge(&mut parsed, parse(&content));
    }
    let mut theme_unsupported = apply_theme(&mut parsed).await;
    let (mut diff, mut unsupported) = mapping::map(&parsed);
    unsupported.append(&mut theme_unsupported);
    diff.retain(|key, value| !current::matches(current, key, value));
    json!({
        "found": true,
        "configPath": paths[0].to_string_lossy(),
        "configPaths": paths.iter().map(|path| path.to_string_lossy()).collect::<Vec<_>>(),
        "diff": diff,
        "unsupportedKeys": unsupported,
    })
}

fn config_paths() -> Vec<PathBuf> {
    let home = resolve_local_home_path();
    if cfg!(target_os = "windows") {
        let base = absolute_environment_path("APPDATA").or(home);
        return with_config_filenames(base.into_iter().map(|path| path.join("ghostty")));
    }
    let mut directories = absolute_environment_path("XDG_CONFIG_HOME")
        .or_else(|| home.as_ref().map(|path| path.join(".config")))
        .into_iter()
        .map(|path| path.join("ghostty"))
        .collect::<Vec<_>>();
    if cfg!(target_os = "macos")
        && let Some(home) = home
    {
        directories.push(
            home.join("Library")
                .join("Application Support")
                .join("com.mitchellh.ghostty"),
        );
    }
    with_config_filenames(directories)
}

fn with_config_filenames(directories: impl IntoIterator<Item = PathBuf>) -> Vec<PathBuf> {
    directories
        .into_iter()
        .flat_map(|directory| [directory.join("config.ghostty"), directory.join("config")])
        .collect()
}

fn parse(content: &str) -> Map<String, Value> {
    let mut parsed = Map::new();
    for raw in content.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() {
            continue;
        }
        let value = unquote(&strip_comment(value.trim()));
        match parsed.remove(key) {
            None => {
                parsed.insert(key.to_owned(), Value::String(value));
            }
            Some(Value::Array(mut values)) => {
                values.push(Value::String(value));
                parsed.insert(key.to_owned(), Value::Array(values));
            }
            Some(previous) => {
                parsed.insert(
                    key.to_owned(),
                    Value::Array(vec![previous, Value::String(value)]),
                );
            }
        }
    }
    parsed
}

fn strip_comment(value: &str) -> String {
    let mut single = false;
    let mut double = false;
    let bytes = value.as_bytes();
    for (index, byte) in bytes.iter().enumerate() {
        match byte {
            b'\'' if !double => single = !single,
            b'"' if !single => double = !double,
            b'#' if !single && !double && index > 0 && matches!(bytes[index - 1], b' ' | b'\t') => {
                return value[..index].trim().to_owned();
            }
            _ => {}
        }
    }
    value.trim().to_owned()
}

fn unquote(value: &str) -> String {
    if value.len() >= 2
        && ((value.starts_with('"') && value.ends_with('"'))
            || (value.starts_with('\'') && value.ends_with('\'')))
    {
        value[1..value.len() - 1].to_owned()
    } else {
        value.to_owned()
    }
}

fn merge(target: &mut Map<String, Value>, source: Map<String, Value>) {
    for (key, value) in source {
        if key == "palette" {
            let mut values = as_array(target.remove(&key));
            values.extend(as_array(Some(value)));
            target.insert(key, Value::Array(values));
        } else {
            target.insert(key, value);
        }
    }
}

async fn apply_theme(parsed: &mut Map<String, Value>) -> Vec<String> {
    let Some(raw) = parsed.remove("theme") else {
        return Vec::new();
    };
    let name = raw
        .as_array()
        .and_then(|values| values.last())
        .unwrap_or(&raw)
        .as_str()
        .unwrap_or("")
        .trim();
    if name
        .split(',')
        .any(|part| matches!(part.trim().split_once(':'), Some(("light" | "dark", _))))
    {
        return vec!["theme (light:/dark: pairs not supported)".to_owned()];
    }
    let Some(theme) = resolve_theme(name).await else {
        return vec!["theme (theme file not found)".to_owned()];
    };
    for (key, value) in theme {
        if key == "palette" {
            let mut values = as_array(Some(value));
            values.extend(as_array(parsed.remove(&key)));
            parsed.insert(key, Value::Array(values));
        } else {
            parsed.entry(key).or_insert(value);
        }
    }
    Vec::new()
}

async fn resolve_theme(name: &str) -> Option<Map<String, Value>> {
    let candidate = Path::new(name);
    let paths = if candidate.is_absolute() {
        vec![candidate.to_owned()]
    } else {
        if name.is_empty()
            || name.contains('/')
            || name.contains('\\')
            || matches!(name, "." | "..")
        {
            return None;
        }
        theme_dirs()
            .into_iter()
            .map(|directory| directory.join(name))
            .collect()
    };
    for path in paths {
        let Ok(metadata) = tokio::fs::metadata(&path).await else {
            continue;
        };
        if !metadata.is_file() || metadata.len() > MAX_THEME_BYTES {
            return None;
        }
        let content = tokio::fs::read_to_string(path).await.ok()?;
        let mut values = parse(&content);
        values.retain(|key, _| {
            matches!(
                key.as_str(),
                "palette"
                    | "background"
                    | "foreground"
                    | "cursor-color"
                    | "cursor-text"
                    | "selection-background"
                    | "selection-foreground"
                    | "bold-color"
                    | "split-divider-color"
            )
        });
        return Some(values);
    }
    None
}

fn theme_dirs() -> Vec<PathBuf> {
    if !cfg!(any(target_os = "macos", target_os = "linux")) {
        return Vec::new();
    }
    let home = resolve_local_home_path();
    let mut paths = absolute_environment_path("XDG_CONFIG_HOME")
        .or_else(|| home.map(|path| path.join(".config")))
        .into_iter()
        .map(|path| path.join("ghostty").join("themes"))
        .collect::<Vec<_>>();
    if let Some(resources) = absolute_environment_path("GHOSTTY_RESOURCES_DIR") {
        paths.push(resources.join("themes"));
    } else if cfg!(target_os = "macos") {
        paths.push(PathBuf::from(
            "/Applications/Ghostty.app/Contents/Resources/ghostty/themes",
        ));
    } else if cfg!(target_os = "linux") {
        paths.extend([
            PathBuf::from("/usr/share/ghostty/themes"),
            PathBuf::from("/usr/local/share/ghostty/themes"),
        ]);
    }
    paths
}

fn as_array(value: Option<Value>) -> Vec<Value> {
    match value {
        Some(Value::Array(values)) => values,
        Some(value) => vec![value],
        None => Vec::new(),
    }
}

fn absolute_environment_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
}

fn empty() -> Value {
    json!({ "found": false, "diff": {}, "unsupportedKeys": [] })
}

fn read_error(error: std::io::Error) -> Value {
    json!({ "found": false, "diff": {}, "unsupportedKeys": [], "error": format!("Could not read config: {error}") })
}
