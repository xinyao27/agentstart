use std::process::Stdio;
use std::time::Duration;

use serde_json::Value;
use tokio::process::Command;
use tokio::time::{sleep, timeout};

use super::EmulatorError;

const SIMCTL_UNAVAILABLE: &str = "Xcode Simulator tools are unavailable. Install full Xcode, open it once, then select it with `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer`.";

#[derive(Clone)]
pub(crate) struct DeviceRecord {
    pub(crate) name: String,
    pub(crate) udid: String,
    pub(crate) state: String,
    pub(crate) runtime: String,
    pub(crate) is_available: Option<bool>,
}

pub(super) async fn list() -> Result<Vec<DeviceRecord>, EmulatorError> {
    if !cfg!(target_os = "macos") {
        return Ok(Vec::new());
    }
    let output = run_simctl(["list", "devices", "-j"], Duration::from_secs(15)).await?;
    let document: Value = serde_json::from_slice(&output).map_err(|error| {
        EmulatorError::domain("emulator_error", format!("invalid simctl output: {error}"))
    })?;
    let mut devices = Vec::new();
    if let Some(runtimes) = document.get("devices").and_then(Value::as_object) {
        for (runtime, entries) in runtimes {
            let Some(entries) = entries.as_array() else {
                continue;
            };
            for entry in entries {
                let Some(udid) = entry.get("udid").and_then(Value::as_str) else {
                    continue;
                };
                devices.push(DeviceRecord {
                    name: entry
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or(udid)
                        .to_owned(),
                    udid: udid.to_owned(),
                    state: entry
                        .get("state")
                        .and_then(Value::as_str)
                        .unwrap_or("unknown")
                        .to_owned(),
                    runtime: runtime.clone(),
                    is_available: entry.get("isAvailable").and_then(Value::as_bool),
                });
            }
        }
    }
    Ok(devices)
}

pub(super) async fn resolve(candidate: &str) -> Result<String, EmulatorError> {
    if is_udid(candidate) {
        return Ok(candidate.to_owned());
    }
    let needle = candidate.to_ascii_lowercase();
    Ok(list()
        .await?
        .into_iter()
        .find(|device| {
            device.name.to_ascii_lowercase().contains(&needle) || device.udid == candidate
        })
        .map(|device| device.udid)
        .unwrap_or_else(|| candidate.to_owned()))
}

pub(super) async fn ensure_booted(udid: &str) -> Result<(), EmulatorError> {
    ensure_macos()?;
    let device = list()
        .await?
        .into_iter()
        .find(|device| device.udid == udid)
        .ok_or_else(|| {
            EmulatorError::domain(
                "emulator_device_not_found",
                format!(
                    "Simulator {udid} not found. Create one via Xcode > Window > Devices and Simulators."
                ),
            )
        })?;
    if device.state == "Booted" {
        return Ok(());
    }
    let _ = run_simctl(["boot", udid], Duration::from_secs(45)).await;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(22);
    while tokio::time::Instant::now() < deadline {
        sleep(Duration::from_millis(700)).await;
        if list().await.is_ok_and(|devices| {
            devices
                .iter()
                .any(|device| device.udid == udid && device.state == "Booted")
        }) {
            return Ok(());
        }
    }
    Err(EmulatorError::domain(
        "emulator_error",
        format!("Simulator {udid} did not finish booting"),
    ))
}

pub(super) async fn shutdown(udid: &str) -> Result<(), EmulatorError> {
    ensure_macos()?;
    match run_simctl(["shutdown", udid], Duration::from_secs(30)).await {
        Ok(_) => Ok(()),
        Err(error)
            if error
                .message
                .to_ascii_lowercase()
                .contains("current state: shutdown") =>
        {
            Ok(())
        }
        Err(error) => Err(error),
    }
}

pub(super) fn default_device(devices: &[DeviceRecord]) -> Option<String> {
    let available: Vec<_> = devices
        .iter()
        .filter(|device| device.is_available != Some(false))
        .collect();
    let chosen = available
        .iter()
        .copied()
        .find(|device| {
            device.state == "Booted" && device.name.to_ascii_lowercase().contains("iphone")
        })
        .or_else(|| {
            available
                .iter()
                .copied()
                .find(|device| device.state == "Booted")
        })
        .or_else(|| {
            available
                .iter()
                .copied()
                .find(|device| device.name.to_ascii_lowercase().contains("iphone"))
        })
        .or_else(|| available.first().copied())
        .or_else(|| devices.first());
    chosen.map(|device| device.udid.clone())
}

pub(super) fn ensure_macos() -> Result<(), EmulatorError> {
    if cfg!(target_os = "macos") {
        Ok(())
    } else {
        Err(EmulatorError::domain(
            "emulator_not_macos",
            "iOS Simulator requires macOS with Xcode Command Line Tools.",
        ))
    }
}

async fn run_simctl<const N: usize>(
    args: [&str; N],
    duration: Duration,
) -> Result<Vec<u8>, EmulatorError> {
    let mut command = Command::new("xcrun");
    command
        .arg("simctl")
        .args(args)
        .stdin(Stdio::null())
        .kill_on_drop(true);
    let output = timeout(duration, command.output())
        .await
        .map_err(|_| EmulatorError::domain("emulator_error", "xcrun simctl timed out"))?
        .map_err(map_simctl_io)?;
    if output.status.success() {
        return Ok(output.stdout);
    }
    let message = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    if message
        .to_ascii_lowercase()
        .contains("unable to find utility")
    {
        Err(EmulatorError::domain(
            "emulator_simctl_unavailable",
            SIMCTL_UNAVAILABLE,
        ))
    } else {
        Err(EmulatorError::domain(
            "emulator_error",
            if message.is_empty() {
                format!("xcrun simctl failed: {}", output.status)
            } else {
                message
            },
        ))
    }
}

fn map_simctl_io(error: std::io::Error) -> EmulatorError {
    if error.kind() == std::io::ErrorKind::NotFound {
        EmulatorError::domain("emulator_simctl_unavailable", SIMCTL_UNAVAILABLE)
    } else {
        EmulatorError::domain("emulator_error", error.to_string())
    }
}

fn is_udid(value: &str) -> bool {
    let segments: Vec<_> = value.split('-').collect();
    let lengths = [8, 4, 4, 4, 12];
    segments.len() == lengths.len()
        && segments.iter().zip(lengths).all(|(segment, length)| {
            segment.len() == length && segment.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
}
