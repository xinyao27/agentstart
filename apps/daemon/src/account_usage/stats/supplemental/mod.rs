mod aggregation;
use super::{StatsError, SupplementalUsage};
use crate::ai_vault::{
    AiVaultAuthority,
    model::{AiVaultAgent, AiVaultListInput},
};
use crate::provider_usage::ProviderUsageAuthority;

pub(super) async fn scan(
    vault: &AiVaultAuthority,
    usage: &ProviderUsageAuthority,
    force: bool,
) -> Result<SupplementalUsage, StatsError> {
    let scopes = usage.worktree_scope_paths().await?;
    if scopes.is_empty() {
        return Ok(SupplementalUsage {
            daily_tokens: vec![],
            model_usage: vec![],
        });
    }
    let result = vault
        .list(AiVaultListInput {
            compact: false,
            execution_host_id: Some("local".into()),
            execution_host_scope: None,
            force,
            limit: usize::MAX,
            scope_paths: scopes.clone(),
        })
        .await;
    let sessions = result
        .sessions
        .into_iter()
        .filter(|s| {
            !matches!(
                s.agent,
                AiVaultAgent::Claude
                    | AiVaultAgent::Codex
                    | AiVaultAgent::Cursor
                    | AiVaultAgent::Opencode
            ) && s.execution_host_id == "local"
        })
        .collect::<Vec<_>>();
    let prices = tokio::task::spawn_blocking(crate::provider_usage::pricing::UsagePricing::load)
        .await
        .map_err(|e| StatsError::Supplemental(e.to_string()))?;
    Ok(aggregation::build(&sessions, &scopes, &prices))
}
