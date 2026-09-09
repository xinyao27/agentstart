#[derive(Debug)]
pub(crate) struct ResolveDroppedPathsResult {
    pub(crate) resolved_paths: Vec<String>,
    pub(crate) skipped: Vec<DroppedPathSkip>,
    pub(crate) failed: Vec<DroppedPathFailure>,
}

#[derive(Debug)]
pub(crate) struct DroppedPathSkip {
    pub(crate) source_path: String,
    pub(crate) reason: &'static str,
}

#[derive(Debug)]
pub(crate) struct DroppedPathFailure {
    pub(crate) source_path: String,
    pub(crate) reason: String,
}

pub(crate) fn resolve(paths: Vec<String>, worktree_path: &str) -> ResolveDroppedPathsResult {
    ResolveDroppedPathsResult {
        resolved_paths: resolve_for_target(paths, worktree_path),
        skipped: Vec::new(),
        failed: Vec::new(),
    }
}

#[cfg(not(windows))]
fn resolve_for_target(paths: Vec<String>, _worktree_path: &str) -> Vec<String> {
    paths
}

#[cfg(windows)]
fn resolve_for_target(paths: Vec<String>, worktree_path: &str) -> Vec<String> {
    let Some(target) = parse_wsl_unc(worktree_path) else {
        return paths;
    };
    paths
        .into_iter()
        .map(|path| resolve_for_wsl(path, &target.distribution))
        .collect()
}

#[cfg(windows)]
struct WslPath {
    distribution: String,
    linux_path: String,
}

#[cfg(windows)]
fn resolve_for_wsl(path: String, target_distribution: &str) -> String {
    if let Some(dropped) = parse_wsl_unc(&path) {
        return if dropped
            .distribution
            .to_lowercase()
            .eq(&target_distribution.to_lowercase())
        {
            dropped.linux_path
        } else {
            path
        };
    }
    to_linux_drive_path(&path).unwrap_or(path)
}

#[cfg(windows)]
fn parse_wsl_unc(path: &str) -> Option<WslPath> {
    let normalized = path.replace('\\', "/");
    let remainder = normalized.strip_prefix("//")?;
    let (server, remainder) = remainder.split_once('/')?;
    if !server.eq_ignore_ascii_case("wsl.localhost") && !server.eq_ignore_ascii_case("wsl$") {
        return None;
    }
    let (distribution, suffix) = remainder.split_once('/').unwrap_or((remainder, ""));
    if distribution.is_empty() {
        return None;
    }
    Some(WslPath {
        distribution: distribution.to_owned(),
        linux_path: format!("/{suffix}"),
    })
}

#[cfg(windows)]
fn to_linux_drive_path(path: &str) -> Option<String> {
    let bytes = path.as_bytes();
    if bytes.len() < 3
        || !bytes[0].is_ascii_alphabetic()
        || bytes[1] != b':'
        || !matches!(bytes[2], b'/' | b'\\')
    {
        return None;
    }
    let drive = char::from(bytes[0]).to_ascii_lowercase();
    let remainder = path[3..].replace('\\', "/");
    Some(if remainder.is_empty() {
        format!("/mnt/{drive}/")
    } else {
        format!("/mnt/{drive}/{remainder}")
    })
}
