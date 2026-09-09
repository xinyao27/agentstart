use std::sync::OnceLock;

use regex::Regex;

// Why: Long DNS labels become unreadable in browser address bars.
const HOST_LABEL_MAX_CHARS: usize = 48;

pub(super) const LOOPBACK_HOSTS: &[&str] = &["localhost", "127.0.0.1", "0.0.0.0", "::1", "::"];

pub(super) struct LabelInput<'a> {
    pub(super) project_name: &'a str,
    pub(super) worktree_name: &'a str,
    pub(super) worktree_path: Option<&'a str>,
}

pub(super) struct RouteKeyInput<'a> {
    pub(super) target_url: &'a str,
    pub(super) project_name: &'a str,
    pub(super) worktree_name: &'a str,
    pub(super) repo_id: Option<&'a str>,
    pub(super) worktree_id: Option<&'a str>,
}

/// Mirrors `slugifyLocalhostWorktreeLabel`: lowercase, strip quotes, collapse
/// non-alphanumeric runs to a single dash, trim edge dashes, then bound the
/// length (re-trimming a dash exposed by truncation).
pub(super) fn slugify(value: &str) -> String {
    let lowered = value.trim().to_lowercase();
    let unquoted = quotes().replace_all(&lowered, "");
    let dashed = non_alnum_run().replace_all(&unquoted, "-");
    let trimmed = trim_dashes(&dashed);
    let bounded: String = trimmed.chars().take(HOST_LABEL_MAX_CHARS).collect();
    let bounded = trim_dashes(&bounded);
    if bounded.is_empty() {
        "workspace".to_owned()
    } else {
        bounded.to_owned()
    }
}

/// Mirrors `getLocalhostWorktreeHostLabel`: a primary worktree (bare `main`,
/// or a name ending in a `main` path segment) always carries its project
/// name so every project's primary worktree does not collapse onto one label.
pub(super) fn host_label(input: &LabelInput<'_>) -> String {
    let project_slug = slugify(input.project_name);
    let short_name = short_worktree_name(input.worktree_path.unwrap_or(input.worktree_name));
    let worktree_slug = slugify(short_name);
    if worktree_slug == "main" || trailing_main().is_match(input.worktree_name) {
        return slugify(&format!("{project_slug}-main"));
    }
    worktree_slug
}

pub(super) fn route_key(input: &RouteKeyInput<'_>) -> String {
    if let Some(worktree_id) = input.worktree_id {
        return format!("worktree:{worktree_id}:{}", input.target_url);
    }
    if let Some(repo_id) = input.repo_id {
        return format!(
            "repo:{repo_id}:{}:{}",
            input.worktree_name, input.target_url
        );
    }
    format!(
        "{}:{}:{}",
        input.project_name, input.worktree_name, input.target_url
    )
}

pub(super) fn normalize_hostname(hostname: &str) -> String {
    hostname
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_ascii_lowercase()
}

/// Mirrors `connectableLoopbackHost`: wildcard bind addresses are not
/// connectable destinations (connecting to them fails on Windows), so swap
/// them for the loopback address that actually accepts a connection.
pub(super) fn connectable_loopback_host(hostname: &str) -> String {
    match normalize_hostname(hostname).as_str() {
        "0.0.0.0" => "127.0.0.1".to_owned(),
        "::" => "::1".to_owned(),
        _ => hostname.to_owned(),
    }
}

fn short_worktree_name(worktree_name: &str) -> &str {
    worktree_name
        .split(['\\', '/'])
        .map(str::trim)
        .rfind(|part| !part.is_empty())
        .unwrap_or(worktree_name)
}

fn trim_dashes(value: &str) -> &str {
    value.trim_matches('-')
}

fn expression(cell: &'static OnceLock<Regex>, source: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(source).expect("worktree label expression is valid"))
}

fn quotes() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r#"['"]"#)
}

fn non_alnum_run() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r"[^a-z0-9]+")
}

fn trailing_main() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r"(?i)(?:^|[-_\s/])main$")
}
