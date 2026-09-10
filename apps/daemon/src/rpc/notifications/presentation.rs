use super::input::ReportInput;
use crate::notifications::NotificationSource;

const AGENT_LABEL_MAX_UTF16_LENGTH: usize = 40;
const BODY_PREVIEW_MAX_UTF16_LENGTH: usize = 180;
const TITLE_CONTEXT_MAX_UTF16_LENGTH: usize = 80;

pub(super) struct NotificationPresentation {
    pub(super) body: String,
    pub(super) title: String,
}

pub(super) fn build(input: &ReportInput) -> NotificationPresentation {
    match input.source {
        NotificationSource::TerminalBell => terminal_bell(input),
        NotificationSource::Test => NotificationPresentation {
            body: "This is a test notification from AgentStart.".to_owned(),
            title: "AgentStart notifications are on".to_owned(),
        },
        NotificationSource::AgentTaskComplete => {
            agent_task_complete(input).unwrap_or_else(|| agent_task_fallback(input))
        }
    }
}

fn terminal_bell(input: &ReportInput) -> NotificationPresentation {
    let worktree_label = input.worktree_label.as_deref().unwrap_or("workspace");
    let body = input
        .repo_label
        .as_deref()
        .filter(|value| !value.is_empty())
        .map_or_else(
            || "Attention requested".to_owned(),
            |repo_label| format!("{repo_label} · Attention requested"),
        );
    NotificationPresentation {
        body,
        title: format!("Bell in {worktree_label}"),
    }
}

fn agent_task_complete(input: &ReportInput) -> Option<NotificationPresentation> {
    if !has_agent_snapshot(input) {
        return None;
    }
    let agent_label = agent_label(input.agent_type.as_deref());
    let context = worktree_context(input);
    let status = match input.agent_state.as_deref() {
        Some("blocked" | "waiting") => "needs input",
        Some("done") if input.agent_interrupted == Some(true) => "stopped",
        _ => "finished",
    };
    let body = rich_body(input).unwrap_or_else(|| format!("{agent_label} {status}."));
    Some(NotificationPresentation {
        body,
        title: format!("{context} - {agent_label} {status}"),
    })
}

fn agent_task_fallback(input: &ReportInput) -> NotificationPresentation {
    let worktree_label = input.worktree_label.as_deref().unwrap_or("workspace");
    let body = if let Some(repo_label) = input
        .repo_label
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        input
            .terminal_title
            .as_deref()
            .filter(|value| !value.is_empty())
            .map_or_else(
                || repo_label.to_owned(),
                |terminal_title| format!("{repo_label} · {terminal_title}"),
            )
    } else {
        input
            .terminal_title
            .clone()
            .unwrap_or_else(|| "A coding agent finished working.".to_owned())
    };
    NotificationPresentation {
        body,
        title: format!("Task complete in {worktree_label}"),
    }
}

fn has_agent_snapshot(input: &ReportInput) -> bool {
    [
        input.agent_type.as_deref(),
        input.agent_state.as_deref(),
        input.agent_prompt.as_deref(),
        input.agent_tool_name.as_deref(),
        input.agent_tool_input.as_deref(),
        input.agent_last_assistant_message.as_deref(),
    ]
    .into_iter()
    .flatten()
    .any(|value| !value.is_empty())
        || input.agent_interrupted == Some(true)
}

fn worktree_context(input: &ReportInput) -> String {
    let worktree_label = normalize_text(
        input.worktree_label.as_deref(),
        TITLE_CONTEXT_MAX_UTF16_LENGTH,
    );
    let repo_label = normalize_text(input.repo_label.as_deref(), TITLE_CONTEXT_MAX_UTF16_LENGTH);
    if input.has_multiple_active_repos == Some(true)
        && !repo_label.is_empty()
        && !worktree_label.is_empty()
    {
        return normalize_text(
            Some(&format!("{repo_label} / {worktree_label}")),
            TITLE_CONTEXT_MAX_UTF16_LENGTH,
        );
    }
    if !worktree_label.is_empty() {
        worktree_label
    } else if !repo_label.is_empty() {
        repo_label
    } else {
        "workspace".to_owned()
    }
}

fn rich_body(input: &ReportInput) -> Option<String> {
    let assistant_message = normalize_text(
        input.agent_last_assistant_message.as_deref(),
        BODY_PREVIEW_MAX_UTF16_LENGTH,
    );
    if !assistant_message.is_empty() {
        return Some(assistant_message);
    }
    let tool_name = normalize_text(input.agent_tool_name.as_deref(), 60);
    let tool_input = normalize_text(
        input.agent_tool_input.as_deref(),
        BODY_PREVIEW_MAX_UTF16_LENGTH,
    );
    match (tool_name.is_empty(), tool_input.is_empty()) {
        (false, false) => Some(format!("Using {tool_name}: {tool_input}")),
        (false, true) => Some(format!("Using {tool_name}")),
        (true, false) => Some(format!("Tool input: {tool_input}")),
        (true, true) => None,
    }
}

fn agent_label(agent_type: Option<&str>) -> String {
    let normalized = normalize_text(agent_type, AGENT_LABEL_MAX_UTF16_LENGTH);
    match normalized.as_str() {
        "" | "unknown" => "Agent".to_owned(),
        "claude" => "Claude".to_owned(),
        "openclaude" => "OpenClaude".to_owned(),
        "codex" => "Codex".to_owned(),
        "gemini" => "Gemini".to_owned(),
        "antigravity" => "Antigravity".to_owned(),
        "opencode" => "OpenCode".to_owned(),
        "cursor" => "Cursor".to_owned(),
        "aider" => "Aider".to_owned(),
        "pi" => "Pi".to_owned(),
        "omp" => "OMP".to_owned(),
        "droid" => "Droid".to_owned(),
        "grok" => "Grok".to_owned(),
        "hermes" => "Hermes".to_owned(),
        _ => normalized,
    }
}

fn normalize_text(value: Option<&str>, max_utf16_length: usize) -> String {
    let mut normalized = String::new();
    let mut pending_space = false;
    for character in value.unwrap_or_default().chars() {
        if is_ecmascript_whitespace(character) {
            pending_space = !normalized.is_empty();
        } else {
            if pending_space {
                normalized.push(' ');
                pending_space = false;
            }
            normalized.push(character);
        }
    }
    if normalized.encode_utf16().count() <= max_utf16_length {
        return normalized;
    }
    let prefix_length = max_utf16_length.saturating_sub(1);
    let mut prefix = String::new();
    let mut length = 0;
    for character in normalized.chars() {
        let character_length = character.len_utf16();
        if length + character_length > prefix_length {
            break;
        }
        prefix.push(character);
        length += character_length;
    }
    prefix.push('…');
    prefix
}

fn is_ecmascript_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}'
            | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}'
            | '\u{205f}' | '\u{3000}' | '\u{feff}'
    )
}
