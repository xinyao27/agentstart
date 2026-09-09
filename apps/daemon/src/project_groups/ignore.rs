use crate::hosts::{HostDirectoryEntry, HostFileKind, HostFilesystem};

const IGNORE_FILE_MAX_BYTES: usize = 1024 * 1024;
const SKIPPED: &[&str] = &[
    "node_modules",
    ".next",
    "dist",
    "build",
    ".cache",
    "vendor",
    "__pycache__",
    ".turbo",
    ".parcel-cache",
];
const METADATA: &[&str] = &[".git", ".svn", ".hg", ".jj", ".sl", ".repo", "CVS"];

#[derive(Clone)]
pub(super) struct IgnoreRule {
    base: Vec<String>,
    basename_only: bool,
    negate: bool,
    pattern: String,
}

pub(super) async fn read_rules(
    filesystem: &HostFilesystem,
    folder: &str,
    entries: &[HostDirectoryEntry],
    base: &[String],
) -> Vec<IgnoreRule> {
    if !entries
        .iter()
        .any(|entry| entry.name == ".gitignore" && entry.kind == HostFileKind::File)
    {
        return Vec::new();
    }
    let path = filesystem.paths().join(&[folder, ".gitignore"]);
    let Ok(Some(content)) = filesystem.read_text(&path, IGNORE_FILE_MAX_BYTES).await else {
        return Vec::new();
    };
    content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .filter_map(|line| parse_rule(line, base))
        .collect()
}

pub(super) fn is_ignored(name: &str, segments: &[String], rules: &[IgnoreRule]) -> bool {
    let mut ignored = false;
    for rule in rules {
        if segments.len() <= rule.base.len() {
            continue;
        }
        let relative = &segments[rule.base.len()..];
        let matched = if rule.basename_only {
            relative
                .iter()
                .any(|segment| glob_matches(&rule.pattern, segment))
        } else {
            path_matches(&rule.pattern.split('/').collect::<Vec<_>>(), relative)
        };
        if matched {
            ignored = !rule.negate;
        }
    }
    ignored
        || METADATA.contains(&name)
        || SKIPPED.contains(&name)
        || (segments.len() > 1 && name.starts_with('.'))
}

fn parse_rule(line: &str, base: &[String]) -> Option<IgnoreRule> {
    let negate = line.starts_with('!');
    let source = line.strip_prefix('!').unwrap_or(line);
    let anchored = source.starts_with('/');
    let pattern = source.trim_matches('/').to_owned();
    (!pattern.is_empty()).then(|| IgnoreRule {
        base: base.to_vec(),
        basename_only: !anchored && !pattern.contains('/'),
        negate,
        pattern,
    })
}

fn glob_matches(pattern: &str, value: &str) -> bool {
    glob_from(pattern.as_bytes(), value.as_bytes(), 0, 0)
}

fn glob_from(pattern: &[u8], value: &[u8], pattern_index: usize, value_index: usize) -> bool {
    match pattern.get(pattern_index) {
        None => value_index == value.len(),
        Some(b'*') => {
            glob_from(pattern, value, pattern_index + 1, value_index)
                || value_index < value.len()
                    && glob_from(pattern, value, pattern_index, value_index + 1)
        }
        Some(b'?') => {
            value_index < value.len()
                && value[value_index] != b'/'
                && glob_from(pattern, value, pattern_index + 1, value_index + 1)
        }
        Some(character) => {
            value.get(value_index) == Some(character)
                && glob_from(pattern, value, pattern_index + 1, value_index + 1)
        }
    }
}

fn path_matches(pattern: &[&str], value: &[String]) -> bool {
    path_from(pattern, value, 0, 0)
}

fn path_from(pattern: &[&str], value: &[String], left: usize, right: usize) -> bool {
    match pattern.get(left) {
        None => right == value.len(),
        Some(&"**") => {
            path_from(pattern, value, left + 1, right)
                || right < value.len() && path_from(pattern, value, left, right + 1)
        }
        Some(segment) => {
            right < value.len()
                && glob_matches(segment, &value[right])
                && path_from(pattern, value, left + 1, right + 1)
        }
    }
}
