use std::collections::VecDeque;
use std::sync::Arc;

use base64::Engine;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::hosts::{
    ExecutionHost, HostCommand, HostFileKind, HostFilesystem, HostKind, HostRemoveOptions,
};
use crate::workspace_paths::PathResolution;

use super::model::MutationResult;
use super::{FilesAuthority, FilesError, host_io, path, scope};

impl FilesAuthority {
    pub(crate) async fn write(
        &self,
        worktree: &str,
        relative_path: &str,
        content: &str,
    ) -> Result<MutationResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (_, target) = scope::target(
            &scope,
            &self.paths,
            relative_path,
            false,
            PathResolution::Follow,
        )
        .await?;
        if host_io::metadata(scope.host.clone(), &target, false)
            .await?
            .is_some_and(|metadata| metadata.kind == HostFileKind::Directory)
        {
            return Err(FilesError::InvalidInput("Cannot write to a directory"));
        }
        write_bytes(
            scope.host.clone(),
            &target,
            content.as_bytes(),
            WriteMode::Replace,
        )
        .await?;
        self.invalidate_scope(&scope).await;
        Ok(MutationResult::OK)
    }

    pub(crate) async fn write_base64(
        &self,
        worktree: &str,
        relative_path: &str,
        content_base64: &str,
    ) -> Result<MutationResult, FilesError> {
        self.write_base64_chunk(worktree, relative_path, content_base64, false)
            .await
    }

    pub(crate) async fn write_base64_chunk(
        &self,
        worktree: &str,
        relative_path: &str,
        content_base64: &str,
        append: bool,
    ) -> Result<MutationResult, FilesError> {
        let mut encoded = content_base64.to_owned();
        match encoded.len() % 4 {
            2 => encoded.push_str("=="),
            3 => encoded.push('='),
            _ => {}
        }
        let content = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| FilesError::InvalidInput("File content must be base64"))?;
        let scope = self.scopes.resolve(worktree).await?;
        let (_, target) = scope::target(
            &scope,
            &self.paths,
            relative_path,
            false,
            PathResolution::Follow,
        )
        .await?;
        create_parent(scope.host.clone(), &target).await?;
        write_bytes(
            scope.host.clone(),
            &target,
            &content,
            if append {
                WriteMode::Append
            } else {
                WriteMode::Exclusive
            },
        )
        .await?;
        self.invalidate_scope(&scope).await;
        Ok(MutationResult::OK)
    }

    pub(crate) async fn create_file(
        &self,
        worktree: &str,
        relative_path: &str,
    ) -> Result<MutationResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (_, target) = scope::target(
            &scope,
            &self.paths,
            relative_path,
            false,
            PathResolution::Follow,
        )
        .await?;
        create_parent(scope.host.clone(), &target).await?;
        write_bytes(scope.host.clone(), &target, &[], WriteMode::Exclusive).await?;
        self.invalidate_scope(&scope).await;
        Ok(MutationResult::OK)
    }

    pub(crate) async fn create_directory(
        &self,
        worktree: &str,
        relative_path: &str,
    ) -> Result<MutationResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (_, target) = scope::target(
            &scope,
            &self.paths,
            relative_path,
            false,
            PathResolution::Follow,
        )
        .await?;
        if host_io::metadata(scope.host.clone(), &target, false)
            .await?
            .is_some()
        {
            return Err(FilesError::PathExists(path::basename(&target)));
        }
        HostFilesystem::new(scope.host.clone())
            .mkdir(&target, false)
            .await?;
        self.invalidate_scope(&scope).await;
        Ok(MutationResult::OK)
    }

    pub(crate) async fn create_directory_no_clobber(
        &self,
        worktree: &str,
        relative_path: &str,
    ) -> Result<MutationResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (_, target) = scope::target(
            &scope,
            &self.paths,
            relative_path,
            false,
            PathResolution::Follow,
        )
        .await?;
        HostFilesystem::new(scope.host.clone())
            .mkdir(&target, false)
            .await?;
        self.invalidate_scope(&scope).await;
        Ok(MutationResult::OK)
    }

    pub(crate) async fn commit_upload(
        &self,
        worktree: &str,
        temporary_relative_path: &str,
        final_relative_path: &str,
    ) -> Result<MutationResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (_, temporary) = scope::target(
            &scope,
            &self.paths,
            temporary_relative_path,
            false,
            PathResolution::Follow,
        )
        .await?;
        let (_, final_path) = scope::target(
            &scope,
            &self.paths,
            final_relative_path,
            false,
            PathResolution::Follow,
        )
        .await?;
        create_parent(scope.host.clone(), &final_path).await?;
        copy_exclusive(scope.host.clone(), &temporary, &final_path).await?;
        HostFilesystem::new(scope.host.clone())
            .remove(
                &temporary,
                HostRemoveOptions {
                    force: true,
                    recursive: false,
                },
            )
            .await?;
        self.invalidate_scope(&scope).await;
        Ok(MutationResult::OK)
    }

    pub(crate) async fn rename(
        &self,
        worktree: &str,
        old_relative_path: &str,
        new_relative_path: &str,
    ) -> Result<MutationResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (_, old_path) = scope::target(
            &scope,
            &self.paths,
            old_relative_path,
            false,
            PathResolution::PreserveLeaf,
        )
        .await?;
        let (_, new_path) = scope::target(
            &scope,
            &self.paths,
            new_relative_path,
            false,
            PathResolution::PreserveLeaf,
        )
        .await?;
        assert_rename_destination(scope.host.clone(), &old_path, &new_path).await?;
        HostFilesystem::new(scope.host.clone())
            .rename(&old_path, &new_path)
            .await?;
        self.invalidate_scope(&scope).await;
        Ok(MutationResult::OK)
    }

    pub(crate) async fn copy(
        &self,
        worktree: &str,
        source_relative_path: &str,
        destination_relative_path: &str,
    ) -> Result<MutationResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (_, source) = scope::target(
            &scope,
            &self.paths,
            source_relative_path,
            false,
            PathResolution::PreserveLeaf,
        )
        .await?;
        let (_, destination) = scope::target(
            &scope,
            &self.paths,
            destination_relative_path,
            false,
            PathResolution::PreserveLeaf,
        )
        .await?;
        create_parent(scope.host.clone(), &destination).await?;
        copy_exclusive(scope.host.clone(), &source, &destination).await?;
        self.invalidate_scope(&scope).await;
        Ok(MutationResult::OK)
    }

    pub(crate) async fn delete(
        &self,
        worktree: &str,
        relative_path: &str,
        recursive: bool,
    ) -> Result<MutationResult, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let (_, target) = scope::target(
            &scope,
            &self.paths,
            relative_path,
            false,
            PathResolution::PreserveLeaf,
        )
        .await?;
        HostFilesystem::new(scope.host.clone())
            .remove(
                &target,
                HostRemoveOptions {
                    force: true,
                    recursive,
                },
            )
            .await?;
        self.invalidate_scope(&scope).await;
        Ok(MutationResult::OK)
    }

    async fn invalidate_scope(&self, scope: &scope::FileScope) {
        self.inventory
            .invalidate(scope.host.id(), &scope.path)
            .await;
    }
}

#[derive(Clone, Copy)]
enum WriteMode {
    Append,
    Exclusive,
    Replace,
}

async fn create_parent(host: Arc<dyn ExecutionHost>, path: &str) -> Result<(), FilesError> {
    let filesystem = HostFilesystem::new(host);
    filesystem
        .mkdir(&filesystem.paths().dirname(path), true)
        .await?;
    Ok(())
}

async fn write_bytes(
    host: Arc<dyn ExecutionHost>,
    path: &str,
    content: &[u8],
    mode: WriteMode,
) -> Result<(), FilesError> {
    if host.kind() == HostKind::Local {
        let mut options = tokio::fs::OpenOptions::new();
        options.write(true);
        match mode {
            WriteMode::Append => {
                options.append(true).create(true);
            }
            WriteMode::Exclusive => {
                options.create_new(true);
            }
            WriteMode::Replace => {
                options.create(true).truncate(true);
            }
        }
        let mut file = options.open(path).await?;
        file.write_all(content).await?;
        file.flush().await?;
        return Ok(());
    }
    let operator = match mode {
        WriteMode::Append => ">>",
        WriteMode::Exclusive | WriteMode::Replace => ">",
    };
    let noclobber = if matches!(mode, WriteMode::Exclusive) {
        "set -C;"
    } else {
        ""
    };
    let mut command = HostCommand::new(
        "sh",
        [
            "-c".to_owned(),
            format!("{noclobber} cat {operator} \"$1\""),
            "sh".to_owned(),
            path.to_owned(),
        ],
    );
    command.stdin = Some(content.to_vec());
    let output = host.exec(command).await?;
    if output.exit_code == 0 {
        Ok(())
    } else {
        Err(FilesError::CommandFailed("write file"))
    }
}

async fn copy_exclusive(
    host: Arc<dyn ExecutionHost>,
    source: &str,
    destination: &str,
) -> Result<(), FilesError> {
    if host.kind() != HostKind::Local {
        return remote_copy_exclusive(host, source, destination).await;
    }
    let metadata = tokio::fs::symlink_metadata(source).await?;
    if metadata.is_file() {
        return local_copy_file(source, destination, metadata.permissions()).await;
    }
    if metadata.file_type().is_symlink() {
        return local_copy_symlink(source, destination).await;
    }
    if !metadata.is_dir() {
        return Err(FilesError::InvalidInput("unsupported copy source"));
    }
    tokio::fs::create_dir(destination).await?;
    tokio::fs::set_permissions(destination, metadata.permissions()).await?;
    let mut pending = VecDeque::from([(source.to_owned(), destination.to_owned())]);
    while let Some((source_dir, destination_dir)) = pending.pop_front() {
        let mut entries = tokio::fs::read_dir(&source_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            let source_path = entry.path();
            let destination_path = std::path::Path::new(&destination_dir).join(entry.file_name());
            let metadata = tokio::fs::symlink_metadata(&source_path).await?;
            if metadata.is_dir() {
                tokio::fs::create_dir(&destination_path).await?;
                tokio::fs::set_permissions(&destination_path, metadata.permissions()).await?;
                pending.push_back((
                    source_path.to_string_lossy().into_owned(),
                    destination_path.to_string_lossy().into_owned(),
                ));
            } else if metadata.file_type().is_symlink() {
                local_copy_symlink(&source_path, &destination_path).await?;
            } else if metadata.is_file() {
                local_copy_file(&source_path, &destination_path, metadata.permissions()).await?;
            }
        }
    }
    Ok(())
}

async fn local_copy_file(
    source: impl AsRef<std::path::Path>,
    destination: impl AsRef<std::path::Path>,
    permissions: std::fs::Permissions,
) -> Result<(), FilesError> {
    let mut source = tokio::fs::File::open(source).await?;
    let mut destination = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination.as_ref())
        .await?;
    let mut buffer = vec![0; 128 * 1_024];
    loop {
        let read = source.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        destination.write_all(&buffer[..read]).await?;
    }
    destination.flush().await?;
    destination.set_permissions(permissions).await?;
    Ok(())
}

#[cfg(unix)]
async fn local_copy_symlink(
    source: impl AsRef<std::path::Path>,
    destination: impl AsRef<std::path::Path>,
) -> Result<(), FilesError> {
    tokio::fs::symlink(tokio::fs::read_link(source).await?, destination).await?;
    Ok(())
}

#[cfg(windows)]
async fn local_copy_symlink(
    source: impl AsRef<std::path::Path>,
    destination: impl AsRef<std::path::Path>,
) -> Result<(), FilesError> {
    let target = tokio::fs::read_link(source.as_ref()).await?;
    if tokio::fs::metadata(source).await?.is_dir() {
        tokio::fs::symlink_dir(target, destination).await?;
    } else {
        tokio::fs::symlink_file(target, destination).await?;
    }
    Ok(())
}

async fn remote_copy_exclusive(
    host: Arc<dyn ExecutionHost>,
    source: &str,
    destination: &str,
) -> Result<(), FilesError> {
    let script = r#"
source=$1
destination=$2
copy_mode() {
  if mode=$(stat -c '%a' "$1" 2>/dev/null); then :
  elif mode=$(stat -f '%Lp' "$1" 2>/dev/null); then :
  else return
  fi
  chmod "$mode" "$2"
}
if [ -e "$destination" ] || [ -L "$destination" ]; then exit 17; fi
if [ -L "$source" ]; then
  link_target=$(readlink "$source") || exit
  case $link_target in -*) link_target=./$link_target;; esac
  ln -s "$link_target" "$destination"
elif [ -d "$source" ]; then
  mkdir "$destination" || exit
  cp -RP "$source"/. "$destination"/ || exit
  copy_mode "$source" "$destination"
elif [ -f "$source" ]; then
  (set -C; cat "$source" > "$destination") || exit
  copy_mode "$source" "$destination"
else
  exit 64
fi
"#;
    let output = host
        .exec(HostCommand::new(
            "sh",
            ["-c", script, "sh", source, destination],
        ))
        .await?;
    if output.exit_code == 0 {
        Ok(())
    } else {
        Err(FilesError::CommandFailed("copy path"))
    }
}

async fn assert_rename_destination(
    host: Arc<dyn ExecutionHost>,
    old_path: &str,
    new_path: &str,
) -> Result<(), FilesError> {
    let Some(new_metadata) = host_io::metadata(host.clone(), new_path, false).await? else {
        return Ok(());
    };
    let old_metadata = host_io::metadata(host.clone(), old_path, false)
        .await?
        .ok_or_else(|| FilesError::MissingPath(old_path.to_owned()))?;
    let filesystem = HostFilesystem::new(host);
    let old_name = filesystem.paths().basename(old_path);
    let new_name = filesystem.paths().basename(new_path);
    let case_only = filesystem.paths().dirname(old_path) == filesystem.paths().dirname(new_path)
        && old_name != new_name
        && old_name.to_lowercase() == new_name.to_lowercase();
    if old_metadata.identity == new_metadata.identity && case_only {
        Ok(())
    } else {
        Err(FilesError::PathExists(new_name))
    }
}
