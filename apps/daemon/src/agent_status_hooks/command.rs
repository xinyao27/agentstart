use std::path::Path;

#[cfg(windows)]
use base64::Engine;

pub(super) struct ManagedCommandMatcher {
    needles: [String; 4],
}

impl ManagedCommandMatcher {
    pub(super) fn new(script_file_name: &str) -> Self {
        let stem = script_file_name
            .strip_suffix(".cmd")
            .or_else(|| script_file_name.strip_suffix(".ps1"))
            .or_else(|| script_file_name.strip_suffix(".sh"))
            .unwrap_or(script_file_name);
        Self {
            needles: [
                format!("agent-hooks/{script_file_name}"),
                format!("agent-hooks/{stem}.cmd"),
                format!("agent-hooks/{stem}.ps1"),
                format!("agent-hooks/{stem}.sh"),
            ],
        }
    }

    pub(super) fn matches(&self, command: &str) -> bool {
        let normalized = command.replace('\\', "/");
        self.needles
            .iter()
            .any(|needle| normalized.contains(needle))
            || decode_powershell(command).is_some_and(|decoded| {
                let normalized = decoded.replace('\\', "/");
                self.needles
                    .iter()
                    .any(|needle| normalized.contains(needle))
            })
    }
}

pub(super) fn managed_command(path: &Path, provider: &str) -> String {
    managed_command_with_env(path, provider, &[])
}

pub(super) fn managed_command_with_env(
    path: &Path,
    provider: &str,
    environment: &[(&str, &str)],
) -> String {
    if cfg!(windows) {
        let path = path.display().to_string();
        if matches!(provider, "codex" | "antigravity" | "devin")
            && environment.is_empty()
            && path.chars().all(is_windows_cmd_safe)
        {
            return path;
        }
        if matches!(provider, "claude" | "openclaude") && environment.is_empty() {
            let bash_path = path.replace('\\', "/");
            if bash_path.chars().all(is_windows_git_bash_safe) {
                let quoted = quote_posix(&bash_path);
                return format!(
                    "if [ -f {quoted} ]; then {quoted}; else cat >/dev/null 2>&1 || :; fi"
                );
            }
        }
        powershell_command(&path, environment)
    } else {
        let quoted = quote_posix(&path.display().to_string());
        let environment = environment
            .iter()
            .map(|(key, value)| format!("{key}={}", quote_posix(value)))
            .collect::<Vec<_>>()
            .join(" ");
        let invocation = if environment.is_empty() {
            format!("/bin/sh {quoted}")
        } else {
            format!("{environment} /bin/sh {quoted}")
        };
        format!(
            "if [ -f {quoted} ] && [ -r {quoted} ] && [ -x {quoted} ]; then {invocation}; else cat >/dev/null 2>&1 || :; fi"
        )
    }
}

pub(super) fn managed_posix_command(path: &Path, environment: &[(&str, &str)]) -> String {
    let path = path.display().to_string().replace('\\', "/");
    let quoted = quote_posix(&path);
    let environment = environment
        .iter()
        .map(|(key, value)| format!("{key}={}", quote_posix(value)))
        .collect::<Vec<_>>()
        .join(" ");
    let invocation = if environment.is_empty() {
        format!("/bin/sh {quoted}")
    } else {
        format!("{environment} /bin/sh {quoted}")
    };
    format!(
        "if [ -f {quoted} ] && [ -r {quoted} ] && [ -x {quoted} ]; then {invocation}; else cat >/dev/null 2>&1 || :; fi"
    )
}

fn quote_posix(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(windows)]
fn powershell_command(path: &str, environment: &[(&str, &str)]) -> String {
    let escaped = path.replace('\'', "''");
    let environment = environment
        .iter()
        .map(|(key, value)| format!("$env:{key} = '{}'; ", value.replace('\'', "''")))
        .collect::<String>();
    let command = format!(
        "{environment}if (Test-Path -LiteralPath '{escaped}' -PathType Leaf) {{ & '{escaped}'; exit $LASTEXITCODE }}; [Console]::In.ReadToEnd() | Out-Null; exit 0"
    );
    let bytes = command
        .encode_utf16()
        .flat_map(u16::to_le_bytes)
        .collect::<Vec<_>>();
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let root = std::env::var("SystemRoot")
        .unwrap_or_else(|_| r"C:\Windows".to_owned())
        .replace('\\', "/");
    format!(
        "{root}/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand {encoded}"
    )
}

#[cfg(not(windows))]
fn powershell_command(_path: &str, _environment: &[(&str, &str)]) -> String {
    String::new()
}

#[cfg(windows)]
fn decode_powershell(command: &str) -> Option<String> {
    let marker = "-encodedcommand ";
    let start = command.to_ascii_lowercase().find(marker)? + marker.len();
    let encoded = &command[start..];
    let encoded = encoded.split_whitespace().next()?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .ok()?;
    let words = bytes
        .chunks_exact(2)
        .map(|bytes| u16::from_le_bytes([bytes[0], bytes[1]]))
        .collect::<Vec<_>>();
    String::from_utf16(&words).ok()
}

#[cfg(not(windows))]
fn decode_powershell(_command: &str) -> Option<String> {
    None
}

fn is_windows_cmd_safe(character: char) -> bool {
    character.is_ascii_alphanumeric() || "_.:\\~-".contains(character)
}

fn is_windows_git_bash_safe(character: char) -> bool {
    character.is_ascii_alphanumeric() || "_.:/~-".contains(character)
}
