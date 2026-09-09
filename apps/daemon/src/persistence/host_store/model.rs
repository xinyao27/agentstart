use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RegisteredHostKind {
    Ssh,
    Wsl,
}

#[derive(Clone, Debug)]
pub(crate) struct HostRecord {
    pub(crate) created_at: i64,
    pub(crate) id: String,
    pub(crate) kind: RegisteredHostKind,
    pub(crate) label: String,
    pub(crate) platform: String,
    pub(crate) target: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostMutation {
    pub(crate) revision: i64,
}

pub(crate) struct HostSnapshot {
    pub(crate) hosts: Vec<HostRecord>,
    pub(crate) revision: i64,
}

impl RegisteredHostKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Ssh => "ssh",
            Self::Wsl => "wsl",
        }
    }

    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "ssh" => Some(Self::Ssh),
            "wsl" => Some(Self::Wsl),
            _ => None,
        }
    }
}
