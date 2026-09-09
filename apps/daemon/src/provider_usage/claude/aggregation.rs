use std::collections::BTreeMap;

use super::super::worktrees::Location;
use super::model::{Daily, LocationUsage, Session, Turn};

#[derive(Default)]
pub(super) struct Aggregation {
    sessions: BTreeMap<String, Session>,
    daily: BTreeMap<(String, Option<String>, String), Daily>,
}

impl Aggregation {
    pub(super) fn add(
        &mut self,
        turn: &Turn,
        day: String,
        location: Location,
        cost: Option<f64>,
        unpriced: u64,
    ) {
        let session = Session {
            session_id: turn.session_id.clone(),
            first_timestamp: turn.timestamp.clone(),
            last_timestamp: turn.timestamp.clone(),
            model: turn.model.clone(),
            last_cwd: turn.cwd.clone(),
            last_git_branch: turn.git_branch.clone(),
            primary_worktree_id: location.worktree_id.clone(),
            primary_repo_id: location.repo_id.clone(),
            turn_count: 1,
            total_input_tokens: turn.tokens.input_tokens,
            total_output_tokens: turn.tokens.output_tokens,
            total_cache_read_tokens: turn.tokens.cache_read_tokens,
            total_cache_write_tokens: turn.tokens.cache_write_tokens,
            location_breakdown: vec![LocationUsage {
                location_key: location.project_key.clone(),
                project_label: location.project_label.clone(),
                repo_id: location.repo_id.clone(),
                worktree_id: location.worktree_id.clone(),
                turn_count: 1,
                tokens: turn.tokens.clone(),
            }],
        };
        self.merge_sessions([session]);
        self.merge_daily([Daily {
            day,
            model: turn.model.clone(),
            location,
            turn_count: 1,
            zero_cache_read_turn_count: u64::from(turn.tokens.cache_read_tokens == 0),
            tokens: turn.tokens.clone(),
            estimated_cost_usd: cost,
            unpriced_tokens: unpriced,
        }]);
    }

    pub(super) fn merge_sessions(&mut self, sessions: impl IntoIterator<Item = Session>) {
        for session in sessions {
            let Some(existing) = self.sessions.get_mut(&session.session_id) else {
                self.sessions.insert(session.session_id.clone(), session);
                continue;
            };
            if session.first_timestamp < existing.first_timestamp {
                existing.first_timestamp = session.first_timestamp;
            }
            if session.last_timestamp > existing.last_timestamp {
                existing.last_timestamp = session.last_timestamp;
                existing.last_cwd = session.last_cwd;
                existing.last_git_branch = session.last_git_branch;
            }
            existing.model = session.model.or(existing.model.take());
            existing.turn_count = existing.turn_count.saturating_add(session.turn_count);
            existing.total_input_tokens = existing
                .total_input_tokens
                .saturating_add(session.total_input_tokens);
            existing.total_output_tokens = existing
                .total_output_tokens
                .saturating_add(session.total_output_tokens);
            existing.total_cache_read_tokens = existing
                .total_cache_read_tokens
                .saturating_add(session.total_cache_read_tokens);
            existing.total_cache_write_tokens = existing
                .total_cache_write_tokens
                .saturating_add(session.total_cache_write_tokens);
            for location in session.location_breakdown {
                if let Some(existing) = existing
                    .location_breakdown
                    .iter_mut()
                    .find(|candidate| candidate.location_key == location.location_key)
                {
                    existing.turn_count = existing.turn_count.saturating_add(location.turn_count);
                    existing.tokens.merge(&location.tokens);
                } else {
                    existing.location_breakdown.push(location);
                }
            }
        }
    }

    pub(super) fn merge_daily(&mut self, daily: impl IntoIterator<Item = Daily>) {
        for row in daily {
            let key = (
                row.day.clone(),
                row.model.clone(),
                row.location.project_key.clone(),
            );
            if let Some(existing) = self.daily.get_mut(&key) {
                existing.turn_count = existing.turn_count.saturating_add(row.turn_count);
                existing.zero_cache_read_turn_count = existing
                    .zero_cache_read_turn_count
                    .saturating_add(row.zero_cache_read_turn_count);
                existing.tokens.merge(&row.tokens);
                existing.unpriced_tokens =
                    existing.unpriced_tokens.saturating_add(row.unpriced_tokens);
                if let Some(cost) = row.estimated_cost_usd {
                    existing.estimated_cost_usd =
                        Some(existing.estimated_cost_usd.unwrap_or(0.0) + cost);
                }
            } else {
                self.daily.insert(key, row);
            }
        }
    }

    pub(super) fn finish(self) -> (Vec<Session>, Vec<Daily>) {
        let mut sessions = self.sessions.into_values().collect::<Vec<_>>();
        for session in &mut sessions {
            session.location_breakdown.sort_by_key(|location| {
                std::cmp::Reverse(
                    location
                        .tokens
                        .input_tokens
                        .saturating_add(location.tokens.output_tokens),
                )
            });
            if let Some(location) = session.location_breakdown.first() {
                session.primary_worktree_id = location.worktree_id.clone();
                session.primary_repo_id = location.repo_id.clone();
            }
        }
        sessions.sort_by(|left, right| right.last_timestamp.cmp(&left.last_timestamp));
        let mut daily = self.daily.into_values().collect::<Vec<_>>();
        daily.sort_by(|left, right| {
            (&left.day, &left.location.project_label)
                .cmp(&(&right.day, &right.location.project_label))
        });
        (sessions, daily)
    }
}
