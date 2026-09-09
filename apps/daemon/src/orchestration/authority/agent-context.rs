use std::collections::HashMap;

use rusqlite::Connection;
use serde_json::{Map, Value, json};

use super::OrchestrationAuthority;
use crate::orchestration::OrchestrationError;

impl OrchestrationAuthority {
    pub(crate) async fn agent_contexts(
        &self,
        bindings: Vec<(String, String)>,
    ) -> Result<Value, OrchestrationError> {
        if bindings.is_empty() {
            return Ok(json!({}));
        }
        self.store
            .execute(move |connection| contexts(connection, &bindings))
            .await
    }
}

fn contexts(
    connection: &Connection,
    bindings: &[(String, String)],
) -> Result<Value, OrchestrationError> {
    let bindings_json = serde_json::to_string(bindings).map_err(|_| {
        OrchestrationError::domain("invalid_argument", "Terminal bindings could not be encoded")
    })?;
    // Why: rowid determines the latest dispatch, including a failed replacement; filtering completed
    // rows before selection would resurrect an older task on a reused terminal.
    let mut query = connection.prepare(
        "WITH bindings AS (SELECT json_extract(value,'$[0]') AS handle,
                                  json_extract(value,'$[1]') AS pane FROM json_each(?1))
         SELECT b.handle,b.pane,d.id,d.task_id,d.status,d.completed_at,
                t.spec,t.task_title,t.display_name,t.created_by_terminal_handle,
                CASE WHEN r.legacy=1 THEN (SELECT coordinator_handle FROM coordinator_runs
                     WHERE status='running' ORDER BY created_at DESC LIMIT 1) ELSE r.coordinator_handle END,
                CASE WHEN r.legacy=1 THEN (SELECT id FROM coordinator_runs
                     WHERE status='running' ORDER BY created_at DESC LIMIT 1) ELSE r.id END
         FROM bindings b JOIN dispatch_contexts d ON d.rowid=(
            SELECT candidate.rowid FROM dispatch_contexts candidate
            WHERE candidate.assignee_handle=b.handle
            ORDER BY CASE WHEN candidate.status IN ('pending','dispatched') THEN 0 ELSE 1 END,
                     candidate.rowid DESC LIMIT 1)
         LEFT JOIN tasks t ON t.id=d.task_id AND t.run_id=d.run_id
         LEFT JOIN runs r ON r.id=d.run_id
         WHERE d.status IN ('pending','dispatched') OR
               (d.status='completed' AND julianday(d.completed_at)>=julianday('now')-(30.0/1440.0))",
    )?;
    let by_handle: HashMap<&str, &str> = bindings
        .iter()
        .map(|(handle, pane)| (handle.as_str(), pane.as_str()))
        .collect();
    let mut output = Map::new();
    let mut rows = query.query([bindings_json])?;
    while let Some(row) = rows.next()? {
        let handle: String = row.get(0)?;
        let pane: String = row.get(1)?;
        let status: String = row.get(4)?;
        let spec: Option<String> = row.get(6)?;
        let title: Option<String> = row.get(7)?;
        let display: Option<String> = row.get(8)?;
        let creator: Option<String> = row.get(9)?;
        let coordinator: Option<String> = if status == "completed" {
            None
        } else {
            row.get(10)?
        };
        let parent = creator.or_else(|| {
            coordinator
                .as_ref()
                .filter(|value| *value != &handle)
                .cloned()
        });
        let mut context = Map::from_iter([
            ("dispatchId".to_owned(), Value::String(row.get(2)?)),
            ("taskId".to_owned(), Value::String(row.get(3)?)),
            ("dispatchStatus".to_owned(), Value::String(status)),
        ]);
        if let Some(completed) = row.get::<_, Option<String>>(5)? {
            context.insert("completedAt".to_owned(), Value::String(completed));
        }
        if let Some(spec) = spec {
            let title = title_text(title.as_deref(), &spec, 80);
            let display = title_text(display.as_deref(), &title, 160);
            if !title.is_empty() {
                context.insert("taskTitle".to_owned(), Value::String(title));
            }
            if !display.is_empty() {
                context.insert("displayName".to_owned(), Value::String(display));
            }
        }
        if let Some(parent) = parent {
            if let Some(pane) = by_handle.get(parent.as_str()) {
                context.insert(
                    "parentPaneKey".to_owned(),
                    Value::String((*pane).to_owned()),
                );
            }
            context.insert("parentTerminalHandle".to_owned(), Value::String(parent));
        }
        if let Some(coordinator) = coordinator {
            context.insert("coordinatorHandle".to_owned(), Value::String(coordinator));
            if let Some(run) = row.get::<_, Option<String>>(11)? {
                context.insert("orchestrationRunId".to_owned(), Value::String(run));
            }
        }
        output.insert(pane, Value::Object(context));
    }
    Ok(Value::Object(output))
}

fn title_text(preferred: Option<&str>, fallback: &str, max: usize) -> String {
    let preferred = normalize_title(preferred.unwrap_or_default(), max);
    if !preferred.is_empty() {
        return preferred;
    }
    fallback
        .split('\n')
        .map(|line| normalize_title(line, max))
        .find(|line| !line.is_empty())
        .unwrap_or_default()
}

fn normalize_title(value: &str, max: usize) -> String {
    let normalized = value
        .split(ecmascript_whitespace)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if normalized.encode_utf16().count() <= max {
        return normalized;
    }
    let mut title = String::new();
    let mut length = 0;
    for character in normalized.chars() {
        length += character.len_utf16();
        if length > max.saturating_sub(3) {
            break;
        }
        title.push(character);
    }
    format!("{}...", title.trim_end_matches(ecmascript_whitespace))
}

fn ecmascript_whitespace(character: char) -> bool {
    (character.is_whitespace() && character != '\u{85}') || character == '\u{feff}'
}
