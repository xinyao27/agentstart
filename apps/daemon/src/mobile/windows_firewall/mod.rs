mod command;
mod model;
mod scope;
mod scripts;

use serde_json::Value;
use url::Url;

use super::MobilePairingManager;
pub(crate) use model::{
    WindowsFirewallRepairFailureReason, WindowsMobileFirewallDetails,
    WindowsMobileFirewallRepairResult, WindowsMobileFirewallStatus, WindowsNetworkCategory,
};

const ELEVATION_TIMEOUT_MS: u64 = 5 * 60_000;
const POWERSHELL_TIMEOUT_MS: u64 = 10_000;

#[derive(Clone)]
pub(crate) struct WindowsFirewall {
    mobile_pairing: MobilePairingManager,
}

impl WindowsFirewall {
    pub(crate) fn new(mobile_pairing: MobilePairingManager) -> Self {
        Self { mobile_pairing }
    }

    pub(crate) async fn inspect(&self, address: Option<&str>) -> WindowsMobileFirewallStatus {
        let Some(port) = self.supported_port() else {
            return WindowsMobileFirewallStatus::Unsupported;
        };
        let result = match executable_path() {
            Some(path) => command::run_powershell(
                scripts::inspection(port, &path, address),
                POWERSHELL_TIMEOUT_MS,
            )
            .await
            .ok()
            .and_then(|stdout| serde_json::from_str::<Value>(stdout.trim()).ok()),
            None => None,
        };
        let Some(result) = result.and_then(|value| value.as_object().cloned()) else {
            return unavailable_status(port);
        };
        let blocking_rule_detected = result
            .get("blockingRuleDetected")
            .is_some_and(|value| value == true);
        WindowsMobileFirewallStatus::Supported(WindowsMobileFirewallDetails {
            blocking_rule_detected,
            inspection_available: true,
            network_category: network_category(result.get("networkCategory")),
            port,
            private_firewall_enabled: !result
                .get("privateFirewallEnabled")
                .is_some_and(|value| value == false),
            rule_allowed: !blocking_rule_detected
                && scope::has_sufficient_remote_scope(
                    result.get("matchingRuleScopes"),
                    result.get("localAddress"),
                    result.get("localPrefixLength"),
                ),
        })
    }

    pub(crate) async fn repair(&self) -> WindowsMobileFirewallRepairResult {
        let Some(port) = self.supported_port() else {
            return WindowsMobileFirewallRepairResult::Failed(
                WindowsFirewallRepairFailureReason::Unsupported,
            );
        };
        let Some(executable_path) = executable_path() else {
            return WindowsMobileFirewallRepairResult::Failed(
                WindowsFirewallRepairFailureReason::Failed,
            );
        };
        let repair_script = scripts::repair(port, &executable_path);
        let elevation_script = scripts::elevation(
            &command::powershell_path(),
            &scripts::encode(&repair_script),
        );
        let result = command::run_powershell(elevation_script, ELEVATION_TIMEOUT_MS)
            .await
            .ok()
            .and_then(|stdout| serde_json::from_str::<Value>(stdout.trim()).ok())
            .and_then(|value| value.as_object().cloned());
        let Some(result) = result else {
            return WindowsMobileFirewallRepairResult::Failed(
                WindowsFirewallRepairFailureReason::Failed,
            );
        };
        if !result.get("launched").is_some_and(|value| value == true)
            && result.get("nativeErrorCode").and_then(Value::as_i64) == Some(1223)
        {
            return WindowsMobileFirewallRepairResult::Failed(
                WindowsFirewallRepairFailureReason::Cancelled,
            );
        }
        if result.get("launched").is_some_and(|value| value == true)
            && result.get("exitCode").and_then(Value::as_i64) == Some(0)
        {
            WindowsMobileFirewallRepairResult::Ok
        } else {
            WindowsMobileFirewallRepairResult::Failed(WindowsFirewallRepairFailureReason::Failed)
        }
    }

    pub(crate) fn open_network_settings(&self) -> bool {
        command::open_network_settings()
    }

    fn supported_port(&self) -> Option<u16> {
        if !cfg!(windows)
            || !matches!(
                std::env::var("AGENTSTART_BUILD_IDENTITY").as_deref(),
                Ok("stable" | "rc")
            )
        {
            return None;
        }
        let endpoint = self.mobile_pairing.websocket_endpoint()?;
        Url::parse(&endpoint).ok()?.port().filter(|port| *port > 0)
    }
}

fn executable_path() -> Option<String> {
    std::env::current_exe()
        .ok()
        .map(|path| path.to_string_lossy().into_owned())
}

fn unavailable_status(port: u16) -> WindowsMobileFirewallStatus {
    WindowsMobileFirewallStatus::Supported(WindowsMobileFirewallDetails {
        blocking_rule_detected: false,
        inspection_available: false,
        network_category: WindowsNetworkCategory::Unknown,
        port,
        private_firewall_enabled: true,
        rule_allowed: false,
    })
}

fn network_category(value: Option<&Value>) -> WindowsNetworkCategory {
    match value.and_then(Value::as_str) {
        Some("Private") => WindowsNetworkCategory::Private,
        Some("Public") => WindowsNetworkCategory::Public,
        Some("DomainAuthenticated") => WindowsNetworkCategory::Domain,
        _ => WindowsNetworkCategory::Unknown,
    }
}
