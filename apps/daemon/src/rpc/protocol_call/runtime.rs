use super::{
    ProtocolCallContext, ProtocolHandlerOutcome, ProtocolHandlerResponse, ProtocolRequest,
    ProtocolRouter, app_control_protocol, cli_protocol, developer_permissions_protocol,
    mobile_protocol, preflight_protocol, shell_platform_protocol, updater_protocol,
    windows_firewall_protocol,
};

pub(super) enum Method {
    ShellHostServiceRegister,
    ShellHostServiceExecute,
    AppControlServiceRecordStartupDiagnostic,
    AppControlServiceRestart,
    CliServiceGetInstallStatus,
    CliServiceInstall,
    CliServiceRemove,
    CliServiceGetWslInstallStatus,
    CliServiceInstallWsl,
    CliServiceRemoveWsl,
    DeveloperPermissionsServiceGetStatus,
    DeveloperPermissionsServiceRequest,
    WindowsFirewallServiceGetStatus,
    WindowsFirewallServiceRepair,
    WindowsFirewallServiceOpenNetworkSettings,
    HostRegistryServiceIsWslAvailable,
    HostRegistryServiceListWslDistros,
    HostRegistryServiceIsGitBashAvailable,
    HostRegistryServiceIsPwshAvailable,
    HostRegistryServiceMarkAgentTrusted,
    HostRegistryServiceAdd,
    HostRegistryServiceList,
    HostRegistryServiceProbe,
    HostRegistryServiceRemove,
    MobilePairingServiceCreateDevelopmentOffer,
    MobilePairingServiceGetPairingQr,
    MobilePairingServiceListDevices,
    MobilePairingServiceListNetworkInterfaces,
    MobilePairingServiceRevokeDevice,
    RuntimeEnvironmentServiceGenerateOffer,
    RuntimeEnvironmentServiceDisconnect,
    RuntimeEnvironmentServiceGetStatus,
    RuntimeEnvironmentServiceImport,
    RuntimeEnvironmentServiceList,
    RuntimeEnvironmentServiceListPeers,
    RuntimeEnvironmentServiceRemove,
    RuntimeEnvironmentServiceRevokePeer,
    StatusServiceGetStatus,
    UpdaterServiceCheck,
    UpdaterServiceDownload,
    UpdaterServiceGetStatus,
    UpdaterServiceGetVersion,
    UpdaterServiceInstall,
    UpdaterServiceSubscribeStatus,
    ShellPlatformServiceOpenPath,
    ShellPlatformServiceGetSystemAccentColor,
    ShellPlatformServiceOpenFileUri,
    ShellPlatformServiceOpenInExternalEditor,
    ShellPlatformServiceOpenInFileManager,
    ShellPlatformServiceOpenFilePath,
    ShellPlatformServicePathExists,
    ShellPlatformServicePickAttachment,
    ShellPlatformServicePickImage,
    ShellPlatformServicePickAudio,
    ShellPlatformServicePickDirectory,
    PreflightServiceCheck,
    PreflightServiceDetectAgents,
    PreflightServiceDetectRemoteAgents,
    PreflightServiceRefreshAgents,
}

impl ProtocolRouter {
    pub(super) async fn handle_runtime(
        &self,
        method: Method,
        request: ProtocolRequest<'_>,
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        let result = match method {
            Method::ShellHostServiceRegister => {
                match agentstart_protocol::transport::decode::<
                    agentstart_protocol::runtime::v1::ShellHostRegisterRequest,
                >(request.payload)
                {
                    Ok(_) => {
                        let accepted = self.shell_host.register(&self.connection_id).await;
                        Ok(ProtocolHandlerResponse::plain(
                            agentstart_protocol::transport::encode(
                                &agentstart_protocol::runtime::v1::ShellHostAccepted { accepted },
                            ),
                        ))
                    }
                    Err(error) => Err(error),
                }
            }
            Method::ShellHostServiceExecute => Err(super::status(
                agentstart_protocol::protocol::v1::StatusCode::PermissionDenied,
                "Shell host requests are served only by the browser",
            )),
            Method::AppControlServiceRecordStartupDiagnostic => {
                app_control_protocol::record_startup_diagnostic(&self.app_control, request.payload)
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::AppControlServiceRestart => {
                app_control_protocol::restart(&self.app_control, request.payload)
            }
            Method::CliServiceGetInstallStatus => {
                cli_protocol::get_install_status(&self.cli, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::CliServiceInstall => cli_protocol::install(&self.cli, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::CliServiceRemove => cli_protocol::remove(&self.cli, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::CliServiceGetWslInstallStatus => {
                cli_protocol::get_wsl_install_status(&self.cli, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::CliServiceInstallWsl => cli_protocol::install_wsl(&self.cli, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::CliServiceRemoveWsl => cli_protocol::remove_wsl(&self.cli, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::DeveloperPermissionsServiceGetStatus => {
                developer_permissions_protocol::get_status(
                    &self.developer_permissions,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::DeveloperPermissionsServiceRequest => developer_permissions_protocol::request(
                &self.developer_permissions,
                request.payload,
            )
            .await
            .map(ProtocolHandlerResponse::plain),
            Method::WindowsFirewallServiceGetStatus => {
                windows_firewall_protocol::get_status(&self.windows_firewall, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WindowsFirewallServiceRepair => {
                windows_firewall_protocol::repair(&self.windows_firewall, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WindowsFirewallServiceOpenNetworkSettings => {
                windows_firewall_protocol::open_network_settings(
                    &self.windows_firewall,
                    request.payload,
                )
                .map(ProtocolHandlerResponse::plain)
            }
            Method::HostRegistryServiceIsWslAvailable => self
                .host_registry
                .protocol_is_wsl_available(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::HostRegistryServiceListWslDistros => self
                .host_registry
                .protocol_list_wsl_distros(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::HostRegistryServiceIsGitBashAvailable => self
                .host_registry
                .protocol_is_git_bash_available(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::HostRegistryServiceIsPwshAvailable => self
                .host_registry
                .protocol_is_pwsh_available(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::HostRegistryServiceMarkAgentTrusted => self
                .agent_trust
                .protocol_mark_trusted(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::HostRegistryServiceAdd => self
                .host_registry
                .protocol_add(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::HostRegistryServiceList => self
                .host_registry
                .protocol_list(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::HostRegistryServiceProbe => self
                .host_registry
                .protocol_probe(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::HostRegistryServiceRemove => self
                .host_registry
                .protocol_remove(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::MobilePairingServiceCreateDevelopmentOffer => {
                mobile_protocol::create_development_offer(&self.mobile, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::MobilePairingServiceGetPairingQr => {
                mobile_protocol::get_pairing_qr(&self.mobile, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::MobilePairingServiceListDevices => {
                mobile_protocol::list_devices(&self.mobile, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::MobilePairingServiceListNetworkInterfaces => {
                mobile_protocol::list_network_interfaces(&self.mobile, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::MobilePairingServiceRevokeDevice => {
                mobile_protocol::revoke_device(&self.mobile, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::RuntimeEnvironmentServiceGenerateOffer => self
                .runtime_environments
                .protocol_generate_offer(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RuntimeEnvironmentServiceDisconnect => self
                .runtime_environments
                .protocol_disconnect(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RuntimeEnvironmentServiceGetStatus => self
                .runtime_environments
                .protocol_get_status(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RuntimeEnvironmentServiceImport => self
                .runtime_environments
                .protocol_import(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RuntimeEnvironmentServiceList => self
                .runtime_environments
                .protocol_list(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::RuntimeEnvironmentServiceListPeers => self
                .runtime_environments
                .protocol_list_peers(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::RuntimeEnvironmentServiceRemove => self
                .runtime_environments
                .protocol_remove(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RuntimeEnvironmentServiceRevokePeer => self
                .runtime_environments
                .protocol_revoke_peer(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::StatusServiceGetStatus => self
                .status
                .protocol_status(request.payload, context.access().principal())
                .map(ProtocolHandlerResponse::plain),
            Method::UpdaterServiceCheck => updater_protocol::check(&self.updater, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::UpdaterServiceDownload => {
                updater_protocol::download(&self.updater, request.payload)
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::UpdaterServiceGetStatus => {
                updater_protocol::get_status(&self.updater, request.payload)
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::UpdaterServiceGetVersion => {
                updater_protocol::get_version(&self.updater, request.payload)
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::UpdaterServiceInstall => {
                updater_protocol::install(&self.updater, request.payload)
            }
            Method::UpdaterServiceSubscribeStatus => {
                return match updater_protocol::subscribe_status(
                    &self.updater,
                    request.payload,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::ShellPlatformServiceOpenPath => {
                shell_platform_protocol::open_path(&self.shell_platform, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellPlatformServiceGetSystemAccentColor => {
                shell_platform_protocol::get_system_accent_color(
                    &self.shell_platform,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellPlatformServiceOpenFileUri => {
                shell_platform_protocol::open_file_uri(&self.shell_platform, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellPlatformServiceOpenInExternalEditor => {
                shell_platform_protocol::open_in_external_editor(
                    &self.shell_platform,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellPlatformServiceOpenInFileManager => {
                shell_platform_protocol::open_in_file_manager(&self.shell_platform, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellPlatformServiceOpenFilePath => {
                shell_platform_protocol::open_file_path(&self.shell_platform, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellPlatformServicePathExists => {
                shell_platform_protocol::path_exists(&self.shell_platform, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellPlatformServicePickAttachment => {
                shell_platform_protocol::pick_attachment(&self.shell_platform, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellPlatformServicePickImage => {
                shell_platform_protocol::pick_image(&self.shell_platform, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellPlatformServicePickAudio => {
                shell_platform_protocol::pick_audio(&self.shell_platform, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellPlatformServicePickDirectory => {
                shell_platform_protocol::pick_directory(&self.shell_platform, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::PreflightServiceCheck => {
                preflight_protocol::check(&self.preflight, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::PreflightServiceDetectAgents => {
                preflight_protocol::detect_agents(&self.preflight, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::PreflightServiceDetectRemoteAgents => {
                preflight_protocol::detect_remote_agents(&self.preflight, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::PreflightServiceRefreshAgents => {
                preflight_protocol::refresh_agents(&self.preflight, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
        };
        match result {
            Ok(response) => ProtocolHandlerOutcome::Complete(response),
            Err(error) => ProtocolHandlerOutcome::Failed(error),
        }
    }
}
