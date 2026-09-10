use agentstart_protocol::runtime::v1::{
    ShellKeybindingsDiagnostic, ShellKeybindingsOverrideEntry, ShellKeybindingsOverrideMap,
    ShellKeybindingsPlatform, ShellKeybindingsPlatformOverrides, ShellKeybindingsSeverity,
    ShellKeybindingsSnapshot,
};

use crate::keybindings::{DiagnosticSeverity, KeybindingFileSnapshot, KeybindingPlatform};

pub(in crate::rpc) fn protocol_snapshot(
    snapshot: &KeybindingFileSnapshot,
) -> ShellKeybindingsSnapshot {
    ShellKeybindingsSnapshot {
        path: snapshot.path.clone(),
        platform: platform_value(snapshot.platform),
        exists: snapshot.exists,
        overrides: Some(override_map(snapshot.overrides.iter())),
        common_overrides: Some(override_map(snapshot.common_overrides.iter())),
        platform_overrides: Some(ShellKeybindingsPlatformOverrides {
            darwin: platform_section(snapshot, KeybindingPlatform::Darwin),
            linux: platform_section(snapshot, KeybindingPlatform::Linux),
            win32: platform_section(snapshot, KeybindingPlatform::Win32),
        }),
        diagnostics: snapshot
            .diagnostics
            .iter()
            .map(|diagnostic| ShellKeybindingsDiagnostic {
                severity: match diagnostic.severity {
                    DiagnosticSeverity::Warning => ShellKeybindingsSeverity::Warning,
                    DiagnosticSeverity::Error => ShellKeybindingsSeverity::Error,
                } as i32,
                message: diagnostic.message.clone(),
                action_id: diagnostic.action_id.clone(),
                section: diagnostic.section.clone(),
            })
            .collect(),
    }
}

// Why: the legacy surface serializes a platform section only when the file
// declares one (possibly empty), so absence and an empty section stay distinct.
fn platform_section(
    snapshot: &KeybindingFileSnapshot,
    platform: KeybindingPlatform,
) -> Option<ShellKeybindingsOverrideMap> {
    snapshot
        .platform_overrides
        .get(platform)
        .map(|overrides| override_map(overrides.iter()))
}

fn override_map<'a>(
    entries: impl Iterator<Item = (&'a str, &'a [String])>,
) -> ShellKeybindingsOverrideMap {
    ShellKeybindingsOverrideMap {
        entries: entries
            .map(|(action_id, bindings)| ShellKeybindingsOverrideEntry {
                action_id: action_id.to_owned(),
                bindings: bindings.to_vec(),
            })
            .collect(),
    }
}

fn platform_value(platform: KeybindingPlatform) -> i32 {
    (match platform {
        KeybindingPlatform::Darwin => ShellKeybindingsPlatform::Darwin,
        KeybindingPlatform::Linux => ShellKeybindingsPlatform::Linux,
        KeybindingPlatform::Win32 => ShellKeybindingsPlatform::Win32,
    }) as i32
}
