// Why: mirrors Node's `os.platform()`/`os.arch()`/`os.release()` strings so a persisted
// `CrashReportRecord` reads the same on disk regardless of which daemon (Bun or Rust)
// wrote it. `crate::telemetry`'s equivalent helpers are module-private to that authority,
// so this is a deliberately small, self-contained duplicate rather than a shared import.

pub(super) fn platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        value => value,
    }
}

pub(super) fn architecture() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        value => value,
    }
}

pub(super) async fn os_release() -> String {
    #[cfg(windows)]
    let output = tokio::process::Command::new("cmd")
        .args(["/C", "ver"])
        .output()
        .await;
    #[cfg(not(windows))]
    let output = tokio::process::Command::new("uname")
        .arg("-r")
        .output()
        .await;
    output
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .unwrap_or_default()
}

// Why: Persisted platform values must remain readable across daemon upgrades.
pub(super) fn is_known_platform(value: &str) -> bool {
    matches!(
        value,
        "aix"
            | "android"
            | "cygwin"
            | "darwin"
            | "freebsd"
            | "haiku"
            | "linux"
            | "netbsd"
            | "openbsd"
            | "sunos"
            | "win32"
    )
}
