#[derive(Clone, Copy, Eq, PartialEq)]
pub(super) enum AgentStatus {
    Idle,
    Permission,
    Working,
}

pub(super) struct TerminalTitleParser {
    control: super::side_effects::ControlParser,
}

impl TerminalTitleParser {
    pub(super) fn new() -> Self {
        Self {
            control: Default::default(),
        }
    }
    pub(super) fn observe(&mut self, bytes: &[u8]) -> Option<String> {
        self.control.observe(bytes).titles.pop()
    }
}

// Why: stats and terminal status share the same agent-title vocabulary as the browser;
// ordinary command/cwd titles must never increment the lifetime agent counter.
pub(super) fn detect_agent_status(title: &str) -> Option<AgentStatus> {
    let normalized = title.to_lowercase();
    if title.is_empty() || claude_management(title) || normalized.trim() == "cursor agent" {
        return None;
    }
    if title.contains('\u{270b}') {
        return Some(AgentStatus::Permission);
    }
    if title.contains(['\u{2726}', '\u{23f2}']) {
        return Some(AgentStatus::Working);
    }
    if title.contains('\u{25c7}') {
        return Some(AgentStatus::Idle);
    }
    if pi_synthetic(title) {
        return Some(if braille_spinner(title) {
            AgentStatus::Working
        } else if normalized.contains("action required") {
            AgentStatus::Permission
        } else {
            AgentStatus::Idle
        });
    }
    if title == "\u{2733}"
        || title.starts_with("\u{2733} ")
        || (pi_legacy(title) && !braille_spinner(title))
    {
        return Some(AgentStatus::Idle);
    }
    if braille_spinner(title) {
        return Some(AgentStatus::Working);
    }
    let legacy = LEGACY_AGENT_NAMES
        .iter()
        .any(|name| agent_name(&normalized, name, true));
    let droid = agent_name(&normalized, "droid", false);
    if !legacy
        && !droid
        && !agent_name(&normalized, "hermes", false)
        && !agent_name(&normalized, "agy", false)
    {
        return None;
    }
    if ["action required", "permission", "waiting"]
        .iter()
        .any(|word| normalized.contains(word))
    {
        return Some(AgentStatus::Permission);
    }
    if strong_keyword(&normalized, &["ready", "idle", "done"]) {
        return Some(AgentStatus::Idle);
    }
    if strong_keyword(&normalized, &["working", "thinking", "running"]) || title.starts_with(". ") {
        return Some(AgentStatus::Working);
    }
    if title.starts_with("* ") {
        return Some(AgentStatus::Idle);
    }
    if droid && !legacy {
        return None;
    }
    Some(AgentStatus::Idle)
}

const LEGACY_AGENT_NAMES: &[&str] = &[
    "claude",
    "openclaude",
    "codex",
    "copilot",
    "cursor",
    "gemini",
    "antigravity",
    "opencode",
    "mimo",
    "openclaw",
    "aider",
    "grok",
    "devin",
];

fn braille_spinner(title: &str) -> bool {
    title
        .chars()
        .any(|character| ('\u{2800}'..='\u{28ff}').contains(&character))
}

fn agent_name(title: &str, name: &str, executable_suffix: bool) -> bool {
    title.match_indices(name).any(|(start, _)| {
        if title[..start]
            .chars()
            .next_back()
            .is_some_and(name_boundary_blocked)
        {
            return false;
        }
        let rest = &title[start + name.len()..];
        if !rest.chars().next().is_some_and(name_boundary_blocked) {
            return true;
        }
        executable_suffix
            && [".exe", ".cmd", ".bat", ".ps1"].iter().any(|suffix| {
                rest.strip_prefix(suffix)
                    .is_some_and(|tail| !tail.chars().next().is_some_and(name_boundary_blocked))
            })
    })
}

fn name_boundary_blocked(character: char) -> bool {
    character.is_ascii_alphanumeric() || "_./\\-".contains(character)
}

fn strong_keyword(title: &str, words: &[&str]) -> bool {
    words.iter().any(|word| {
        title.match_indices(word).any(|(start, _)| {
            !title[..start]
                .chars()
                .next_back()
                .is_some_and(name_boundary_blocked)
                && !title[start + word.len()..]
                    .chars()
                    .next()
                    .is_some_and(|character| {
                        character.is_ascii_alphanumeric() || "_-".contains(character)
                    })
        })
    })
}

fn claude_management(title: &str) -> bool {
    static PATTERN: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r#"(?i)^\s*(?:"(?:.*[\\/])?claude(?:\.(?:exe|cmd|bat|ps1))?"|'(?:.*[\\/])?claude(?:\.(?:exe|cmd|bat|ps1))?'|(?:.*[\\/])?claude(?:\.(?:exe|cmd|bat|ps1))?)\s+agents\s*$"#)
            .expect("Claude management title pattern is valid")
    });
    PATTERN.is_match(title)
}

fn pi_synthetic(title: &str) -> bool {
    static PATTERN: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"(?i)^\s*(?:[\x{2800}-\x{28ff}]\s+)?(pi|omp)(?:\s+-\s+action required|\s+(?:ready|idle|done))?\s*$")
            .expect("Pi synthetic title pattern is valid")
    });
    PATTERN.is_match(title)
}

fn pi_legacy(title: &str) -> bool {
    static PATTERN: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"^\s*(?:[\x{2800}-\x{28ff}]\s+)?π(?:\s*[-:]|\s)\s*.*$")
            .expect("Pi legacy title pattern is valid")
    });
    PATTERN.is_match(title)
}

pub(super) fn explicit_idle(title: &str) -> bool {
    let normalized = title.to_lowercase();
    let has_idle_word = ["ready", "idle", "done"].iter().any(|word| {
        normalized.match_indices(word).any(|(index, _)| {
            is_idle_boundary(normalized[..index].chars().next_back())
                && is_idle_boundary(normalized[index + word.len()..].chars().next())
        })
    });
    has_idle_word
        || title.starts_with('\u{2733}')
        || title.starts_with("* ")
        || title.contains('\u{25c7}')
        || title.starts_with("\u{03c0} - ")
}

fn is_idle_boundary(character: Option<char>) -> bool {
    character.is_none_or(|character| character.is_whitespace() || ".!?".contains(character))
}

pub(super) fn normalize_title(title: &str) -> String {
    let lower = title.to_lowercase();
    if title.contains(['✋', '✦', '⏲', '◇'])
        || (!pi_legacy(title) && agent_name(&lower, "gemini", false))
    {
        match detect_agent_status(title) {
            Some(AgentStatus::Permission) => return "✋ Gemini CLI".to_owned(),
            Some(AgentStatus::Working) => return "✦ Gemini CLI".to_owned(),
            Some(AgentStatus::Idle) => return "◇ Gemini CLI".to_owned(),
            None => {}
        }
    }
    if pi_legacy(title) {
        match detect_agent_status(title) {
            Some(AgentStatus::Working) => return "⠋ Pi".to_owned(),
            Some(AgentStatus::Idle) => return "Pi".to_owned(),
            _ => {}
        }
    }
    static GROK: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"(?i)^[\x{2800}-\x{28ff}]+(?:\s+-\s+[\s\S]+?\s-)?\s+grok\s*$")
            .expect("constant Grok title pattern")
    });
    if GROK.is_match(title) {
        return "⠋ Grok".to_owned();
    }
    title.to_owned()
}

pub(super) fn clear_working_indicators(title: &str) -> String {
    let mut cleaned: String = title
        .chars()
        .filter(|character| {
            !matches!(character, '✦' | '⏲') && !('\u{2800}'..='\u{28ff}').contains(character)
        })
        .collect();
    if cleaned.starts_with(". ") {
        cleaned.drain(..2);
    }
    let lower = cleaned.to_ascii_lowercase();
    if LEGACY_AGENT_NAMES
        .iter()
        .any(|name| agent_name(&lower, name, false))
        || ["hermes", "droid", "agy"]
            .iter()
            .any(|name| agent_name(&lower, name, true))
    {
        let mut ranges = Vec::new();
        for word in ["working", "thinking", "running"] {
            for (start, _) in lower.match_indices(word) {
                let end = start + word.len();
                if !lower[..start]
                    .chars()
                    .next_back()
                    .is_some_and(name_boundary_blocked)
                    && !lower[end..]
                        .chars()
                        .next()
                        .is_some_and(|c| c.is_ascii_alphanumeric() || "_-".contains(c))
                {
                    ranges.push(start..end);
                }
            }
        }
        ranges.sort_by_key(|range| range.start);
        for range in ranges.into_iter().rev() {
            cleaned.replace_range(range, "");
        }
    }
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if cleaned.is_empty() {
        title.to_owned()
    } else {
        cleaned
    }
}
