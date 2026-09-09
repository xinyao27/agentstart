use serde_json::{Map, Value};

use super::enabled;

const FORWARD: &[&str] = &["todo", "in-progress", "in-review", "completed"];
const REVERSE: &[&str] = &["completed", "in-review", "in-progress", "todo"];

pub(super) fn migrate(raw: &Map<String, Value>) -> Value {
    let source = raw.get("workspaceStatuses");
    let workflow = !enabled(raw, "_workspaceStatusesDefaultWorkflowMigrated")
        && [FORWARD, REVERSE]
            .iter()
            .any(|order| exact(source, order, false) || exact(source, order, true));
    let repair = !enabled(raw, "_workspaceStatusesReorderedDefaultRepaired")
        && exact(source, REVERSE, false);
    if workflow || repair {
        return super::super::normalize::workspace::statuses(None);
    }
    let mut normalized = super::super::normalize::workspace::statuses(source);
    if !enabled(raw, "_workspaceStatusesDefaultVisualsMigrated")
        && let Some(statuses) = normalized.as_array_mut()
    {
        for status in statuses {
            let Some(status) = status.as_object_mut() else {
                continue;
            };
            let id = status
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            let label = status
                .get("label")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if !default_label(&id, label) {
                continue;
            }
            let Some((old_color, old_icon, new_visual)) = visuals(&id) else {
                continue;
            };
            if status.get("color").and_then(Value::as_str) == Some(old_color) {
                status.insert("color".to_owned(), Value::String(new_visual.to_owned()));
            }
            let icon = status.get("icon").and_then(Value::as_str);
            if icon == Some(old_icon) || (id == "in-progress" && icon == Some("circle-progress")) {
                status.insert("icon".to_owned(), Value::String(new_visual.to_owned()));
            }
        }
    }
    normalized
}

fn exact(source: Option<&Value>, order: &[&str], legacy: bool) -> bool {
    let Some(values) = source.and_then(Value::as_array) else {
        return false;
    };
    values.len() == order.len()
        && values.iter().zip(order).all(|(value, id)| {
            let Some(raw) = value.as_object() else {
                return false;
            };
            let Some(label) = raw.get("label").and_then(Value::as_str) else {
                return false;
            };
            let (color, icon) = if let Some((color, icon, new)) = visuals(id) {
                if legacy { (color, icon) } else { (new, new) }
            } else {
                ("neutral", "circle")
            };
            raw.len() == 4
                && raw.get("id").and_then(Value::as_str) == Some(id)
                && default_label(id, label)
                && raw.get("color").and_then(Value::as_str) == Some(color)
                && raw.get("icon").and_then(Value::as_str) == Some(icon)
        })
}

fn default_label(id: &str, label: &str) -> bool {
    matches!(
        (id, label),
        ("todo", "Todo")
            | ("in-progress", "In progress")
            | ("in-review", "In review")
            | ("completed", "Completed" | "Done")
    )
}

fn visuals(id: &str) -> Option<(&'static str, &'static str, &'static str)> {
    match id {
        "in-progress" => Some(("blue", "circle-dot", "conductor-progress")),
        "in-review" => Some(("violet", "git-pull-request", "conductor-review")),
        "completed" => Some(("emerald", "circle-check", "conductor-done")),
        _ => None,
    }
}
