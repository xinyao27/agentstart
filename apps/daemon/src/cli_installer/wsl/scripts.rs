use base64::Engine as _;
use base64::alphabet;
use base64::engine::DecodePaddingMode;
use base64::engine::general_purpose::STANDARD;
use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};

pub(super) const MANAGED_MARKER: &str = "# Yiru managed WSL CLI launcher";
pub(super) const BRIDGE_MANAGED_MARKER: &str = "# Yiru managed WSL CLI PowerShell bridge";

pub(super) fn build_launcher(windows_launcher_path: &str, bridge_path: &str) -> String {
    let encoded_target = STANDARD.encode(windows_launcher_path);
    [
        "#!/usr/bin/env bash".to_owned(),
        "set -euo pipefail".to_owned(),
        MANAGED_MARKER.to_owned(),
        format!("# YIRU_WIN_LAUNCHER_B64={encoded_target}"),
        format!("YIRU_WIN_LAUNCHER={}", quote_shell(windows_launcher_path)),
        format!("YIRU_BRIDGE_PS1={}", quote_shell(bridge_path)),
        "if command -v powershell.exe >/dev/null 2>&1; then".to_owned(),
        "  YIRU_POWERSHELL=powershell.exe".to_owned(),
        "elif [ -x /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe ]; then".to_owned(),
        "  YIRU_POWERSHELL=/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe".to_owned(),
        "else".to_owned(),
        "  echo \"Yiru WSL CLI requires Windows interop and could not find powershell.exe.\" >&2".to_owned(),
        "  exit 1".to_owned(),
        "fi".to_owned(),
        "# Why: a shell can outlive a deleted worktree; keep explicit CLI selectors and".to_owned(),
        "# help usable, and repair cwd before any WSL interop tool tries to resolve it.".to_owned(),
        "YIRU_WSL_CWD=$(pwd -P 2>/dev/null) || {".to_owned(),
        "  YIRU_WSL_CWD=/".to_owned(),
        "  cd /".to_owned(),
        "}".to_owned(),
        "YIRU_BRIDGE_PS1_WIN=$(wslpath -w \"$YIRU_BRIDGE_PS1\")".to_owned(),
        "YIRU_WSL_CWD_WIN=$(wslpath -w \"$YIRU_WSL_CWD\")".to_owned(),
        "exec \"$YIRU_POWERSHELL\" -NoProfile -ExecutionPolicy Bypass -File \"$YIRU_BRIDGE_PS1_WIN\" \"$YIRU_WIN_LAUNCHER\" -WslCwd \"$YIRU_WSL_CWD_WIN\" \"$@\"".to_owned(),
        String::new(),
    ]
    .join("\n")
}

pub(super) fn build_bridge() -> &'static str {
    r#"# Yiru managed WSL CLI PowerShell bridge
[CmdletBinding(PositionalBinding=$false)]
param(
  [Parameter(Mandatory=$true, Position=0)]
  [string]$YiruLauncher,

  [string]$WslCwd,

  [Parameter(ValueFromRemainingArguments=$true)]
  [string[]]$ForwardArgs
)

$exitCode = 0
try {
  if ([string]::IsNullOrEmpty($WslCwd)) {
    Remove-Item Env:YIRU_CLI_CWD -ErrorAction SilentlyContinue
  } else {
    $env:YIRU_CLI_CWD = $WslCwd
  }
  # Why: unlike SSH passthrough, WSL paths arrive as Windows paths and are
  # safe for the desktop runtime to resolve through the selected distro.
  $env:YIRU_CLI_EXECUTION_HOST_KIND = 'wsl'
  Push-Location -LiteralPath (Split-Path -Parent $YiruLauncher)
  & $YiruLauncher @ForwardArgs
  if ($null -eq $LASTEXITCODE) {
    if (-not $?) {
      $exitCode = 1
    } else {
      $exitCode = 0
    }
  } else {
    $exitCode = $LASTEXITCODE
  }
} catch {
  Write-Error $_
  $exitCode = 1
}
exit $exitCode
"#
}

pub(super) fn build_registration_command(
    command_path: &str,
    launcher_path: &str,
    path_directory: &str,
) -> String {
    let bridge_path = bridge_path(command_path);
    [
        "set -euo pipefail".to_owned(),
        format!("mkdir -p {}", quote_shell(path_directory)),
        format!("mkdir -p {}", quote_shell(&posix_dirname(&bridge_path))),
        registration_lock(command_path),
        format!(
            "command_tmp={}.$$",
            quote_shell(&format!("{command_path}.tmp"))
        ),
        format!("bridge_path={}", quote_shell(&bridge_path)),
        "bridge_tmp=\"${bridge_path}.tmp.$$\"".to_owned(),
        "bridge_backup=\"${bridge_tmp}.backup\"".to_owned(),
        "bridge_had_original=0".to_owned(),
        "bridge_touched=0".to_owned(),
        "committed=0".to_owned(),
        "rollback() {".to_owned(),
        "  result=$?".to_owned(),
        "  set +e".to_owned(),
        "  if [ \"$committed\" -ne 1 ]; then".to_owned(),
        format!(
            "    if [ \"$bridge_had_original\" -eq 1 ]; then mv -f \"$bridge_backup\" {}; elif [ \"$bridge_touched\" -eq 1 ]; then rm -f {}; fi",
            quote_shell(&bridge_path),
            quote_shell(&bridge_path)
        ),
        "  fi".to_owned(),
        "  rm -f \"$command_tmp\" \"$bridge_tmp\" \"$bridge_backup\"".to_owned(),
        "  exit \"$result\"".to_owned(),
        "}".to_owned(),
        "trap rollback EXIT".to_owned(),
        safe_replace_guard(command_path, MANAGED_MARKER),
        safe_replace_guard(&bridge_path, BRIDGE_MANAGED_MARKER),
        "cat > \"$command_tmp\" <<'YIRU_WSL_CLI'".to_owned(),
        build_launcher(launcher_path, &bridge_path),
        "YIRU_WSL_CLI".to_owned(),
        "cat > \"$bridge_tmp\" <<'YIRU_WSL_BRIDGE'".to_owned(),
        build_bridge().to_owned(),
        "YIRU_WSL_BRIDGE".to_owned(),
        "chmod 755 \"$command_tmp\"".to_owned(),
        "chmod 644 \"$bridge_tmp\"".to_owned(),
        safe_replace_guard(command_path, MANAGED_MARKER),
        safe_replace_guard(&bridge_path, BRIDGE_MANAGED_MARKER),
        format!(
            "if [ -f {} ]; then cp -p {} \"$bridge_backup\"; bridge_had_original=1; fi",
            quote_shell(&bridge_path),
            quote_shell(&bridge_path)
        ),
        format!("mv -f \"$bridge_tmp\" {}", quote_shell(&bridge_path)),
        "bridge_touched=1".to_owned(),
        format!("mv -f \"$command_tmp\" {}", quote_shell(command_path)),
        "committed=1".to_owned(),
        "rm -f \"$bridge_backup\"".to_owned(),
        "trap - EXIT".to_owned(),
    ]
    .join("\n")
}

pub(super) fn build_safe_remove_command(command_path: &str) -> String {
    let bridge_path = bridge_path(command_path);
    [
        "set -euo pipefail".to_owned(),
        registration_lock(command_path),
        safe_replace_guard(command_path, MANAGED_MARKER),
        safe_replace_guard(&bridge_path, BRIDGE_MANAGED_MARKER),
        format!(
            "rm -f {} {}",
            quote_shell(command_path),
            quote_shell(&bridge_path)
        ),
    ]
    .join("\n")
}

pub(super) fn bridge_path(command_path: &str) -> String {
    let root = command_path.strip_suffix("/.local/bin/yiru").map_or_else(
        || command_path.to_owned(),
        |prefix| format!("{prefix}/.local/share/yiru"),
    );
    format!("{root}/yiru-wsl-bridge.ps1")
}

pub(super) fn parse_managed_launcher_target(content: &str) -> Option<String> {
    let decoder = GeneralPurpose::new(
        &alphabet::STANDARD,
        GeneralPurposeConfig::new()
            .with_decode_allow_trailing_bits(true)
            .with_decode_padding_mode(DecodePaddingMode::Indifferent),
    );
    for line in content.lines() {
        if let Some(encoded) = line.strip_prefix("# YIRU_WIN_LAUNCHER_B64=")
            && !encoded.is_empty()
            && encoded
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'/' | b'='))
            && let Ok(decoded) = decoder.decode(encoded)
        {
            return Some(String::from_utf8_lossy(&decoded).into_owned());
        }
    }
    for line in content.lines() {
        let Some(quoted) = line
            .strip_prefix("YIRU_WIN_LAUNCHER='")
            .and_then(|line| line.strip_suffix('\''))
        else {
            continue;
        };
        let segments = quoted.split("'\"'\"'").collect::<Vec<_>>();
        if segments.iter().any(|segment| segment.contains('\'')) {
            return None;
        }
        let target = segments.join("'");
        return (!target.is_empty()).then_some(target);
    }
    None
}

pub(super) fn posix_dirname(path: &str) -> String {
    path.rsplit_once('/').map_or_else(
        || "/".to_owned(),
        |(directory, _)| {
            if directory.is_empty() {
                "/".to_owned()
            } else {
                directory.to_owned()
            }
        },
    )
}

pub(super) fn quote_shell(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn safe_replace_guard(path: &str, marker: &str) -> String {
    let path = quote_shell(path);
    let marker = quote_shell(marker);
    [
        format!("if [ -L {path} ]; then"),
        "  echo \"__YIRU_CONFLICT__\"".to_owned(),
        "  exit 23".to_owned(),
        format!("elif [ -e {path} ] && {{ [ ! -f {path} ] || ! grep -Fq {marker} {path}; }}; then"),
        "  echo \"__YIRU_CONFLICT__\"".to_owned(),
        "  exit 23".to_owned(),
        "fi".to_owned(),
    ]
    .join("\n")
}

fn registration_lock(command_path: &str) -> String {
    let lock_directory = posix_dirname(&bridge_path(command_path));
    [
        format!(
            "if command -v flock >/dev/null 2>&1 && mkdir -p {} 2>/dev/null; then",
            quote_shell(&lock_directory)
        ),
        format!(
            "  exec 9>{}",
            quote_shell(&format!("{lock_directory}/.yiru-wsl-cli.lock"))
        ),
        "  flock -x -w 30 9".to_owned(),
        "fi".to_owned(),
    ]
    .join("\n")
}
