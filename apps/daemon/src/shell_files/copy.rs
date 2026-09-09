use std::path::PathBuf;

use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::hosts::{HostCommand, HostFilesystem, HostKind};
use crate::workspace_paths::AuthorizedWorkspacePath;

use super::ShellFileError;

pub(super) async fn entry(
    source: AuthorizedWorkspacePath,
    destination: AuthorizedWorkspacePath,
) -> Result<(), ShellFileError> {
    if source.host.kind() == HostKind::Local {
        copy_local(PathBuf::from(source.path), PathBuf::from(destination.path)).await
    } else {
        let output = source
            .host
            .exec(HostCommand::new(
                "cp",
                ["-R", "-P", "--", &source.path, &destination.path],
            ))
            .await?;
        if output.exit_code == 0 {
            Ok(())
        } else {
            Err(ShellFileError::Operation(output.stderr.trim().to_owned()))
        }
    }
}

async fn copy_local(source: PathBuf, destination: PathBuf) -> Result<(), ShellFileError> {
    let mut pending = vec![(source, destination)];
    while let Some((source, destination)) = pending.pop() {
        let metadata = tokio::fs::symlink_metadata(&source).await?;
        if metadata.is_symlink() {
            copy_symlink(&source, &destination).await?;
        } else if metadata.is_dir() {
            tokio::fs::create_dir(&destination).await?;
            let mut entries = tokio::fs::read_dir(&source).await?;
            while let Some(entry) = entries.next_entry().await? {
                pending.push((entry.path(), destination.join(entry.file_name())));
            }
        } else {
            copy_file(&source, &destination).await?;
        }
    }
    Ok(())
}

async fn copy_file(source: &PathBuf, destination: &PathBuf) -> Result<(), ShellFileError> {
    let permissions = tokio::fs::metadata(source).await?.permissions();
    let mut source = tokio::fs::File::open(source).await?;
    let mut destination = tokio::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(destination)
        .await?;
    let mut buffer = vec![0; 64 * 1_024];
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
async fn copy_symlink(source: &PathBuf, destination: &PathBuf) -> Result<(), ShellFileError> {
    let target = tokio::fs::read_link(source).await?;
    tokio::fs::symlink(target, destination).await?;
    Ok(())
}

#[cfg(windows)]
async fn copy_symlink(source: &PathBuf, destination: &PathBuf) -> Result<(), ShellFileError> {
    let target = tokio::fs::read_link(source).await?;
    let follows_directory = tokio::fs::metadata(source)
        .await
        .is_ok_and(|metadata| metadata.is_dir());
    if follows_directory {
        tokio::fs::symlink_dir(target, destination).await?;
    } else {
        tokio::fs::symlink_file(target, destination).await?;
    }
    Ok(())
}

pub(super) async fn ensure_source_exists(
    source: &AuthorizedWorkspacePath,
) -> Result<(), ShellFileError> {
    let filesystem = HostFilesystem::new(source.host.clone());
    if filesystem.stat(&source.path).await?.is_some() {
        Ok(())
    } else {
        Err(ShellFileError::Operation(
            "No such file or directory".to_owned(),
        ))
    }
}
