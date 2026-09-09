use crate::hosts::HostPlatform;

use super::model::AiVaultAgent;

pub(super) fn command(
    agent: AiVaultAgent,
    session_id: &str,
    file_path: &str,
    cwd: Option<&str>,
    codex_home: Option<&str>,
    platform: HostPlatform,
) -> String {
    let base = match agent {
        AiVaultAgent::Antigravity => "agy",
        AiVaultAgent::Claude => "claude",
        AiVaultAgent::Codex => "codex",
        AiVaultAgent::Copilot => "copilot",
        AiVaultAgent::Cursor => "cursor-agent",
        AiVaultAgent::Devin => "devin",
        AiVaultAgent::Droid => "droid",
        AiVaultAgent::Gemini => "gemini",
        AiVaultAgent::Grok => "grok",
        AiVaultAgent::Hermes => "hermes",
        AiVaultAgent::Kimi => "kimi",
        AiVaultAgent::Omp => "omp",
        AiVaultAgent::Openclaw => "openclaw",
        AiVaultAgent::Opencode => "opencode",
        AiVaultAgent::Pi => "pi",
        AiVaultAgent::Rovo => "acli",
    };
    let target = if agent == AiVaultAgent::Omp {
        file_path
    } else {
        session_id
    };
    let argument = quote(target, platform);
    let invocation = match agent {
        AiVaultAgent::Codex => format!("{base} resume {argument}"),
        AiVaultAgent::Rovo => format!("{base} rovodev run --restore {argument}"),
        AiVaultAgent::Opencode | AiVaultAgent::Pi | AiVaultAgent::Kimi => {
            format!("{base} --session {argument}")
        }
        AiVaultAgent::Copilot => format!("{base} --resume={argument}"),
        AiVaultAgent::Antigravity => format!("{base} --conversation {argument}"),
        _ => format!("{base} --resume {argument}"),
    };
    let invocation = match codex_home.filter(|value| !value.trim().is_empty()) {
        Some(home) if platform == HostPlatform::Windows => {
            format!(
                "set {} && {invocation}",
                quote(&format!("CODEX_HOME={home}"), platform)
            )
        }
        Some(home) => format!("CODEX_HOME={} {invocation}", quote(home, platform)),
        None => invocation,
    };
    match cwd.filter(|value| !value.trim().is_empty()) {
        Some(cwd) if platform == HostPlatform::Windows => {
            let inner = format!("cd /d {} && {invocation}", quote(cwd, platform));
            format!("cmd /d /s /c {}", quote(&inner, platform))
        }
        Some(cwd) => format!("cd {} && {invocation}", quote(cwd, platform)),
        None => invocation,
    }
}

fn quote(value: &str, platform: HostPlatform) -> String {
    if platform == HostPlatform::Windows {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        format!("'{}'", value.replace('\'', "'\\''"))
    }
}
