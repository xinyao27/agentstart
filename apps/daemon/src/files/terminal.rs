use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::hosts::{
    ExecutionHost, HostCommand, HostFileKind, HostFilesystem, HostKind, HostPlatform,
};

use super::model::{
    FilePreviewResult, FileReadResult, MutationResult, TerminalOpenTarget, TerminalPathResolution,
};
use super::{FilesAuthority, FilesError, TerminalGrant, host_io, path, query};

const GRANT_TTL: Duration = Duration::from_secs(10 * 60);
const MOBILE_READ_MAX_BYTES: usize = 512 * 1_024;

impl FilesAuthority {
    pub(crate) async fn resolve_terminal_path(
        &self,
        worktree: &str,
        path_text: &str,
        cwd: Option<&str>,
        terminal: Option<&str>,
        client_id: &str,
    ) -> Result<TerminalPathResolution, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let terminal = terminal.map(str::trim).filter(|value| !value.is_empty());
        let terminal_context = terminal
            .and_then(|handle| {
                self.terminals
                    .resolve_file_context(handle)
                    .map(|context| (handle, context))
            })
            .filter(|(_, context)| {
                context.worktree_id == scope.worktree_id && context.host_id == scope.host.id()
            });
        let base = terminal_context
            .as_ref()
            .map(|(_, context)| context.cwd.as_str())
            .or_else(|| cwd.filter(|value| !value.trim().is_empty()))
            .unwrap_or(&scope.path);
        let filesystem = HostFilesystem::new(scope.host.clone());
        let expanded =
            expand_terminal_path(&filesystem, scope.host.platform(), path_text, &scope.path)
                .await?;
        let absolute_path = if filesystem.paths().is_absolute(&expanded) {
            filesystem.paths().resolve(&expanded, &[])
        } else {
            filesystem.paths().resolve(base, &[&expanded])
        };
        let relative_path = path::relative_inside(
            &filesystem,
            scope.host.platform(),
            &scope.path,
            &absolute_path,
        );
        if let Some(relative_path) = relative_path.as_deref().filter(|value| !value.is_empty()) {
            let authorized = self
                .paths
                .resolve(
                    &absolute_path,
                    crate::workspace_paths::PathResolution::Follow,
                )
                .await?;
            if authorized.host.id() != scope.host.id() {
                return Err(FilesError::InvalidInput("worktree host mismatch"));
            }
            let Some(metadata) =
                host_io::metadata(scope.host.clone(), &authorized.path, true).await?
            else {
                return Ok(empty_resolution(
                    &scope,
                    Some(relative_path.to_owned()),
                    absolute_path,
                ));
            };
            let is_directory = metadata.kind == HostFileKind::Directory;
            return Ok(TerminalPathResolution {
                absolute_path: Some(absolute_path.clone()),
                exists: true,
                is_directory,
                open_target: (!is_directory).then(|| TerminalOpenTarget::WorktreeFile {
                    absolute_path,
                    provider: provider(scope.host.as_ref()),
                    relative_path: relative_path.to_owned(),
                }),
                relative_path: Some(relative_path.to_owned()),
                worktree: scope.worktree_id,
            });
        }
        let empty = || empty_resolution(&scope, relative_path.clone(), absolute_path.clone());
        let Some((terminal_handle, _)) = terminal_context else {
            return Ok(empty());
        };
        let Some(canonical) = allowed_artifact_path(scope.host.clone(), &absolute_path).await?
        else {
            return Ok(empty());
        };
        let provenance_path = if path_text.starts_with("//") {
            path_text
        } else {
            &absolute_path
        };
        if !self
            .terminals
            .has_recent_output_path(terminal_handle, provenance_path, &canonical)
        {
            return Ok(empty());
        }
        let Some(metadata) = host_io::metadata(scope.host.clone(), &canonical, true).await? else {
            return Ok(empty());
        };
        let is_directory = metadata.kind == HostFileKind::Directory;
        if !is_directory && metadata.link_count.is_some_and(|count| count > 1) {
            return Ok(empty());
        }
        let open_target = if is_directory {
            None
        } else {
            let grant_id = random_uuid()?;
            let expires_at = Instant::now() + GRANT_TTL;
            let expiry_task =
                schedule_grant_expiry(self.grants.clone(), grant_id.clone(), expires_at);
            super::lock(&self.grants).insert(
                grant_id.clone(),
                TerminalGrant {
                    absolute_path: canonical.clone(),
                    client_id: client_id.to_owned(),
                    expiry_task,
                    expires_at,
                    host: scope.host.clone(),
                    identity: metadata.identity,
                    worktree_id: scope.worktree_id.clone(),
                },
            );
            Some(TerminalOpenTarget::AbsoluteFile {
                absolute_path: canonical.clone(),
                grant_id,
                provider: provider(scope.host.as_ref()),
            })
        };
        Ok(TerminalPathResolution {
            absolute_path: Some(canonical),
            exists: true,
            is_directory,
            open_target,
            relative_path: None,
            worktree: scope.worktree_id,
        })
    }

    pub(crate) async fn read_terminal_artifact(
        &self,
        worktree: &str,
        grant_id: &str,
        absolute_path: &str,
        client_id: &str,
    ) -> Result<FileReadResult, FilesError> {
        if path::is_mobile_binary(absolute_path) {
            return Err(FilesError::BinaryFile);
        }
        let grant = self
            .require_grant(worktree, grant_id, absolute_path, client_id)
            .await?;
        let content = read_granted(&grant, MOBILE_READ_MAX_BYTES).await?;
        if path::is_binary(&content) {
            return Err(FilesError::BinaryFile);
        }
        let (content, byte_length, truncated) = query::truncate_mobile_text(&content);
        self.refresh_grant(grant_id);
        Ok(FileReadResult {
            byte_length,
            content,
            relative_path: absolute_path.to_owned(),
            truncated,
            worktree: grant.worktree_id,
        })
    }

    pub(crate) async fn preview_terminal_artifact(
        &self,
        worktree: &str,
        grant_id: &str,
        absolute_path: &str,
        client_id: &str,
    ) -> Result<FilePreviewResult, FilesError> {
        let grant = self
            .require_grant(worktree, grant_id, absolute_path, client_id)
            .await?;
        let preview = if grant.host.kind() == HostKind::Local {
            let maximum = if path::preview_mime(&grant.absolute_path).is_some() {
                10 * 1_024 * 1_024
            } else {
                MOBILE_READ_MAX_BYTES
            };
            query::preview_bytes(
                &grant.absolute_path,
                read_local_granted(&grant, maximum).await?,
            )
        } else {
            let maximum = if path::preview_mime(&grant.absolute_path).is_some() {
                10 * 1_024 * 1_024
            } else {
                MOBILE_READ_MAX_BYTES
            };
            query::preview_bytes(
                &grant.absolute_path,
                read_remote_granted(&grant, maximum).await?,
            )
        };
        self.refresh_grant(grant_id);
        Ok(preview)
    }

    pub(crate) async fn write_terminal_artifact(
        &self,
        worktree: &str,
        grant_id: &str,
        absolute_path: &str,
        content: &str,
        client_id: &str,
    ) -> Result<MutationResult, FilesError> {
        if content.len() > MOBILE_READ_MAX_BYTES {
            return Err(FilesError::FileTooLarge);
        }
        if path::is_mobile_binary(absolute_path) {
            return Err(FilesError::BinaryFile);
        }
        let grant = self
            .require_grant(worktree, grant_id, absolute_path, client_id)
            .await?;
        let existing = read_granted(&grant, MOBILE_READ_MAX_BYTES).await?;
        if path::is_binary(&existing) {
            return Err(FilesError::BinaryFile);
        }
        atomic_write_granted(&grant, content.as_bytes()).await?;
        let metadata = host_io::metadata(grant.host.clone(), &grant.absolute_path, true)
            .await?
            .ok_or(FilesError::TerminalGrantStale)?;
        let mut grants = super::lock(&self.grants);
        let current = grants
            .get_mut(grant_id)
            .ok_or(FilesError::TerminalGrantExpired)?;
        current.identity = metadata.identity;
        refresh_grant_expiry(&self.grants, grant_id, current);
        Ok(MutationResult::OK)
    }

    pub(crate) fn revoke_terminal_grants_for_client(&self, client_id: &str) {
        super::lock(&self.grants).retain(|_, grant| {
            if grant.client_id == client_id {
                grant.expiry_task.abort();
                false
            } else {
                true
            }
        });
    }

    async fn require_grant(
        &self,
        worktree: &str,
        grant_id: &str,
        absolute_path: &str,
        client_id: &str,
    ) -> Result<TerminalGrant, FilesError> {
        let scope = self.scopes.resolve(worktree).await?;
        let now = Instant::now();
        let mut grants = super::lock(&self.grants);
        grants.retain(|_, grant| {
            if grant.expires_at <= now {
                grant.expiry_task.abort();
                false
            } else {
                true
            }
        });
        let grant = grants
            .get(grant_id)
            .cloned()
            .ok_or(FilesError::TerminalGrantExpired)?;
        if grant.worktree_id != scope.worktree_id
            || grant.host.id() != scope.host.id()
            || grant.absolute_path != absolute_path
            || grant.client_id != client_id
        {
            return Err(FilesError::TerminalGrantMismatch);
        }
        Ok(grant)
    }

    fn refresh_grant(&self, grant_id: &str) {
        if let Some(grant) = super::lock(&self.grants).get_mut(grant_id) {
            refresh_grant_expiry(&self.grants, grant_id, grant);
        }
    }
}

fn refresh_grant_expiry(
    grants: &Arc<std::sync::Mutex<std::collections::HashMap<String, TerminalGrant>>>,
    grant_id: &str,
    grant: &mut TerminalGrant,
) {
    grant.expiry_task.abort();
    let expires_at = Instant::now() + GRANT_TTL;
    grant.expiry_task = schedule_grant_expiry(grants.clone(), grant_id.to_owned(), expires_at);
    grant.expires_at = expires_at;
}

fn schedule_grant_expiry(
    grants: Arc<std::sync::Mutex<std::collections::HashMap<String, TerminalGrant>>>,
    grant_id: String,
    expires_at: Instant,
) -> tokio::task::AbortHandle {
    tokio::spawn(async move {
        tokio::time::sleep_until(tokio::time::Instant::from_std(expires_at)).await;
        let mut grants = super::lock(&grants);
        if grants
            .get(&grant_id)
            .is_some_and(|grant| grant.expires_at <= Instant::now())
        {
            grants.remove(&grant_id);
        }
    })
    .abort_handle()
}

fn empty_resolution(
    scope: &super::scope::FileScope,
    relative_path: Option<String>,
    absolute_path: String,
) -> TerminalPathResolution {
    TerminalPathResolution {
        absolute_path: Some(absolute_path),
        exists: false,
        is_directory: false,
        open_target: None,
        relative_path,
        worktree: scope.worktree_id.clone(),
    }
}

async fn expand_terminal_path(
    filesystem: &HostFilesystem,
    platform: HostPlatform,
    path_text: &str,
    worktree_path: &str,
) -> Result<String, FilesError> {
    let normalized = normalize_file_uri(platform, path_text, worktree_path);
    if let Some(remainder) = normalized
        .strip_prefix("~/")
        .or_else(|| normalized.strip_prefix("~\\"))
    {
        let home = filesystem
            .home_directory()
            .await?
            .ok_or(FilesError::HomeUnavailable)?;
        Ok(filesystem.paths().resolve(&home, &[remainder]))
    } else {
        Ok(normalized)
    }
}

fn normalize_file_uri(platform: HostPlatform, path_text: &str, worktree_path: &str) -> String {
    if platform == HostPlatform::Windows {
        return path_text.to_owned();
    }
    let Some(remainder) = path_text.strip_prefix("//") else {
        return path_text.to_owned();
    };
    let Some((authority, path_suffix)) = remainder.split_once(['/', '\\']) else {
        return path_text.to_owned();
    };
    if !matches!(
        authority.to_ascii_lowercase().as_str(),
        "localhost" | "127.0.0.1" | "::1"
    ) {
        return path_text.to_owned();
    }
    let path_value = format!("/{path_suffix}");
    if path::is_windows_absolute(worktree_path)
        && path_value.as_bytes().get(0..4).is_some_and(|bytes| {
            bytes[0] == b'/'
                && bytes[1].is_ascii_alphabetic()
                && bytes[2] == b':'
                && matches!(bytes[3], b'/' | b'\\')
        })
    {
        path_value[1..].to_owned()
    } else {
        path_value
    }
}

async fn allowed_artifact_path(
    host: Arc<dyn ExecutionHost>,
    absolute_path: &str,
) -> Result<Option<String>, FilesError> {
    let filesystem = HostFilesystem::new(host.clone());
    let Some(metadata) = host_io::metadata(host.clone(), absolute_path, false).await? else {
        return Ok(None);
    };
    if metadata.kind == HostFileKind::Symlink {
        return Ok(None);
    }
    let canonical = if metadata.kind == HostFileKind::Directory {
        filesystem.canonical_directory(absolute_path).await?
    } else {
        let parent = filesystem
            .canonical_directory(&filesystem.paths().dirname(absolute_path))
            .await?;
        filesystem
            .paths()
            .join(&[&parent, &filesystem.paths().basename(absolute_path)])
    };
    let mut roots = vec!["/tmp".to_owned(), "/private/tmp".to_owned()];
    if host.kind() == HostKind::Local {
        roots.push(std::env::temp_dir().to_string_lossy().into_owned());
    }
    for root in roots {
        let Ok(canonical_root) = filesystem.canonical_directory(&root).await else {
            continue;
        };
        if path::relative_inside(&filesystem, host.platform(), &canonical_root, &canonical)
            .is_some()
        {
            return Ok(Some(canonical));
        }
    }
    Ok(None)
}

async fn read_granted(grant: &TerminalGrant, maximum: usize) -> Result<Vec<u8>, FilesError> {
    if grant.host.kind() == HostKind::Local {
        return read_local_granted(grant, maximum).await;
    }
    read_remote_granted(grant, maximum).await
}

async fn read_remote_granted(grant: &TerminalGrant, maximum: usize) -> Result<Vec<u8>, FilesError> {
    let script = r#"
identity() {
  if values=$(stat -L -c '%d|%i|%h|%s|%y' "$1" 2>/dev/null); then :
  elif values=$(stat -L -f '%d|%i|%l|%z|%Sm' -t '%s' "$1" 2>/dev/null); then :
  else return 1
  fi
  old_ifs=$IFS
  IFS='|'
  read -r device inode links size modified <<EOF
$values
EOF
  IFS=$old_ifs
  printf '%s:%s:%s:%s:%s' "$device" "$inode" "$links" "$size" "$modified"
}
exec 3<"$1" || exit 44
[ "$(identity /dev/fd/3)" = "$2" ] || exit 45
head -c "$3" <&3
"#;
    let maximum_with_sentinel = maximum.saturating_add(1);
    let mut command = HostCommand::new(
        "sh",
        [
            "-c".to_owned(),
            script.to_owned(),
            "sh".to_owned(),
            grant.absolute_path.clone(),
            grant.identity.clone(),
            maximum_with_sentinel.to_string(),
        ],
    );
    command.capture_stdout_bytes = true;
    command.max_output_bytes = Some(maximum_with_sentinel);
    let output = grant.host.exec(command).await?;
    if output.exit_code != 0 {
        return Err(FilesError::TerminalGrantStale);
    }
    let bytes = output.stdout_bytes.unwrap_or_default();
    if bytes.len() > maximum {
        Err(FilesError::FileTooLarge)
    } else {
        Ok(bytes)
    }
}

async fn read_local_granted(grant: &TerminalGrant, maximum: usize) -> Result<Vec<u8>, FilesError> {
    use tokio::io::AsyncReadExt;

    let mut file = open_local_granted(grant).await?;
    let metadata = file.metadata().await?;
    verify_local_metadata(grant, metadata)?;
    let metadata = file.metadata().await?;
    if metadata.len() > maximum as u64 {
        return Err(FilesError::FileTooLarge);
    }
    let mut bytes = Vec::with_capacity(usize::try_from(metadata.len()).unwrap_or(maximum));
    (&mut file)
        .take(maximum.saturating_add(1) as u64)
        .read_to_end(&mut bytes)
        .await?;
    if bytes.len() > maximum {
        return Err(FilesError::FileTooLarge);
    }
    verify_local_metadata(grant, file.metadata().await?)?;
    Ok(bytes)
}

async fn open_local_granted(grant: &TerminalGrant) -> Result<tokio::fs::File, FilesError> {
    let mut options = tokio::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        options.custom_flags(nix::libc::O_NOFOLLOW);
    }
    match options.open(&grant.absolute_path).await {
        Ok(file) => Ok(file),
        Err(error) if is_symlink_loop(&error) => Err(FilesError::TerminalGrantStale),
        Err(error) => Err(error.into()),
    }
}

#[cfg(unix)]
fn is_symlink_loop(error: &std::io::Error) -> bool {
    error.raw_os_error() == Some(nix::libc::ELOOP)
}

#[cfg(not(unix))]
fn is_symlink_loop(_error: &std::io::Error) -> bool {
    false
}

fn verify_local_metadata(
    grant: &TerminalGrant,
    metadata: std::fs::Metadata,
) -> Result<(), FilesError> {
    let metadata = host_io::local_metadata_value(metadata);
    if metadata.kind != HostFileKind::File
        || metadata.link_count.is_some_and(|count| count > 1)
        || metadata.identity != grant.identity
    {
        return Err(FilesError::TerminalGrantStale);
    }
    Ok(())
}

async fn verify_grant_identity(grant: &TerminalGrant) -> Result<(), FilesError> {
    let metadata = host_io::metadata(grant.host.clone(), &grant.absolute_path, false)
        .await?
        .ok_or(FilesError::TerminalGrantStale)?;
    if metadata.kind != HostFileKind::File
        || metadata.link_count.is_some_and(|count| count > 1)
        || metadata.identity != grant.identity
    {
        return Err(FilesError::TerminalGrantStale);
    }
    Ok(())
}

async fn atomic_write_granted(grant: &TerminalGrant, content: &[u8]) -> Result<(), FilesError> {
    verify_grant_identity(grant).await?;
    let filesystem = HostFilesystem::new(grant.host.clone());
    let temporary = filesystem.paths().join(&[
        &filesystem.paths().dirname(&grant.absolute_path),
        &format!(
            ".{}.{}.tmp",
            filesystem.paths().basename(&grant.absolute_path),
            random_uuid()?
        ),
    ]);
    if grant.host.kind() == HostKind::Local {
        let result = async {
            let current = open_local_granted(grant).await?;
            let current_metadata = current.metadata().await?;
            let permissions = current_metadata.permissions();
            verify_local_metadata(grant, current_metadata)?;
            drop(current);
            let mut file = tokio::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .await?;
            use tokio::io::AsyncWriteExt;
            file.write_all(content).await?;
            file.flush().await?;
            file.set_permissions(permissions).await?;
            let fresh = open_local_granted(grant).await?;
            verify_local_metadata(grant, fresh.metadata().await?)?;
            drop(fresh);
            tokio::fs::rename(&temporary, &grant.absolute_path).await?;
            Ok::<(), FilesError>(())
        }
        .await;
        if result.is_err() {
            let _ = tokio::fs::remove_file(&temporary).await;
        }
        return result;
    }
    let mut command = HostCommand::new(
        "sh",
        [
            "-c".to_owned(),
            r#"
identity() {
  if values=$(stat -c '%d|%i|%h|%s|%y' "$1" 2>/dev/null); then :
  elif values=$(stat -f '%d|%i|%l|%z|%Sm' -t '%s' "$1" 2>/dev/null); then :
  else return 1
  fi
  old_ifs=$IFS
  IFS='|'
  read -r device inode links size modified <<EOF
$values
EOF
  IFS=$old_ifs
  printf '%s:%s:%s:%s:%s' "$device" "$inode" "$links" "$size" "$modified"
}
same_file() {
  [ -f "$1" ] && [ ! -L "$1" ] && [ "$(identity "$1")" = "$3" ]
}
same_file "$1" "$2" "$3" || exit
if mode=$(stat -c '%a' "$1" 2>/dev/null); then :
elif mode=$(stat -f '%Lp' "$1" 2>/dev/null); then :
else mode=
fi
set -C
cat > "$2" || exit
if [ -n "$mode" ]; then chmod "$mode" "$2" || exit; fi
same_file "$1" "$2" "$3" || exit
mv -f "$2" "$1"
"#
            .to_owned(),
            "sh".to_owned(),
            grant.absolute_path.clone(),
            temporary.clone(),
            grant.identity.clone(),
        ],
    );
    command.stdin = Some(content.to_vec());
    let result = match grant.host.exec(command).await {
        Ok(output) if output.exit_code == 0 => Ok(()),
        Ok(_) => Err(FilesError::TerminalGrantStale),
        Err(error) => Err(error.into()),
    };
    if result.is_err() {
        let _ = HostFilesystem::new(grant.host.clone())
            .remove(
                &temporary,
                crate::hosts::HostRemoveOptions {
                    force: true,
                    recursive: false,
                },
            )
            .await;
    }
    result
}

fn provider(host: &dyn ExecutionHost) -> &'static str {
    match host.kind() {
        HostKind::Local | HostKind::Wsl => "local",
        HostKind::Ssh => "ssh",
    }
}

fn random_uuid() -> Result<String, getrandom::Error> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes)?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Ok(format!(
        "{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
        u32::from_be_bytes(bytes[0..4].try_into().unwrap_or_default()),
        u16::from_be_bytes(bytes[4..6].try_into().unwrap_or_default()),
        u16::from_be_bytes(bytes[6..8].try_into().unwrap_or_default()),
        u16::from_be_bytes(bytes[8..10].try_into().unwrap_or_default()),
        u64::from_be_bytes([
            0, 0, bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15],
        ])
    ))
}
