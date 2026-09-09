pub(super) mod protocol;

use crate::mobile::windows_firewall::{
    WindowsFirewall, WindowsMobileFirewallRepairResult, WindowsMobileFirewallStatus,
};

#[derive(Clone)]
pub(super) struct WindowsFirewallRpc {
    firewall: WindowsFirewall,
}

impl WindowsFirewallRpc {
    pub(super) fn new(firewall: WindowsFirewall) -> Self {
        Self { firewall }
    }

    pub(super) async fn inspect(&self, address: Option<&str>) -> WindowsMobileFirewallStatus {
        self.firewall.inspect(address).await
    }

    pub(super) async fn repair(&self) -> WindowsMobileFirewallRepairResult {
        self.firewall.repair().await
    }

    pub(super) fn open_network_settings(&self) -> bool {
        self.firewall.open_network_settings()
    }
}
