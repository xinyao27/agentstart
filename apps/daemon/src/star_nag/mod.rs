// Why: The prompt state is shared across Chrome connections for the lifetime of the daemon.

mod agent_value_moment;
mod session;
mod ui_state;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use serde::Serialize;
use serde_json::{Map, Value};
use tokio::sync::OnceCell;

use crate::account_usage::StatsAuthority;
use crate::github::GitHubAuthority;
use crate::shell_events::ShellEventAuthority;
use crate::telemetry::TelemetryAuthority;
use crate::ui::UiAuthority;

use session::{PromptMode, PromptSession, PromptSource};

// Why not named `StarNagPromptMode`: the generated wire type `agentstart_protocol::runtime::v1::
// StarNagPromptMode` already carries that name, and `crate::rpc::star_nag::protocol` needs both
// this domain enum and the wire enum in scope at once. This type is already namespaced under
// `crate::star_nag::`, so it does not need the prefix.
pub(crate) use agent_value_moment::AgentValueMomentPreparation;
pub(crate) use session::PromptMode as StarNagDomainPromptMode;

// Why `Serialize`: `crate::shell_events` embeds this directly in the `starNagShow` event it
// publishes to Chrome — see `session::PromptMode`'s doc comment for the wire-shape rationale,
// identical here (`Card` -> "card", `Toast` -> "toast").
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum StarNagSurface {
    Card,
    Toast,
}

#[derive(Clone)]
pub(crate) struct StarNagAuthority {
    inner: Arc<Inner>,
}

struct Inner {
    started: AtomicBool,
    github: GitHubAuthority,
    session_ids: AtomicU64,
    shell_events: ShellEventAuthority,
    state: Mutex<State>,
    stats: StatsAuthority,
    telemetry: TelemetryAuthority,
    ui: UiAuthority,
}

struct State {
    evaluating: bool,
    agent_value_moment_pending_mode: Option<PromptMode>,
    pending_onboarding_completed: bool,
    prompt_session: Option<PromptSession>,
    prompt_visible: bool,
    /// Why: dedups only genuinely concurrent `starAgentStart()` calls, matching Bun's
    /// `session.starAttemptPromise` — cleared right after the attempt resolves so a later,
    /// non-concurrent retry runs a fresh attempt instead of replaying a cached result.
    star_attempt: Option<(u64, Arc<OnceCell<bool>>)>,
}

impl StarNagAuthority {
    pub(crate) fn new(
        ui: UiAuthority,
        github: GitHubAuthority,
        telemetry: TelemetryAuthority,
        stats: StatsAuthority,
        shell_events: ShellEventAuthority,
    ) -> Self {
        Self {
            inner: Arc::new(Inner {
                started: AtomicBool::new(false),
                github,
                session_ids: AtomicU64::new(0),
                shell_events,
                state: Mutex::new(State {
                    evaluating: false,
                    agent_value_moment_pending_mode: None,
                    pending_onboarding_completed: false,
                    prompt_session: None,
                    prompt_visible: false,
                    star_attempt: None,
                }),
                stats,
                telemetry,
                ui,
            }),
        }
    }

    pub(crate) async fn start(&self) {
        if self.inner.started.swap(true, Ordering::AcqRel) {
            return;
        }
        self.ensure_baseline().await;
        let mut starts = self.inner.stats.subscribe_agent_starts();
        let inner = Arc::downgrade(&self.inner);
        tokio::spawn(async move {
            while starts.changed().await.is_ok() {
                let total = *starts.borrow_and_update();
                let Some(inner) = inner.upgrade() else {
                    return;
                };
                let authority = Self { inner };
                authority.agent_started(total).await;
            }
        });
    }

    async fn agent_started(&self, total: u64) {
        let ui = self.inner.ui.get();
        if ui_state::is_completed(&ui)
            || ui_state::is_cooldown_active(ui_state::deferred_until(&ui), ui_state::now_millis())
        {
            return;
        }
        if !ui_state::app_version_current(&ui) {
            self.ensure_baseline().await;
            return;
        }
        let baseline = ui_state::baseline_agents(&ui).unwrap_or(total);
        if total.saturating_sub(baseline) >= ui_state::next_threshold(&ui) {
            self.maybe_show(PromptSource::Threshold, StarNagSurface::Card)
                .await;
        }
    }

    pub(crate) async fn dismiss(&self) {
        self.defer("dismissed", "star_nag_dismissed").await;
    }

    pub(crate) async fn later(&self) {
        self.defer("later", "star_nag_later").await;
    }

    pub(crate) async fn complete(&self) {
        self.mark_completed().await;
    }

    pub(crate) async fn open_web(&self) {
        let session = {
            let mut state = lock(&self.inner.state);
            let Some(session) = state.prompt_session.as_mut() else {
                return;
            };
            if session.opened_repo_tracked {
                return;
            }
            session.opened_repo_tracked = true;
            *session
        };
        self.track_outcome(&session, "opened_repo", Some(PromptMode::Web), None)
            .await;
        self.defer_state().await;
        self.clear_prompt(true);
    }

    /// Why: dedups concurrent callers onto one `run_star_attempt`, then clears the slot so a later
    /// independent call (e.g. after fixing GitHub auth) runs a fresh attempt — see `State::star_attempt`.
    pub(crate) async fn star_agentstart(&self) -> bool {
        let (session, cell) = {
            let mut state = lock(&self.inner.state);
            let Some(session) = state.prompt_session else {
                return false;
            };
            // Why clone the slot before matching rather than matching `&state.star_attempt`
            // directly: the "no attempt yet" arm needs to write `state.star_attempt`, which an
            // active borrow from the match scrutinee would forbid.
            let cell = match state.star_attempt.clone() {
                Some((id, cell)) if id == session.id => cell,
                _ => {
                    let cell = Arc::new(OnceCell::new());
                    state.star_attempt = Some((session.id, Arc::clone(&cell)));
                    cell
                }
            };
            (session, cell)
        };
        let authority = self.clone();
        let result = *cell
            .get_or_init(|| async move { authority.run_star_attempt(session).await })
            .await;
        let mut state = lock(&self.inner.state);
        if matches!(&state.star_attempt, Some((id, current)) if *id == session.id && Arc::ptr_eq(current, &cell))
        {
            state.star_attempt = None;
        }
        result
    }

    pub(crate) async fn onboarding_completed(&self) {
        let ui = self.inner.ui.get();
        let cooldown_active =
            ui_state::is_cooldown_active(ui_state::deferred_until(&ui), ui_state::now_millis());
        let completed = ui_state::is_completed(&ui);
        let should_return = {
            let mut state = lock(&self.inner.state);
            if completed || cooldown_active || state.evaluating {
                if !completed && !cooldown_active && state.evaluating {
                    state.pending_onboarding_completed = true;
                }
                true
            } else {
                false
            }
        };
        if should_return {
            return;
        }
        if lock(&self.inner.state).prompt_visible {
            self.clear_prompt(true);
        }
        self.maybe_show(PromptSource::OnboardingCompleted, StarNagSurface::Toast)
            .await;
    }

    async fn ensure_baseline(&self) {
        let ui = self.inner.ui.get();
        if ui_state::app_version_current(&ui) && ui_state::baseline_agents(&ui).is_some() {
            return;
        }
        let total = self.total_agents_spawned().await;
        self.inner.ui.set(ui_state::baseline_update(total));
    }

    async fn total_agents_spawned(&self) -> u64 {
        self.inner.stats.total_agents_spawned()
    }

    fn next_session_id(&self) -> u64 {
        self.inner.session_ids.fetch_add(1, Ordering::Relaxed)
    }

    /// Why: mirrors `StarNagService.show` — audience presence and "nothing already visible" are
    /// checked and the session installed atomically so two concurrent `show` calls cannot both
    /// win. `threshold`/`agents_since_baseline` are read/fetched before the lock (matching Bun's
    /// fully synchronous `show`, which has no `await` between its guard and its state mutation).
    async fn show(&self, source: PromptSource, mode: PromptMode, surface: StarNagSurface) -> bool {
        let ui = self.inner.ui.get();
        let threshold = ui_state::next_threshold(&ui);
        let baseline = ui_state::baseline_agents(&ui).unwrap_or(0);
        let total = self.total_agents_spawned().await;
        let agents_since_baseline = total.saturating_sub(baseline);
        let session = {
            let mut state = lock(&self.inner.state);
            if !self.inner.shell_events.has_subscribers() || state.prompt_visible {
                return false;
            }
            let session = PromptSession::new(
                self.next_session_id(),
                source,
                mode,
                threshold,
                agents_since_baseline,
            );
            state.prompt_visible = true;
            state.prompt_session = Some(session);
            session
        };
        self.inner.shell_events.publish_star_nag_show(mode, surface);
        self.track_outcome(&session, "shown", None, None).await;
        ui_state::log_event(
            "star_nag_shown",
            threshold,
            agents_since_baseline,
            source,
            None,
        );
        true
    }

    /// Why: mirrors `StarNagService.maybeShow` — the evaluating/visible guard and a live GitHub
    /// star check, then delegates to `show` with the mode the check determined.
    async fn maybe_show(&self, source: PromptSource, surface: StarNagSurface) -> bool {
        if !self.try_begin_evaluating() {
            return false;
        }
        let starred = self.inner.github.check_agentstart_starred().await;
        if ui_state::is_completed(&self.inner.ui.get()) {
            self.finish_evaluating();
            return false;
        }
        let result = match starred {
            None => self.show(source, PromptMode::Web, surface).await,
            Some(true) => {
                self.track_already_starred(source).await;
                self.mark_completed().await;
                false
            }
            Some(false) => self.show(source, PromptMode::Gh, surface).await,
        };
        self.finish_evaluating();
        result
    }

    fn try_begin_evaluating(&self) -> bool {
        let mut state = lock(&self.inner.state);
        if state.prompt_visible || state.evaluating {
            return false;
        }
        state.evaluating = true;
        true
    }

    /// Why: mirrors `setEvaluating(false)` — if `onboardingCompleted()` was called while this (or
    /// a concurrent `agentValueMoment.prepare()`) was evaluating, it queued itself instead of
    /// blocking; releasing the flag here re-fires it as a detached task, matching Bun's
    /// fire-and-forget `void this.onboardingCompleted()`.
    fn finish_evaluating(&self) {
        let should_retry = {
            let mut state = lock(&self.inner.state);
            state.evaluating = false;
            if state.pending_onboarding_completed {
                state.pending_onboarding_completed = false;
                true
            } else {
                false
            }
        };
        if should_retry {
            let authority = self.clone();
            tokio::spawn(async move {
                authority.onboarding_completed().await;
            });
        }
    }

    async fn defer(&self, outcome: &'static str, log_event: &'static str) {
        let session = {
            let mut state = lock(&self.inner.state);
            match state.prompt_session {
                Some(session) => session,
                None => {
                    state.prompt_visible = false;
                    return;
                }
            }
        };
        let ui = self.inner.ui.get();
        let threshold = ui_state::next_threshold(&ui);
        let next_threshold = threshold.saturating_mul(2);
        self.track_outcome(
            &session,
            outcome,
            None,
            Some((next_threshold, ui_state::STAR_NAG_COOLDOWN_DAYS)),
        )
        .await;
        ui_state::log_event(
            log_event,
            threshold,
            session.agents_since_baseline,
            session.source,
            Some(next_threshold),
        );
        self.defer_state().await;
        self.clear_prompt(true);
    }

    async fn defer_state(&self) {
        let ui = self.inner.ui.get();
        let threshold = ui_state::next_threshold(&ui);
        let total = self.total_agents_spawned().await;
        self.inner
            .ui
            .set(ui_state::defer_update(threshold.saturating_mul(2), total));
    }

    async fn run_star_attempt(&self, session: PromptSession) -> bool {
        self.track_outcome(&session, "star_clicked", Some(PromptMode::Gh), None)
            .await;
        let starred = self.inner.github.star_agentstart().await;
        if starred {
            self.inner
                .telemetry
                .track_main(
                    "app_starred_agentstart",
                    Map::from_iter([(
                        "source".to_owned(),
                        Value::String(session.source.as_app_star_source().as_str().to_owned()),
                    )]),
                )
                .await;
            self.track_outcome(
                &session,
                "direct_star_succeeded",
                Some(PromptMode::Gh),
                None,
            )
            .await;
            self.mark_completed().await;
            return true;
        }
        self.track_outcome(&session, "direct_star_failed", Some(PromptMode::Gh), None)
            .await;
        self.set_session_mode_if_current(session.id, PromptMode::Web);
        false
    }

    fn set_session_mode_if_current(&self, id: u64, mode: PromptMode) {
        let mut state = lock(&self.inner.state);
        if let Some(session) = state.prompt_session.as_mut()
            && session.id == id
        {
            session.mode = mode;
        }
    }

    async fn mark_completed(&self) {
        self.inner.ui.set(ui_state::completed_update());
        self.clear_prompt(true);
        lock(&self.inner.state).pending_onboarding_completed = false;
    }

    fn clear_prompt(&self, publish_hide: bool) {
        let mut state = lock(&self.inner.state);
        let was_visible = state.prompt_visible;
        state.prompt_visible = false;
        state.prompt_session = None;
        state.agent_value_moment_pending_mode = None;
        drop(state);
        if publish_hide && was_visible {
            self.inner.shell_events.publish_star_nag_hide();
        }
    }

    async fn track_outcome(
        &self,
        session: &PromptSession,
        outcome: &str,
        mode_override: Option<PromptMode>,
        defer_extra: Option<(u64, u64)>,
    ) {
        let mut props = session.outcome_props(outcome, mode_override);
        if let Some((next_threshold, cooldown_days)) = defer_extra {
            props.insert("next_threshold".to_owned(), Value::from(next_threshold));
            props.insert("cooldown_days".to_owned(), Value::from(cooldown_days));
        }
        self.inner
            .telemetry
            .track_main("star_nag_outcome", props)
            .await;
    }

    async fn track_already_starred(&self, source: PromptSource) {
        let ui = self.inner.ui.get();
        let threshold = ui_state::next_threshold(&ui);
        let baseline = ui_state::baseline_agents(&ui).unwrap_or(0);
        let total = self.total_agents_spawned().await;
        let agents_since_baseline = total.saturating_sub(baseline);
        let session =
            PromptSession::new(0, source, PromptMode::Gh, threshold, agents_since_baseline);
        let props = session.outcome_props("already_starred_suppressed", None);
        self.inner
            .telemetry
            .track_main("star_nag_outcome", props)
            .await;
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
