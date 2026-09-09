use crate::hosts::{HostFilesystem, HostKind};
use crate::workspace_paths::{AuthorizedWorkspacePath, PathResolution};

use super::{ShellFileError, ShellFiles};

impl ShellFiles {
    pub(crate) async fn rename(
        &self,
        old_path: &str,
        new_path: &str,
    ) -> Result<(), ShellFileError> {
        let source = self
            .authority
            .resolve(old_path, PathResolution::PreserveLeaf)
            .await?;
        let destination = self
            .authority
            .resolve(new_path, PathResolution::PreserveLeaf)
            .await?;
        require_same_host(&source, &destination)?;
        let filesystem = HostFilesystem::new(source.host.clone());
        if filesystem.stat(&destination.path).await?.is_some()
            && !is_case_only_identity(&source, &destination).await?
        {
            return Err(destination_conflict(&filesystem, &destination.path));
        }
        filesystem.rename(&source.path, &destination.path).await?;
        Ok(())
    }

    pub(crate) async fn copy(
        &self,
        source_path: &str,
        destination_path: &str,
    ) -> Result<(), ShellFileError> {
        let source = self
            .authority
            .resolve(source_path, PathResolution::PreserveLeaf)
            .await?;
        let destination = self
            .authority
            .resolve(destination_path, PathResolution::PreserveLeaf)
            .await?;
        require_same_host(&source, &destination)?;
        let filesystem = HostFilesystem::new(source.host.clone());
        super::copy::ensure_source_exists(&source).await?;
        if filesystem.stat(&destination.path).await?.is_some() {
            return Err(destination_conflict(&filesystem, &destination.path));
        }
        let parent = filesystem.paths().dirname(&destination.path);
        filesystem.mkdir(&parent, true).await?;
        super::copy::entry(source, destination).await
    }
}

fn require_same_host(
    source: &AuthorizedWorkspacePath,
    destination: &AuthorizedWorkspacePath,
) -> Result<(), ShellFileError> {
    if source.host.id() == destination.host.id() {
        Ok(())
    } else {
        Err(ShellFileError::CrossHost)
    }
}

async fn is_case_only_identity(
    source: &AuthorizedWorkspacePath,
    destination: &AuthorizedWorkspacePath,
) -> Result<bool, ShellFileError> {
    if source.host.kind() != HostKind::Local {
        return Ok(false);
    }
    let paths = HostFilesystem::new(source.host.clone()).paths();
    let old_name = paths.basename(&source.path);
    let new_name = paths.basename(&destination.path);
    if paths.dirname(&source.path) != paths.dirname(&destination.path)
        || old_name == new_name
        || old_name.to_lowercase() != new_name.to_lowercase()
    {
        return Ok(false);
    }
    let old_real = tokio::fs::canonicalize(&source.path).await?;
    let new_real = tokio::fs::canonicalize(&destination.path).await?;
    Ok(old_real == new_real)
}

fn destination_conflict(filesystem: &HostFilesystem, path: &str) -> ShellFileError {
    let name = filesystem.paths().basename(path);
    ShellFileError::Operation(format!(
        "A file or folder named '{name}' already exists in this location"
    ))
}
