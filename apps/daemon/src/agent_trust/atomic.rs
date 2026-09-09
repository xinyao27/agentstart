use crate::atomic_file_replace;
use crate::hosts::{
    ExecutionHost, HostCommand, HostFileKind, HostFilesystem, HostKind, HostRemoveOptions,
};

use super::AgentTrustError;

const SYMLINK_LIMIT: usize = 20;

pub(super) async fn replace(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    target: &str,
    contents: &[u8],
) -> Result<(), AgentTrustError> {
    let target = writable_target(filesystem, host, target).await?;
    let directory = filesystem.paths().dirname(&target);
    filesystem.mkdir(&directory, true).await?;
    let temporary = temporary_path(&target)?;
    if host.kind() == HostKind::Local {
        replace_local(&temporary, &target, contents).await
    } else {
        replace_remote(filesystem, &temporary, &target, contents).await
    }
}

pub(super) async fn canonical_entry(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    path: &str,
) -> String {
    if host.kind() == HostKind::Local {
        return tokio::fs::canonicalize(path)
            .await
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_else(|_| path.to_owned());
    }
    canonical_remote_entry(filesystem, host, path)
        .await
        .unwrap_or_else(|_| path.to_owned())
}

async fn writable_target(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    path: &str,
) -> Result<String, AgentTrustError> {
    if filesystem
        .stat(path)
        .await?
        .is_none_or(|stat| stat.kind != HostFileKind::Symlink)
    {
        return Ok(path.to_owned());
    }
    if host.kind() == HostKind::Local {
        return Ok(tokio::fs::canonicalize(path)
            .await?
            .to_string_lossy()
            .into_owned());
    }
    resolve_remote_links(filesystem, host, path).await
}

async fn canonical_remote_entry(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    path: &str,
) -> Result<String, AgentTrustError> {
    let Some(stat) = filesystem.stat(path).await? else {
        return Ok(path.to_owned());
    };
    if stat.kind == HostFileKind::Directory {
        return Ok(filesystem.canonical_directory(path).await?);
    }
    let resolved = if stat.kind == HostFileKind::Symlink {
        resolve_remote_links(filesystem, host, path).await?
    } else {
        path.to_owned()
    };
    let directory = filesystem.paths().dirname(&resolved);
    let basename = filesystem.paths().basename(&resolved);
    let canonical_directory = filesystem.canonical_directory(&directory).await?;
    Ok(filesystem
        .paths()
        .join(&[canonical_directory.as_str(), basename.as_str()]))
}

async fn resolve_remote_links(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    path: &str,
) -> Result<String, AgentTrustError> {
    let mut current = path.to_owned();
    for _ in 0..SYMLINK_LIMIT {
        let Some(stat) = filesystem.stat(&current).await? else {
            return Ok(current);
        };
        if stat.kind != HostFileKind::Symlink {
            return Ok(current);
        }
        let output = host
            .exec(HostCommand::new("readlink", [current.as_str()]))
            .await?;
        if output.exit_code != 0 {
            return Err(AgentTrustError::SymlinkResolution);
        }
        let target = output.stdout.trim_end_matches(['\r', '\n']);
        if target.is_empty() {
            return Err(AgentTrustError::SymlinkResolution);
        }
        current = if filesystem.paths().is_absolute(target) {
            target.to_owned()
        } else {
            let directory = filesystem.paths().dirname(&current);
            filesystem.paths().resolve(&directory, &[target])
        };
    }
    Err(AgentTrustError::SymlinkResolution)
}

async fn replace_remote(
    filesystem: &HostFilesystem,
    temporary: &str,
    target: &str,
    contents: &[u8],
) -> Result<(), AgentTrustError> {
    let result = async {
        filesystem.write(temporary, contents).await?;
        filesystem.rename(temporary, target).await?;
        Ok(())
    }
    .await;
    if result.is_err() {
        let _ = filesystem
            .remove(
                temporary,
                HostRemoveOptions {
                    force: true,
                    recursive: false,
                },
            )
            .await;
    }
    result
}

async fn replace_local(
    temporary: &str,
    target: &str,
    contents: &[u8],
) -> Result<(), AgentTrustError> {
    use tokio::io::AsyncWriteExt;

    let result = async {
        let mut options = tokio::fs::OpenOptions::new();
        options.create_new(true).write(true);
        let mut file = options.open(temporary).await?;
        file.write_all(contents).await?;
        file.flush().await?;
        file.sync_all().await?;
        if let Ok(metadata) = tokio::fs::metadata(target).await {
            tokio::fs::set_permissions(temporary, metadata.permissions()).await?;
        }
        atomic_file_replace::replace_async(
            std::path::Path::new(temporary),
            std::path::Path::new(target),
        )
        .await?;
        Ok(())
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(temporary).await;
    }
    result
}

fn temporary_path(target: &str) -> Result<String, AgentTrustError> {
    let mut entropy = [0_u8; 8];
    getrandom::fill(&mut entropy).map_err(|error| AgentTrustError::Entropy(error.to_string()))?;
    let suffix = u64::from_le_bytes(entropy);
    Ok(format!("{target}.{}.{suffix:016x}.tmp", std::process::id()))
}
