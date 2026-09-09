use super::model::{
    AiVaultSession, AiVaultSessionDayTokens, AiVaultSessionPreviewMessage,
    AiVaultSessionTokenUsage, SessionAccumulator,
};

const BTREE_ENTRY_OVERHEAD_BYTES: usize = 128;

// Why: the parse cache retains a finalized session plus a resumable fold per
// transcript, and a single long session holds one token-usage record per
// assistant turn. Bounding the cache by entry count alone would let a handful
// of those pin an unbounded amount of memory, so the budget needs each value's
// real retained size.
pub(super) fn session_bytes(session: &AiVaultSession) -> usize {
    let mut total = size_of::<AiVaultSession>();
    for text in [
        &session.id,
        &session.execution_host_id,
        &session.session_id,
        &session.title,
        &session.file_path,
        &session.modified_at,
        &session.resume_command,
    ] {
        total = total.saturating_add(text.capacity());
    }
    for text in [
        session.execution_host_platform.as_ref(),
        session.cwd.as_ref(),
        session.branch.as_ref(),
        session.model.as_ref(),
        session.codex_home.as_ref(),
        session.created_at.as_ref(),
        session.updated_at.as_ref(),
        session.last_user_prompt.as_ref(),
    ] {
        total = total.saturating_add(optional_text_bytes(text));
    }
    if let Some(days) = session.tokens_by_day.as_deref() {
        total = total.saturating_add(session.tokens_by_day.as_ref().map_or(0, |days| {
            days.capacity()
                .saturating_mul(size_of::<AiVaultSessionDayTokens>())
        }));
        for entry in days {
            total = total.saturating_add(entry.day.capacity());
        }
    }
    total = total
        .saturating_add(
            session
                .token_usage
                .as_ref()
                .map_or(0, |usage| usage_bytes(usage, usage.capacity())),
        )
        .saturating_add(preview_bytes(
            &session.preview_messages,
            session.preview_messages.capacity(),
        ));
    if let Some(subagent) = session.subagent.as_ref() {
        total = total
            .saturating_add(size_of_val(subagent))
            .saturating_add(subagent.parent_session_id.capacity())
            .saturating_add(optional_text_bytes(subagent.agent_type.as_ref()));
    }
    total
}

pub(super) fn accumulator_bytes(state: &SessionAccumulator) -> usize {
    let mut total = size_of::<SessionAccumulator>();
    for text in [&state.file_path, &state.modified_at, &state.session_id] {
        total = total.saturating_add(text.capacity());
    }
    for text in [
        state.branch.as_ref(),
        state.codex_home.as_ref(),
        state.cwd.as_ref(),
        state.last_user_prompt.as_ref(),
        state.model.as_ref(),
        state.provider.as_ref(),
        state.title.as_ref(),
    ] {
        total = total.saturating_add(optional_text_bytes(text));
    }
    for (day, tokens) in &state.tokens_by_day {
        total = total
            .saturating_add(BTREE_ENTRY_OVERHEAD_BYTES)
            .saturating_add(day.capacity())
            .saturating_add(size_of_val(tokens));
    }
    total
        .saturating_add(usage_bytes(
            &state.token_usage,
            state.token_usage.capacity(),
        ))
        .saturating_add(preview_bytes(
            &state.preview_messages,
            state.preview_messages.capacity(),
        ))
}

fn usage_bytes(usage: &[AiVaultSessionTokenUsage], capacity: usize) -> usize {
    usage.iter().fold(
        capacity.saturating_mul(size_of::<AiVaultSessionTokenUsage>()),
        |total, entry| {
            total
                .saturating_add(optional_text_bytes(entry.provider.as_ref()))
                .saturating_add(optional_text_bytes(entry.model.as_ref()))
                .saturating_add(optional_text_bytes(entry.timestamp.as_ref()))
        },
    )
}

fn preview_bytes(messages: &[AiVaultSessionPreviewMessage], capacity: usize) -> usize {
    messages.iter().fold(
        capacity.saturating_mul(size_of::<AiVaultSessionPreviewMessage>()),
        |total, message| {
            total
                .saturating_add(message.text.capacity())
                .saturating_add(optional_text_bytes(message.timestamp.as_ref()))
        },
    )
}

fn optional_text_bytes(value: Option<&String>) -> usize {
    value.map_or(0, String::capacity)
}
