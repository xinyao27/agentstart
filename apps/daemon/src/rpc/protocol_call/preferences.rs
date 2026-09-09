use super::{
    ProtocolCallContext, ProtocolHandlerOutcome, ProtocolHandlerResponse, ProtocolRequest,
    ProtocolRouter, client_events_protocol, host_progress_protocol, keybindings_protocol,
    profiles_protocol, settings_protocol, shell_events_protocol, shell_state_protocol, ui_protocol,
};

pub(super) enum Method {
    SettingsServiceGetDocument,
    SettingsServiceSetDocument,
    SettingsServiceGet,
    SettingsServiceUpdate,
    SettingsServiceGetTerminalQuickCommands,
    SettingsServiceUpdateTerminalQuickCommands,
    SettingsServiceUpdatePrBotAuthorOverride,
    SettingsServiceListFonts,
    SettingsServicePreviewGhosttyImport,
    SettingsServicePreviewWarpThemeImport,
    UiServiceGet,
    UiServiceSet,
    UiServiceRecordFeatureInteraction,
    ShellKeybindingsServiceGet,
    ShellKeybindingsServiceEnsureFile,
    ShellKeybindingsServiceReload,
    ShellKeybindingsServiceOpenFile,
    ShellKeybindingsServiceRevealFile,
    ShellKeybindingsServiceSetAction,
    ShellYiruProfilesServiceList,
    ShellYiruProfilesServiceCreateLocal,
    ShellYiruProfilesServiceSwitchProfile,
    ShellYiruProfilesServiceTransferProject,
    ShellYiruProfilesServiceFindProjectProfiles,
    ShellCacheServiceGetGitHub,
    ShellCacheServiceSetGitHub,
    ShellOnboardingServiceGet,
    ShellOnboardingServiceUpdate,
    ClientEventsServiceUnsubscribe,
    ClientEventsServiceSubscribe,
    ShellEventsServiceSubscribe,
    ProgressEventsServiceSubscribe,
}

impl ProtocolRouter {
    pub(super) async fn handle_preferences(
        &self,
        method: Method,
        request: ProtocolRequest<'_>,
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        let result = match method {
            Method::SettingsServiceGetDocument => {
                settings_protocol::get_document(&self.settings, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SettingsServiceSetDocument => {
                settings_protocol::set_document(&self.settings, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SettingsServiceGet => settings_protocol::get(&self.settings, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::SettingsServiceUpdate => {
                settings_protocol::update(&self.settings, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SettingsServiceGetTerminalQuickCommands => {
                settings_protocol::get_terminal_quick_commands(&self.settings, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SettingsServiceUpdateTerminalQuickCommands => {
                settings_protocol::update_terminal_quick_commands(&self.settings, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SettingsServiceUpdatePrBotAuthorOverride => {
                settings_protocol::update_pr_bot_author_override(&self.settings, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SettingsServiceListFonts => {
                settings_protocol::list_fonts(&self.settings, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SettingsServicePreviewGhosttyImport => {
                settings_protocol::preview_ghostty_import(&self.settings, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SettingsServicePreviewWarpThemeImport => {
                settings_protocol::preview_warp_theme_import(&self.settings, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::UiServiceGet => ui_protocol::get(&self.ui, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::UiServiceSet => ui_protocol::set(&self.ui, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::UiServiceRecordFeatureInteraction => {
                ui_protocol::record_feature_interaction(&self.ui, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellKeybindingsServiceGet => {
                keybindings_protocol::get(&self.keybindings, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellKeybindingsServiceEnsureFile => {
                keybindings_protocol::ensure_file(&self.keybindings, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellKeybindingsServiceReload => {
                keybindings_protocol::reload(&self.keybindings, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellKeybindingsServiceOpenFile => {
                keybindings_protocol::open_file(&self.keybindings, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellKeybindingsServiceRevealFile => {
                keybindings_protocol::reveal_file(&self.keybindings, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellKeybindingsServiceSetAction => {
                keybindings_protocol::set_action(&self.keybindings, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellYiruProfilesServiceList => {
                profiles_protocol::list(&self.profiles, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellYiruProfilesServiceCreateLocal => {
                profiles_protocol::create_local(&self.profiles, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellYiruProfilesServiceSwitchProfile => {
                profiles_protocol::switch_profile(&self.profiles, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellYiruProfilesServiceTransferProject => {
                profiles_protocol::transfer_project(&self.profiles, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellYiruProfilesServiceFindProjectProfiles => {
                profiles_protocol::find_project_profiles(&self.profiles, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellCacheServiceGetGitHub => {
                shell_state_protocol::get_github_cache(&self.shell_state, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellCacheServiceSetGitHub => {
                shell_state_protocol::set_github_cache(&self.shell_state, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellOnboardingServiceGet => {
                shell_state_protocol::get_onboarding(&self.shell_state, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellOnboardingServiceUpdate => {
                shell_state_protocol::update_onboarding(&self.shell_state, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ClientEventsServiceUnsubscribe => client_events_protocol::unsubscribe(
                &self.client_events,
                request.payload,
                &self.connection_id,
            )
            .await
            .map(ProtocolHandlerResponse::plain),
            Method::ClientEventsServiceSubscribe => {
                return match client_events_protocol::subscribe(
                    &self.client_events,
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
            Method::ShellEventsServiceSubscribe => {
                return match shell_events_protocol::subscribe(
                    &self.shell_events,
                    request.payload,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::ProgressEventsServiceSubscribe => {
                return match host_progress_protocol::subscribe(
                    &self.host_progress,
                    request.payload,
                    context,
                )
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
