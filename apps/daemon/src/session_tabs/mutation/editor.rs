use super::{
    SessionTabsAuthority, SessionTabsError, object_field, prune_group_layout, prune_groups,
};
use serde_json::{Value, json};
use std::collections::HashSet;

impl SessionTabsAuthority {
    pub(super) async fn close_document_tab(
        &self,
        host_id: Option<&str>,
        worktree: &str,
        tab: &Value,
    ) -> Result<(), SessionTabsError> {
        if tab.get("isPinned").and_then(Value::as_bool) == Some(true) {
            return Err(SessionTabsError::TerminalTabPinned);
        }
        if tab.get("isDirty").and_then(Value::as_bool) == Some(true) {
            return Err(SessionTabsError::EditorDirty);
        }
        let id = tab
            .get("id")
            .and_then(Value::as_str)
            .ok_or(SessionTabsError::TabNotFound)?
            .to_owned();
        let kind = tab.get("type").and_then(Value::as_str).unwrap_or_default();
        if kind == "browser"
            && !self
                .inner
                .shells
                .dispatch_ui(
                    "/ui/command",
                    json!({"type":"closeSessionTab","tabId":id,"worktreeId":worktree}),
                )
                .await
        {
            return Err(SessionTabsError::RendererUnavailable);
        }
        let path = tab
            .get("filePath")
            .and_then(Value::as_str)
            .map(str::to_owned);
        let browser_id = tab
            .get("browserWorkspaceId")
            .and_then(Value::as_str)
            .map(str::to_owned);
        let worktree = worktree.to_owned();
        self.inner
            .workspace_session
            .mutate(host_id, move |session| {
                let Some(session) = session.as_object_mut() else {
                    return (Err(SessionTabsError::TabNotFound), false);
                };
                if session
                    .get("unifiedTabs")
                    .and_then(|map| map.get(&worktree))
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .any(|tab| {
                        tab.get("id").and_then(Value::as_str) == Some(id.as_str())
                            && tab.get("isPinned").and_then(Value::as_bool) == Some(true)
                    })
                {
                    return (Err(SessionTabsError::TerminalTabPinned), false);
                }
                if path.as_deref().is_some_and(|path| {
                    session
                        .get("openFilesByWorktree")
                        .and_then(|map| map.get(&worktree))
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                        .any(|file| {
                            file.get("filePath").and_then(Value::as_str) == Some(path)
                                && file.get("dirtyDraftContent").is_some()
                        })
                }) {
                    return (Err(SessionTabsError::EditorDirty), false);
                }
                if let Some(tabs) = object_field(session, "unifiedTabs")
                    .get_mut(&worktree)
                    .and_then(Value::as_array_mut)
                {
                    tabs.retain(|tab| tab.get("id").and_then(Value::as_str) != Some(id.as_str()));
                }
                if let Some(path) = &path
                    && let Some(files) = object_field(session, "openFilesByWorktree")
                        .get_mut(&worktree)
                        .and_then(Value::as_array_mut)
                {
                    files.retain(|file| {
                        file.get("filePath").and_then(Value::as_str) != Some(path.as_str())
                    });
                }
                if let Some(browser) = &browser_id {
                    if let Some(tabs) = object_field(session, "browserTabsByWorktree")
                        .get_mut(&worktree)
                        .and_then(Value::as_array_mut)
                    {
                        tabs.retain(|tab| {
                            tab.get("id").and_then(Value::as_str) != Some(browser.as_str())
                        });
                    }
                    object_field(session, "browserPagesByWorkspace").remove(browser);
                }
                let removed = HashSet::from([id]);
                prune_groups(session, &worktree, &removed);
                prune_group_layout(session, &worktree);
                (Ok(()), true)
            })
            .await??;
        self.inner.workspace_session.flush().await?;
        self.reconcile_headless_now().await
    }
}
