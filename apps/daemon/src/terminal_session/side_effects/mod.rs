mod agent_status;
mod command_code;
mod control;
mod pr_links;
mod text;

use super::terminal_title::{
    AgentStatus, clear_working_indicators, detect_agent_status, normalize_title,
};
pub(super) use control::ControlParser;
use serde::Serialize;
use std::time::{Duration, Instant};

#[derive(Clone, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub(crate) enum TerminalSideEffect {
    Title {
        normalized_title: String,
        raw_title: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        stale_working_title_clear: Option<bool>,
    },
    Bell,
    AgentWorking,
    AgentIdle {
        title: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        stale_working_title_clear: Option<bool>,
    },
    AgentExited,
    CommandFinished {
        exit_code: Option<i32>,
    },
    PrLink {
        link: pr_links::PullRequestLink,
    },
    CommandCodeWorking {
        prompt: String,
    },
    CommandCodeDone {
        prompt: String,
    },
    #[serde(rename = "2031-subscribe")]
    ColorSchemeSubscribe,
}

pub(super) struct SideEffectObserver {
    control: ControlParser,
    text: text::TextDecoder,
    links: pr_links::PullRequestScanner,
    command_code: command_code::CommandCodeScanner,
    title: Option<String>,
    status: Option<AgentStatus>,
    stale_at: Option<Instant>,
    agent_status: Option<serde_json::Value>,
}

impl SideEffectObserver {
    pub(super) fn new(title: Option<&str>, command: Option<&str>) -> Self {
        Self {
            control: Default::default(),
            text: Default::default(),
            links: Default::default(),
            command_code: command_code::CommandCodeScanner::new(command),
            title: title.map(normalize_title),
            status: title.and_then(detect_agent_status),
            stale_at: None,
            agent_status: None,
        }
    }

    pub(super) fn agent_status(&self) -> Option<&serde_json::Value> {
        self.agent_status.as_ref()
    }

    pub(super) fn observe(
        &mut self,
        bytes: &[u8],
        now: Instant,
        observed_at: i64,
    ) -> Vec<TerminalSideEffect> {
        let observed = self.control.observe(bytes);
        for mut status in observed.agent_statuses {
            let state_started_at = self
                .agent_status
                .as_ref()
                .filter(|previous| previous.get("state") == status.get("state"))
                .and_then(|previous| previous.get("stateStartedAt"))
                .and_then(serde_json::Value::as_i64)
                .unwrap_or(observed_at);
            status["stateStartedAt"] = state_started_at.into();
            status["receivedAt"] = observed_at.into();
            self.agent_status = Some(status);
        }
        let text = self.text.decode(bytes);
        let mut facts = Vec::new();
        if observed.titles.is_empty() {
            if !bytes.is_empty()
                && self.title.as_deref().and_then(detect_agent_status) == Some(AgentStatus::Working)
            {
                self.stale_at = Some(now + Duration::from_secs(3));
            }
        } else {
            self.stale_at = None;
            for title in observed.titles {
                self.apply_title(title, false, &mut facts);
            }
        }
        facts.extend(
            observed
                .command_finished
                .into_iter()
                .map(|exit_code| TerminalSideEffect::CommandFinished { exit_code }),
        );
        facts.extend(
            self.links
                .observe(&text)
                .into_iter()
                .map(|link| TerminalSideEffect::PrLink { link }),
        );
        if observed.subscribed {
            facts.push(TerminalSideEffect::ColorSchemeSubscribe);
        }
        if observed.bell {
            facts.push(TerminalSideEffect::Bell);
        }
        facts.extend(self.command_code.observe(&text));
        facts
    }

    pub(super) fn expire(&mut self, now: Instant) -> Vec<TerminalSideEffect> {
        if self.stale_at.is_none_or(|deadline| deadline > now) {
            return Vec::new();
        }
        self.stale_at = None;
        let mut facts = Vec::new();
        if let Some(title) = &self.title
            && detect_agent_status(title) == Some(AgentStatus::Working)
        {
            self.apply_title(clear_working_indicators(title), true, &mut facts);
        }
        facts
    }

    pub(super) fn close(&mut self) {
        self.stale_at = None;
    }

    fn apply_title(&mut self, raw_title: String, stale: bool, facts: &mut Vec<TerminalSideEffect>) {
        if raw_title.trim().eq_ignore_ascii_case("cursor agent") {
            return;
        }
        let normalized_title = normalize_title(&raw_title);
        self.title = Some(normalized_title.clone());
        facts.push(TerminalSideEffect::Title {
            normalized_title,
            raw_title: raw_title.clone(),
            stale_working_title_clear: stale.then_some(true),
        });
        let status = detect_agent_status(&raw_title);
        if self.status == Some(AgentStatus::Working)
            && status.is_some()
            && status != Some(AgentStatus::Working)
        {
            facts.push(TerminalSideEffect::AgentIdle {
                title: raw_title,
                stale_working_title_clear: stale.then_some(true),
            });
        }
        if self.status != Some(AgentStatus::Working) && status == Some(AgentStatus::Working) {
            facts.push(TerminalSideEffect::AgentWorking);
        }
        if self.status.is_some() && self.status != Some(AgentStatus::Working) && status.is_none() {
            self.status = None;
            facts.push(TerminalSideEffect::AgentExited);
        }
        if status.is_some() {
            self.status = status;
        }
    }
}
