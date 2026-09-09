use std::collections::{BTreeMap, VecDeque};

use chrono::{Local, TimeZone};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use super::model::{ActivitySummary, DailyActivity};

const MAX_EVENTS: usize = 10_000;
const MAX_COUNTED_PRS: usize = 2_000;

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct ActivityDocument {
    schema_version: u32,
    events: VecDeque<ActivityEvent>,
    aggregates: Aggregates,
    daily_activity: Vec<Day>,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct Aggregates {
    total_agents_spawned: u64,
    #[serde(rename = "totalPRsCreated")]
    total_prs_created: u64,
    total_agent_time_ms: u64,
    #[serde(rename = "countedPRs")]
    counted_prs: VecDeque<String>,
    first_event_at: Option<i64>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActivityEvent {
    #[serde(rename = "type")]
    kind: EventKind,
    at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    repo_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    worktree_id: Option<String>,
    #[serde(default)]
    meta: Map<String, Value>,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum EventKind {
    AgentStart,
    AgentStop,
    PrCreated,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct Day {
    day: String,
    agent_starts: u64,
    prs_created: u64,
}

impl ActivityDocument {
    pub(super) fn normalize(&mut self) {
        if self.schema_version < 2 {
            self.daily_activity.clear();
            for event in &self.events {
                record_day(&mut self.daily_activity, event);
            }
        }
        self.schema_version = 2;
        while self.events.len() > MAX_EVENTS {
            self.events.pop_front();
        }
        while self.aggregates.counted_prs.len() > MAX_COUNTED_PRS {
            self.aggregates.counted_prs.pop_front();
        }
    }

    pub(super) fn total_agents_spawned(&self) -> u64 {
        self.aggregates.total_agents_spawned
    }

    pub(super) fn summary(&self) -> ActivitySummary {
        ActivitySummary {
            total_agents_spawned: self.aggregates.total_agents_spawned,
            total_prs_created: self.aggregates.total_prs_created,
            total_agent_time_ms: self.aggregates.total_agent_time_ms,
            first_event_at: self.aggregates.first_event_at.map(|at| at as f64),
            daily_activity: self
                .daily_activity
                .iter()
                .map(|day| DailyActivity {
                    day: day.day.clone(),
                    agent_starts: day.agent_starts,
                    prs_created: day.prs_created,
                })
                .collect(),
        }
    }

    pub(super) fn start_agent(&mut self, pty_id: &str, at: i64) {
        self.aggregates.total_agents_spawned =
            self.aggregates.total_agents_spawned.saturating_add(1);
        self.record(ActivityEvent {
            kind: EventKind::AgentStart,
            at,
            repo_id: None,
            worktree_id: None,
            meta: Map::from_iter([("ptyId".to_owned(), json!(pty_id))]),
        });
    }

    pub(super) fn stop_agent(&mut self, pty_id: &str, at: i64, started_at: i64) {
        let duration = at.saturating_sub(started_at).max(0) as u64;
        self.aggregates.total_agent_time_ms =
            self.aggregates.total_agent_time_ms.saturating_add(duration);
        self.record(ActivityEvent {
            kind: EventKind::AgentStop,
            at,
            repo_id: None,
            worktree_id: None,
            meta: Map::from_iter([
                ("ptyId".to_owned(), json!(pty_id)),
                ("durationMs".to_owned(), json!(duration)),
            ]),
        });
    }

    pub(super) fn record_pr(&mut self, url: &str, number: u64, repo_id: &str, at: i64) -> bool {
        if self.aggregates.counted_prs.iter().any(|known| known == url) {
            return false;
        }
        self.aggregates.total_prs_created = self.aggregates.total_prs_created.saturating_add(1);
        self.aggregates.counted_prs.push_back(url.to_owned());
        if self.aggregates.counted_prs.len() > MAX_COUNTED_PRS {
            self.aggregates.counted_prs.pop_front();
        }
        self.record(ActivityEvent {
            kind: EventKind::PrCreated,
            at,
            repo_id: Some(repo_id.to_owned()),
            worktree_id: None,
            meta: Map::from_iter([
                ("prUrl".to_owned(), json!(url)),
                ("prNumber".to_owned(), json!(number)),
            ]),
        });
        true
    }

    fn record(&mut self, event: ActivityEvent) {
        self.aggregates.first_event_at.get_or_insert(event.at);
        record_day(&mut self.daily_activity, &event);
        self.events.push_back(event);
        if self.events.len() > MAX_EVENTS {
            self.events.pop_front();
        }
    }
}

fn record_day(days: &mut Vec<Day>, event: &ActivityEvent) {
    if matches!(event.kind, EventKind::AgentStop) {
        return;
    }
    let Some(timestamp) = Local.timestamp_millis_opt(event.at).single() else {
        return;
    };
    let key = timestamp.format("%Y-%m-%d").to_string();
    let index = match days.binary_search_by(|day| day.day.cmp(&key)) {
        Ok(index) => index,
        Err(index) => {
            days.insert(
                index,
                Day {
                    day: key,
                    ..Day::default()
                },
            );
            index
        }
    };
    let day = &mut days[index];
    match event.kind {
        EventKind::AgentStart => day.agent_starts = day.agent_starts.saturating_add(1),
        EventKind::PrCreated => day.prs_created = day.prs_created.saturating_add(1),
        EventKind::AgentStop => {}
    }
}

pub(super) struct ActivityState {
    pub(super) document: ActivityDocument,
    pub(super) live_agents: BTreeMap<String, i64>,
    pub(super) revision: u64,
}
