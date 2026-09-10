mod activity;
mod activity_data;
mod aggregate;
mod fallback;
mod model;
mod source;
mod supplemental;

use std::path::PathBuf;

use thiserror::Error;

use crate::provider_usage::{Provider, ProviderUsageAuthority, ProviderUsageError};

pub(crate) use model::{
    DailyActivity, DailyProviderUsage, DailyTokens, DailyValue, ModelUsage, ProjectUsage,
    ProviderUsage, StatsProvider, StatsRange, StatsSummary, SupplementalDailyUsage,
    SupplementalUsage, UnavailableAgent,
};

#[derive(Clone)]
pub(crate) struct StatsAuthority {
    activity: activity::ActivityAuthority,
    usage: ProviderUsageAuthority,
    ai_vault: Option<crate::ai_vault::AiVaultAuthority>,
}

#[derive(Debug, Error)]
pub(crate) enum StatsError {
    #[error("stats state could not be read: {0}")]
    Io(#[from] std::io::Error),
    #[error("stats state is invalid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Usage(#[from] ProviderUsageError),
    #[error("supplemental usage is unavailable: {0}")]
    Supplemental(String),
}

impl StatsAuthority {
    pub(crate) async fn open(
        root: PathBuf,
        usage: ProviderUsageAuthority,
    ) -> Result<Self, StatsError> {
        Ok(Self {
            activity: activity::ActivityAuthority::open(root.join("agentstart-stats.json")).await?,
            usage,
            ai_vault: None,
        })
    }

    pub(crate) fn with_ai_vault(mut self, ai_vault: crate::ai_vault::AiVaultAuthority) -> Self {
        self.ai_vault = Some(ai_vault);
        self
    }

    pub(crate) fn total_agents_spawned(&self) -> u64 {
        self.activity.total_agents_spawned()
    }

    pub(crate) fn subscribe_agent_starts(&self) -> tokio::sync::watch::Receiver<u64> {
        self.activity.subscribe_agent_starts()
    }

    pub(crate) fn start_agent(&self, pty_id: &str, at: i64) {
        self.activity.start_agent(pty_id, at);
    }

    pub(crate) fn stop_agent(&self, pty_id: &str, at: i64) {
        self.activity.stop_agent(pty_id, at);
    }

    pub(crate) fn record_pr_created(&self, url: &str, number: u64, repo_id: &str) {
        self.activity.record_pr(url, number, repo_id);
    }

    pub(crate) async fn flush(&self) -> std::io::Result<()> {
        self.activity.flush().await
    }

    pub(crate) async fn summary(
        &self,
        refresh: bool,
        range: StatsRange,
    ) -> Result<StatsSummary, StatsError> {
        match self.attributed_summary(refresh, range).await {
            Ok(summary) => Ok(summary),
            Err(error) => {
                eprintln!("[stats] Failed to read attributed usage: {error}");
                Ok(fallback::summary(self.activity.summary(), self.ai_vault.as_ref()).await)
            }
        }
    }

    async fn attributed_summary(
        &self,
        refresh: bool,
        range: StatsRange,
    ) -> Result<StatsSummary, StatsError> {
        for provider in [Provider::Claude, Provider::Codex, Provider::OpenCode] {
            self.usage.set_enabled(provider, true).await?;
        }
        if refresh {
            let (claude, codex, open_code) = tokio::join!(
                self.usage.refresh(Provider::Claude, true),
                self.usage.refresh(Provider::Codex, true),
                self.usage.refresh(Provider::OpenCode, true)
            );
            claude?;
            codex?;
            open_code?;
        } else {
            for provider in [Provider::Claude, Provider::Codex, Provider::OpenCode] {
                self.usage.refresh_background(provider);
            }
        }
        let vault = self
            .ai_vault
            .as_ref()
            .ok_or_else(|| StatsError::Supplemental("AI Vault source is unavailable".to_owned()))?;
        let supplemental_usage = supplemental::scan(vault, &self.usage, refresh).await?;
        let range_name = range.as_str();
        let (claude, codex, open_code) = tokio::try_join!(
            self.usage
                .snapshot(Provider::Claude, "agentstart", range_name, Some(100)),
            self.usage
                .snapshot(Provider::Codex, "agentstart", range_name, Some(100)),
            self.usage
                .snapshot(Provider::OpenCode, "agentstart", range_name, Some(100))
        )?;
        let activity = self.activity.summary();
        Ok(aggregate::summary(
            activity,
            range,
            [
                source::provider_snapshot(StatsProvider::Claude, &claude),
                source::provider_snapshot(StatsProvider::Codex, &codex),
                source::provider_snapshot(StatsProvider::OpenCode, &open_code),
            ],
            supplemental_usage,
        ))
    }
}
