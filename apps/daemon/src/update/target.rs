use std::path::Path;

use super::UpdateError;

pub(super) fn release_asset_name() -> Result<&'static str, UpdateError> {
    match (
        std::env::consts::OS,
        std::env::consts::ARCH,
        cfg!(target_env = "musl"),
    ) {
        ("macos", "aarch64", _) => Ok("agentstart-rust-darwin-arm64"),
        ("macos", "x86_64", _) => Ok("agentstart-rust-darwin-x64"),
        ("linux", "aarch64", false) => Ok("agentstart-rust-linux-arm64"),
        ("linux", "x86_64", false) => Ok("agentstart-rust-linux-x64"),
        ("linux", "aarch64", true) => Ok("agentstart-rust-linux-arm64-musl"),
        ("linux", "x86_64", true) => Ok("agentstart-rust-linux-x64-musl"),
        ("windows", "x86_64", _) => Ok("agentstart-rust-windows-x64.exe"),
        _ => Err(UpdateError::PlatformUnsupported),
    }
}

pub(super) fn is_npm_install(executable: &Path) -> bool {
    cfg!(windows)
        || executable
            .parent()
            .is_some_and(|directory| directory.join("agentstart.version").exists())
}

pub(super) fn is_homebrew_install(executable: &Path) -> bool {
    let path = executable.to_string_lossy();
    path.contains("/Cellar/agentstart/") || path.contains("/homebrew/")
}

pub(super) fn is_development_build(executable: &Path, version: &str) -> bool {
    if matches!(version, "0.0.0" | "0.0.0-dev") {
        return true;
    }
    let Some(profile) = executable.parent() else {
        return false;
    };
    matches!(
        profile.file_name().and_then(|name| name.to_str()),
        Some("debug" | "release")
    ) && profile
        .parent()
        .is_some_and(|parent| parent.file_name().and_then(|name| name.to_str()) == Some("target"))
}
