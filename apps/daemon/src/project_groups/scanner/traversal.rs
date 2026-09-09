use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use crate::hosts::{HostFileKind, HostFilesystem};

use super::NestedRepoScanError;
use crate::project_groups::ignore::{self, IgnoreRule};
use crate::project_groups::{NestedRepoCandidate, NestedRepoScan, NestedRepoScanOptions};

#[derive(Clone)]
struct Folder {
    depth: usize,
    ignore_rules: Vec<IgnoreRule>,
    path: String,
    segments: Vec<String>,
}

pub(super) async fn scan_path(
    filesystem: &HostFilesystem,
    path: String,
    options: NestedRepoScanOptions,
    token: &AtomicBool,
    mut progress: impl FnMut(&NestedRepoScan),
) -> Result<NestedRepoScan, NestedRepoScanError> {
    let started = Instant::now();
    if has_git_marker(filesystem, &path).await {
        return Ok(result(
            path,
            "git_repo",
            Vec::new(),
            options,
            started,
            ScanState::default(),
        ));
    }
    let mut traversal = Traversal::new(filesystem, &path, options, token, started, &mut progress);
    traversal.scan().await;
    traversal.state.stopped = token.load(Ordering::Acquire);
    Ok(result(
        path.clone(),
        "non_git_folder",
        traversal.repos,
        options,
        started,
        traversal.state,
    ))
}

struct Traversal<'a, Progress> {
    filesystem: &'a HostFilesystem,
    folders: Vec<Folder>,
    options: NestedRepoScanOptions,
    progress: &'a mut Progress,
    repos: Vec<NestedRepoCandidate>,
    root_path: &'a str,
    started: Instant,
    state: ScanState,
    token: &'a AtomicBool,
}

impl<'a, Progress> Traversal<'a, Progress>
where
    Progress: FnMut(&NestedRepoScan),
{
    fn new(
        filesystem: &'a HostFilesystem,
        root_path: &'a str,
        options: NestedRepoScanOptions,
        token: &'a AtomicBool,
        started: Instant,
        progress: &'a mut Progress,
    ) -> Self {
        Self {
            filesystem,
            folders: vec![Folder {
                depth: 0,
                ignore_rules: Vec::new(),
                path: root_path.to_owned(),
                segments: Vec::new(),
            }],
            options,
            progress,
            repos: Vec::new(),
            root_path,
            started,
            state: ScanState::default(),
            token,
        }
    }

    async fn scan(&mut self) {
        let mut index = 0;
        while index < self.folders.len() {
            if self.should_stop() {
                break;
            }
            let folder = self.folders[index].clone();
            index += 1;
            if folder.depth > self.options.max_depth {
                continue;
            }
            let Ok(entries) = self.filesystem.read_dir(&folder.path).await else {
                continue;
            };
            let mut rules = folder.ignore_rules.clone();
            rules.extend(
                ignore::read_rules(self.filesystem, &folder.path, &entries, &folder.segments).await,
            );
            let mut directories = entries
                .into_iter()
                .filter(|entry| entry.kind == HostFileKind::Directory)
                .collect::<Vec<_>>();
            directories.sort_unstable_by(|left, right| left.name.cmp(&right.name));
            self.scan_directories(&folder, directories, rules).await;
        }
    }

    async fn scan_directories(
        &mut self,
        folder: &Folder,
        directories: Vec<crate::hosts::HostDirectoryEntry>,
        rules: Vec<IgnoreRule>,
    ) {
        for entry in directories {
            if self.should_stop() {
                break;
            }
            let mut segments = folder.segments.clone();
            segments.push(entry.name.clone());
            if ignore::is_ignored(&entry.name, &segments, &rules) {
                continue;
            }
            let child = self.filesystem.paths().join(&[&folder.path, &entry.name]);
            if has_git_marker(self.filesystem, &child).await {
                self.repos.push(NestedRepoCandidate {
                    depth: folder.depth + 1,
                    display_name: self.filesystem.paths().basename(&child),
                    path: child,
                });
                (self.progress)(&result(
                    self.root_path.to_owned(),
                    "non_git_folder",
                    self.repos.clone(),
                    self.options,
                    self.started,
                    self.state,
                ));
            } else if folder.depth < self.options.max_depth {
                self.folders.push(Folder {
                    depth: folder.depth + 1,
                    ignore_rules: rules.clone(),
                    path: child,
                    segments,
                });
            }
        }
    }

    fn should_stop(&mut self) -> bool {
        if self.repos.len() >= self.options.max_repos {
            self.state.truncated = true;
            return true;
        }
        stop(self.token, self.started, self.options, &mut self.state)
    }
}

async fn has_git_marker(filesystem: &HostFilesystem, path: &str) -> bool {
    let marker = filesystem.paths().join(&[path, ".git"]);
    if filesystem
        .stat(&marker)
        .await
        .ok()
        .flatten()
        .is_some_and(|stat| matches!(stat.kind, HostFileKind::Directory | HostFileKind::File))
    {
        return true;
    }
    let head = filesystem.paths().join(&[path, "HEAD"]);
    let objects = filesystem.paths().join(&[path, "objects"]);
    let refs = filesystem.paths().join(&[path, "refs"]);
    is_kind(filesystem, &head, HostFileKind::File).await
        && is_kind(filesystem, &objects, HostFileKind::Directory).await
        && is_kind(filesystem, &refs, HostFileKind::Directory).await
}

async fn is_kind(filesystem: &HostFilesystem, path: &str, expected: HostFileKind) -> bool {
    filesystem
        .stat(path)
        .await
        .ok()
        .flatten()
        .is_some_and(|stat| stat.kind == expected)
}

#[derive(Clone, Copy, Default)]
struct ScanState {
    stopped: bool,
    timed_out: bool,
    truncated: bool,
}

fn stop(
    token: &AtomicBool,
    started: Instant,
    options: NestedRepoScanOptions,
    state: &mut ScanState,
) -> bool {
    if token.load(Ordering::Acquire) {
        state.stopped = true;
        return true;
    }
    if options
        .timeout_ms
        .is_some_and(|limit| started.elapsed().as_millis() > u128::from(limit))
    {
        state.timed_out = true;
        return true;
    }
    false
}

fn result(
    path: String,
    kind: &'static str,
    repos: Vec<NestedRepoCandidate>,
    options: NestedRepoScanOptions,
    started: Instant,
    state: ScanState,
) -> NestedRepoScan {
    NestedRepoScan {
        duration_ms: i64::try_from(started.elapsed().as_millis()).unwrap_or(i64::MAX),
        max_depth: options.max_depth,
        max_repos: options.max_repos,
        repos,
        selected_path: path,
        selected_path_kind: kind,
        stopped: state.stopped,
        timed_out: state.timed_out,
        timeout_ms: options.timeout_ms,
        truncated: state.truncated,
    }
}
