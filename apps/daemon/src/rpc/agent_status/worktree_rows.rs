use super::AgentStatusAuthority;
use serde_json::Value;
use std::collections::HashMap;

impl AgentStatusAuthority {
    pub(crate) fn worktree_rows(&self) -> (Vec<Value>, Vec<(String, String)>) {
        let hooks: HashMap<_, _> = self
            .snapshot()
            .into_iter()
            .filter_map(|entry| Some((entry.get("paneKey")?.as_str()?.to_owned(), entry)))
            .collect();
        let bindings = self.terminals.agent_bindings();
        let identities = bindings
            .iter()
            .filter_map(|binding| {
                Some((
                    binding.get("handle")?.as_str()?.to_owned(),
                    binding.get("paneKey")?.as_str()?.to_owned(),
                ))
            })
            .collect();
        let rows = bindings
            .into_iter()
            .filter_map(|binding| select_row(&binding, &hooks))
            .collect();
        (rows, identities)
    }
}

fn select_row(binding: &Value, hooks: &HashMap<String, Value>) -> Option<Value> {
    let pane = binding.get("paneKey")?.as_str()?;
    let created_at = binding
        .get("createdAt")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let hook = hooks.get(pane).filter(|hook| {
        let token_matches = match (
            binding.get("launchToken").and_then(Value::as_str),
            hook.get("launchToken").and_then(Value::as_str),
        ) {
            (Some(expected), actual) => actual == Some(expected),
            (None, _) => true,
        };
        token_matches
            && hook
                .get("receivedAt")
                .and_then(Value::as_i64)
                .is_some_and(|at| at >= created_at)
    });
    let osc = binding.get("oscStatus").filter(|value| value.is_object());
    let status = match (hook, osc) {
        (Some(hook), Some(osc)) if timestamp(osc) > timestamp(hook) => osc,
        (Some(hook), _) => hook,
        (_, Some(osc)) => osc,
        _ => return None,
    };
    let mut row = status.as_object()?.clone();
    // Why: a retained hook can name the worktree before a rename; the current PTY binding wins.
    for field in [
        "paneKey",
        "tabId",
        "hostId",
        "worktreeId",
        "worktreePath",
        "handle",
    ] {
        row.insert(
            field.to_owned(),
            binding.get(field).cloned().unwrap_or(Value::Null),
        );
    }
    Some(Value::Object(row))
}

fn timestamp(value: &Value) -> i64 {
    value.get("receivedAt").and_then(Value::as_i64).unwrap_or(0)
}
