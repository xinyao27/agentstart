use serde_json::{Map, json};

use crate::settings::TelemetrySettings;

use super::identity::random_uuid;
use super::model::CommonProperties;

pub(super) async fn common_properties(
    settings: &TelemetrySettings,
    channel: &str,
) -> Option<CommonProperties> {
    let session_id = random_uuid().ok()?;
    let values = Map::from_iter([
        (
            "app_version".to_owned(),
            json!(
                std::env::var("YIRU_APP_VERSION")
                    .unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_owned())
            ),
        ),
        ("platform".to_owned(), json!(platform())),
        ("arch".to_owned(), json!(architecture())),
        ("os_release".to_owned(), json!(os_release().await)),
        ("install_id".to_owned(), json!(settings.install_id)),
        ("session_id".to_owned(), json!(session_id)),
        ("yiru_channel".to_owned(), json!(channel)),
    ]);
    let valid = values.iter().all(|(key, value)| {
        value.as_str().is_some_and(|value| {
            value.encode_utf16().count() <= 64
                && (!matches!(key.as_str(), "install_id" | "session_id") || !value.is_empty())
        })
    });
    valid.then(|| CommonProperties {
        install_id: settings.install_id.clone(),
        values,
    })
}

pub(super) fn official_build() -> Option<(String, String)> {
    let channel = option_env!("YIRU_BUILD_IDENTITY")?;
    if !matches!(channel, "stable" | "rc") {
        return None;
    }
    let key = option_env!("YIRU_POSTHOG_WRITE_KEY")?.trim();
    (!key.is_empty()).then(|| (channel.to_owned(), key.to_owned()))
}

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
