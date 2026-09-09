use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RegistryHostKind {
    Ssh,
    Wsl,
}

#[derive(Clone, Debug)]
pub(crate) struct HostAddInput {
    pub(crate) expected_revision: i64,
    pub(crate) kind: RegistryHostKind,
    pub(crate) label: String,
    pub(crate) target: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostDescriptor {
    pub(crate) id: String,
    pub(crate) kind: String,
    pub(crate) label: String,
    pub(crate) platform: String,
    pub(crate) target: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostCapability {
    pub(crate) available: bool,
    pub(crate) detail: Option<String>,
    pub(crate) name: &'static str,
}

#[derive(Serialize)]
pub(crate) struct HostAddResult {
    pub(crate) host: HostDescriptor,
    pub(crate) revision: i64,
}

#[derive(Serialize)]
pub(crate) struct HostListResult {
    pub(crate) hosts: Vec<HostDescriptor>,
    pub(crate) revision: i64,
}

#[derive(Serialize)]
pub(crate) struct HostProbeResult {
    pub(crate) capabilities: Vec<HostCapability>,
    pub(crate) host: HostDescriptor,
}

#[derive(Serialize)]
pub(crate) struct HostRemoveResult {
    pub(crate) removed: bool,
    pub(crate) revision: i64,
}
