pub(crate) struct SourceRoot {
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) path: String,
    pub(crate) kind: &'static str,
    pub(crate) providers: Vec<&'static str>,
    pub(crate) owner: Option<&'static str>,
    pub(crate) scope: String,
}
impl SourceRoot {
    pub(crate) fn new(
        id: String,
        label: String,
        path: String,
        kind: &'static str,
        providers: Vec<&'static str>,
        owner: Option<&'static str>,
        scope: String,
    ) -> Self {
        Self {
            id,
            label,
            path,
            kind,
            providers,
            owner,
            scope,
        }
    }
}

pub(crate) fn home_roots(paths: crate::hosts::HostPaths, home: &str) -> Vec<SourceRoot> {
    let root = |id: &str,
                label: &str,
                path: String,
                kind: &'static str,
                providers: Vec<&'static str>,
                owner: Option<&'static str>| {
        SourceRoot::new(
            id.to_owned(),
            label.to_owned(),
            path,
            kind,
            providers,
            owner,
            "global".to_owned(),
        )
    };
    let mut roots = vec![
        root(
            "home-codex",
            "Codex home",
            paths.join(&[home, ".codex", "skills"]),
            "home",
            vec!["codex"],
            Some("codex"),
        ),
        root(
            "home-agents",
            "Agent skills home",
            paths.join(&[home, ".agents", "skills"]),
            "home",
            vec!["agent-skills"],
            None,
        ),
        root(
            "home-claude",
            "Claude home",
            paths.join(&[home, ".claude", "skills"]),
            "home",
            vec!["claude"],
            Some("claude"),
        ),
        root(
            "home-grok",
            "Grok home",
            paths.join(&[home, ".grok", "skills"]),
            "home",
            vec!["agent-skills"],
            Some("grok"),
        ),
        root(
            "home-opencode",
            "OpenCode home",
            paths.join(&[home, ".config", "opencode", "skills"]),
            "home",
            vec!["agent-skills"],
            Some("opencode"),
        ),
        root(
            "home-pi",
            "Pi home",
            paths.join(&[home, ".pi", "agent", "skills"]),
            "home",
            vec!["agent-skills"],
            Some("pi"),
        ),
        root(
            "home-gemini",
            "Gemini home",
            paths.join(&[home, ".gemini", "skills"]),
            "home",
            vec!["agent-skills"],
            Some("gemini"),
        ),
        root(
            "home-antigravity",
            "Antigravity home",
            paths.join(&[home, ".gemini", "antigravity", "skills"]),
            "home",
            vec!["agent-skills"],
            Some("antigravity"),
        ),
        root(
            "home-cursor",
            "Cursor home",
            paths.join(&[home, ".cursor", "skills"]),
            "home",
            vec!["agent-skills"],
            Some("cursor"),
        ),
        root(
            "codex-plugin-cache",
            "Codex plugin cache",
            paths.join(&[home, ".codex", "plugins", "cache"]),
            "plugin",
            vec!["codex", "agent-skills"],
            Some("codex"),
        ),
    ];
    if let Some(plugin_cache) = roots
        .iter_mut()
        .find(|root| root.id == "codex-plugin-cache")
    {
        plugin_cache.scope = "plugin:codex-plugin-cache".to_owned();
    }
    roots
}
