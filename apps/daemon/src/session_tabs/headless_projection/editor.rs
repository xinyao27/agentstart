use serde_json::{Value, json};

pub(super) fn append(session: &Value, worktree: &str, output: &mut Vec<Value>) {
    let unified = session
        .get("unifiedTabs")
        .and_then(|tabs| tabs.get(worktree))
        .and_then(Value::as_array);
    for file in session
        .get("openFilesByWorktree")
        .and_then(|files| files.get(worktree))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(path) = file.get("filePath").and_then(Value::as_str) else {
            continue;
        };
        let runtime = file
            .get("runtimeEnvironmentId")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty());
        let owned = format!(
            "editor:{}:{}:{}",
            encode(worktree),
            encode(runtime.unwrap_or("local")),
            encode(path)
        );
        let matching = unified
            .into_iter()
            .flatten()
            .filter(|tab| {
                tab.get("contentType").and_then(Value::as_str) == Some("editor")
                    && tab
                        .get("entityId")
                        .and_then(Value::as_str)
                        .is_some_and(|id| id == path || id == owned)
            })
            .collect::<Vec<_>>();
        if matching.is_empty() {
            output.push(project(
                file,
                runtime.map(|_| owned.as_str()).unwrap_or(path),
                None,
            ));
        } else {
            for tab in matching {
                output.push(project(
                    file,
                    tab.get("entityId").and_then(Value::as_str).unwrap_or(path),
                    Some(tab),
                ));
            }
        }
    }
}

fn project(file: &Value, file_id: &str, unified: Option<&Value>) -> Value {
    let path = file
        .get("filePath")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let relative = file
        .get("relativePath")
        .and_then(Value::as_str)
        .unwrap_or(path);
    let markdown = file.get("language").and_then(Value::as_str) == Some("markdown");
    let title = unified
        .and_then(|tab| tab.get("customLabel"))
        .and_then(Value::as_str)
        .filter(|label| !label.is_empty())
        .unwrap_or_else(|| relative.rsplit(['/', '\\']).next().unwrap_or(relative));
    let id = unified
        .and_then(|tab| tab.get("id"))
        .and_then(Value::as_str)
        .unwrap_or(file_id);
    let draft = file.get("dirtyDraftContent").and_then(Value::as_str);
    let mut value = json!({
        "id": id, "type": if markdown {"markdown"} else {"file"},
        "title": title, "filePath": path, "relativePath": relative,
        "language": file.get("language").and_then(Value::as_str).unwrap_or_default(),
        "mode": "edit", "isDirty": draft.is_some(), "isActive": false,
        "color": unified.and_then(|tab| tab.get("color")).cloned().unwrap_or(Value::Null),
        "isPinned": unified.and_then(|tab| tab.get("isPinned")).and_then(Value::as_bool).unwrap_or(false)
    });
    if markdown {
        value["sourceFileId"] = Value::String(file_id.to_owned());
        value["sourceFilePath"] = Value::String(path.to_owned());
        value["sourceRelativePath"] = Value::String(relative.to_owned());
        value["documentVersion"] = Value::String(
            draft
                .map(draft_version)
                .unwrap_or_else(|| format!("file:{file_id}")),
        );
    }
    value
}

fn draft_version(value: &str) -> String {
    let mut hash = 2_166_136_261_u32;
    let mut length = 0;
    for unit in value.encode_utf16() {
        hash = (hash ^ u32::from(unit)).wrapping_mul(16_777_619);
        length += 1;
    }
    format!("draft:{length}:{hash:x}")
}

fn encode(value: &str) -> String {
    let mut result = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte) {
            result.push(char::from(byte));
        } else {
            use std::fmt::Write;
            let _ = write!(&mut result, "%{byte:02X}");
        }
    }
    result
}
