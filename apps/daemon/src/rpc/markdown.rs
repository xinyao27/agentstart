pub(in crate::rpc) mod protocol;

use std::time::Duration;

use serde_json::{Value, json};
use thiserror::Error;

use crate::session_tabs::{SessionTabsAuthority, SessionTabsError, SessionTabsScope};
use crate::shell_services::{ShellServicesError, ShellServicesRegistry};

// Why: the legacy JSON surface for the markdown namespace is retired; only the
// protobuf handlers remain, resolving the tab through the same session-tabs
// authority before relaying to the shell renderer.

const SHELL_REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Clone)]
pub(super) struct MarkdownRpc {
    session_tabs: SessionTabsAuthority,
    shells: ShellServicesRegistry,
}

struct MarkdownInput {
    base_version: Option<String>,
    content: Option<String>,
    tab_id: String,
    worktree: String,
}

#[derive(Clone, Copy)]
enum MarkdownMethod {
    ReadTab,
    SaveTab,
}

impl MarkdownMethod {
    fn shell_path(self) -> &'static str {
        match self {
            Self::ReadTab => "/mobileMarkdown/read",
            Self::SaveTab => "/mobileMarkdown/save",
        }
    }
}

#[derive(Debug, Error)]
pub(in crate::rpc) enum MarkdownRpcError {
    #[error(transparent)]
    SessionTabs(#[from] SessionTabsError),
    #[error(transparent)]
    Shell(Box<ShellServicesError>),
}

impl From<ShellServicesError> for MarkdownRpcError {
    fn from(error: ShellServicesError) -> Self {
        Self::Shell(Box::new(error))
    }
}

impl MarkdownRpc {
    pub(super) fn new(session_tabs: SessionTabsAuthority, shells: ShellServicesRegistry) -> Self {
        Self {
            session_tabs,
            shells,
        }
    }

    pub(in crate::rpc) async fn protocol_read_tab(
        &self,
        worktree: String,
        tab_id: String,
    ) -> Result<Value, MarkdownRpcError> {
        let output = self
            .execute(
                MarkdownMethod::ReadTab,
                MarkdownInput {
                    base_version: None,
                    content: None,
                    tab_id,
                    worktree,
                },
            )
            .await?;
        validate_output(MarkdownMethod::ReadTab, output)
    }

    pub(in crate::rpc) async fn protocol_save_tab(
        &self,
        worktree: String,
        tab_id: String,
        base_version: String,
        content: String,
    ) -> Result<Value, MarkdownRpcError> {
        let output = self
            .execute(
                MarkdownMethod::SaveTab,
                MarkdownInput {
                    base_version: Some(base_version),
                    content: Some(content),
                    tab_id,
                    worktree,
                },
            )
            .await?;
        validate_output(MarkdownMethod::SaveTab, output)
    }

    async fn execute(
        &self,
        method: MarkdownMethod,
        input: MarkdownInput,
    ) -> Result<Value, MarkdownRpcError> {
        let worktree_id = self.resolve_markdown_tab(&input).await?;
        let shell_input = match method {
            MarkdownMethod::ReadTab => {
                json!({ "worktreeId": worktree_id, "tabId": input.tab_id })
            }
            MarkdownMethod::SaveTab => json!({
                "worktreeId": worktree_id,
                "tabId": input.tab_id,
                "baseVersion": input.base_version,
                "content": input.content,
            }),
        };
        Ok(self
            .shells
            .request_web_with_timeout(
                None,
                method.shell_path(),
                shell_input,
                SHELL_REQUEST_TIMEOUT,
            )
            .await?)
    }

    async fn resolve_markdown_tab(
        &self,
        input: &MarkdownInput,
    ) -> Result<String, SessionTabsError> {
        let scope = self.session_tabs.resolve_scope(&input.worktree).await?;
        let snapshot = self.session_tabs.snapshot_for_scope(&scope).await?;
        let is_markdown = snapshot
            .get("tabs")
            .and_then(Value::as_array)
            .is_some_and(|tabs| {
                tabs.iter().any(|tab| {
                    tab.get("id").and_then(Value::as_str) == Some(input.tab_id.as_str())
                        && tab.get("type").and_then(Value::as_str) == Some("markdown")
                })
            });
        if !is_markdown {
            return Err(SessionTabsError::TabNotFound);
        }
        let SessionTabsScope::Worktree { worktree, .. } = scope else {
            return Err(SessionTabsError::HostProvenance);
        };
        Ok(worktree)
    }
}

fn validate_output(method: MarkdownMethod, output: Value) -> Result<Value, MarkdownRpcError> {
    let Some(object) = output.as_object() else {
        return Err(ShellServicesError::InvalidResponse.into());
    };
    let valid = match method {
        MarkdownMethod::ReadTab => {
            matches!(object.len(), 8 | 9)
                && object.keys().all(|key| {
                    matches!(
                        key.as_str(),
                        "tabId"
                            | "filePath"
                            | "relativePath"
                            | "content"
                            | "isDirty"
                            | "version"
                            | "source"
                            | "editable"
                            | "readOnlyReason"
                    )
                })
                && string(object.get("tabId"))
                && string(object.get("filePath"))
                && string(object.get("relativePath"))
                && string(object.get("content"))
                && object.get("isDirty").is_some_and(Value::is_boolean)
                && string(object.get("version"))
                && matches!(
                    object.get("source").and_then(Value::as_str),
                    Some("draft" | "file")
                )
                && object.get("editable").is_some_and(Value::is_boolean)
                && object.get("readOnlyReason").is_none_or(|reason| {
                    matches!(
                        reason.as_str(),
                        Some(
                            "unsupported_preview"
                                | "unsupported_tab"
                                | "unsupported_untitled"
                                | "file_too_large"
                        )
                    )
                })
        }
        MarkdownMethod::SaveTab => {
            object.len() == 4
                && object
                    .keys()
                    .all(|key| matches!(key.as_str(), "tabId" | "version" | "isDirty" | "content"))
                && string(object.get("tabId"))
                && string(object.get("version"))
                && object.get("isDirty") == Some(&Value::Bool(false))
                && string(object.get("content"))
        }
    };
    valid
        .then_some(output)
        .ok_or_else(|| ShellServicesError::InvalidResponse.into())
}

fn string(value: Option<&Value>) -> bool {
    value.is_some_and(Value::is_string)
}
