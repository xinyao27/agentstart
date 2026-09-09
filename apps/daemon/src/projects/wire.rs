use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{GitRemoteIdentity, ProjectKind};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub(crate) enum LocalWindowsRuntimePreference {
    #[serde(rename = "inherit-global")]
    InheritGlobal,
    #[serde(rename = "windows-host")]
    WindowsHost,
    #[serde(rename = "wsl")]
    Wsl { distro: String },
}

impl LocalWindowsRuntimePreference {
    pub(super) fn normalized(self) -> Self {
        match self {
            Self::Wsl { distro } => {
                let distro = distro.trim_matches(is_ecmascript_whitespace).to_owned();
                if distro.is_empty() {
                    Self::InheritGlobal
                } else {
                    Self::Wsl { distro }
                }
            }
            preference => preference,
        }
    }

    pub(super) fn database_values(&self) -> (&'static str, Option<&str>) {
        match self {
            Self::InheritGlobal => ("inherit-global", None),
            Self::WindowsHost => ("windows-host", None),
            Self::Wsl { distro } => ("wsl", Some(distro)),
        }
    }
}

fn is_ecmascript_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{0009}'
            ..='\u{000d}'
                | '\u{0020}'
                | '\u{00a0}'
                | '\u{1680}'
                | '\u{2000}'..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectProviderIdentity {
    #[serde(deserialize_with = "deserialize_provider")]
    provider: String,
    owner: String,
    repo: String,
}

fn deserialize_provider<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<String, D::Error> {
    let provider = String::deserialize(deserializer)?;
    match provider.as_str() {
        "github" => Ok(provider),
        _ => Err(serde::de::Error::custom("unsupported project provider")),
    }
}

impl ProjectProviderIdentity {
    pub(super) fn github(owner: String, repo: String) -> Self {
        Self {
            provider: "github".to_owned(),
            owner,
            repo,
        }
    }

    pub(super) fn identity_key(&self) -> String {
        format!(
            "github:{}/{}",
            self.owner.trim().to_lowercase(),
            self.repo.trim().to_lowercase()
        )
    }

    pub(crate) fn github_coordinates(&self) -> (String, String) {
        (self.owner.clone(), self.repo.clone())
    }

    pub(crate) fn provider_name(&self) -> &str {
        &self.provider
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeProject {
    pub(crate) badge_color: String,
    pub(crate) created_at: i64,
    pub(crate) display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) git_remote_identity: Option<GitRemoteIdentity>,
    pub(crate) id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) kind: Option<ProjectKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) local_windows_runtime_preference: Option<LocalWindowsRuntimePreference>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) provider_identity: Option<ProjectProviderIdentity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, deserialize_with = "deserialize_repo_icon")]
    pub(crate) repo_icon: Option<Value>,
    pub(crate) source_repo_ids: Vec<String>,
    pub(crate) updated_at: i64,
}

fn deserialize_repo_icon<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Value>, D::Error> {
    Value::deserialize(deserializer).map(Some)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeProjectList {
    pub(crate) projects: Vec<RuntimeProject>,
    pub(crate) revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeProjectResult {
    pub(crate) project: RuntimeProject,
    pub(crate) revision: i64,
}

pub(crate) struct ProjectWireUpdate {
    pub(crate) expected_revision: i64,
    pub(crate) local_windows_runtime_preference: Option<LocalWindowsRuntimePreference>,
    pub(crate) project_id: String,
}
