mod terminal;
mod ui;

use serde_json::{Value, json};
use yiru_protocol::runtime::v1::*;

use super::ShellServicesError;
use shell_host_request::Command;
use shell_host_response::Result as Response;

type Result<T> = std::result::Result<T, ShellServicesError>;

pub(super) fn encode(path: &str, body: &Value) -> Result<ShellHostRequest> {
    let command = match path {
        "/ui/command" => Command::Ui(ui::encode(body)?),
        "/terminal/create" => Command::TerminalCreate(terminal::create(body)?),
        "/terminal/reveal" => Command::TerminalReveal(terminal::reveal(body)?),
        "/terminal/mount" => Command::TerminalMount(ShellHostTerminalMount {
            worktree_id: required(body, "worktreeId")?,
            tab_id: optional(body, "tabId"),
            pty_id: optional(body, "ptyId"),
        }),
        "/terminal/closeTab" => Command::TerminalClose(ShellHostTerminalClose {
            tab_id: required(body, "tabId")?,
        }),
        "/mobileMarkdown/read" => Command::MarkdownRead(ShellHostMarkdownRead {
            worktree_id: required(body, "worktreeId")?,
            tab_id: required(body, "tabId")?,
        }),
        "/mobileMarkdown/save" => Command::MarkdownSave(ShellHostMarkdownSave {
            worktree_id: required(body, "worktreeId")?,
            tab_id: required(body, "tabId")?,
            base_version: required(body, "baseVersion")?,
            content: required(body, "content")?,
        }),
        "/rateLimitResume/dispatch" => Command::Resume(
            crate::rpc::rate_limit_resume::protocol::json_to_schedule(body)
                .ok_or(ShellServicesError::InvalidResponse)?,
        ),
        "/notifications/display" => Command::NotificationDisplay(ShellHostNotificationDisplay {
            source: optional(body, "source"),
            notification_id: optional(body, "notificationId"),
            worktree_id: optional(body, "worktreeId"),
            pane_key: optional(body, "paneKey"),
            title: required(body, "title")?,
            body: required(body, "body")?,
            use_system_sound: flag(body, "useSystemSound").unwrap_or(false),
            suppress_when_focused: flag(body, "suppressWhenFocused").unwrap_or(false),
            require_display_confirmation: flag(body, "requireDisplayConfirmation"),
        }),
        "/notifications/dismiss" => Command::NotificationDismiss(ShellHostNotificationDismiss {
            notification_ids: strings(body, "notificationIds")?,
        }),
        _ => return Err(ShellServicesError::InvalidResponse),
    };
    Ok(ShellHostRequest {
        command: Some(command),
    })
}

pub(super) fn decode(path: &str, response: ShellHostResponse) -> Result<Value> {
    match (path, response.result) {
        (
            "/ui/command" | "/terminal/mount" | "/rateLimitResume/dispatch",
            Some(Response::Accepted(value)),
        ) => Ok(json!({ "accepted": value.accepted })),
        ("/terminal/create", Some(Response::TerminalCreated(value))) => {
            Ok(json!({ "tabId": value.tab_id, "title": value.title }))
        }
        ("/terminal/reveal", Some(Response::TerminalRevealed(value))) => {
            Ok(json!({ "tabId": value.tab_id, "title": value.title }))
        }
        ("/terminal/closeTab", Some(Response::TerminalClosed(value))) => {
            Ok(json!({ "closed": value.closed }))
        }
        ("/mobileMarkdown/read", Some(Response::MarkdownContent(value))) => {
            let mut result = json!({
            "tabId": value.tab_id, "filePath": value.file_path, "relativePath": value.relative_path,
            "content": value.content, "isDirty": value.is_dirty, "version": value.version,
            "source": value.source, "editable": value.editable,
            });
            if let Some(reason) = value.read_only_reason {
                result["readOnlyReason"] = Value::String(reason);
            }
            Ok(result)
        }
        ("/mobileMarkdown/save", Some(Response::MarkdownSaved(value))) => Ok(
            json!({ "tabId": value.tab_id, "version": value.version, "isDirty": value.is_dirty, "content": value.content }),
        ),
        ("/notifications/display", Some(Response::NotificationDisplayed(value))) => {
            Ok(json!({ "delivered": value.delivered, "reason": value.reason }))
        }
        ("/notifications/dismiss", Some(Response::NotificationDismissed(value))) => {
            Ok(json!({ "dismissed": value.dismissed }))
        }
        _ => Err(ShellServicesError::InvalidResponse),
    }
}

fn required(body: &Value, key: &str) -> Result<String> {
    optional(body, key).ok_or(ShellServicesError::InvalidResponse)
}
fn optional(body: &Value, key: &str) -> Option<String> {
    body.get(key).and_then(Value::as_str).map(str::to_owned)
}
fn flag(body: &Value, key: &str) -> Option<bool> {
    body.get(key).and_then(Value::as_bool)
}
fn strings(body: &Value, key: &str) -> Result<Vec<String>> {
    body.get(key)
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .map(|value| {
                    value
                        .as_str()
                        .map(str::to_owned)
                        .ok_or(ShellServicesError::InvalidResponse)
                })
                .collect()
        })
        .unwrap_or_else(|| Ok(Vec::new()))
}
fn map(body: &Value, key: &str) -> Result<std::collections::HashMap<String, String>> {
    body.get(key)
        .and_then(Value::as_object)
        .map(|values| {
            values
                .iter()
                .map(|(key, value)| {
                    Ok((
                        key.clone(),
                        value
                            .as_str()
                            .ok_or(ShellServicesError::InvalidResponse)?
                            .to_owned(),
                    ))
                })
                .collect()
        })
        .unwrap_or_else(|| Ok(std::collections::HashMap::new()))
}
fn launch(body: &Value) -> Result<Option<TerminalLaunchConfig>> {
    body.get("launchConfig")
        .filter(|value| !value.is_null())
        .map(|value| {
            Ok(TerminalLaunchConfig {
                agent_command: optional(value, "agentCommand"),
                omp_resume_file_path: optional(value, "ompResumeFilePath"),
                agent_args: required(value, "agentArgs")?,
                agent_env: map(value, "agentEnv")?,
            })
        })
        .transpose()
}
