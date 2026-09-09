pub(super) fn blocked_reason(text: &str) -> Option<&'static str> {
    let normalized = text.to_lowercase();
    blocked_signal(&normalized).map(|(_, reason)| reason)
}

fn blocked_signal(normalized: &str) -> Option<(usize, &'static str)> {
    let mut candidates = Vec::new();
    push_pair(
        &mut candidates,
        normalized,
        "update available",
        "press enter to continue",
        "codex-update-prompt",
    );
    push_pair(
        &mut candidates,
        normalized,
        "choose working directory to",
        "press enter to continue",
        "codex-cwd-prompt",
    );
    push_pair(
        &mut candidates,
        normalized,
        "codex just got an upgrade",
        "press enter to continue",
        "codex-model-migration-prompt",
    );
    push_pair(
        &mut candidates,
        normalized,
        "hooks need review",
        "press enter to confirm",
        "codex-hooks-review-prompt",
    );
    let trust_index = ["do you trust", "trust this", "trusted workspace"]
        .iter()
        .filter_map(|needle| normalized.rfind(needle))
        .max();
    if let Some(index) = trust_index
        && ["workspace", "folder", "directory", "repo"]
            .iter()
            .any(|needle| normalized[index..].contains(needle))
    {
        candidates.push((index, "codex-trust-workspace"));
    }
    let interactive_index = [
        "press enter to confirm",
        "press enter to continue",
        "press enter to view",
        "press enter to insert",
        "press t to trust",
    ]
    .iter()
    .filter_map(|needle| normalized.rfind(needle))
    .max();
    if let Some(index) = interactive_index {
        let start = floor_char_boundary(normalized, index.saturating_sub(600));
        let end = floor_char_boundary(normalized, (index + 200).min(normalized.len()));
        let context = &normalized[start..end];
        let has_context = ["codex", "permission", "sandbox", "trust", "hook"]
            .iter()
            .any(|needle| context.contains(needle));
        let has_specific = candidates
            .iter()
            .any(|(candidate, _)| *candidate >= start && *candidate <= index);
        if has_context && !has_specific {
            candidates.push((index, "codex-interactive-prompt"));
        }
    }
    let (blocked_index, reason) = candidates.into_iter().max_by_key(|(index, _)| *index)?;
    if dismissed_prompt_index(normalized).is_some_and(|index| index > blocked_index) {
        return None;
    }
    Some((blocked_index, reason))
}

fn floor_char_boundary(value: &str, mut index: usize) -> usize {
    while index > 0 && !value.is_char_boundary(index) {
        index -= 1;
    }
    index
}

pub(super) fn known_ready_prompt(text: &str) -> bool {
    let normalized = text.to_lowercase();
    let Some(ready_index) = ready_prompt_index(&normalized) else {
        return false;
    };
    blocked_signal(&normalized).is_none_or(|(blocked_index, _)| blocked_index <= ready_index)
}

fn push_pair(
    candidates: &mut Vec<(usize, &'static str)>,
    text: &str,
    start: &str,
    confirmation: &str,
    reason: &'static str,
) {
    if let Some(index) = text.rfind(start)
        && text[index..].contains(confirmation)
    {
        candidates.push((index, reason));
    }
}

fn dismissed_prompt_index(text: &str) -> Option<usize> {
    [
        codex_ready_index(text),
        antigravity_ready_index(text),
        cursor_active_index(text),
    ]
    .into_iter()
    .flatten()
    .max()
}

fn ready_prompt_index(text: &str) -> Option<usize> {
    [
        codex_ready_index(text),
        antigravity_ready_index(text),
        cursor_ready_index(text),
    ]
    .into_iter()
    .flatten()
    .max()
}

fn codex_ready_index(text: &str) -> Option<usize> {
    let index = text.rfind("openai codex")?;
    let segment = &text[index..];
    (segment.contains("model:") && segment.contains("directory:")).then_some(index)
}

fn antigravity_ready_index(text: &str) -> Option<usize> {
    let index = text.rfind("antigravity cli")?;
    let segment = &text[index..];
    let has_model = segment
        .lines()
        .any(|line| line.trim().starts_with("gemini"));
    let has_prompt = segment.lines().any(|line| line.trim() == ">");
    (has_model && has_prompt).then_some(index)
}

fn cursor_active_index(text: &str) -> Option<usize> {
    let index = text.rfind("cursor agent")?;
    text[index..].contains('\u{2192}').then_some(index)
}

fn cursor_ready_index(text: &str) -> Option<usize> {
    let index = cursor_active_index(text)?;
    (!text[index..]
        .chars()
        .any(|character| ('\u{2801}'..='\u{28ff}').contains(&character)))
    .then_some(index)
}
