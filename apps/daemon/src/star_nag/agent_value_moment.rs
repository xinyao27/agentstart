// Why: Agent value moments share the prompt authority state so concurrent triggers cannot show duplicate prompts.

use super::session::{PromptMode, PromptSource};
use super::{StarNagAuthority, StarNagSurface, lock, ui_state};

#[derive(Clone, Copy, Debug)]
pub(crate) enum AgentValueMomentPreparation {
    Ready(PromptMode),
    Skipped,
}

enum Guard {
    ProceedEvaluating,
    SkipConsuming,
    SkipSilently,
}

impl StarNagAuthority {
    /// Why: mirrors `StarNagAgentValueMoment.prepare()`. The two skip branches differ in whether
    /// they consume the once-per-version gate: "already consumed, or another evaluation already in
    /// flight" leaves it untouched (so a still-eligible follow-up call can retry); "completed,
    /// cooldown active, or a prompt already visible" consumes it, matching Bun exactly, so this app
    /// version does not keep re-asking once any of those became true.
    pub(crate) async fn agent_value_moment_preparation(&self) -> AgentValueMomentPreparation {
        let ui = self.inner.ui.get();
        let already_consumed = ui_state::agent_value_moment_consumed(&ui);
        let guard = {
            let mut state = lock(&self.inner.state);
            if already_consumed || state.evaluating {
                Guard::SkipSilently
            } else if ui_state::is_completed(&ui)
                || ui_state::is_cooldown_active(
                    ui_state::deferred_until(&ui),
                    ui_state::now_millis(),
                )
                || state.prompt_visible
            {
                Guard::SkipConsuming
            } else {
                state.evaluating = true;
                Guard::ProceedEvaluating
            }
        };
        match guard {
            Guard::SkipSilently => return AgentValueMomentPreparation::Skipped,
            Guard::SkipConsuming => {
                self.consume_agent_value_moment_version();
                return AgentValueMomentPreparation::Skipped;
            }
            Guard::ProceedEvaluating => {}
        }
        let starred = self.inner.github.check_agentstart_starred().await;
        let result = if ui_state::is_completed(&self.inner.ui.get()) {
            AgentValueMomentPreparation::Skipped
        } else {
            match starred {
                None => {
                    lock(&self.inner.state).agent_value_moment_pending_mode = Some(PromptMode::Web);
                    AgentValueMomentPreparation::Ready(PromptMode::Web)
                }
                Some(true) => {
                    self.track_already_starred(PromptSource::AgentValueMoment)
                        .await;
                    self.mark_completed().await;
                    self.consume_agent_value_moment_version();
                    AgentValueMomentPreparation::Skipped
                }
                Some(false) => {
                    lock(&self.inner.state).agent_value_moment_pending_mode = Some(PromptMode::Gh);
                    AgentValueMomentPreparation::Ready(PromptMode::Gh)
                }
            }
        };
        self.finish_evaluating();
        result
    }

    /// Why: mirrors `StarNagAgentValueMoment.showPrepared()`.
    pub(crate) async fn show_agent_value_moment(&self) {
        let Some(mode) = lock(&self.inner.state).agent_value_moment_pending_mode else {
            return;
        };
        if ui_state::agent_value_moment_consumed(&self.inner.ui.get()) {
            return;
        }
        let ui = self.inner.ui.get();
        let should_consume_and_clear = {
            let state = lock(&self.inner.state);
            ui_state::is_completed(&ui)
                || ui_state::is_cooldown_active(
                    ui_state::deferred_until(&ui),
                    ui_state::now_millis(),
                )
                || state.prompt_visible
                || state.evaluating
        };
        if should_consume_and_clear {
            self.consume_agent_value_moment_version();
            lock(&self.inner.state).agent_value_moment_pending_mode = None;
            return;
        }
        let delivered = self
            .show(PromptSource::AgentValueMoment, mode, StarNagSurface::Card)
            .await;
        if delivered || ui_state::is_completed(&self.inner.ui.get()) {
            self.consume_agent_value_moment_version();
        }
        if delivered {
            lock(&self.inner.state).agent_value_moment_pending_mode = None;
        }
    }

    fn consume_agent_value_moment_version(&self) {
        self.inner
            .ui
            .set(ui_state::agent_value_moment_consumed_update());
    }
}
