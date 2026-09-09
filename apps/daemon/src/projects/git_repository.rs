use std::sync::Arc;

use crate::hosts::{ExecutionHost, HostCommand, HostFileKind, HostFilesystem};

const GIT_PROBE_OUTPUT_LIMIT_BYTES: usize = 64 * 1024;

pub(crate) async fn is_git_repository(host: Arc<dyn ExecutionHost>, path: &str) -> bool {
    let filesystem = HostFilesystem::new(host.clone());
    let Ok(canonical_path) = filesystem.canonical_directory(path).await else {
        return false;
    };
    let worktree = git_bool(host.as_ref(), path, ["rev-parse", "--is-inside-work-tree"]).await;
    if worktree == Some(true) {
        return true;
    }
    let bare = git_bool(host.as_ref(), path, ["rev-parse", "--is-bare-repository"]).await;
    if bare == Some(true) {
        return true;
    }
    if worktree == Some(false) && bare == Some(false) {
        return false;
    }
    marker_ancestors(&filesystem, &canonical_path).await
}

async fn git_bool<const N: usize>(
    host: &dyn ExecutionHost,
    cwd: &str,
    args: [&str; N],
) -> Option<bool> {
    let mut command = HostCommand::new("git", args);
    command.cwd = Some(cwd.to_owned());
    command.max_output_bytes = Some(GIT_PROBE_OUTPUT_LIMIT_BYTES);
    command.timeout_ms = Some(5_000);
    let output = host.exec(command).await.ok()?;
    if output.exit_code != 0 {
        return None;
    }
    match output.stdout.trim() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

async fn marker_ancestors(filesystem: &HostFilesystem, path: &str) -> bool {
    let paths = filesystem.paths();
    let mut candidate = path.to_owned();
    loop {
        let inside_marker = paths.basename(&candidate).eq_ignore_ascii_case(".git")
            || inside_dot_git(&paths.relative(&candidate, path));
        if !inside_marker {
            if worktree_marker(filesystem, &candidate).await {
                return true;
            }
            if bare_marker(filesystem, &candidate).await {
                return true;
            }
        }
        let parent = paths.dirname(&candidate);
        if parent == candidate {
            return false;
        }
        candidate = parent;
    }
}

fn inside_dot_git(relative: &str) -> bool {
    relative
        .split(['/', '\\'])
        .any(|segment| segment.eq_ignore_ascii_case(".git"))
}

async fn worktree_marker(filesystem: &HostFilesystem, path: &str) -> bool {
    let marker = filesystem.paths().join(&[path, ".git"]);
    match filesystem.stat(&marker).await.ok().flatten() {
        Some(stat) if stat.kind == HostFileKind::Directory => git_dir(filesystem, &marker).await,
        Some(stat) if stat.kind == HostFileKind::File => {
            let Some(content) = filesystem.read_text(&marker, 8 * 1024).await.ok().flatten() else {
                return false;
            };
            let Some(target) = gitdir_target(&content) else {
                return false;
            };
            let target = filesystem.paths().resolve(path, &[target]);
            git_dir(filesystem, &target).await
        }
        _ => false,
    }
}

fn gitdir_target(content: &str) -> Option<&str> {
    let line = content
        .split_once(['\r', '\n'])
        .map_or(content, |(line, _)| line);
    let (label, target) = line.split_once(':')?;
    let target = target.trim();
    (label.eq_ignore_ascii_case("gitdir") && !target.is_empty()).then_some(target)
}

async fn git_dir(filesystem: &HostFilesystem, path: &str) -> bool {
    if common_git_dir(filesystem, path).await {
        return true;
    }
    let head = filesystem.paths().join(&[path, "HEAD"]);
    let common_file = filesystem.paths().join(&[path, "commondir"]);
    if !is_kind(filesystem, &head, HostFileKind::File).await
        || !is_kind(filesystem, &common_file, HostFileKind::File).await
    {
        return false;
    }
    let Some(common) = filesystem
        .read_text(&common_file, 8 * 1024)
        .await
        .ok()
        .flatten()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
    else {
        return false;
    };
    let common = filesystem.paths().resolve(path, &[&common]);
    common_git_dir(filesystem, &common).await
}

async fn common_git_dir(filesystem: &HostFilesystem, path: &str) -> bool {
    let head = filesystem.paths().join(&[path, "HEAD"]);
    let objects = filesystem.paths().join(&[path, "objects"]);
    let refs = filesystem.paths().join(&[path, "refs"]);
    is_kind(filesystem, &head, HostFileKind::File).await
        && is_kind(filesystem, &objects, HostFileKind::Directory).await
        && is_kind(filesystem, &refs, HostFileKind::Directory).await
}

async fn bare_marker(filesystem: &HostFilesystem, path: &str) -> bool {
    common_git_dir(filesystem, path).await && config_declares_bare(filesystem, path).await
}

async fn config_declares_bare(filesystem: &HostFilesystem, path: &str) -> bool {
    let config = filesystem.paths().join(&[path, "config"]);
    let Some(content) = filesystem
        .read_text(&config, 1024 * 1024)
        .await
        .ok()
        .flatten()
    else {
        return false;
    };
    let mut core = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(section) = trimmed
            .strip_prefix('[')
            .and_then(|line| line.split_once(']'))
        {
            core = section.0.trim().eq_ignore_ascii_case("core");
            continue;
        }
        if !core {
            continue;
        }
        let Some((key, value)) = trimmed.split_once('=') else {
            continue;
        };
        if key.trim().eq_ignore_ascii_case("bare") {
            return matches!(
                config_value(value).to_ascii_lowercase().as_str(),
                "true" | "yes" | "on" | "1"
            );
        }
    }
    false
}

fn config_value(value: &str) -> &str {
    let mut quote = None;
    let mut escaped = false;
    let end = value
        .char_indices()
        .find_map(|(index, character)| {
            if escaped {
                escaped = false;
                return None;
            }
            if character == '\\' {
                escaped = true;
                return None;
            }
            match quote {
                Some(open) if character == open => quote = None,
                Some(_) => {}
                None if matches!(character, '\'' | '"') => quote = Some(character),
                None if matches!(character, '#' | ';') => return Some(index),
                None => {}
            }
            None
        })
        .unwrap_or(value.len());
    value[..end].trim().trim_matches(['\'', '"'])
}

async fn is_kind(filesystem: &HostFilesystem, path: &str, expected: HostFileKind) -> bool {
    filesystem
        .stat(path)
        .await
        .ok()
        .flatten()
        .is_some_and(|stat| stat.kind == expected)
}
