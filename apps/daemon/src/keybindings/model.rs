use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};

use crate::protocol::KeybindingDescriptor;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum KeybindingPlatform {
    Darwin,
    Linux,
    Win32,
}

impl KeybindingPlatform {
    pub(crate) const fn current() -> Self {
        if cfg!(target_os = "macos") {
            Self::Darwin
        } else if cfg!(windows) {
            Self::Win32
        } else {
            Self::Linux
        }
    }

    pub(crate) const fn name(self) -> &'static str {
        match self {
            Self::Darwin => "darwin",
            Self::Linux => "linux",
            Self::Win32 => "win32",
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct KeybindingOverrides(Vec<(String, Vec<String>)>);

impl KeybindingOverrides {
    pub(crate) fn get(&self, action_id: &str) -> Option<&Vec<String>> {
        self.0
            .iter()
            .find_map(|(candidate, value)| (candidate == action_id).then_some(value))
    }

    pub(crate) fn insert(&mut self, action_id: String, bindings: Vec<String>) {
        if let Some((_, current)) = self
            .0
            .iter_mut()
            .find(|(candidate, _)| candidate == &action_id)
        {
            *current = bindings;
        } else {
            self.0.push((action_id, bindings));
        }
    }

    pub(crate) fn remove(&mut self, action_id: &str) {
        self.0.retain(|(candidate, _)| candidate != action_id);
    }

    pub(crate) fn contains(&self, action_id: &str) -> bool {
        self.0.iter().any(|(candidate, _)| candidate == action_id)
    }

    pub(crate) fn iter(&self) -> impl Iterator<Item = (&str, &[String])> {
        self.0
            .iter()
            .map(|(action_id, bindings)| (action_id.as_str(), bindings.as_slice()))
    }
}

impl Serialize for KeybindingOverrides {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (action_id, bindings) in &self.0 {
            map.serialize_entry(action_id, bindings)?;
        }
        map.end()
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct PlatformOverrides(Vec<(KeybindingPlatform, KeybindingOverrides)>);

impl PlatformOverrides {
    pub(crate) fn insert(&mut self, platform: KeybindingPlatform, overrides: KeybindingOverrides) {
        if let Some((_, current)) = self
            .0
            .iter_mut()
            .find(|(candidate, _)| candidate == &platform)
        {
            *current = overrides;
        } else {
            self.0.push((platform, overrides));
        }
    }

    pub(crate) fn get(&self, platform: KeybindingPlatform) -> Option<&KeybindingOverrides> {
        self.0
            .iter()
            .find_map(|(candidate, value)| (*candidate == platform).then_some(value))
    }
}

impl Serialize for PlatformOverrides {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (platform, overrides) in &self.0 {
            map.serialize_entry(platform.name(), overrides)?;
        }
        map.end()
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeybindingFileDiagnostic {
    pub(crate) severity: DiagnosticSeverity,
    pub(crate) message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) action_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) section: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum DiagnosticSeverity {
    Warning,
    Error,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeybindingFileSnapshot {
    pub(crate) path: String,
    pub(crate) platform: KeybindingPlatform,
    pub(crate) exists: bool,
    pub(crate) overrides: KeybindingOverrides,
    pub(crate) common_overrides: KeybindingOverrides,
    pub(crate) platform_overrides: PlatformOverrides,
    pub(crate) diagnostics: Vec<KeybindingFileDiagnostic>,
}

pub(crate) fn definition<'a>(
    definitions: &'a [KeybindingDescriptor],
    action_id: &str,
) -> Option<&'a KeybindingDescriptor> {
    definitions
        .iter()
        .find(|definition| definition.id == action_id)
}

pub(crate) fn normalize_action_id<'a>(
    definitions: &'a [KeybindingDescriptor],
    stored_action_id: &'a str,
) -> Option<&'a str> {
    if stored_action_id == "worktree.palette" {
        return Some("app.commandPalette");
    }
    definition(definitions, stored_action_id).map(|definition| definition.id.as_str())
}
