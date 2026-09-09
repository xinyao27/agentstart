use serde_json::{Value, json};

use crate::hosts::{HostFileKind, HostFilesystem, HostPaths};

use super::runner::{GitRunOptions, command_failure};
use super::scope::{GitAuthority, GitAuthorityError, GitScope};

const BULK_CHUNK_SIZE: usize = 100;

impl GitAuthority {
    pub(crate) async fn stage(
        &self,
        worktree: &str,
        file_path: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        let path = literal_pathspec(&scope, file_path)?;
        scope
            .runner
            .checked(vec!["add".to_owned(), "--".to_owned(), path])
            .await?;
        Ok(json!({ "ok": true }))
    }

    pub(crate) async fn unstage(
        &self,
        worktree: &str,
        file_path: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        let path = literal_pathspec(&scope, file_path)?;
        scope
            .runner
            .checked(vec![
                "restore".to_owned(),
                "--staged".to_owned(),
                "--".to_owned(),
                path,
            ])
            .await?;
        Ok(json!({ "ok": true }))
    }

    pub(crate) async fn bulk_stage(
        &self,
        worktree: &str,
        file_paths: &[String],
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        for chunk in file_paths.chunks(BULK_CHUNK_SIZE) {
            let mut args = vec!["add".to_owned(), "--".to_owned()];
            args.extend(literal_pathspecs(&scope, chunk)?);
            scope.runner.checked(args).await?;
        }
        Ok(json!({ "ok": true }))
    }

    pub(crate) async fn bulk_unstage(
        &self,
        worktree: &str,
        file_paths: &[String],
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        for chunk in file_paths.chunks(BULK_CHUNK_SIZE) {
            let mut args = vec!["restore".to_owned(), "--staged".to_owned(), "--".to_owned()];
            args.extend(literal_pathspecs(&scope, chunk)?);
            scope.runner.checked(args).await?;
        }
        Ok(json!({ "ok": true }))
    }

    pub(crate) async fn discard(
        &self,
        worktree: &str,
        file_path: &str,
    ) -> Result<Value, GitAuthorityError> {
        self.bulk_discard(worktree, &[file_path.to_owned()]).await
    }

    pub(crate) async fn bulk_discard(
        &self,
        worktree: &str,
        file_paths: &[String],
    ) -> Result<Value, GitAuthorityError> {
        if file_paths.is_empty() {
            return Ok(json!({ "ok": true }));
        }
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        let pathspecs = literal_pathspecs(&scope, file_paths)?;
        let tracked = tracked_paths(&scope, &pathspecs).await?;
        let mut tracked_specs = Vec::new();
        let mut untracked_paths = Vec::new();
        let mut untracked_specs = Vec::new();
        for (path, pathspec) in file_paths.iter().zip(pathspecs) {
            if tracked.iter().any(|tracked| contains_path(path, tracked)) {
                tracked_specs.push(pathspec);
            } else {
                untracked_paths.push(path.clone());
                untracked_specs.push(pathspec);
            }
        }
        validate_untracked_targets(&scope, &untracked_paths).await?;
        for chunk in tracked_specs.chunks(BULK_CHUNK_SIZE) {
            let mut args = vec![
                "restore".to_owned(),
                "--worktree".to_owned(),
                "--source=HEAD".to_owned(),
                "--".to_owned(),
            ];
            args.extend_from_slice(chunk);
            scope.runner.checked(args).await?;
        }
        validate_untracked_targets(&scope, &untracked_paths).await?;
        for chunk in untracked_specs.chunks(BULK_CHUNK_SIZE) {
            let mut args = vec!["clean".to_owned(), "-ffdx".to_owned(), "--".to_owned()];
            args.extend_from_slice(chunk);
            scope.runner.checked(args).await?;
        }
        Ok(json!({ "ok": true }))
    }

    pub(crate) async fn commit(
        &self,
        worktree: &str,
        message: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        let output = scope
            .runner
            .run(
                vec!["commit".to_owned(), "-m".to_owned(), message.to_owned()],
                GitRunOptions::default(),
            )
            .await?;
        if output.exit_code == 0 {
            Ok(json!({ "success": true }))
        } else {
            let message = command_failure(output).to_string();
            Ok(json!({ "success": false, "error": message }))
        }
    }
}

async fn validate_untracked_targets(
    scope: &GitScope,
    file_paths: &[String],
) -> Result<(), GitAuthorityError> {
    let filesystem = HostFilesystem::new(scope.host.clone());
    let paths = filesystem.paths();
    let real_worktree = filesystem.canonical_directory(&scope.runner.cwd).await?;
    for file_path in file_paths {
        let target = paths.resolve(&scope.runner.cwd, &[file_path]);
        assert_child(&paths, &scope.runner.cwd, &target, file_path)?;
        let real_target = match filesystem.stat(&target).await? {
            Some(stat) if stat.kind == HostFileKind::Directory => {
                filesystem.canonical_directory(&target).await?
            }
            Some(stat) => {
                let parent = paths.dirname(&target);
                let real_parent = filesystem.canonical_directory(&parent).await?;
                if stat.kind == HostFileKind::Symlink {
                    real_parent
                } else {
                    paths.join(&[&real_parent, &paths.basename(&target)])
                }
            }
            None => nearest_real_parent(&filesystem, &paths, &target, file_path).await?,
        };
        assert_inside_or_equal(&paths, &real_worktree, &real_target, file_path)?;
    }
    Ok(())
}

async fn nearest_real_parent(
    filesystem: &HostFilesystem,
    paths: &HostPaths,
    target: &str,
    original: &str,
) -> Result<String, GitAuthorityError> {
    let mut parent = paths.dirname(target);
    loop {
        if filesystem.stat(&parent).await?.is_some() {
            return filesystem
                .canonical_directory(&parent)
                .await
                .map_err(Into::into);
        }
        let next = paths.dirname(&parent);
        if next == parent {
            return Err(outside_worktree(original));
        }
        parent = next;
    }
}

fn assert_child(
    paths: &HostPaths,
    root: &str,
    target: &str,
    original: &str,
) -> Result<(), GitAuthorityError> {
    let relative = paths.relative(root, target);
    if relative.is_empty()
        || relative == "."
        || relative == ".."
        || relative.starts_with("../")
        || relative.starts_with("..\\")
        || paths.is_absolute(&relative)
    {
        return Err(outside_worktree(original));
    }
    Ok(())
}

fn assert_inside_or_equal(
    paths: &HostPaths,
    root: &str,
    target: &str,
    original: &str,
) -> Result<(), GitAuthorityError> {
    let relative = paths.relative(root, target);
    if relative == ".."
        || relative.starts_with("../")
        || relative.starts_with("..\\")
        || paths.is_absolute(&relative)
    {
        return Err(outside_worktree(original));
    }
    Ok(())
}

fn outside_worktree(path: &str) -> GitAuthorityError {
    GitAuthorityError::Operation(format!("Path \"{path}\" resolves outside the worktree"))
}

fn literal_pathspec(scope: &GitScope, file_path: &str) -> Result<String, GitAuthorityError> {
    validate_relative(scope, file_path)?;
    let path = file_path.replace('\\', "/");
    Ok(format!(":(literal){path}"))
}

fn literal_pathspecs(
    scope: &GitScope,
    file_paths: &[String],
) -> Result<Vec<String>, GitAuthorityError> {
    file_paths
        .iter()
        .map(|path| literal_pathspec(scope, path))
        .collect()
}

fn validate_relative(scope: &GitScope, file_path: &str) -> Result<(), GitAuthorityError> {
    if file_path.is_empty() {
        return Err(GitAuthorityError::InvalidInput("missing file path"));
    }
    let filesystem = HostFilesystem::new(scope.host.clone());
    if filesystem.paths().is_absolute(file_path)
        || file_path.split(['/', '\\']).any(|segment| segment == "..")
    {
        return Err(GitAuthorityError::Operation(format!(
            "Path \"{file_path}\" resolves outside the worktree"
        )));
    }
    Ok(())
}

async fn tracked_paths(
    scope: &GitScope,
    pathspecs: &[String],
) -> Result<Vec<String>, GitAuthorityError> {
    let mut paths = Vec::new();
    for chunk in pathspecs.chunks(BULK_CHUNK_SIZE) {
        let mut args = vec!["ls-files".to_owned(), "-z".to_owned(), "--".to_owned()];
        args.extend_from_slice(chunk);
        let output = scope.runner.checked(args).await?;
        paths.extend(
            output
                .split('\0')
                .filter(|path| !path.is_empty())
                .map(str::to_owned),
        );
    }
    Ok(paths)
}

fn contains_path(requested: &str, tracked: &str) -> bool {
    let requested = requested.trim_end_matches(['/', '\\']).replace('\\', "/");
    let tracked = tracked.trim_end_matches(['/', '\\']).replace('\\', "/");
    tracked == requested || tracked.starts_with(&format!("{requested}/"))
}
