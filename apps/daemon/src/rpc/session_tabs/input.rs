// Why: the legacy JSON input parsers retired with the METHODS table; the
// protobuf handler (`protocol.rs`) still shares these bounds so its validation
// cannot drift from what the renderer and headless mutations agree on.
pub(super) const MAX_AGENT_PROMPT_BYTES: usize = 32 * 1024;
pub(super) const MAX_PANE_LAYOUT_DEPTH: usize = 64;
pub(super) const MAX_PANE_LAYOUT_NODES: usize = 1_024;
pub(super) const TUI_AGENTS: &[&str] = &[
    "claude",
    "openclaude",
    "codex",
    "autohand",
    "opencode",
    "mimo-code",
    "pi",
    "omp",
    "gemini",
    "antigravity",
    "aider",
    "goose",
    "amp",
    "kilo",
    "kiro",
    "crush",
    "aug",
    "cline",
    "codebuff",
    "command-code",
    "continue",
    "cursor",
    "droid",
    "kimi",
    "mistral-vibe",
    "qwen-code",
    "rovo",
    "hermes",
    "openclaw",
    "copilot",
    "grok",
    "devin",
    "ante",
    "trae",
];
