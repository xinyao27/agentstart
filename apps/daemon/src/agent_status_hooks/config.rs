use std::fs;
use std::path::Path;

use serde_json::{Map, Value};

use super::AgentStatusHooksError;
use super::command::ManagedCommandMatcher;

pub(super) fn read(path: &Path) -> Result<Map<String, Value>, AgentStatusHooksError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Map::new()),
        Err(error) => return Err(error.into()),
    };
    serde_json::from_slice::<Value>(&bytes)?
        .as_object()
        .cloned()
        .ok_or_else(|| invalid_config(path))
}

pub(super) fn read_jsonc(path: &Path) -> Result<Map<String, Value>, AgentStatusHooksError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Map::new()),
        Err(error) => return Err(error.into()),
    };
    let text = String::from_utf8(bytes).map_err(|error| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, error.utf8_error())
    })?;
    let normalized = strip_json_comments(&text);
    serde_json::from_str::<Value>(&strip_trailing_commas(&normalized))?
        .as_object()
        .cloned()
        .ok_or_else(|| invalid_config(path))
}

fn strip_json_comments(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut characters = input.chars().peekable();
    let mut in_string = false;
    let mut escaped = false;
    while let Some(character) = characters.next() {
        if in_string {
            output.push(character);
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                in_string = false;
            }
            continue;
        }
        if character == '"' {
            in_string = true;
            output.push(character);
            continue;
        }
        if character == '/' && characters.peek() == Some(&'/') {
            characters.next();
            for next in characters.by_ref() {
                if next == '\n' {
                    output.push('\n');
                    break;
                }
            }
            continue;
        }
        if character == '/' && characters.peek() == Some(&'*') {
            characters.next();
            let mut previous = '\0';
            for next in characters.by_ref() {
                if next == '\n' {
                    output.push('\n');
                }
                if previous == '*' && next == '/' {
                    break;
                }
                previous = next;
            }
            continue;
        }
        output.push(character);
    }
    output
}

fn strip_trailing_commas(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut in_string = false;
    let mut escaped = false;
    let characters = input.chars().collect::<Vec<_>>();
    for (index, character) in characters.iter().copied().enumerate() {
        if in_string {
            output.push(character);
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                in_string = false;
            }
            continue;
        }
        if character == '"' {
            in_string = true;
            output.push(character);
            continue;
        }
        if character == ',' {
            let next = characters[index + 1..]
                .iter()
                .find(|next| !next.is_whitespace());
            if matches!(next, Some('}') | Some(']')) {
                continue;
            }
        }
        output.push(character);
    }
    output
}

pub(super) fn hooks(config: &Map<String, Value>) -> Map<String, Value> {
    config
        .get("hooks")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

pub(super) fn remove_managed(definitions: &[Value], matcher: &ManagedCommandMatcher) -> Vec<Value> {
    remove_matching(definitions, |command| matcher.matches(command))
}

pub(super) fn remove_matching(
    definitions: &[Value],
    matches: impl Fn(&str) -> bool + Copy,
) -> Vec<Value> {
    definitions
        .iter()
        .filter_map(|definition| clean_definition(definition, matches))
        .collect()
}

fn clean_definition(definition: &Value, matches: impl Fn(&str) -> bool + Copy) -> Option<Value> {
    let Some(source) = definition.as_object() else {
        return Some(definition.clone());
    };
    let mut output = source.clone();
    for key in ["command", "bash", "powershell"] {
        if output.get(key).and_then(Value::as_str).is_some_and(matches) {
            output.remove(key);
        }
    }
    if let Some(nested) = output.get("hooks").and_then(Value::as_array) {
        let retained = nested
            .iter()
            .filter(|hook| {
                !hook
                    .get("command")
                    .and_then(Value::as_str)
                    .is_some_and(matches)
            })
            .cloned()
            .collect::<Vec<_>>();
        if retained.is_empty() {
            output.remove("hooks");
        } else {
            output.insert("hooks".to_owned(), Value::Array(retained));
        }
    }
    let has_command = ["command", "bash", "powershell"]
        .iter()
        .any(|key| output.get(*key).is_some_and(Value::is_string))
        || output
            .get("hooks")
            .and_then(Value::as_array)
            .is_some_and(|hooks| !hooks.is_empty());
    has_command.then_some(Value::Object(output))
}

fn invalid_config(path: &Path) -> AgentStatusHooksError {
    std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        format!("could not parse {} as a JSON object", path.display()),
    )
    .into()
}
