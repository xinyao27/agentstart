use crate::hosts::{HostFilesystem, HostKind};

use super::super::model::AiVaultAgent;

pub(super) fn roots(
    kind: HostKind,
    filesystem: &HostFilesystem,
    home: &str,
    managed_codex_home: Option<&str>,
) -> Vec<Root> {
    let paths = filesystem.paths();
    let mut roots = vec![
        Root::new(
            AiVaultAgent::Claude,
            paths.join(&[home, ".claude", "projects"]),
            &["jsonl"],
            Rule::Claude,
        ),
        Root::new(
            AiVaultAgent::Codex,
            configured_root(kind, "CODEX_HOME", home, ".codex", filesystem),
            &["jsonl"],
            Rule::Any,
        ),
        Root::new(
            AiVaultAgent::Hermes,
            paths.join(&[home, ".hermes", "sessions"]),
            &["json"],
            Rule::Hermes,
        ),
        Root::new(
            AiVaultAgent::Pi,
            normalize_agent_root(
                configured_root(kind, "PI_CODING_AGENT_DIR", home, ".pi", filesystem),
                ".pi",
                filesystem,
            ),
            &["jsonl"],
            Rule::Any,
        ),
        Root::new(
            AiVaultAgent::Omp,
            normalize_agent_root(
                configured_root(kind, "OMP_CODING_AGENT_DIR", home, ".omp", filesystem),
                ".omp",
                filesystem,
            ),
            &["jsonl"],
            Rule::Any,
        ),
        Root::new(
            AiVaultAgent::Cursor,
            paths.join(&[home, ".cursor", "projects"]),
            &["jsonl"],
            Rule::Cursor,
        ),
        Root::new(
            AiVaultAgent::Gemini,
            paths.join(&[home, ".gemini", "tmp"]),
            &["json", "jsonl"],
            Rule::Any,
        ),
        Root::new(
            AiVaultAgent::Antigravity,
            paths.join(&[home, ".gemini", "antigravity-cli", "brain"]),
            &["jsonl"],
            Rule::Antigravity,
        ),
        Root::new(
            AiVaultAgent::Rovo,
            paths.join(&[home, ".rovodev", "sessions"]),
            &["json"],
            Rule::Rovo,
        ),
        Root::new(
            AiVaultAgent::Copilot,
            paths.join(&[
                &configured_root(kind, "COPILOT_HOME", home, ".copilot", filesystem),
                "session-state",
            ]),
            &["jsonl"],
            Rule::Any,
        ),
        Root::new(
            AiVaultAgent::Opencode,
            paths.join(&[
                &opencode_data_root(kind, home, filesystem),
                "storage",
                "session",
            ]),
            &["json"],
            Rule::Any,
        ),
        Root::new(
            AiVaultAgent::Grok,
            paths.join(&[
                &configured_root(kind, "GROK_HOME", home, ".grok", filesystem),
                "sessions",
            ]),
            &["json"],
            Rule::Grok,
        ),
        Root::new(
            AiVaultAgent::Openclaw,
            paths.join(&[
                &configured_root(kind, "OPENCLAW_STATE_DIR", home, ".openclaw", filesystem),
                "agents",
            ]),
            &["jsonl"],
            Rule::Openclaw,
        ),
        Root::new(
            AiVaultAgent::Openclaw,
            paths.join(&[home, ".clawdbot", "agents"]),
            &["jsonl"],
            Rule::Openclaw,
        ),
        Root::new(
            AiVaultAgent::Devin,
            paths.join(&[
                &configured_root(
                    kind,
                    "DEVIN_HOME",
                    home,
                    ".local/share/devin/cli",
                    filesystem,
                ),
                "transcripts",
            ]),
            &["json"],
            Rule::Any,
        ),
        Root::new(
            AiVaultAgent::Droid,
            paths.join(&[home, ".factory", "sessions"]),
            &["jsonl"],
            Rule::Any,
        ),
        Root::new(
            AiVaultAgent::Droid,
            paths.join(&[home, ".factory", "projects"]),
            &["jsonl"],
            Rule::Any,
        ),
        Root::new(
            AiVaultAgent::Kimi,
            paths.join(&[
                &configured_root(kind, "KIMI_CODE_HOME", home, ".kimi-code", filesystem),
                "sessions",
            ]),
            &["json"],
            Rule::Kimi,
        ),
    ];
    let codex_root = roots
        .iter_mut()
        .find(|root| root.agent == AiVaultAgent::Codex);
    if let Some(root) = codex_root {
        root.path = paths.join(&[&root.path, "sessions"]);
    }
    if let Some(managed) = managed_codex_home.filter(|_| kind == HostKind::Local) {
        roots.push(Root::new(
            AiVaultAgent::Codex,
            paths.join(&[managed, "sessions"]),
            &["jsonl"],
            Rule::Any,
        ));
    }
    roots
}

fn configured_root(
    kind: HostKind,
    variable: &str,
    home: &str,
    fallback: &str,
    filesystem: &HostFilesystem,
) -> String {
    if kind == HostKind::Local
        && let Some(value) = std::env::var_os(variable).filter(|value| !value.is_empty())
    {
        return value.to_string_lossy().into_owned();
    }
    filesystem.paths().join(&[home, fallback])
}

pub(super) fn opencode_data_root(
    kind: HostKind,
    home: &str,
    filesystem: &HostFilesystem,
) -> String {
    if kind == HostKind::Local
        && let Some(config) =
            std::env::var_os("OPENCODE_CONFIG_DIR").filter(|value| !value.is_empty())
    {
        return config.to_string_lossy().into_owned();
    }
    filesystem
        .paths()
        .join(&[home, ".local", "share", "opencode"])
}

fn normalize_agent_root(root: String, leaf: &str, filesystem: &HostFilesystem) -> String {
    match filesystem
        .paths()
        .basename(root.trim_end_matches(['/', '\\']))
        .as_str()
    {
        "sessions" => root,
        "agent" => filesystem.paths().join(&[&root, "sessions"]),
        value if value == leaf => filesystem.paths().join(&[&root, "agent", "sessions"]),
        _ => root,
    }
}

#[derive(Clone, Copy)]
pub(super) enum Rule {
    Antigravity,
    Any,
    Claude,
    Cursor,
    Grok,
    Hermes,
    Kimi,
    Openclaw,
    Rovo,
}

impl Rule {
    pub(super) fn descend(self, name: &str, depth: usize) -> bool {
        match self {
            Self::Claude => name != "subagents",
            Self::Antigravity if depth == 1 => name == ".system_generated",
            Self::Antigravity if depth == 2 => name == "logs",
            _ => true,
        }
    }

    fn accepts(self, path: &str) -> bool {
        let normalized = path.replace('\\', "/");
        let basename = normalized.rsplit('/').next().unwrap_or("");
        match self {
            Self::Antigravity => normalized.ends_with("/.system_generated/logs/transcript.jsonl"),
            Self::Claude | Self::Any => true,
            Self::Cursor => normalized
                .split('/')
                .any(|value| value == "agent-transcripts"),
            Self::Grok => basename == "summary.json",
            Self::Hermes => basename.starts_with("session_"),
            Self::Kimi => {
                basename == "state.json"
                    && normalized
                        .rsplit('/')
                        .nth(1)
                        .is_some_and(|value| value.starts_with("session_"))
            }
            Self::Openclaw => normalized.split('/').any(|value| value == "sessions"),
            Self::Rovo => basename == "metadata.json",
        }
    }
}

pub(super) struct Root {
    pub(super) agent: AiVaultAgent,
    extensions: Vec<&'static str>,
    pub(super) path: String,
    pub(super) rule: Rule,
}

impl Root {
    fn new(agent: AiVaultAgent, path: String, extensions: &[&'static str], rule: Rule) -> Self {
        Self {
            agent,
            extensions: extensions.to_vec(),
            path,
            rule,
        }
    }
    pub(super) fn accepts(&self, path: &str) -> bool {
        let extension = path.rsplit_once('.').map_or("", |(_, extension)| extension);
        self.extensions
            .iter()
            .any(|candidate| extension.eq_ignore_ascii_case(candidate))
            && self.rule.accepts(path)
    }
}
