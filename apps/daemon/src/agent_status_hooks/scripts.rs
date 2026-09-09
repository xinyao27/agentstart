pub(super) fn claude() -> String {
    script("claude", false, false)
}

pub(super) fn gemini() -> String {
    script("gemini", true, false)
}

pub(super) fn codex() -> String {
    script("codex", false, true)
}

pub(super) fn standard(provider: &str, emits_empty_object: bool) -> String {
    script(provider, emits_empty_object, false)
}

#[cfg(not(windows))]
pub(super) fn command_code() -> String {
    include_str!("assets/command-code-hook.sh").to_owned()
}

#[cfg(windows)]
pub(super) fn command_code() -> String {
    let base = standard("command-code", false);
    let needle = "if \"%YIRU_AGENT_HOOK_PORT%\"==\"\" goto :yiru_agent_hook_drain_stdin\r\n";
    let recovery = concat!(
        "if not \"%YIRU_AGENT_HOOK_TOKEN%\"==\"\" goto :yiru_command_code_ready\r\n",
        "if not defined APPDATA goto :yiru_command_code_ready\r\n",
        "for /r \"%APPDATA%\\yiru-dev\\agent-hooks\" %%F in (endpoint.cmd) do if \"%YIRU_AGENT_HOOK_TOKEN%\"==\"\" call \"%%~fF\" 2>nul\r\n",
        "for /r \"%APPDATA%\\yiru\\agent-hooks\" %%F in (endpoint.cmd) do if \"%YIRU_AGENT_HOOK_TOKEN%\"==\"\" call \"%%~fF\" 2>nul\r\n",
        ":yiru_command_code_ready\r\n",
    );
    base.replacen(needle, &format!("{recovery}{needle}"), 1)
}

#[cfg(not(windows))]
pub(super) fn copilot() -> String {
    include_str!("assets/copilot-hook.sh").to_owned()
}

#[cfg(windows)]
pub(super) fn copilot() -> String {
    r#"Write-Output '{}'
$inputData = [Console]::In.ReadToEnd()
if ($env:YIRU_AGENT_HOOK_ENDPOINT -and (Test-Path -LiteralPath $env:YIRU_AGENT_HOOK_ENDPOINT)) {
  try {
    Get-Content -LiteralPath $env:YIRU_AGENT_HOOK_ENDPOINT | ForEach-Object {
      if ($_ -match '^set ([A-Za-z0-9_]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
      }
    }
  } catch {}
}
if (-not $env:YIRU_AGENT_HOOK_PORT -or -not $env:YIRU_AGENT_HOOK_TOKEN -or -not $env:YIRU_PANE_KEY) { exit 0 }
if ([string]::IsNullOrWhiteSpace($inputData)) { exit 0 }
try {
  $body = @{ paneKey=$env:YIRU_PANE_KEY; launchToken=$env:YIRU_AGENT_LAUNCH_TOKEN; tabId=$env:YIRU_TAB_ID; worktreeId=$env:YIRU_WORKTREE_ID; hookEventName=$env:YIRU_COPILOT_HOOK_EVENT; env=$env:YIRU_AGENT_HOOK_ENV; version=$env:YIRU_AGENT_HOOK_VERSION; payload=($inputData | ConvertFrom-Json) } | ConvertTo-Json -Depth 100
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri ('http://127.0.0.1:' + $env:YIRU_AGENT_HOOK_PORT + '/hook/copilot') -Headers @{ 'Content-Type'='application/json'; 'X-Yiru-Agent-Hook-Token'=$env:YIRU_AGENT_HOOK_TOKEN } -Body $body -TimeoutSec 2 | Out-Null
} catch {}
exit 0
"#
    .replace('\n', "\r\n")
}

#[cfg(not(windows))]
pub(super) fn grok() -> String {
    include_str!("assets/grok-hook.sh").to_owned()
}

#[cfg(windows)]
pub(super) fn grok() -> String {
    let base = with_event("grok", "grokHome", "YIRU_GROK_HOME", false);
    base.replacen(
        "setlocal\r\n",
        concat!(
            "setlocal\r\n",
            "set \"YIRU_GROK_HOME=%GROK_HOME%\"\r\n",
            "if not \"%GROK_HOME:~4096,1%\"==\"\" set \"YIRU_GROK_HOME=\"\r\n",
            "if \"%YIRU_GROK_HOME:~-1%\"==\"\\\" set \"YIRU_GROK_HOME=%YIRU_GROK_HOME%.\"\r\n",
        ),
        1,
    )
}

#[cfg(windows)]
pub(super) fn with_event(
    provider: &str,
    field_name: &str,
    event_variable: &str,
    emits_empty_object: bool,
) -> String {
    let base = standard(provider, emits_empty_object);
    let needle = "--data-urlencode \"env=%YIRU_AGENT_HOOK_ENV%\"";
    let event = format!("--data-urlencode \"{field_name}=%{event_variable}%\" ");
    base.replacen(needle, &format!("{event}{needle}"), 1)
}

#[cfg(not(windows))]
pub(super) fn antigravity() -> String {
    include_str!("assets/antigravity-hook.sh").to_owned()
}

#[cfg(windows)]
pub(super) fn antigravity() -> String {
    let post = r#""%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$utf8=[System.Text.UTF8Encoding]::new($false); [Console]::InputEncoding=$utf8; [Console]::OutputEncoding=$utf8; $inputData=[Console]::In.ReadToEnd(); try { $payload=if ([string]::IsNullOrWhiteSpace($inputData)) { @{} } else { $inputData | ConvertFrom-Json }; $body=@{ paneKey=$env:YIRU_PANE_KEY; launchToken=$env:YIRU_AGENT_LAUNCH_TOKEN; tabId=$env:YIRU_TAB_ID; worktreeId=$env:YIRU_WORKTREE_ID; env=$env:YIRU_AGENT_HOOK_ENV; version=$env:YIRU_AGENT_HOOK_VERSION; hook_event_name=$env:YIRU_ANTIGRAVITY_EVENT; payload=$payload } | ConvertTo-Json -Depth 100 -Compress; $bodyBytes=$utf8.GetBytes($body); Invoke-WebRequest -UseBasicParsing -Method Post -Uri ('http://127.0.0.1:' + $env:YIRU_AGENT_HOOK_PORT + '/hook/antigravity') -ContentType 'application/json; charset=utf-8' -Headers @{ 'X-Yiru-Agent-Hook-Token'=$env:YIRU_AGENT_HOOK_TOKEN } -Body $bodyBytes -TimeoutSec 2 | Out-Null } catch {}""#;
    [
        "@echo off",
        "setlocal",
        "if /I \"%YIRU_ANTIGRAVITY_EVENT%\"==\"Stop\" (",
        "  echo {\"decision\":\"\"}",
        ") else (",
        "  echo {}",
        ")",
        "if defined YIRU_AGENT_HOOK_ENDPOINT if exist \"%YIRU_AGENT_HOOK_ENDPOINT%\" call \"%YIRU_AGENT_HOOK_ENDPOINT%\" 2>nul",
        "if \"%YIRU_AGENT_HOOK_PORT%\"==\"\" goto :yiru_agent_hook_drain_stdin",
        "if \"%YIRU_AGENT_HOOK_TOKEN%\"==\"\" goto :yiru_agent_hook_drain_stdin",
        "if \"%YIRU_PANE_KEY%\"==\"\" goto :yiru_agent_hook_drain_stdin",
        post,
        "exit /b 0",
        ":yiru_agent_hook_drain_stdin",
        r#""%SystemRoot%\System32\more.com" >nul 2>nul"#,
        "exit /b 0",
        "",
    ]
    .join("\r\n")
}

#[cfg(windows)]
pub(super) fn antigravity_wrapper(event: &str) -> String {
    [
        "@echo off".to_owned(),
        "setlocal".to_owned(),
        format!("set \"YIRU_ANTIGRAVITY_EVENT={event}\""),
        "set \"YIRU_ANTIGRAVITY_CORE=%~dp0antigravity-hook.cmd\"".to_owned(),
        "if exist \"%YIRU_ANTIGRAVITY_CORE%\" (".to_owned(),
        "  call \"%YIRU_ANTIGRAVITY_CORE%\"".to_owned(),
        "  exit /b 0".to_owned(),
        ")".to_owned(),
        "if /I \"%YIRU_ANTIGRAVITY_EVENT%\"==\"Stop\" (".to_owned(),
        "  echo {\"decision\":\"\"}".to_owned(),
        ") else (".to_owned(),
        "  echo {}".to_owned(),
        ")".to_owned(),
        r#""%SystemRoot%\System32\more.com" >nul 2>nul"#.to_owned(),
        "exit /b 0".to_owned(),
        String::new(),
    ]
    .join("\r\n")
}

pub(super) fn kimi() -> String {
    let post = posix_post_command("kimi");
    format!(
        "#!/bin/sh\npayload=$(cat)\nif [ -z \"$payload\" ]; then\n  exit 0\nfi\nif [ -n \"$YIRU_AGENT_HOOK_ENDPOINT\" ] && [ -r \"$YIRU_AGENT_HOOK_ENDPOINT\" ]; then\n  . \"$YIRU_AGENT_HOOK_ENDPOINT\" 2>/dev/null || :\nfi\nif [ -z \"$YIRU_AGENT_HOOK_PORT\" ] || [ -z \"$YIRU_AGENT_HOOK_TOKEN\" ] || [ -z \"$YIRU_PANE_KEY\" ]; then\n  exit 0\nfi\n{post}\nexit 0\n"
    )
}

#[cfg(not(windows))]
fn script(provider: &str, emits_empty_object: bool, handles_wsl: bool) -> String {
    let mut lines = vec!["#!/bin/sh".to_owned()];
    if emits_empty_object {
        lines.push("printf \"{}\\n\"".to_owned());
    }
    lines.extend([
        "payload=$(cat)".to_owned(),
        "if [ -z \"$payload\" ]; then".to_owned(),
        "  exit 0".to_owned(),
        "fi".to_owned(),
    ]);
    if provider == "claude" {
        lines.extend([
            "if [ -n \"$DEVIN_PROJECT_DIR\" ]; then".to_owned(),
            "  exit 0".to_owned(),
            "fi".to_owned(),
        ]);
    }
    if handles_wsl {
        lines.extend(codex_endpoint_loader());
    } else {
        lines.extend([
            "if [ -n \"$YIRU_AGENT_HOOK_ENDPOINT\" ] && [ -r \"$YIRU_AGENT_HOOK_ENDPOINT\" ]; then"
                .to_owned(),
            "  . \"$YIRU_AGENT_HOOK_ENDPOINT\" 2>/dev/null || :".to_owned(),
            "fi".to_owned(),
        ]);
    }
    lines.extend([
        "if [ -z \"$YIRU_AGENT_HOOK_PORT\" ] || [ -z \"$YIRU_AGENT_HOOK_TOKEN\" ] || [ -z \"$YIRU_PANE_KEY\" ]; then".to_owned(),
        "  exit 0".to_owned(),
        "fi".to_owned(),
        post_command(provider),
        "exit 0".to_owned(),
        String::new(),
    ]);
    lines.join("\n")
}

#[cfg(windows)]
fn script(provider: &str, emits_empty_object: bool, _handles_wsl: bool) -> String {
    let mut lines = vec!["@echo off".to_owned(), "setlocal".to_owned()];
    if emits_empty_object {
        lines.push("echo {}".to_owned());
    }
    if provider == "claude" {
        lines.push(
            "if not \"%DEVIN_PROJECT_DIR%\"==\"\" goto :yiru_agent_hook_drain_stdin".to_owned(),
        );
    }
    lines.extend([
        "if defined YIRU_AGENT_HOOK_ENDPOINT if exist \"%YIRU_AGENT_HOOK_ENDPOINT%\" call \"%YIRU_AGENT_HOOK_ENDPOINT%\" 2>nul".to_owned(),
        "if \"%YIRU_AGENT_HOOK_PORT%\"==\"\" goto :yiru_agent_hook_drain_stdin".to_owned(),
        "if \"%YIRU_AGENT_HOOK_TOKEN%\"==\"\" goto :yiru_agent_hook_drain_stdin".to_owned(),
        "if \"%YIRU_PANE_KEY%\"==\"\" goto :yiru_agent_hook_drain_stdin".to_owned(),
        windows_post_command(provider),
        "exit /b 0".to_owned(),
        ":yiru_agent_hook_drain_stdin".to_owned(),
        r#""%SystemRoot%\System32\more.com" >nul 2>nul"#.to_owned(),
        "exit /b 0".to_owned(),
        String::new(),
    ]);
    lines.join("\r\n")
}

#[cfg(not(windows))]
fn codex_endpoint_loader() -> Vec<String> {
    [
        "load_hook_endpoint() {",
        "  endpoint_path=\"$1\"",
        "  case \"$endpoint_path\" in",
        "    *.cmd)",
        "      endpoint_cr=$(printf \"\\r\")",
        "      while IFS= read -r endpoint_line || [ -n \"$endpoint_line\" ]; do",
        "        endpoint_line=${endpoint_line%\"$endpoint_cr\"}",
        "        case \"$endpoint_line\" in",
        "          \"set YIRU_AGENT_HOOK_PORT=\"*) YIRU_AGENT_HOOK_PORT=${endpoint_line#*=} ;;",
        "          \"set YIRU_AGENT_HOOK_TOKEN=\"*) YIRU_AGENT_HOOK_TOKEN=${endpoint_line#*=} ;;",
        "          \"set YIRU_AGENT_HOOK_ENV=\"*) YIRU_AGENT_HOOK_ENV=${endpoint_line#*=} ;;",
        "          \"set YIRU_AGENT_HOOK_VERSION=\"*) YIRU_AGENT_HOOK_VERSION=${endpoint_line#*=} ;;",
        "        esac",
        "      done < \"$endpoint_path\"",
        "      ;;",
        "    *) . \"$endpoint_path\" 2>/dev/null || : ;;",
        "  esac",
        "}",
        "if [ -n \"$YIRU_AGENT_HOOK_ENDPOINT\" ] && [ -r \"$YIRU_AGENT_HOOK_ENDPOINT\" ]; then",
        "  load_hook_endpoint \"$YIRU_AGENT_HOOK_ENDPOINT\"",
        "fi",
    ]
    .into_iter()
    .map(str::to_owned)
    .collect()
}

#[cfg(not(windows))]
fn post_command(provider: &str) -> String {
    posix_post_command(provider)
}

fn posix_post_command(provider: &str) -> String {
    format!(
        r#"printf '%s' "$payload" | curl -sS -X POST "http://127.0.0.1:${{YIRU_AGENT_HOOK_PORT}}/hook/{provider}" \
  --connect-timeout 0.5 --max-time 1.5 \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Yiru-Agent-Hook-Token: ${{YIRU_AGENT_HOOK_TOKEN}}" \
  --data-urlencode "paneKey=${{YIRU_PANE_KEY}}" \
  --data-urlencode "tabId=${{YIRU_TAB_ID}}" \
  --data-urlencode "launchToken=${{YIRU_AGENT_LAUNCH_TOKEN}}" \
  --data-urlencode "worktreeId=${{YIRU_WORKTREE_ID}}" \
  --data-urlencode "env=${{YIRU_AGENT_HOOK_ENV}}" \
  --data-urlencode "version=${{YIRU_AGENT_HOOK_VERSION}}" \
  --data-urlencode "payload@-" >/dev/null 2>&1 || true"#
    )
}

#[cfg(windows)]
fn windows_post_command(provider: &str) -> String {
    format!(
        r#""%SystemRoot%\System32\curl.exe" -sS -X POST "http://127.0.0.1:%YIRU_AGENT_HOOK_PORT%/hook/{provider}" --connect-timeout 0.5 --max-time 1.5 -H "Content-Type: application/x-www-form-urlencoded" -H "X-Yiru-Agent-Hook-Token: %YIRU_AGENT_HOOK_TOKEN%" --data-urlencode "paneKey=%YIRU_PANE_KEY%" --data-urlencode "tabId=%YIRU_TAB_ID%" --data-urlencode "launchToken=%YIRU_AGENT_LAUNCH_TOKEN%" --data-urlencode "worktreeId=%YIRU_WORKTREE_ID%" --data-urlencode "env=%YIRU_AGENT_HOOK_ENV%" --data-urlencode "version=%YIRU_AGENT_HOOK_VERSION%" --data-urlencode "payload@-" >nul 2>&1"#
    )
}
