use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use regex::Regex;
use serde_json::{Value, json};

use crate::host_registry::HostRegistry;
use crate::hosts::{ExecutionHost, HostCommand, HostKind, HostPlatform};

use super::CursorRefreshContext;

const AUTH_TIMEOUT_MS: u64 = 10_000;
const PTY_TIMEOUT: Duration = Duration::from_secs(25);
const STARTUP_FALLBACK: Duration = Duration::from_secs(4);
const PANEL_SETTLE: Duration = Duration::from_millis(750);
const MAX_OUTPUT_BYTES: usize = 100_000;
const MONTHLY_WINDOW_MINUTES: u64 = 30 * 24 * 60;

pub(super) async fn fetch(
    hosts: &HostRegistry,
    root: &Path,
    context: Option<CursorRefreshContext<'_>>,
) -> Value {
    let host_id = context.map_or("local", |context| context.execution_host_id);
    let workspace_id = context
        .and_then(|context| context.workspace_id)
        .map(str::to_owned);
    if host_id.starts_with("runtime:") {
        return unavailable("Cursor usage is unavailable for this runtime environment.");
    }
    let host = match hosts.execution_host(host_id).await {
        Ok(host) => host,
        Err(_) => return unavailable("Cursor usage execution host is unavailable."),
    };
    match cursor_status(host.as_ref()).await {
        CursorAuth::Authenticated => {}
        CursorAuth::Unavailable(message) => return unavailable(message),
    }
    let root = root.to_owned();
    let host = host.clone();
    let result = tokio::task::spawn_blocking(move || {
        fetch_via_pty(host.as_ref(), &root, workspace_id.as_deref())
    })
    .await;
    match result {
        Ok(value) => value,
        Err(_) => error(
            "Cursor usage panel did not return usage details.",
            "unknown",
        ),
    }
}

enum CursorAuth {
    Authenticated,
    Unavailable(&'static str),
}

async fn cursor_status(host: &dyn ExecutionHost) -> CursorAuth {
    let mut command = if host.kind() == HostKind::Local && host.platform() == HostPlatform::Windows
    {
        HostCommand::new(
            "cmd.exe",
            [
                "/d".to_owned(),
                "/s".to_owned(),
                "/c".to_owned(),
                "\"cursor-agent\" status --format json".to_owned(),
            ],
        )
    } else if host.kind() == HostKind::Local {
        HostCommand::new("cursor-agent", ["status", "--format", "json"])
    } else {
        HostCommand::new(
            "sh",
            [
                "-lc".to_owned(),
                login_command("exec cursor-agent status --format json"),
            ],
        )
    };
    command.timeout_ms = Some(AUTH_TIMEOUT_MS);
    command.max_output_bytes = Some(1024 * 1024);
    command.kill_process_tree = true;
    let output = match host.exec(command).await {
        Ok(output) if output.exit_code == 0 => output.stdout,
        _ => {
            return CursorAuth::Unavailable(
                "Cursor Agent CLI is unavailable. Install or update cursor-agent to show usage.",
            );
        }
    };
    match serde_json::from_str::<Value>(&output) {
        Ok(value) if value.get("isAuthenticated").and_then(Value::as_bool) == Some(true) => {
            CursorAuth::Authenticated
        }
        Ok(_) => CursorAuth::Unavailable("Sign in with cursor-agent to show Cursor usage."),
        Err(_) => CursorAuth::Unavailable("Cursor Agent authentication status is unavailable."),
    }
}

fn fetch_via_pty(host: &dyn ExecutionHost, root: &Path, workspace_id: Option<&str>) -> Value {
    let launch = match cursor_launch(host, root, workspace_id) {
        Ok(launch) => launch,
        Err(message) => return unavailable(message),
    };
    let pair = match native_pty_system().openpty(PtySize {
        rows: 40,
        cols: 120,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        Ok(pair) => pair,
        Err(_) => return unavailable("Cursor usage terminal is unavailable."),
    };
    let mut reader = match pair.master.try_clone_reader() {
        Ok(reader) => reader,
        Err(_) => return unavailable("Cursor usage terminal is unavailable."),
    };
    let mut writer = match pair.master.take_writer() {
        Ok(writer) => writer,
        Err(_) => return unavailable("Cursor usage terminal is unavailable."),
    };
    let mut command = CommandBuilder::new(launch.executable);
    command.args(launch.args);
    if let Some(cwd) = launch.cwd {
        command.cwd(cwd);
    }
    command.env("TERM", "xterm-256color");
    let mut child = match pair.slave.spawn_command(command) {
        Ok(child) => child,
        Err(_) => {
            return unavailable(
                "Cursor Agent CLI is unavailable. Install or update cursor-agent to show usage.",
            );
        }
    };
    let mut killer = child.clone_killer();
    drop(pair.slave);
    drop(pair.master);
    let (sender, receiver) = mpsc::channel::<Vec<u8>>();
    let reader_thread = std::thread::spawn(move || {
        let mut buffer = vec![0_u8; 4 * 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => return,
                Ok(count) => {
                    if sender.send(buffer[..count].to_vec()).is_err() {
                        return;
                    }
                }
            }
        }
    });
    let started = Instant::now();
    let mut settle_at = None;
    let mut output = String::new();
    let mut typed = false;
    let mut submitted = false;
    let mut skipped_mcp = false;
    loop {
        if started.elapsed() >= PTY_TIMEOUT || settle_at.is_some_and(|at| Instant::now() >= at) {
            break;
        }
        let wait = settle_at
            .map(|at| at.saturating_duration_since(Instant::now()))
            .unwrap_or(Duration::from_millis(100))
            .min(Duration::from_millis(100));
        match receiver.recv_timeout(wait) {
            Ok(bytes) => append_output(&mut output, &bytes),
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        let clean = strip_terminal_output(&output);
        if !skipped_mcp && contains_mcp_approval(&clean) {
            skipped_mcp = true;
            let _ = writer.write_all(b"c");
            let _ = writer.flush();
            continue;
        }
        if !typed && (contains_ready_prompt(&clean) || started.elapsed() >= STARTUP_FALLBACK) {
            typed = true;
            let _ = writer.write_all(b"/usage");
            let _ = writer.flush();
        }
        if typed && !submitted && contains_usage_completion(&clean) {
            submitted = true;
            let _ = writer.write_all(b"\r");
            let _ = writer.flush();
        }
        if submitted && settle_at.is_none() && panel_is_ready(&clean) {
            settle_at = Some(Instant::now() + PANEL_SETTLE);
        }
    }
    let _ = killer.kill();
    let _ = child.wait();
    drop(writer);
    drop(receiver);
    let _ = reader_thread.join();
    let clean = strip_terminal_output(&output);
    parse_usage(&clean).unwrap_or_else(|| error(describe_failure(&clean), "parse"))
}

struct CursorLaunch {
    executable: String,
    args: Vec<String>,
    cwd: Option<PathBuf>,
}

fn cursor_launch(
    host: &dyn ExecutionHost,
    root: &Path,
    _workspace_id: Option<&str>,
) -> Result<CursorLaunch, &'static str> {
    match host.kind() {
        HostKind::Local => {
            let cwd = root.join("rate-limit-pty-cwd");
            std::fs::create_dir_all(&cwd)
                .map_err(|_| "Cursor usage working directory is unavailable.")?;
            let cwd = std::fs::canonicalize(cwd)
                .map_err(|_| "Cursor usage working directory is unavailable.")?;
            if cwd.parent().is_none() || !cwd.is_dir() {
                return Err("Cursor usage working directory is unsafe.");
            }
            if host.platform() == HostPlatform::Windows {
                Ok(CursorLaunch {
                    executable: "cmd.exe".to_owned(),
                    args: vec![
                        "/d".to_owned(),
                        "/s".to_owned(),
                        "/c".to_owned(),
                        "\"cursor-agent\" --trust".to_owned(),
                    ],
                    cwd: Some(cwd),
                })
            } else {
                Ok(CursorLaunch {
                    executable: "cursor-agent".to_owned(),
                    args: vec!["--trust".to_owned()],
                    cwd: Some(cwd),
                })
            }
        }
        HostKind::Wsl => {
            let distro = host
                .target()
                .filter(|value| !value.trim().is_empty())
                .ok_or("Cursor WSL target is unavailable.")?;
            Ok(CursorLaunch {
                executable: "wsl.exe".to_owned(),
                args: vec![
                    "--distribution".to_owned(),
                    distro.to_owned(),
                    "--exec".to_owned(),
                    "sh".to_owned(),
                    "-lc".to_owned(),
                    login_command(&format!(
                        "{} && exec cursor-agent --trust",
                        safe_remote_cwd()
                    )),
                ],
                cwd: None,
            })
        }
        HostKind::Ssh => {
            let target = host
                .target()
                .filter(|value| !value.trim().is_empty())
                .ok_or("Cursor SSH target is unavailable.")?;
            Ok(CursorLaunch {
                executable: "ssh".to_owned(),
                args: vec![
                    "-o".to_owned(),
                    "BatchMode=yes".to_owned(),
                    "-o".to_owned(),
                    "ConnectTimeout=10".to_owned(),
                    "-tt".to_owned(),
                    "--".to_owned(),
                    target.to_owned(),
                    login_command(&format!(
                        "{} && exec cursor-agent --trust",
                        safe_remote_cwd()
                    )),
                ],
                cwd: None,
            })
        }
    }
}

fn safe_remote_cwd() -> &'static str {
    "yiru_rate_limit_cwd=\"${TMPDIR:-/tmp}/yiru-rate-limit-pty-cwd\" && mkdir -p \"$yiru_rate_limit_cwd\" && cd \"$yiru_rate_limit_cwd\""
}

fn login_command(command: &str) -> String {
    let quoted = posix_quote(command);
    format!(
        "_yiru_shell=$(getent passwd \"$(id -un)\" 2>/dev/null | cut -d: -f7); \
         if [ -z \"$_yiru_shell\" ] || [ ! -x \"$_yiru_shell\" ]; then _yiru_shell=\"${{SHELL:-/bin/bash}}\"; fi; \
         if [ -z \"$_yiru_shell\" ] || [ ! -x \"$_yiru_shell\" ]; then _yiru_shell=/bin/sh; fi; \
         _yiru_name=$(basename \"$_yiru_shell\" | tr '[:upper:]' '[:lower:]'); \
         case \"$_yiru_name\" in sh|dash) exec \"$_yiru_shell\" -lc {quoted} ;; bash|zsh|ksh|mksh|ash) exec \"$_yiru_shell\" -ilc {quoted} ;; *) exec /bin/sh -lc {quoted} ;; esac"
    )
}

fn posix_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn append_output(output: &mut String, bytes: &[u8]) {
    output.push_str(&String::from_utf8_lossy(bytes));
    if output.len() > MAX_OUTPUT_BYTES {
        let mut start = output.len() - MAX_OUTPUT_BYTES;
        while !output.is_char_boundary(start) {
            start += 1;
        }
        output.drain(..start);
    }
}

fn strip_terminal_output(output: &str) -> String {
    let output = Regex::new(r"\x1b\][^\x07]*(?:\x07|\x1b\\)").map_or_else(
        |_| output.to_owned(),
        |expression| expression.replace_all(output, "").into_owned(),
    );
    Regex::new(r"\x1b\[[0-?]*[ -/]*[@-~]").map_or(output.clone(), |expression| {
        expression.replace_all(&output, "").into_owned()
    })
}

fn contains_mcp_approval(value: &str) -> bool {
    let value = value.to_ascii_lowercase();
    value.contains("mcp server approval required") || value.contains("continue without approval")
}

fn contains_ready_prompt(value: &str) -> bool {
    let value = value.to_ascii_lowercase();
    value.contains("plan, search, build anything") || value.contains("ask anything")
}

fn contains_usage_completion(value: &str) -> bool {
    Regex::new(r"(?i)/usage\s+Show plan and on-demand usage")
        .is_ok_and(|expression| expression.is_match(value))
}

fn panel_is_ready(value: &str) -> bool {
    let value = value.to_ascii_lowercase();
    value.contains("esc to close")
        || value.contains("view in dashboard:")
        || value.contains("failed to load usage data")
}

fn parse_usage(output: &str) -> Option<Value> {
    let header = Regex::new(r"(?im)^\s*Usage\s*[•·-]\s*(.*?)\s{2,}Resets\s+(.+?)\s*$")
        .ok()?
        .captures(output);
    let fallback = Regex::new(r"(?im)^\s*Usage\s*[•·-]\s*(.+?)\s*$")
        .ok()?
        .captures(output);
    let plan = header
        .as_ref()
        .and_then(|capture| capture.get(1))
        .or_else(|| fallback.as_ref().and_then(|capture| capture.get(1)))
        .map(|value| value.as_str().trim().to_owned())
        .filter(|value| !value.is_empty());
    let reset_description = header
        .as_ref()
        .and_then(|capture| capture.get(2))
        .map(|value| value.as_str().trim().to_owned())
        .filter(|value| !value.is_empty());
    let resets_at = reset_description.as_deref().and_then(reset_timestamp);
    let included = used_percent(output, "Included");
    let auto = used_percent(output, "Auto");
    let api = used_percent(output, "API");
    if included.is_none() && auto.is_none() && api.is_none() {
        return None;
    }
    let window = |percent| {
        let mut value = super::window(percent, MONTHLY_WINDOW_MINUTES, resets_at);
        if let Some(object) = value.as_object_mut() {
            object.insert(
                "resetDescription".to_owned(),
                reset_description.clone().map_or(Value::Null, Value::String),
            );
        }
        value
    };
    let buckets = [("Included", included), ("Auto", auto), ("API", api)]
        .into_iter()
        .filter_map(|(name, percent)| {
            let mut value = window(percent?);
            value
                .as_object_mut()?
                .insert("name".to_owned(), Value::String(name.to_owned()));
            Some(value)
        })
        .collect::<Vec<_>>();
    Some(json!({
        "provider": "cursor",
        "session": null,
        "weekly": null,
        "monthly": included.map(window),
        "buckets": buckets,
        "planType": plan,
        "updatedAt": super::now_ms_lossy(),
        "error": null,
        "status": "ok",
        "usageMetadata": { "source": "cli" }
    }))
}

fn used_percent(output: &str, label: &str) -> Option<f64> {
    Regex::new(&format!(
        r"(?im)^\s*{}\s+(\d{{1,3}}(?:\.\d+)?)%\s+used\b",
        regex::escape(label)
    ))
    .ok()?
    .captures(output)?
    .get(1)?
    .as_str()
    .parse::<f64>()
    .ok()
    .filter(|value| value.is_finite())
    .map(|value| value.clamp(0.0, 100.0))
}

fn reset_timestamp(description: &str) -> Option<f64> {
    let capture = Regex::new(
        r"(?i)\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:,\s*(\d{4}))?\b",
    )
    .ok()?
    .captures(description)?;
    let month = match capture.get(1)?.as_str().to_ascii_lowercase().as_str() {
        "jan" => 1,
        "feb" => 2,
        "mar" => 3,
        "apr" => 4,
        "may" => 5,
        "jun" => 6,
        "jul" => 7,
        "aug" => 8,
        "sep" => 9,
        "oct" => 10,
        "nov" => 11,
        "dec" => 12,
        _ => return None,
    };
    let day = capture.get(2)?.as_str().parse::<u32>().ok()?;
    let now = chrono::Utc::now();
    let explicit_year = capture
        .get(3)
        .and_then(|value| value.as_str().parse::<i32>().ok());
    let mut year = explicit_year.unwrap_or_else(|| chrono::Datelike::year(&now));
    let timestamp = |year| {
        chrono::NaiveDate::from_ymd_opt(year, month, day)
            .and_then(|date| date.and_hms_opt(0, 0, 0))
            .map(|date| date.and_utc().timestamp_millis() as f64)
    };
    let mut value = timestamp(year)?;
    if explicit_year.is_none() && value < super::now_ms_lossy() - 24.0 * 60.0 * 60.0 * 1_000.0 {
        year += 1;
        value = timestamp(year)?;
    }
    Some(value)
}

fn describe_failure(output: &str) -> &'static str {
    let output = output.to_ascii_lowercase();
    if output.contains("failed to load usage data") {
        "Cursor usage is unavailable right now."
    } else if output.contains("unknown command")
        || output.contains("command not found")
        || output.contains("not recognized")
    {
        "This Cursor Agent version does not expose usage details. Update cursor-agent and retry."
    } else {
        "Cursor usage panel did not return usage details."
    }
}

fn unavailable(message: &str) -> Value {
    json!({
        "provider": "cursor",
        "session": null,
        "weekly": null,
        "updatedAt": super::now_ms_lossy(),
        "error": message,
        "status": "unavailable",
        "usageMetadata": { "failureKind": "usage-unavailable", "source": "cli" }
    })
}

fn error(message: &str, failure: &str) -> Value {
    json!({
        "provider": "cursor",
        "session": null,
        "weekly": null,
        "updatedAt": super::now_ms_lossy(),
        "error": message,
        "status": "error",
        "usageMetadata": { "failureKind": failure, "source": "cli" }
    })
}
