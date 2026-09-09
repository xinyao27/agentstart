use tokio::io::AsyncWriteExt;

use crate::hosts::{HostCommand, HostFileKind, HostFilesystem, HostKind};
use crate::workspace_paths::PathResolution;

use super::{ShellFileError, ShellFiles};

impl ShellFiles {
    pub(crate) async fn write(&self, file_path: &str, content: &str) -> Result<(), ShellFileError> {
        let target = self
            .authority
            .resolve(file_path, PathResolution::Follow)
            .await?;
        let filesystem = HostFilesystem::new(target.host.clone());
        if filesystem
            .stat(&target.path)
            .await?
            .is_some_and(|stat| stat.kind == HostFileKind::Directory)
        {
            return Err(ShellFileError::Operation(
                "Cannot write to a directory".to_owned(),
            ));
        }
        filesystem.write(&target.path, content.as_bytes()).await?;
        Ok(())
    }

    pub(crate) async fn create_file(&self, file_path: &str) -> Result<(), ShellFileError> {
        let target = self
            .authority
            .resolve(file_path, PathResolution::Follow)
            .await?;
        let filesystem = HostFilesystem::new(target.host.clone());
        let parent = filesystem.paths().dirname(&target.path);
        filesystem.mkdir(&parent, true).await?;
        if target.host.kind() == HostKind::Local {
            return create_local_file(&filesystem, &target.path).await;
        }
        let script = "set -C; : > \"$1\"";
        let output = target
            .host
            .exec(HostCommand::new("sh", ["-c", script, "sh", &target.path]))
            .await?;
        if output.exit_code == 0 {
            Ok(())
        } else {
            Err(create_error(&target.path, output.stderr.trim()))
        }
    }

    pub(crate) async fn create_directory(
        &self,
        directory_path: &str,
    ) -> Result<(), ShellFileError> {
        let target = self
            .authority
            .resolve(directory_path, PathResolution::Follow)
            .await?;
        let filesystem = HostFilesystem::new(target.host.clone());
        if filesystem.stat(&target.path).await?.is_some() {
            return Err(conflict(&filesystem, &target.path));
        }
        filesystem.mkdir(&target.path, true).await.map_err(|error| {
            let message = error.to_string();
            if message.contains("Permission denied") {
                permission(&filesystem, &target.path)
            } else {
                error.into()
            }
        })
    }
}

async fn create_local_file(filesystem: &HostFilesystem, path: &str) -> Result<(), ShellFileError> {
    match tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .await
    {
        Ok(mut file) => {
            file.flush().await?;
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            Err(conflict(filesystem, path))
        }
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            Err(permission(filesystem, path))
        }
        Err(error) => Err(error.into()),
    }
}

fn create_error(path: &str, detail: &str) -> ShellFileError {
    if detail.to_ascii_lowercase().contains("exist") {
        let name = path.rsplit('/').next().unwrap_or(path);
        ShellFileError::Operation(format!(
            "A file or folder named '{name}' already exists in this location"
        ))
    } else if detail.to_ascii_lowercase().contains("permission") {
        let name = path.rsplit('/').next().unwrap_or(path);
        ShellFileError::Operation(format!("Permission denied: unable to create '{name}'"))
    } else {
        ShellFileError::Operation(detail.to_owned())
    }
}

fn conflict(filesystem: &HostFilesystem, path: &str) -> ShellFileError {
    let name = filesystem.paths().basename(path);
    ShellFileError::Operation(format!(
        "A file or folder named '{name}' already exists in this location"
    ))
}

fn permission(filesystem: &HostFilesystem, path: &str) -> ShellFileError {
    let name = filesystem.paths().basename(path);
    ShellFileError::Operation(format!("Permission denied: unable to create '{name}'"))
}
