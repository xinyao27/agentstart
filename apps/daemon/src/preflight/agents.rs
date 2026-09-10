use std::collections::HashSet;

use futures_util::future::join_all;

use crate::hosts::HostPlatform;

use super::target::{ProbeTarget, shell_quote};

const DETECTION_TIMEOUT_MS: u64 = 10_000;
const PREFIX: &str = "__AGENTSTART_AGENT_PATH__";

struct AgentProbe {
    id: &'static str,
    command: &'static str,
}

const PROBES: &[AgentProbe] = &[
    probe("claude", "claude"),
    probe("openclaude", "openclaude"),
    probe("codex", "codex"),
    probe("autohand", "autohand"),
    probe("ante", "ante"),
    probe("trae", "traecli"),
    probe("opencode", "opencode"),
    probe("mimo-code", "mimo"),
    probe("pi", "pi"),
    probe("omp", "omp"),
    probe("gemini", "gemini"),
    probe("antigravity", "agy"),
    probe("aider", "aider"),
    probe("goose", "goose"),
    probe("amp", "amp"),
    probe("kilo", "kilo"),
    probe("kiro", "kiro-cli"),
    probe("crush", "crush"),
    probe("aug", "auggie"),
    probe("cline", "cline"),
    probe("codebuff", "codebuff"),
    probe("command-code", "command-code"),
    probe("continue", "cn"),
    probe("cursor", "cursor-agent"),
    probe("droid", "droid"),
    probe("kimi", "kimi"),
    probe("mistral-vibe", "vibe"),
    probe("mistral-vibe", "mistral-vibe"),
    probe("qwen-code", "qwen"),
    probe("rovo", "rovo"),
    probe("hermes", "hermes"),
    probe("openclaw", "openclaw"),
    probe("copilot", "copilot"),
    probe("grok", "grok"),
    probe("devin", "devin"),
];

const fn probe(id: &'static str, command: &'static str) -> AgentProbe {
    AgentProbe { id, command }
}

pub(super) async fn detect(target: &ProbeTarget, path: &str) -> Vec<String> {
    let commands = unique_commands();
    let found = if target.platform() == HostPlatform::Windows {
        detect_windows(target, &commands, path).await
    } else {
        detect_posix(target, &commands, path).await
    };
    let mut ids = HashSet::new();
    PROBES
        .iter()
        .filter(|probe| found.contains(probe.command))
        .filter(|probe| ids.insert(probe.id))
        .map(|probe| probe.id.to_owned())
        .collect()
}

fn unique_commands() -> Vec<&'static str> {
    let mut seen = HashSet::new();
    PROBES
        .iter()
        .map(|probe| probe.command)
        .filter(|command| seen.insert(*command))
        .collect()
}

async fn detect_windows(
    target: &ProbeTarget,
    commands: &[&'static str],
    path: &str,
) -> HashSet<String> {
    let checks = join_all(commands.iter().copied().map(|command| {
        let target = target.clone();
        let path = path.to_owned();
        async move {
            let output = target
                .command("where", &[command], Some(&path))
                .await
                .ok()?;
            (output.exit_code == 0
                && output
                    .stdout
                    .lines()
                    .map(str::trim)
                    .any(is_windows_absolute))
            .then_some(command.to_owned())
        }
    }))
    .await;
    let mut found: HashSet<String> = checks.into_iter().flatten().collect();
    let script = windows_fallback_script(commands);
    if let Ok(output) = target
        .command("cmd.exe", &["/D", "/S", "/C", &script], Some(path))
        .await
    {
        found.extend(parse_windows_found(&output.stdout));
    }
    found
}

async fn detect_posix(
    target: &ProbeTarget,
    commands: &[&'static str],
    path: &str,
) -> HashSet<String> {
    if commands.is_empty() {
        return HashSet::new();
    }
    let list = commands
        .iter()
        .map(|command| shell_quote(command))
        .collect::<Vec<_>>()
        .join(" ");
    let path_seed = if target.is_wsl() {
        String::new()
    } else {
        format!("PATH={}\n", shell_quote(path))
    };
    let script = format!(
        "{path_seed}for cmd in {list}; do\n{}\n{}\ndone",
        lookup_script(),
        fallback_script(target.platform())
    );
    let Ok(output) = target.script(&script, DETECTION_TIMEOUT_MS).await else {
        return HashSet::new();
    };
    parse_found(&output.stdout)
}

fn lookup_script() -> &'static str {
    r#"resolved=
remaining=${PATH-}
while :; do
  case "$remaining" in
    *:*) component=${remaining%%:*}; remaining=${remaining#*:}; more=1 ;;
    *) component=$remaining; more= ;;
  esac
  [ -n "$component" ] || component=.
  case "$component" in /*) candidate=$component/$cmd ;; *) candidate=${PWD%/}/$component/$cmd ;; esac
  if [ -x "$candidate" ] && [ ! -d "$candidate" ]; then resolved=$candidate; break; fi
  [ -n "$more" ] || break
done"#
}

fn fallback_script(platform: HostPlatform) -> &'static str {
    if platform == HostPlatform::Darwin {
        r#"if [ -z "$resolved" ]; then
  for candidate in \
    "$HOME"/.nvm/versions/node/*/bin/"$cmd" \
    "$HOME"/.volta/bin/"$cmd" "$HOME"/.asdf/shims/"$cmd" \
    "$HOME"/.fnm/aliases/default/bin/"$cmd" "$HOME"/.local/share/mise/shims/"$cmd" \
    "$HOME"/.local/bin/"$cmd" "$HOME"/Library/pnpm/"$cmd" \
    "$HOME"/.yarn/bin/"$cmd" "$HOME"/.bun/bin/"$cmd"; do
    if [ -x "$candidate" ] && [ ! -d "$candidate" ]; then resolved=$candidate; break; fi
  done
fi
if [ -n "$resolved" ]; then printf '__AGENTSTART_AGENT_PATH__%s\t%s\n' "$cmd" "$resolved"; fi"#
    } else {
        r#"if [ -z "$resolved" ]; then
  for candidate in \
    "$HOME"/.nvm/versions/node/*/bin/"$cmd" \
    "$HOME"/.volta/bin/"$cmd" "$HOME"/.asdf/shims/"$cmd" \
    "$HOME"/.fnm/aliases/default/bin/"$cmd" "$HOME"/.local/share/mise/shims/"$cmd" \
    "$HOME"/.local/bin/"$cmd" "$HOME"/.local/share/pnpm/"$cmd" \
    "$HOME"/.yarn/bin/"$cmd" "$HOME"/.bun/bin/"$cmd"; do
    if [ -x "$candidate" ] && [ ! -d "$candidate" ]; then resolved=$candidate; break; fi
  done
fi
if [ -n "$resolved" ]; then printf '__AGENTSTART_AGENT_PATH__%s\t%s\n' "$cmd" "$resolved"; fi"#
    }
}

fn parse_found(stdout: &str) -> HashSet<String> {
    stdout
        .lines()
        .map(str::trim)
        .filter_map(|line| line.strip_prefix(PREFIX))
        .filter_map(|payload| payload.split_once('\t'))
        .filter(|(_, path)| path.starts_with('/'))
        .map(|(command, _)| command.to_owned())
        .collect()
}

fn windows_fallback_script(commands: &[&str]) -> String {
    let directories = [
        r"%USERPROFILE%\.volta\bin",
        r"%USERPROFILE%\.asdf\shims",
        r"%USERPROFILE%\.fnm\aliases\default\bin",
        r"%USERPROFILE%\.local\share\mise\shims",
        r"%USERPROFILE%\.local\bin",
        r"%USERPROFILE%\AppData\Roaming\npm",
        r"%USERPROFILE%\AppData\Local\pnpm",
        r"%USERPROFILE%\AppData\Local\Yarn\bin",
        r"%USERPROFILE%\.bun\bin",
    ];
    let mut lines = Vec::new();
    for command in commands {
        let candidates = directories
            .iter()
            .flat_map(|directory| {
                windows_names(command).map(move |name| format!("{directory}\\{name}"))
            })
            .chain(
                windows_names(command)
                    .map(|name| format!(r"%USERPROFILE%\.nvm\versions\node\*\{name}")),
            )
            .map(|candidate| format!(r#""{candidate}""#))
            .collect::<Vec<_>>()
            .join(" ");
        lines.push(format!(
            r#"for %P in ({candidates}) do @if exist "%~fP" if not exist "%~fP\" echo {PREFIX}{command}	%~fP"#
        ));
    }
    lines.join(" & ")
}

fn windows_names(command: &str) -> impl Iterator<Item = String> + '_ {
    ["cmd", "exe", "bat", ""].into_iter().map(move |extension| {
        if extension.is_empty() {
            command.to_owned()
        } else {
            format!("{command}.{extension}")
        }
    })
}

fn parse_windows_found(stdout: &str) -> HashSet<String> {
    stdout
        .lines()
        .map(str::trim)
        .filter_map(|line| line.strip_prefix(PREFIX))
        .filter_map(|payload| payload.split_once('\t'))
        .filter(|(_, path)| is_windows_absolute(path))
        .map(|(command, _)| command.to_owned())
        .collect()
}

fn is_windows_absolute(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/')
        || path.starts_with("\\\\")
}
