use std::sync::Arc;
use std::time::UNIX_EPOCH;

use tokio::io::{AsyncReadExt, AsyncSeekExt};

use crate::hosts::{ExecutionHost, HostCommand, HostFileKind, HostFilesystem, HostKind};

use super::FilesError;

const METADATA_OUTPUT_LIMIT: usize = 64 * 1_024;

#[derive(Clone, Debug)]
pub(super) struct FileMetadata {
    pub(super) identity: String,
    pub(super) kind: HostFileKind,
    pub(super) modified_ms: f64,
    pub(super) link_count: Option<u64>,
    pub(super) size: u64,
}

pub(super) async fn metadata(
    host: Arc<dyn ExecutionHost>,
    path: &str,
    follow: bool,
) -> Result<Option<FileMetadata>, FilesError> {
    if host.kind() == HostKind::Local {
        return local_metadata(path, follow).await;
    }
    remote_metadata(host, path, follow).await
}

pub(super) async fn read_bounded(
    host: Arc<dyn ExecutionHost>,
    path: &str,
    maximum: usize,
) -> Result<Vec<u8>, FilesError> {
    let Some(file) = metadata(host.clone(), path, true).await? else {
        return Err(FilesError::MissingPath(path.to_owned()));
    };
    if file.kind == HostFileKind::Directory {
        return Err(FilesError::InvalidInput("Cannot read a directory"));
    }
    if file.size > maximum as u64 {
        return Err(FilesError::FileTooLarge);
    }
    HostFilesystem::new(host)
        .read(path, maximum)
        .await?
        .ok_or(FilesError::FileTooLarge)
}

pub(super) async fn read_range(
    host: Arc<dyn ExecutionHost>,
    path: &str,
    offset: u64,
    length: usize,
) -> Result<(Vec<u8>, u64), FilesError> {
    let Some(file) = metadata(host.clone(), path, true).await? else {
        return Err(FilesError::MissingPath(path.to_owned()));
    };
    if file.kind == HostFileKind::Directory {
        return Err(FilesError::InvalidInput("Cannot download a directory"));
    }
    let remaining = file.size.saturating_sub(offset);
    let count = usize::try_from(remaining.min(length as u64)).unwrap_or(length);
    if count == 0 {
        return Ok((Vec::new(), file.size));
    }
    if host.kind() == HostKind::Local {
        let mut file_handle = tokio::fs::File::open(path).await?;
        file_handle.seek(std::io::SeekFrom::Start(offset)).await?;
        let mut bytes = vec![0; count];
        let mut read = 0;
        while read < count {
            let next = file_handle.read(&mut bytes[read..]).await?;
            if next == 0 {
                break;
            }
            read += next;
        }
        bytes.truncate(read);
        return Ok((bytes, file.size));
    }
    let mut command = HostCommand::new(
        "sh",
        [
            "-c".to_owned(),
            r#"
exec 3<"$1" || exit 44
dd <&3 bs=65536 skip="$2" 2>/dev/null |
  tail -c +"$(( $3 + 1 ))" |
  head -c "$4"
"#
            .to_owned(),
            "sh".to_owned(),
            path.to_owned(),
            (offset / 65_536).to_string(),
            (offset % 65_536).to_string(),
            count.to_string(),
        ],
    );
    command.capture_stdout_bytes = true;
    command.max_output_bytes = Some(count);
    let output = host.exec(command).await?;
    if output.exit_code != 0 {
        return Err(FilesError::CommandFailed("read file range"));
    }
    Ok((output.stdout_bytes.unwrap_or_default(), file.size))
}

async fn local_metadata(path: &str, follow: bool) -> Result<Option<FileMetadata>, FilesError> {
    let result = if follow {
        tokio::fs::metadata(path).await
    } else {
        tokio::fs::symlink_metadata(path).await
    };
    let metadata = match result {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    Ok(Some(local_metadata_value(metadata)))
}

pub(super) fn local_metadata_value(metadata: std::fs::Metadata) -> FileMetadata {
    let kind = if metadata.is_dir() {
        HostFileKind::Directory
    } else if metadata.is_file() {
        HostFileKind::File
    } else if metadata.file_type().is_symlink() {
        HostFileKind::Symlink
    } else {
        HostFileKind::Other
    };
    let modified = metadata.modified().ok();
    let modified_ms = modified
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map_or(0.0, |value| value.as_secs_f64() * 1_000.0);
    let modified_token = modified_ms.to_string();
    let (device, inode, link_count) = local_identity_fields(&metadata);
    FileMetadata {
        identity: format!(
            "{device}:{inode}:{link_count:?}:{}:{modified_token}",
            metadata.len()
        ),
        kind,
        modified_ms,
        link_count,
        size: metadata.len(),
    }
}

#[cfg(unix)]
fn local_identity_fields(metadata: &std::fs::Metadata) -> (u64, u64, Option<u64>) {
    use std::os::unix::fs::MetadataExt;
    (metadata.dev(), metadata.ino(), Some(metadata.nlink()))
}

#[cfg(not(unix))]
fn local_identity_fields(metadata: &std::fs::Metadata) -> (u64, u64, Option<u64>) {
    (0, metadata.len(), None)
}

async fn remote_metadata(
    host: Arc<dyn ExecutionHost>,
    path: &str,
    follow: bool,
) -> Result<Option<FileMetadata>, FilesError> {
    let stat_flag = if follow { "-L" } else { "" };
    let script = r#"
p=$1
follow=$2
if [ "$follow" != 1 ] && [ -L "$p" ]; then kind=l
elif [ -d "$p" ]; then kind=d
elif [ -f "$p" ]; then kind=f
elif [ -e "$p" ] || [ -L "$p" ]; then kind=o
else exit 44
fi
if values=$(stat STAT_FLAG -c '%d|%i|%h|%s|%Y|%y' -- "$p" 2>/dev/null); then :
elif values=$(stat STAT_FLAG -f '%d|%i|%l|%z|%m|%Sm' -t '%s' -- "$p" 2>/dev/null); then :
else exit 45
fi
printf '%s\n%s\n' "$kind" "$values"
"#
    .replace("STAT_FLAG", stat_flag);
    let mut command = HostCommand::new(
        "sh",
        [
            "-c".to_owned(),
            script,
            "sh".to_owned(),
            path.to_owned(),
            if follow { "1" } else { "0" }.to_owned(),
        ],
    );
    command.max_output_bytes = Some(METADATA_OUTPUT_LIMIT);
    let output = host.exec(command).await?;
    if output.exit_code == 44 {
        return Ok(None);
    }
    if output.exit_code != 0 {
        return Err(FilesError::CommandFailed("inspect file"));
    }
    let mut lines = output.stdout.lines();
    let kind = match lines.next() {
        Some("d") => HostFileKind::Directory,
        Some("f") => HostFileKind::File,
        Some("l") => HostFileKind::Symlink,
        Some("o") => HostFileKind::Other,
        _ => return Err(FilesError::Protocol("invalid remote file kind")),
    };
    let fields = lines.next().unwrap_or("").split('|').collect::<Vec<_>>();
    let [device, inode, links, size, modified_seconds, modified_token] = fields.as_slice() else {
        return Err(FilesError::Protocol("invalid remote metadata"));
    };
    let size = size
        .parse::<u64>()
        .map_err(|_| FilesError::Protocol("invalid remote file size"))?;
    let link_count = links.parse::<u64>().ok();
    let modified_ms = modified_seconds
        .parse::<f64>()
        .map(|value| value * 1_000.0)
        .unwrap_or(0.0);
    Ok(Some(FileMetadata {
        identity: format!("{device}:{inode}:{links}:{size}:{modified_token}"),
        kind,
        modified_ms,
        link_count,
        size,
    }))
}
