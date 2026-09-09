use serde::{Deserialize, Serialize};

use super::super::worktrees::Location;

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::provider_usage) struct Tokens {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
}

impl Tokens {
    pub fn total(&self) -> u64 {
        self.input_tokens
            .saturating_add(self.output_tokens)
            .saturating_add(self.cache_read_tokens)
            .saturating_add(self.cache_write_tokens)
    }
    pub fn merge(&mut self, other: &Self) {
        self.input_tokens = self.input_tokens.saturating_add(other.input_tokens);
        self.output_tokens = self.output_tokens.saturating_add(other.output_tokens);
        self.cache_read_tokens = self
            .cache_read_tokens
            .saturating_add(other.cache_read_tokens);
        self.cache_write_tokens = self
            .cache_write_tokens
            .saturating_add(other.cache_write_tokens);
    }
    pub fn maximum(&mut self, other: &Self) {
        self.input_tokens = self.input_tokens.max(other.input_tokens);
        self.output_tokens = self.output_tokens.max(other.output_tokens);
        self.cache_read_tokens = self.cache_read_tokens.max(other.cache_read_tokens);
        self.cache_write_tokens = self.cache_write_tokens.max(other.cache_write_tokens);
    }
}

pub(in crate::provider_usage) struct Turn {
    pub session_id: String,
    pub timestamp: String,
    pub model: Option<String>,
    pub cwd: Option<String>,
    pub git_branch: Option<String>,
    pub dedupe_key: Option<String>,
    pub tokens: Tokens,
    pub cache_write_1h_tokens: u64,
    pub is_vertex: bool,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::provider_usage) struct LocationUsage {
    pub location_key: String,
    pub project_label: String,
    pub repo_id: Option<String>,
    pub worktree_id: Option<String>,
    pub turn_count: u64,
    #[serde(flatten)]
    pub tokens: Tokens,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::provider_usage) struct Session {
    pub session_id: String,
    pub first_timestamp: String,
    pub last_timestamp: String,
    pub model: Option<String>,
    pub last_cwd: Option<String>,
    pub last_git_branch: Option<String>,
    pub primary_worktree_id: Option<String>,
    pub primary_repo_id: Option<String>,
    pub turn_count: u64,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cache_read_tokens: u64,
    pub total_cache_write_tokens: u64,
    pub location_breakdown: Vec<LocationUsage>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::provider_usage) struct Daily {
    pub day: String,
    pub model: Option<String>,
    #[serde(flatten)]
    pub location: Location,
    pub turn_count: u64,
    pub zero_cache_read_turn_count: u64,
    #[serde(flatten)]
    pub tokens: Tokens,
    pub estimated_cost_usd: Option<f64>,
    pub unpriced_tokens: u64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::provider_usage) struct ProcessedFile {
    pub path: String,
    pub mtime_ms: f64,
    pub size: u64,
    pub line_count: u64,
    pub sessions: Vec<Session>,
    pub daily_aggregates: Vec<Daily>,
    pub owned_dedupe_keys: Vec<String>,
    pub has_deferred_claims: bool,
}

pub(in crate::provider_usage) struct ScanOutput {
    pub processed_files: Vec<ProcessedFile>,
    pub sessions: Vec<Session>,
    pub daily_aggregates: Vec<Daily>,
}
