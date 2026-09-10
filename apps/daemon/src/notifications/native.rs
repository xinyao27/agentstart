use std::process::Stdio;
use std::time::Duration;

use serde_json::json;
use tokio::process::Command;

use crate::persistence::{WorkspaceEventPayload, WorkspaceJournal};

use super::NotificationPhase;

const NOTIFICATION_TIMEOUT: Duration = Duration::from_secs(5);

#[cfg(target_os = "windows")]
const POWERSHELL_TOAST: &str = r#"
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] > $null
$title = [Security.SecurityElement]::Escape($env:AGENTSTART_TOAST_TITLE)
$body = [Security.SecurityElement]::Escape($env:AGENTSTART_TOAST_BODY)
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$title</text><text>$body</text></binding></visual></toast>")
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('AgentStart').Show($toast)
"#;

pub(super) async fn publish(
    journal: &WorkspaceJournal,
    phase: NotificationPhase,
    title: &str,
    body: &str,
    terminal: &str,
    worktree_id: &str,
) -> bool {
    let sent = send(title, body).await;
    let payload = WorkspaceEventPayload::from_iter([
        ("phase".to_owned(), json!(phase_name(phase))),
        ("platform".to_owned(), json!(platform_name())),
        ("terminal".to_owned(), json!(terminal)),
    ]);
    if let Err(error) = journal
        .append(
            repo_scope(worktree_id),
            if sent {
                "notification.native.sent"
            } else {
                "notification.native.unavailable"
            }
            .to_owned(),
            payload,
        )
        .await
    {
        eprintln!("[daemon] Failed to record native notification delivery: {error}");
    }
    sent
}

#[cfg(target_os = "macos")]
async fn send(title: &str, body: &str) -> bool {
    let script =
        "on run argv\n display notification (item 2 of argv) with title (item 1 of argv)\nend run";
    let mut command = Command::new("/usr/bin/osascript");
    command.args(["-e", script, title, body]);
    run(command).await
}

#[cfg(target_os = "linux")]
async fn send(title: &str, body: &str) -> bool {
    let mut command = Command::new("notify-send");
    command.args(["--app-name=AgentStart", title, body]);
    run(command).await
}

#[cfg(target_os = "windows")]
async fn send(title: &str, body: &str) -> bool {
    let mut command = Command::new(windows_powershell_executable());
    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            POWERSHELL_TOAST,
        ])
        .env("AGENTSTART_TOAST_BODY", body)
        .env("AGENTSTART_TOAST_TITLE", title);
    run(command).await
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
async fn send(_title: &str, _body: &str) -> bool {
    false
}

#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
async fn run(mut command: Command) -> bool {
    command
        .kill_on_drop(true)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    tokio::time::timeout(NOTIFICATION_TIMEOUT, command.status())
        .await
        .is_ok_and(|result| result.is_ok_and(|status| status.success()))
}

fn phase_name(phase: NotificationPhase) -> &'static str {
    match phase {
        NotificationPhase::Complete => "complete",
        NotificationPhase::WaitingDecision => "waiting-decision",
    }
}

fn platform_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        platform => platform,
    }
}

fn repo_scope(worktree_id: &str) -> String {
    worktree_id
        .split_once("::")
        .map_or(worktree_id, |(repo_id, _)| repo_id)
        .to_owned()
}

#[cfg(target_os = "windows")]
fn windows_powershell_executable() -> std::path::PathBuf {
    std::env::var("SystemRoot")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .map(std::path::PathBuf::from)
        .map(|root| {
            root.join("System32")
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe")
        })
        .unwrap_or_else(|| std::path::PathBuf::from("powershell.exe"))
}
