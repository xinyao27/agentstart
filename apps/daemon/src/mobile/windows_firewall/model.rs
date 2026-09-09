#[derive(Clone, Copy)]
pub(crate) enum WindowsNetworkCategory {
    Domain,
    Private,
    Public,
    Unknown,
}

pub(crate) enum WindowsMobileFirewallStatus {
    Unsupported,
    Supported(WindowsMobileFirewallDetails),
}

pub(crate) struct WindowsMobileFirewallDetails {
    pub(crate) blocking_rule_detected: bool,
    pub(crate) inspection_available: bool,
    pub(crate) network_category: WindowsNetworkCategory,
    pub(crate) port: u16,
    pub(crate) private_firewall_enabled: bool,
    pub(crate) rule_allowed: bool,
}

pub(crate) enum WindowsMobileFirewallRepairResult {
    Ok,
    Failed(WindowsFirewallRepairFailureReason),
}

#[derive(Clone, Copy)]
pub(crate) enum WindowsFirewallRepairFailureReason {
    Cancelled,
    Failed,
    Unsupported,
}
