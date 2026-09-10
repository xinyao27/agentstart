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
    let needle =
        "if \"%AGENTSTART_AGENT_HOOK_PORT%\"==\"\" goto :agentstart_agent_hook_drain_stdin\r\n";
    let recovery = concat!(
        "if not \"%AGENTSTART_AGENT_HOOK_TOKEN%\"==\"\" goto :agentstart_command_code_ready\r\n",
        "if not defined APPDATA goto :agentstart_command_code_ready\r\n",
        "for /r \"%APPDATA%\\agentstart-dev\\agent-hooks\" %%F in (endpoint.cmd) do if \"%AGENTSTART_AGENT_HOOK_TOKEN%\"==\"\" call \"%%~fF\" 2>nul\r\n",
        "for /r \"%APPDATA%\\agentstart\\agent-hooks\" %%F in (endpoint.cmd) do if \"%AGENTSTART_AGENT_HOOK_TOKEN%\"==\"\" call \"%%~fF\" 2>nul\r\n",
        ":agentstart_command_code_ready\r\n",
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
if ($env:AGENTSTART_AGENT_HOOK_ENDPOINT -and (Test-Path -LiteralPath $env:AGENTSTART_AGENT_HOOK_ENDPOINT)) {
  try {
    Get-Content -LiteralPath $env:AGENTSTART_AGENT_HOOK_ENDPOINT | ForEach-Object {
      if ($_ -match '^set ([A-Za-z0-9_]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
      }
    }
  } catch {}
}
if (-not $env:AGENTSTART_AGENT_HOOK_PORT -or -not $env:AGENTSTART_AGENT_HOOK_TOKEN -or -not $env:AGENTSTART_PANE_KEY) { exit 0 }
if ([string]::IsNullOrWhiteSpace($inputData)) { exit 0 }
try {
  $body = @{ paneKey=$env:AGENTSTART_PANE_KEY; launchToken=$env:AGENTSTART_AGENT_LAUNCH_TOKEN; tabId=$env:AGENTSTART_TAB_ID; worktreeId=$env:AGENTSTART_WORKTREE_ID; hookEventName=$env:AGENTSTART_COPILOT_HOOK_EVENT; env=$env:AGENTSTART_AGENT_HOOK_ENV; version=$env:AGENTSTART_AGENT_HOOK_VERSION; payload=($inputData | ConvertFrom-Json) } | ConvertTo-Json -Depth 100
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri ('http://127.0.0.1:' + $env:AGENTSTART_AGENT_HOOK_PORT + '/hook/copilot') -Headers @{ 'Content-Type'='application/json'; 'X-AgentStart-Agent-Hook-Token'=$env:AGENTSTART_AGENT_HOOK_TOKEN } -Body $body -TimeoutSec 2 | Out-Null
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
    let base = with_event("grok", "grokHome", "AGENTSTART_GROK_HOME", false);
    base.replacen(
        "setlocal\r\n",
        concat!(
            "setlocal\r\n",
            "set \"AGENTSTART_GROK_HOME=%GROK_HOME%\"\r\n",
            "if not \"%GROK_HOME:~4096,1%\"==\"\" set \"AGENTSTART_GROK_HOME=\"\r\n",
            "if \"%AGENTSTART_GROK_HOME:~-1%\"==\"\\\" set \"AGENTSTART_GROK_HOME=%AGENTSTART_GROK_HOME%.\"\r\n",
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
    let needle = "--data-urlencode \"env=%AGENTSTART_AGENT_HOOK_ENV%\"";
    let event = format!("--data-urlencode \"{field_name}=%{event_variable}%\" ");
    base.replacen(needle, &format!("{event}{needle}"), 1)
}

#[cfg(not(windows))]
pub(super) fn antigravity() -> String {
    include_str!("assets/antigravity-hook.sh").to_owned()
}

#[cfg(windows)]
pub(super) fn antigravity() -> String {
    let post = r#""%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$utf8=[System.Text.UTF8Encoding]::new($false); [Console]::InputEncoding=$utf8; [Console]::OutputEncoding=$utf8; $inputData=[Console]::In.ReadToEnd(); try { $payload=if ([string]::IsNullOrWhiteSpace($inputData)) { @{} } else { $inputData | ConvertFrom-Json }; $body=@{ paneKey=$env:AGENTSTART_PANE_KEY; launchToken=$env:AGENTSTART_AGENT_LAUNCH_TOKEN; tabId=$env:AGENTSTART_TAB_ID; worktreeId=$env:AGENTSTART_WORKTREE_ID; env=$env:AGENTSTART_AGENT_HOOK_ENV; version=$env:AGENTSTART_AGENT_HOOK_VERSION; hook_event_name=$env:AGENTSTART_ANTIGRAVITY_EVENT; payload=$payload } | ConvertTo-Json -Depth 100 -Compress; $bodyBytes=$utf8.GetBytes($body); Invoke-WebRequest -UseBasicParsing -Method Post -Uri ('http://127.0.0.1:' + $env:AGENTSTART_AGENT_HOOK_PORT + '/hook/antigravity') -ContentType 'application/json; charset=utf-8' -Headers @{ 'X-AgentStart-Agent-Hook-Token'=$env:AGENTSTART_AGENT_HOOK_TOKEN } -Body $bodyBytes -TimeoutSec 2 | Out-Null } catch {}""#;
    [
        "@echo off",
        "setlocal",
        "if /I \"%AGENTSTART_ANTIGRAVITY_EVENT%\"==\"Stop\" (",
        "  echo {\"decision\":\"\"}",
        ") else (",
        "  echo {}",
        ")",
        "if defined AGENTSTART_AGENT_HOOK_ENDPOINT if exist \"%AGENTSTART_AGENT_HOOK_ENDPOINT%\" call \"%AGENTSTART_AGENT_HOOK_ENDPOINT%\" 2>nul",
        "if \"%AGENTSTART_AGENT_HOOK_PORT%\"==\"\" goto :agentstart_agent_hook_drain_stdin",
        "if \"%AGENTSTART_AGENT_HOOK_TOKEN%\"==\"\" goto :agentstart_agent_hook_drain_stdin",
        "if \"%AGENTSTART_PANE_KEY%\"==\"\" goto :agentstart_agent_hook_drain_stdin",
        post,
        "exit /b 0",
        ":agentstart_agent_hook_drain_stdin",
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
        format!("set \"AGENTSTART_ANTIGRAVITY_EVENT={event}\""),
        "set \"AGENTSTART_ANTIGRAVITY_CORE=%~dp0antigravity-hook.cmd\"".to_owned(),
        "if exist \"%AGENTSTART_ANTIGRAVITY_CORE%\" (".to_owned(),
        "  call \"%AGENTSTART_ANTIGRAVITY_CORE%\"".to_owned(),
        "  exit /b 0".to_owned(),
        ")".to_owned(),
        "if /I \"%AGENTSTART_ANTIGRAVITY_EVENT%\"==\"Stop\" (".to_owned(),
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
        "#!/bin/sh\npayload=$(cat)\nif [ -z \"$payload\" ]; then\n  exit 0\nfi\nif [ -n \"$AGENTSTART_AGENT_HOOK_ENDPOINT\" ] && [ -r \"$AGENTSTART_AGENT_HOOK_ENDPOINT\" ]; then\n  . \"$AGENTSTART_AGENT_HOOK_ENDPOINT\" 2>/dev/null || :\nfi\nif [ -z \"$AGENTSTART_AGENT_HOOK_PORT\" ] || [ -z \"$AGENTSTART_AGENT_HOOK_TOKEN\" ] || [ -z \"$AGENTSTART_PANE_KEY\" ]; then\n  exit 0\nfi\n{post}\nexit 0\n"
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
            "if [ -n \"$AGENTSTART_AGENT_HOOK_ENDPOINT\" ] && [ -r \"$AGENTSTART_AGENT_HOOK_ENDPOINT\" ]; then"
                .to_owned(),
            "  . \"$AGENTSTART_AGENT_HOOK_ENDPOINT\" 2>/dev/null || :".to_owned(),
            "fi".to_owned(),
        ]);
    }
    lines.extend([
        "if [ -z \"$AGENTSTART_AGENT_HOOK_PORT\" ] || [ -z \"$AGENTSTART_AGENT_HOOK_TOKEN\" ] || [ -z \"$AGENTSTART_PANE_KEY\" ]; then".to_owned(),
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
            "if not \"%DEVIN_PROJECT_DIR%\"==\"\" goto :agentstart_agent_hook_drain_stdin"
                .to_owned(),
        );
    }
    lines.extend([
        "if defined AGENTSTART_AGENT_HOOK_ENDPOINT if exist \"%AGENTSTART_AGENT_HOOK_ENDPOINT%\" call \"%AGENTSTART_AGENT_HOOK_ENDPOINT%\" 2>nul".to_owned(),
        "if \"%AGENTSTART_AGENT_HOOK_PORT%\"==\"\" goto :agentstart_agent_hook_drain_stdin".to_owned(),
        "if \"%AGENTSTART_AGENT_HOOK_TOKEN%\"==\"\" goto :agentstart_agent_hook_drain_stdin".to_owned(),
        "if \"%AGENTSTART_PANE_KEY%\"==\"\" goto :agentstart_agent_hook_drain_stdin".to_owned(),
        windows_post_command(provider),
        "exit /b 0".to_owned(),
        ":agentstart_agent_hook_drain_stdin".to_owned(),
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
        "          \"set AGENTSTART_AGENT_HOOK_PORT=\"*) AGENTSTART_AGENT_HOOK_PORT=${endpoint_line#*=} ;;",
        "          \"set AGENTSTART_AGENT_HOOK_TOKEN=\"*) AGENTSTART_AGENT_HOOK_TOKEN=${endpoint_line#*=} ;;",
        "          \"set AGENTSTART_AGENT_HOOK_ENV=\"*) AGENTSTART_AGENT_HOOK_ENV=${endpoint_line#*=} ;;",
        "          \"set AGENTSTART_AGENT_HOOK_VERSION=\"*) AGENTSTART_AGENT_HOOK_VERSION=${endpoint_line#*=} ;;",
        "        esac",
        "      done < \"$endpoint_path\"",
        "      ;;",
        "    *) . \"$endpoint_path\" 2>/dev/null || : ;;",
        "  esac",
        "}",
        "if [ -n \"$AGENTSTART_AGENT_HOOK_ENDPOINT\" ] && [ -r \"$AGENTSTART_AGENT_HOOK_ENDPOINT\" ]; then",
        "  load_hook_endpoint \"$AGENTSTART_AGENT_HOOK_ENDPOINT\"",
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
        r#"printf '%s' "$payload" | curl -sS -X POST "http://127.0.0.1:${{AGENTSTART_AGENT_HOOK_PORT}}/hook/{provider}" \
  --connect-timeout 0.5 --max-time 1.5 \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-AgentStart-Agent-Hook-Token: ${{AGENTSTART_AGENT_HOOK_TOKEN}}" \
  --data-urlencode "paneKey=${{AGENTSTART_PANE_KEY}}" \
  --data-urlencode "tabId=${{AGENTSTART_TAB_ID}}" \
  --data-urlencode "launchToken=${{AGENTSTART_AGENT_LAUNCH_TOKEN}}" \
  --data-urlencode "worktreeId=${{AGENTSTART_WORKTREE_ID}}" \
  --data-urlencode "env=${{AGENTSTART_AGENT_HOOK_ENV}}" \
  --data-urlencode "version=${{AGENTSTART_AGENT_HOOK_VERSION}}" \
  --data-urlencode "payload@-" >/dev/null 2>&1 || true"#
    )
}

#[cfg(windows)]
fn windows_post_command(provider: &str) -> String {
    format!(
        r#""%SystemRoot%\System32\curl.exe" -sS -X POST "http://127.0.0.1:%AGENTSTART_AGENT_HOOK_PORT%/hook/{provider}" --connect-timeout 0.5 --max-time 1.5 -H "Content-Type: application/x-www-form-urlencoded" -H "X-AgentStart-Agent-Hook-Token: %AGENTSTART_AGENT_HOOK_TOKEN%" --data-urlencode "paneKey=%AGENTSTART_PANE_KEY%" --data-urlencode "tabId=%AGENTSTART_TAB_ID%" --data-urlencode "launchToken=%AGENTSTART_AGENT_LAUNCH_TOKEN%" --data-urlencode "worktreeId=%AGENTSTART_WORKTREE_ID%" --data-urlencode "env=%AGENTSTART_AGENT_HOOK_ENV%" --data-urlencode "version=%AGENTSTART_AGENT_HOOK_VERSION%" --data-urlencode "payload@-" >nul 2>&1"#
    )
}
