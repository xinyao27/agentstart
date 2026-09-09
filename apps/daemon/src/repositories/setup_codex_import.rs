use serde_json::Value;

use crate::hosts::HostFilesystemError;

use super::setup_imports::{RepoFiles, candidate};

pub(super) async fn inspect(files: &RepoFiles<'_>) -> Result<Option<Value>, HostFilesystemError> {
    let Some(content) = files.read(".codex/environments/environment.toml").await? else {
        return Ok(None);
    };
    let parsed = parse_toml(&content);
    let Some(setup) = parsed
        .setup
        .map(|value| super::ecmascript::trim(&value).to_owned())
    else {
        return Ok(None);
    };
    if setup.is_empty() {
        return Ok(None);
    }
    Ok(Some(candidate(
        "codex",
        "Codex environment",
        vec![".codex/environments/environment.toml"],
        setup,
        parsed
            .cleanup
            .map(|value| super::ecmascript::trim(&value).to_owned())
            .filter(|value| !value.is_empty()),
        parsed.unsupported,
    )))
}

struct CodexToml {
    cleanup: Option<String>,
    setup: Option<String>,
    unsupported: Vec<String>,
}

fn parse_toml(content: &str) -> CodexToml {
    let lines = content.lines().collect::<Vec<_>>();
    let mut section = "";
    let mut setup = None;
    let mut cleanup = None;
    let mut unsupported = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index];
        let trimmed = line.trim();
        if trimmed.starts_with("actions") && trimmed.contains('=') {
            unsupported.push("actions".to_owned());
        }
        if let Some(name) = trimmed
            .strip_prefix('[')
            .and_then(|value| value.split_once(']'))
            .map(|(name, _)| name)
        {
            section = name;
            if section == "actions" || section.starts_with("actions.") {
                unsupported.push(format!("[{section}]"));
            }
            index += 1;
            continue;
        }
        if matches!(section, "setup" | "cleanup")
            && let Some(raw) = trimmed
                .strip_prefix("script")
                .and_then(|value| value.split_once('='))
        {
            let (value, end) = toml_string(&lines, index, raw.1.trim_start());
            index = end;
            if section == "setup" {
                setup = Some(value);
            } else {
                cleanup = Some(value);
            }
        }
        index += 1;
    }
    CodexToml {
        cleanup,
        setup,
        unsupported,
    }
}

fn toml_string(lines: &[&str], start: usize, raw: &str) -> (String, usize) {
    for delimiter in ["\"\"\"", "'''"] {
        if let Some(remainder) = raw.strip_prefix(delimiter) {
            let mut content = String::new();
            for (index, line) in lines.iter().enumerate().skip(start) {
                let line = if index == start { remainder } else { line };
                if let Some((before, _)) = line.split_once(delimiter) {
                    content.push_str(before);
                    return (content, index);
                }
                content.push_str(line);
                content.push('\n');
            }
            return (content.trim_end().to_owned(), lines.len().saturating_sub(1));
        }
    }
    if raw.starts_with('"') {
        let end = string_end(raw, '"');
        return (
            serde_json::from_str(&raw[..=end]).unwrap_or_else(|_| raw[1..end].to_owned()),
            start,
        );
    }
    if raw.starts_with('\'') {
        let end = string_end(raw, '\'');
        return (raw[1..end].to_owned(), start);
    }
    (
        raw.split(" #").next().unwrap_or(raw).trim().to_owned(),
        start,
    )
}

fn string_end(value: &str, quote: char) -> usize {
    let mut slash_count = 0;
    for (index, character) in value.char_indices().skip(1) {
        if character == quote && (quote == '\'' || slash_count % 2 == 0) {
            return index;
        }
        if character == '\\' {
            slash_count += 1;
        } else {
            slash_count = 0;
        }
    }
    value.len().saturating_sub(1)
}
