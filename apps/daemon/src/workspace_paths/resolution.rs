use std::collections::HashSet;

use crate::external_paths::path_resolution;
use crate::hosts::{ExecutionHost, HostFileKind, HostFilesystem, HostKind};

use super::candidates::Candidate;
use super::containment::contains;
use super::{AuthorizedWorkspacePath, PathResolution, WorkspacePathError};

const SYMLINK_LIMIT: usize = 20;

pub(super) struct AuthorizedCandidate {
    authority_id: String,
    canonical_root: String,
    target: AuthorizedWorkspacePath,
}

pub(super) async fn authorize_candidates(
    candidates: Vec<Candidate>,
    target_path: &str,
    mode: PathResolution,
) -> Result<Vec<AuthorizedCandidate>, WorkspacePathError> {
    let mut authorized = Vec::new();
    for candidate in candidates {
        let filesystem = HostFilesystem::new(candidate.host.clone());
        let canonical_root = filesystem.canonical_directory(&candidate.root).await?;
        let canonical_target =
            canonical_entry(&filesystem, candidate.host.as_ref(), target_path, mode).await?;
        if contains(
            &filesystem.paths(),
            candidate.host.platform(),
            &canonical_root,
            &canonical_target,
        ) {
            authorized.push(AuthorizedCandidate {
                authority_id: candidate.authority_id,
                canonical_root,
                target: AuthorizedWorkspacePath {
                    host: candidate.host,
                    path: canonical_target,
                },
            });
        }
    }
    Ok(authorized)
}

pub(super) fn select(
    mut authorized: Vec<AuthorizedCandidate>,
) -> Result<AuthorizedWorkspacePath, WorkspacePathError> {
    authorized.sort_unstable_by_key(|candidate| std::cmp::Reverse(candidate.canonical_root.len()));
    let Some(selected) = authorized.first() else {
        return Err(WorkspacePathError::Unauthorized);
    };
    let specificity = selected.canonical_root.len();
    let top = authorized
        .iter()
        .take_while(|candidate| candidate.canonical_root.len() == specificity)
        .map(|candidate| {
            (
                candidate.target.host.id().to_owned(),
                candidate.authority_id.clone(),
                candidate.canonical_root.clone(),
            )
        })
        .collect::<HashSet<_>>();
    if top.len() != 1 {
        return Err(WorkspacePathError::Ambiguous);
    }
    Ok(authorized.remove(0).target)
}

async fn canonical_entry(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    path: &str,
    mode: PathResolution,
) -> Result<String, WorkspacePathError> {
    if host.kind() == HostKind::Local {
        let resolved = path_resolution::resolve_absolute(path)?;
        let canonical = match mode {
            PathResolution::Follow => path_resolution::canonicalize(&resolved).await?,
            PathResolution::PreserveLeaf => {
                path_resolution::canonicalize_preserving_leaf(&resolved).await?
            }
        };
        return Ok(canonical.to_string_lossy().into_owned());
    }
    match mode {
        PathResolution::Follow => canonical_remote_follow(filesystem, host, path).await,
        PathResolution::PreserveLeaf => {
            let parent = filesystem.paths().dirname(path);
            let leaf = filesystem.paths().basename(path);
            let canonical_parent = canonical_remote_follow(filesystem, host, &parent).await?;
            Ok(filesystem
                .paths()
                .join(&[canonical_parent.as_str(), leaf.as_str()]))
        }
    }
}

async fn canonical_remote_follow(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    path: &str,
) -> Result<String, WorkspacePathError> {
    let resolved = resolve_remote_leaf(filesystem, host, path).await?;
    let paths = filesystem.paths();
    let mut candidate = resolved;
    let mut missing = Vec::<String>::new();
    loop {
        if let Some(stat) = filesystem.stat(&candidate).await? {
            let canonical = if stat.kind == HostFileKind::Directory {
                filesystem.canonical_directory(&candidate).await?
            } else {
                let parent = filesystem
                    .canonical_directory(&paths.dirname(&candidate))
                    .await?;
                paths.join(&[parent.as_str(), paths.basename(&candidate).as_str()])
            };
            return Ok(missing
                .iter()
                .rev()
                .fold(canonical, |base, segment| paths.join(&[&base, segment])));
        }
        let parent = paths.dirname(&candidate);
        if parent == candidate {
            return Err(WorkspacePathError::PathResolution(
                "no existing ancestor was available".to_owned(),
            ));
        }
        missing.push(paths.basename(&candidate));
        candidate = parent;
    }
}

async fn resolve_remote_leaf(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    path: &str,
) -> Result<String, WorkspacePathError> {
    let mut current = path.to_owned();
    for _ in 0..SYMLINK_LIMIT {
        let Some(stat) = filesystem.stat(&current).await? else {
            return Ok(current);
        };
        if stat.kind != HostFileKind::Symlink {
            return Ok(current);
        }
        let output = host
            .exec(crate::hosts::HostCommand::new("readlink", [&current]))
            .await?;
        let target = output.stdout.trim_end_matches(['\r', '\n']);
        if output.exit_code != 0 || target.is_empty() {
            return Err(WorkspacePathError::PathResolution(
                "remote symlink target was unavailable".to_owned(),
            ));
        }
        current = if filesystem.paths().is_absolute(target) {
            target.to_owned()
        } else {
            filesystem
                .paths()
                .resolve(&filesystem.paths().dirname(&current), &[target])
        };
    }
    Err(WorkspacePathError::PathResolution(
        "remote symlink limit exceeded".to_owned(),
    ))
}
