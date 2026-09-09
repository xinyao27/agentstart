mod browser_history;
mod sleeping_agents;

use serde_json::{Map, Value};

use super::accepts_terminal_launch_agent;

const RETIRED_CONTENT_TYPES: &[&str] = &[
    "explorer",
    "search",
    "vault",
    "workspaces",
    "pr-checks",
    "source-control",
    "checks",
    "ports",
];

pub(super) fn repair_session(input: &Value) -> Value {
    let mut session = input.clone();
    let Some(session) = session.as_object_mut() else {
        return session;
    };
    repair_terminal_agents(session.get_mut("tabsByWorktree"));
    repair_unified_tabs(session.get_mut("unifiedTabs"));
    if let Some(history) = session.get_mut("browserUrlHistory") {
        browser_history::repair(history);
    }
    repair_last_visited(session.get_mut("lastVisitedAtByWorktreeId"));
    if let Some(records) = session.remove("sleepingAgentSessionsByPaneKey")
        && let Some(records) = sleeping_agents::repair(&records)
    {
        session.insert("sleepingAgentSessionsByPaneKey".to_owned(), records);
    }
    Value::Object(session.clone())
}

fn repair_terminal_agents(tabs: Option<&mut Value>) {
    let Some(tabs) = tabs.and_then(Value::as_object_mut) else {
        return;
    };
    for tab in tabs.values_mut().filter_map(Value::as_array_mut).flatten() {
        let Some(tab) = tab.as_object_mut() else {
            continue;
        };
        if tab
            .get("launchAgent")
            .is_some_and(|agent| !accepts_terminal_launch_agent(agent))
        {
            tab.remove("launchAgent");
        }
    }
}

fn repair_unified_tabs(tabs: Option<&mut Value>) {
    let Some(tabs) = tabs.and_then(Value::as_object_mut) else {
        return;
    };
    for tabs in tabs.values_mut().filter_map(Value::as_array_mut) {
        tabs.retain(|tab| {
            let Some(content_type) = tab.get("contentType").and_then(Value::as_str) else {
                return true;
            };
            !RETIRED_CONTENT_TYPES.contains(&content_type)
        });
    }
}

fn repair_last_visited(value: Option<&mut Value>) {
    let Some(value) = value else {
        return;
    };
    let entries = match value {
        Value::Object(entries) => entries
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect::<Vec<_>>(),
        Value::Array(entries) => entries
            .iter()
            .enumerate()
            .map(|(index, value)| (index.to_string(), value.clone()))
            .collect(),
        _ => return,
    };
    *value = Value::Object(
        entries
            .into_iter()
            .filter(|(_, value)| {
                value
                    .as_f64()
                    .is_some_and(|number| number.is_finite() && number >= 0.0)
            })
            .collect::<Map<_, _>>(),
    );
}
