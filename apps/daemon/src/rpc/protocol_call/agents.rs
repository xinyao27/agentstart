use super::{
    ProtocolCallContext, ProtocolHandlerOutcome, ProtocolHandlerResponse, ProtocolRequest,
    ProtocolRouter, accounts_protocol, agent_status_protocol, ai_vault_protocol, skills_protocol,
};

pub(super) enum Method {
    AccountsServiceAdd,
    AccountsServiceCancelPendingLogin,
    AccountsServiceClearMiniMaxCookie,
    AccountsServiceGetMiniMaxCredentials,
    AgentSessionServiceProviders,
    AgentSessionServiceList,
    AgentSessionServiceStart,
    AgentSessionServiceStop,
    AgentSessionServiceFollowup,
    AgentStatusServiceInferInterrupt,
    AgentStatusServiceGetSnapshot,
    AgentStatusServiceGetMigrationUnsupportedSnapshot,
    AgentStatusServiceSubscribe,
    AgentStatusServiceDrop,
    AgentStatusServiceDropByTabPrefix,
    AgentStatusServiceRetirePaneAuthority,
    AgentStatusServiceTransferPaneAuthority,
    AiVaultServiceListSessions,
    AiVaultServiceListSubagentSessions,
    AccountsServiceList,
    AccountsServiceListCachedClaude,
    AccountsServiceListCachedCodex,
    AccountsServiceRemove,
    AccountsServiceUnsubscribe,
    AccountsServiceRefreshRateLimits,
    AccountsServiceRefreshRateLimitsForTarget,
    AccountsServiceConsumeCodexResetCredit,
    AccountsServiceRefreshInactiveAccounts,
    AccountsServiceRefreshGrokRateLimits,
    AccountsServiceGetGrokStatus,
    AccountsServiceSelect,
    AccountsServiceReauthenticate,
    AccountsServiceSaveMiniMaxCookie,
    AccountsServiceSubscribe,
    StatsServiceGetSummary,
    ProviderUsageServiceGetScanState,
    ProviderUsageServiceSetEnabled,
    ProviderUsageServiceRefresh,
    ProviderUsageServiceGetSnapshot,
    RateLimitResumeServiceInspectCodex,
    RateLimitResumeServiceList,
    RateLimitResumeServiceSchedule,
    RateLimitResumeServiceCancel,
    RateLimitResumeServiceRunNow,
    RateLimitResumeServiceMarkFired,
    RateLimitResumeServiceMarkFailed,
    RateLimitResumeServiceMarkStale,
    RateLimitResumeServiceRendererReady,
    SkillsServiceDiscover,
    SkillsServiceManageFreshnessInventory,
    SkillsServiceManageStartUpdateRun,
    SkillsServiceManageStartInstallRun,
    SkillsServiceManageStartRemoveRun,
    SkillsServiceManageListSkillFiles,
    SkillsServiceManageReadSkillDirFile,
    SkillsServiceManageCancelUpdateRun,
    SkillsServiceManageAcknowledgeUpdateRun,
    SkillsServiceManageGetUpdateRun,
    SkillsServiceManageEventsSubscribe,
}

impl ProtocolRouter {
    pub(super) async fn handle_agents(
        &self,
        method: Method,
        request: ProtocolRequest<'_>,
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        let result = match method {
            Method::AccountsServiceAdd => {
                accounts_protocol::add(&self.accounts, request.payload, context)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceCancelPendingLogin => {
                accounts_protocol::cancel_pending_login(&self.accounts, request.payload)
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceClearMiniMaxCookie => {
                accounts_protocol::clear_minimax_credentials(request.payload)
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceGetMiniMaxCredentials => {
                accounts_protocol::get_minimax_credentials(request.payload)
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AgentSessionServiceProviders => self
                .agent_session
                .protocol_providers(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::AgentSessionServiceList => self
                .agent_session
                .protocol_list(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::AgentSessionServiceStart => self
                .agent_session
                .protocol_start(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::AgentSessionServiceStop => self
                .agent_session
                .protocol_stop(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::AgentSessionServiceFollowup => self
                .agent_session
                .protocol_followup(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::AgentStatusServiceInferInterrupt => {
                agent_status_protocol::infer_interrupt(&self.agent_status, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AgentStatusServiceGetSnapshot => {
                agent_status_protocol::get_snapshot(&self.agent_status, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AgentStatusServiceGetMigrationUnsupportedSnapshot => {
                agent_status_protocol::get_migration_unsupported_snapshot(
                    &self.agent_status,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::AgentStatusServiceSubscribe => {
                return match agent_status_protocol::subscribe(
                    &self.agent_status,
                    request.payload,
                    &self.connection_id,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::AgentStatusServiceDrop => {
                agent_status_protocol::drop_pane(&self.agent_status, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AgentStatusServiceDropByTabPrefix => {
                agent_status_protocol::drop_by_tab_prefix(&self.agent_status, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AgentStatusServiceRetirePaneAuthority => {
                agent_status_protocol::retire_pane_authority(&self.agent_status, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AgentStatusServiceTransferPaneAuthority => {
                agent_status_protocol::transfer_pane_authority(&self.agent_status, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AiVaultServiceListSessions => {
                ai_vault_protocol::list_sessions(&self.ai_vault, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AiVaultServiceListSubagentSessions => {
                ai_vault_protocol::list_subagent_sessions(&self.ai_vault, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceList => accounts_protocol::list(&self.accounts, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::AccountsServiceListCachedClaude => {
                accounts_protocol::list_cached_claude(&self.accounts, request.payload)
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceListCachedCodex => {
                accounts_protocol::list_cached_codex(&self.accounts, request.payload)
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceRemove => {
                accounts_protocol::remove(&self.accounts, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceUnsubscribe => {
                accounts_protocol::unsubscribe(&self.accounts, request.payload)
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceRefreshRateLimits => {
                accounts_protocol::refresh_rate_limits(&self.accounts, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceRefreshRateLimitsForTarget => {
                accounts_protocol::refresh_rate_limits_for_target(&self.accounts, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceConsumeCodexResetCredit => {
                accounts_protocol::consume_codex_reset_credit(&self.accounts, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceRefreshInactiveAccounts => {
                accounts_protocol::refresh_inactive_accounts(&self.accounts, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceRefreshGrokRateLimits => {
                accounts_protocol::refresh_grok_rate_limits(&self.accounts, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceGetGrokStatus => {
                accounts_protocol::get_grok_status(&self.accounts, request.payload)
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceSelect => {
                accounts_protocol::select(&self.accounts, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceReauthenticate => {
                accounts_protocol::reauthenticate(&self.accounts, request.payload, context)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceSaveMiniMaxCookie => {
                accounts_protocol::save_minimax_credentials(request.payload)
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AccountsServiceSubscribe => {
                return match accounts_protocol::subscribe(
                    &self.accounts,
                    request.payload,
                    &self.connection_id,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::StatsServiceGetSummary => self
                .stats
                .protocol_summary(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::ProviderUsageServiceGetScanState => self
                .provider_usage
                .protocol_get_scan_state(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::ProviderUsageServiceSetEnabled => self
                .provider_usage
                .protocol_set_enabled(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::ProviderUsageServiceRefresh => self
                .provider_usage
                .protocol_refresh(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::ProviderUsageServiceGetSnapshot => self
                .provider_usage
                .protocol_get_snapshot(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RateLimitResumeServiceInspectCodex => self
                .rate_limit_resume
                .protocol_inspect_codex(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RateLimitResumeServiceList => self
                .rate_limit_resume
                .protocol_list(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RateLimitResumeServiceSchedule => self
                .rate_limit_resume
                .protocol_schedule(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RateLimitResumeServiceCancel => self
                .rate_limit_resume
                .protocol_cancel(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RateLimitResumeServiceRunNow => self
                .rate_limit_resume
                .protocol_run_now(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RateLimitResumeServiceMarkFired => self
                .rate_limit_resume
                .protocol_mark_fired(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RateLimitResumeServiceMarkFailed => self
                .rate_limit_resume
                .protocol_mark_failed(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RateLimitResumeServiceMarkStale => self
                .rate_limit_resume
                .protocol_mark_stale(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RateLimitResumeServiceRendererReady => self
                .rate_limit_resume
                .protocol_renderer_ready(request.payload, &self.connection_id)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::SkillsServiceDiscover => {
                skills_protocol::discover(&self.skills, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SkillsServiceManageFreshnessInventory => {
                skills_protocol::freshness_inventory(&self.skills, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SkillsServiceManageStartUpdateRun => {
                skills_protocol::start_update_run(&self.skills, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SkillsServiceManageStartInstallRun => {
                skills_protocol::start_install_run(&self.skills, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SkillsServiceManageStartRemoveRun => {
                skills_protocol::start_remove_run(&self.skills, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SkillsServiceManageListSkillFiles => {
                skills_protocol::list_skill_files(&self.skills, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SkillsServiceManageReadSkillDirFile => {
                skills_protocol::read_skill_dir_file(&self.skills, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SkillsServiceManageCancelUpdateRun => {
                skills_protocol::cancel_update_run(&self.skills, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SkillsServiceManageAcknowledgeUpdateRun => {
                skills_protocol::acknowledge_update_run(&self.skills, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SkillsServiceManageGetUpdateRun => {
                skills_protocol::get_update_run(&self.skills, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SkillsServiceManageEventsSubscribe => {
                return match skills_protocol::subscribe(&self.skills, request.payload, context)
                    .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
        };
        match result {
            Ok(response) => ProtocolHandlerOutcome::Complete(response),
            Err(error) => ProtocolHandlerOutcome::Failed(error),
        }
    }
}
