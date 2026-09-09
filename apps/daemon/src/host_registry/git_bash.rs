#[cfg(windows)]
use std::collections::HashSet;
#[cfg(windows)]
use std::path::Path;

#[cfg(not(windows))]
pub(super) fn is_available() -> bool {
    false
}

#[cfg(not(windows))]
pub(crate) fn executable() -> Option<String> {
    None
}

#[cfg(windows)]
pub(super) fn is_available() -> bool {
    executable().is_some()
}

#[cfg(windows)]
pub(crate) fn executable() -> Option<String> {
    candidate_paths().into_iter().find(|candidate| {
        is_git_for_windows_bash(candidate) && Path::new(candidate).try_exists().unwrap_or(false)
    })
}

#[cfg(windows)]
fn candidate_paths() -> Vec<String> {
    let environment = std::env::vars().collect::<Vec<_>>();
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();
    for name in [
        "ProgramFiles",
        "ProgramW6432",
        "ProgramFiles(x86)",
        "LOCALAPPDATA",
    ] {
        if let Some(root) = environment_value(&environment, name) {
            push_root(&mut candidates, &mut seen, root);
        }
    }
    if let Some(path) = environment_value(&environment, "Path") {
        for segment in path
            .split(';')
            .map(unquote)
            .filter(|value| !value.is_empty())
        {
            push_path_segment(&mut candidates, &mut seen, segment);
        }
    }
    candidates
}

#[cfg(windows)]
fn push_root(candidates: &mut Vec<String>, seen: &mut HashSet<String>, root: &str) {
    for suffix in [
        "Git\\bin\\bash.exe",
        "Git\\usr\\bin\\bash.exe",
        "Programs\\Git\\bin\\bash.exe",
        "Programs\\Git\\usr\\bin\\bash.exe",
    ] {
        push(candidates, seen, join(root, suffix));
    }
}

#[cfg(windows)]
fn push_path_segment(candidates: &mut Vec<String>, seen: &mut HashSet<String>, segment: &str) {
    let normalized = normalize(segment);
    let direct = join(&normalized, "bash.exe");
    if is_git_for_windows_bash(&direct) {
        push(candidates, seen, direct);
    }
    let mut components = normalized.rsplitn(2, '\\');
    let basename = components.next().unwrap_or_default();
    let parent = components.next().unwrap_or_default();
    let parent_name = parent.rsplit('\\').next().unwrap_or_default();
    if basename.eq_ignore_ascii_case("cmd") && matches_git_root(parent_name) {
        push_git_bins(candidates, seen, parent);
    } else if matches_git_root(basename) {
        push_git_bins(candidates, seen, &normalized);
    }
}

#[cfg(windows)]
fn push_git_bins(candidates: &mut Vec<String>, seen: &mut HashSet<String>, root: &str) {
    push(candidates, seen, join(root, "bin\\bash.exe"));
    push(candidates, seen, join(root, "usr\\bin\\bash.exe"));
}

#[cfg(windows)]
fn push(candidates: &mut Vec<String>, seen: &mut HashSet<String>, value: String) {
    let key = value.to_ascii_lowercase();
    if seen.insert(key) {
        candidates.push(value);
    }
}

#[cfg(windows)]
fn is_git_for_windows_bash(value: &str) -> bool {
    let value = normalize(value).to_ascii_lowercase();
    [
        "\\git\\bin\\bash.exe",
        "\\git\\usr\\bin\\bash.exe",
        "\\portablegit\\bin\\bash.exe",
        "\\portablegit\\usr\\bin\\bash.exe",
    ]
    .iter()
    .any(|suffix| value.ends_with(suffix))
}

#[cfg(windows)]
fn environment_value<'a>(environment: &'a [(String, String)], name: &str) -> Option<&'a str> {
    environment
        .iter()
        .find(|(candidate, value)| candidate.eq_ignore_ascii_case(name) && !value.is_empty())
        .map(|(_, value)| value.as_str())
}

#[cfg(windows)]
fn matches_git_root(value: &str) -> bool {
    value.eq_ignore_ascii_case("git") || value.eq_ignore_ascii_case("portablegit")
}

#[cfg(windows)]
fn join(root: &str, suffix: &str) -> String {
    format!("{}\\{suffix}", normalize(root).trim_end_matches('\\'))
}

#[cfg(windows)]
fn normalize(value: &str) -> String {
    unquote(value.trim()).replace('/', "\\")
}

#[cfg(windows)]
fn unquote(value: &str) -> &str {
    value
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .unwrap_or(value)
}
