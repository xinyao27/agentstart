use std::collections::HashSet;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use regex::Regex;
use tokio::sync::Mutex as AsyncMutex;

use crate::hosts::{ExecutionHost, HostCommand, HostCommandErrorKind, HostPlatform};

use super::model::{ShellHydration, ShellHydrationFailureReason};

const DELIMITER: &str = "__AGENTSTART_SHELL_PATH__";
const HYDRATION_TIMEOUT_MS: u64 = 5_000;
const WINDOWS_PATH_CACHE_TTL: Duration = Duration::from_secs(30);

pub(super) struct ShellPath {
    cached: AsyncMutex<Option<ShellHydration>>,
    effective: Mutex<String>,
    windows_cached: AsyncMutex<Option<(Instant, Vec<String>)>>,
}

impl ShellPath {
    pub(super) fn new() -> Self {
        let effective = std::env::var("PATH")
            .or_else(|_| std::env::var("Path"))
            .unwrap_or_default();
        Self {
            cached: AsyncMutex::new(None),
            effective: Mutex::new(effective),
            windows_cached: AsyncMutex::new(None),
        }
    }

    pub(super) fn effective(&self) -> String {
        lock(&self.effective).clone()
    }

    pub(super) async fn hydrate(
        &self,
        host: Arc<dyn ExecutionHost>,
        force: bool,
    ) -> ShellHydration {
        let mut cached = self.cached.lock().await;
        if !force && let Some(value) = cached.as_ref() {
            return value.clone();
        }
        let value = hydrate(host).await;
        *cached = Some(value.clone());
        value
    }

    pub(super) async fn refresh_windows_path(&self, host: Arc<dyn ExecutionHost>) {
        if host.platform() != HostPlatform::Windows {
            return;
        }
        let mut cached = self.windows_cached.lock().await;
        let segments = if let Some((read_at, segments)) = cached.as_ref() {
            if read_at.elapsed() < WINDOWS_PATH_CACHE_TTL {
                segments.clone()
            } else {
                read_windows_path(host).await
            }
        } else {
            read_windows_path(host).await
        };
        *cached = Some((Instant::now(), segments.clone()));
        append_windows_segments(&self.effective, &segments);
    }

    pub(super) fn merge(&self, segments: &[String], platform: HostPlatform) -> Vec<String> {
        if segments.is_empty() {
            return Vec::new();
        }
        let separator = separator(platform);
        let mut current = lock(&self.effective);
        let current_segments: Vec<&str> = current
            .split(separator)
            .filter(|segment| !segment.is_empty())
            .collect();
        let shell_segments = ordered_unique(segments.iter().map(String::as_str));
        let shell_set: HashSet<&str> = shell_segments.iter().copied().collect();
        let existing: HashSet<&str> = current_segments.iter().copied().collect();
        let added = shell_segments
            .iter()
            .filter(|segment| !existing.contains(**segment))
            .map(|segment| (*segment).to_owned())
            .collect();
        let merged = shell_segments
            .iter()
            .copied()
            .chain(
                current_segments
                    .iter()
                    .copied()
                    .filter(|segment| !shell_set.contains(segment)),
            )
            .collect::<Vec<_>>()
            .join(&separator.to_string());
        if merged != *current {
            *current = merged;
        }
        added
    }
}

async fn read_windows_path(host: Arc<dyn ExecutionHost>) -> Vec<String> {
    let mut segments = Vec::new();
    for key in [
        r"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
        r"HKCU\Environment",
    ] {
        let mut command = HostCommand::new("reg.exe", ["query", key, "/v", "Path"]);
        command.timeout_ms = Some(HYDRATION_TIMEOUT_MS);
        let Ok(output) = host.exec(command).await else {
            continue;
        };
        if output.exit_code != 0 {
            continue;
        }
        if let Some(value) = registry_path(&output.stdout) {
            segments.extend(
                expand_windows_env(value)
                    .split(';')
                    .map(str::trim)
                    .filter(|segment| !segment.is_empty())
                    .map(str::to_owned),
            );
        }
    }
    segments
}

fn registry_path(output: &str) -> Option<&str> {
    output.lines().find_map(|line| {
        let trimmed = line.trim_start();
        let remainder = trimmed
            .strip_prefix("Path")
            .or_else(|| trimmed.strip_prefix("PATH"))?
            .trim_start();
        let (_, value) = remainder.split_once(char::is_whitespace)?;
        Some(value.trim_start_matches(char::is_whitespace))
    })
}

fn expand_windows_env(value: &str) -> String {
    Regex::new(r"%([^%]+)%")
        .expect("static Windows environment pattern is valid")
        .replace_all(value, |captures: &regex::Captures<'_>| {
            let name = &captures[1];
            std::env::vars()
                .find(|(key, _)| key.eq_ignore_ascii_case(name))
                .map_or_else(|| captures[0].to_owned(), |(_, value)| value)
        })
        .into_owned()
}

fn append_windows_segments(path: &Mutex<String>, segments: &[String]) {
    let mut current = lock(path);
    let mut existing: HashSet<String> = current
        .split(';')
        .map(|segment| segment.to_ascii_lowercase())
        .collect();
    let missing: Vec<&str> = segments
        .iter()
        .map(String::as_str)
        .filter(|segment| existing.insert(segment.to_ascii_lowercase()))
        .collect();
    if !missing.is_empty() {
        let mut values: Vec<&str> = current
            .split(';')
            .filter(|value| !value.is_empty())
            .collect();
        values.extend(missing);
        *current = values.join(";");
    }
}

async fn hydrate(host: Arc<dyn ExecutionHost>) -> ShellHydration {
    let shell = pick_shell(host.platform());
    let Some(shell) = shell else {
        return failed(ShellHydrationFailureReason::NoShell);
    };
    let script =
        format!("printf '%s' '{DELIMITER}'; printf '%s' \"$PATH\"; printf '%s' '{DELIMITER}'");
    let mut command = HostCommand::new(shell, ["-ilc", script.as_str()]);
    command.timeout_ms = Some(HYDRATION_TIMEOUT_MS);
    let output = match host.exec(command).await {
        Ok(output) => output,
        Err(error) if error.kind() == HostCommandErrorKind::Timeout => {
            return failed(ShellHydrationFailureReason::Timeout);
        }
        Err(_) => return failed(ShellHydrationFailureReason::SpawnError),
    };
    let segments = parse_path(&output.stdout, host.platform());
    if segments.is_empty() {
        failed(ShellHydrationFailureReason::EmptyPath)
    } else {
        ShellHydration {
            failure_reason: ShellHydrationFailureReason::None,
            segments,
        }
    }
}

fn pick_shell(platform: HostPlatform) -> Option<String> {
    if platform == HostPlatform::Windows {
        return None;
    }
    if let Ok(shell) = std::env::var("SHELL")
        && !shell.is_empty()
    {
        return Some(shell);
    }
    Some(
        if platform == HostPlatform::Darwin {
            "/bin/zsh"
        } else {
            "/bin/bash"
        }
        .to_owned(),
    )
}

fn parse_path(stdout: &str, platform: HostPlatform) -> Vec<String> {
    let cleaned = Regex::new(r"\x1b\[[0-9;?]*[A-Za-z]")
        .expect("static ANSI pattern is valid")
        .replace_all(stdout, "");
    let Some(first) = cleaned.find(DELIMITER) else {
        return Vec::new();
    };
    let remaining = &cleaned[first + DELIMITER.len()..];
    let Some(second) = remaining.find(DELIMITER) else {
        return Vec::new();
    };
    let captured = remaining[..second].trim();
    if captured.is_empty() {
        return Vec::new();
    }
    ordered_unique(
        captured
            .split(separator(platform))
            .map(str::trim)
            .filter(|segment| !segment.is_empty()),
    )
    .into_iter()
    .map(str::to_owned)
    .collect()
}

fn ordered_unique<'a>(values: impl IntoIterator<Item = &'a str>) -> Vec<&'a str> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|value| seen.insert(*value))
        .collect()
}

fn separator(platform: HostPlatform) -> char {
    if platform == HostPlatform::Windows {
        ';'
    } else {
        ':'
    }
}

fn failed(failure_reason: ShellHydrationFailureReason) -> ShellHydration {
    ShellHydration {
        failure_reason,
        segments: Vec::new(),
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}
