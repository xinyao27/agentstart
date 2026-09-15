use serde_json::{Value, json};

// Why: durable identity plus the last known page handle and navigation state, so a client can
// attach a live view; whether that page is still open is answered by the screencast itself,
// not by withholding the handle here.
pub(in crate::session_tabs) fn append_metadata(
    session: &Value,
    worktree: &str,
    snapshot: &mut Value,
) {
    let unified = session
        .get("unifiedTabs")
        .and_then(|map| map.get(worktree))
        .and_then(Value::as_array);
    let Some(tabs) = snapshot.get_mut("tabs").and_then(Value::as_array_mut) else {
        return;
    };
    for browser in session
        .get("browserTabsByWorktree")
        .and_then(|map| map.get(worktree))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(entity_id) = browser.get("id").and_then(Value::as_str) else {
            continue;
        };
        let record = unified.into_iter().flatten().find(|tab| {
            tab.get("contentType").and_then(Value::as_str) == Some("browser")
                && tab.get("entityId").and_then(Value::as_str) == Some(entity_id)
        });
        tabs.push(json!({
            "type": "browser",
            "id": record.and_then(|tab| tab.get("id")).and_then(Value::as_str).unwrap_or(entity_id),
            "browserWorkspaceId": entity_id,
            "browserPageId": browser.get("activePageId"),
            "title": browser.get("title"),
            "url": browser.get("url"),
            "loading": browser.get("loading"),
            "canGoBack": browser.get("canGoBack"),
            "canGoForward": browser.get("canGoForward"),
            "isActive": false,
        }));
    }
}
