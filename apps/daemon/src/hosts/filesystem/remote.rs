use crate::hosts::{ExecutionHost, HostCommand, HostCommandOutput};

use super::model::{
    HostDirectoryEntry, HostFileKind, HostFileStat, HostFilesystemError, HostFilesystemErrorKind,
    HostRemoveOptions,
};

const EXIT_MISSING: i32 = 44;
const DIRECTORY_OUTPUT_MAX_BYTES: usize = 16 * 1_024 * 1_024;
const METADATA_OUTPUT_MAX_BYTES: usize = 64 * 1_024;
const READ_DIRECTORY_SCRIPT: &str = r#"
for entry in ./* ./.[!.]* ./..?*; do
  if [ ! -e "$entry" ] && [ ! -L "$entry" ]; then continue; fi
  name=${entry#./}
  if [ -L "$entry" ]; then kind=l
  elif [ -d "$entry" ]; then kind=d
  elif [ -f "$entry" ]; then kind=f
  else kind=o
  fi
  printf '%s\000%s\000' "$kind" "$name"
done
"#;
// Why: a byte range needs one round trip, so the offset skip and the length
// bound are piped in the remote shell instead of streaming the whole file back.
const READ_RANGE_SCRIPT: &str = r#"
[ -f "$1" ] || exit 44
tail -c +"$2" -- "$1" | head -c "$3"
"#;

const STAT_SCRIPT: &str = r#"
path=$1
if [ -L "$path" ]; then kind=l; size=0
elif [ -d "$path" ]; then kind=d; size=0
elif [ -f "$path" ]; then kind=f; size=$(wc -c < "$path") || exit
elif [ -e "$path" ]; then kind=o; size=0
else exit 44
fi
modified=$(stat -c '%Y' -- "$path" 2>/dev/null || stat -f '%m' -- "$path" 2>/dev/null || true)
printf '%s\000%s\000%s\000' "$kind" "$size" "$modified"
"#;

pub(super) async fn append(
    host: &dyn ExecutionHost,
    path: &str,
    content: &[u8],
) -> Result<(), HostFilesystemError> {
    let mut command = HostCommand::new("sh", ["-c", "cat >> \"$1\"", "sh", path]);
    command.stdin = Some(content.to_vec());
    successful(host.exec(command).await?, "append file")
}

pub(super) async fn canonical_directory(
    host: &dyn ExecutionHost,
    path: &str,
) -> Result<String, HostFilesystemError> {
    let mut command = bounded_text_command("pwd", ["-P"], METADATA_OUTPUT_MAX_BYTES);
    command.cwd = Some(path.to_owned());
    let output = host.exec(command).await?;
    if output.exit_code != 0 {
        return Err(HostFilesystemError::new(
            HostFilesystemErrorKind::NotDirectory,
            "host_path_not_directory",
        ));
    }
    let canonical = output.stdout.trim();
    if canonical.is_empty() {
        Err(protocol_error("canonical directory response was empty"))
    } else {
        Ok(canonical.to_owned())
    }
}

pub(super) async fn exists(
    host: &dyn ExecutionHost,
    path: &str,
) -> Result<bool, HostFilesystemError> {
    let output = host
        .exec(bounded_text_command(
            "sh",
            [
                "-c".to_owned(),
                "[ -e \"$1\" ]".to_owned(),
                "sh".to_owned(),
                path.to_owned(),
            ],
            METADATA_OUTPUT_MAX_BYTES,
        ))
        .await?;
    Ok(output.exit_code == 0)
}

pub(super) async fn home_directory(
    host: &dyn ExecutionHost,
) -> Result<Option<String>, HostFilesystemError> {
    let output = host
        .exec(bounded_text_command(
            "sh",
            ["-lc", "printf %s \"$HOME\""],
            METADATA_OUTPUT_MAX_BYTES,
        ))
        .await?;
    Ok((output.exit_code == 0)
        .then(|| output.stdout.trim().to_owned())
        .filter(|home| !home.is_empty()))
}

pub(super) async fn mkdir(
    host: &dyn ExecutionHost,
    path: &str,
    recursive: bool,
) -> Result<(), HostFilesystemError> {
    let args = if recursive {
        vec!["-p".to_owned(), "--".to_owned(), path.to_owned()]
    } else {
        vec!["--".to_owned(), path.to_owned()]
    };
    successful(
        host.exec(HostCommand::new("mkdir", args)).await?,
        "create directory",
    )
}

pub(super) async fn read(
    host: &dyn ExecutionHost,
    path: &str,
    max_bytes: usize,
) -> Result<Option<Vec<u8>>, HostFilesystemError> {
    let count = max_bytes.saturating_add(1);
    let mut command = HostCommand::new(
        "head",
        [
            "-c".to_owned(),
            count.to_string(),
            "--".to_owned(),
            path.to_owned(),
        ],
    );
    command.capture_stdout_bytes = true;
    command.max_output_bytes = Some(count);
    let output = host.exec(command).await?;
    if output.exit_code != 0 {
        return Ok(None);
    }
    let bytes = binary_stdout(output)?;
    Ok((bytes.len() <= max_bytes).then_some(bytes))
}

pub(super) async fn read_range(
    host: &dyn ExecutionHost,
    path: &str,
    start: u64,
    max_bytes: usize,
) -> Result<Option<Vec<u8>>, HostFilesystemError> {
    let mut command = HostCommand::new(
        "sh",
        [
            "-c".to_owned(),
            READ_RANGE_SCRIPT.to_owned(),
            "sh".to_owned(),
            path.to_owned(),
            start.saturating_add(1).to_string(),
            max_bytes.to_string(),
        ],
    );
    command.capture_stdout_bytes = true;
    command.max_output_bytes = Some(max_bytes);
    let output = host.exec(command).await?;
    if output.exit_code != 0 {
        return Ok(None);
    }
    binary_stdout(output).map(Some)
}

pub(super) async fn read_prefix(
    host: &dyn ExecutionHost,
    path: &str,
    max_bytes: usize,
) -> Result<Option<Vec<u8>>, HostFilesystemError> {
    let mut command = HostCommand::new(
        "head",
        [
            "-c".to_owned(),
            max_bytes.to_string(),
            "--".to_owned(),
            path.to_owned(),
        ],
    );
    command.capture_stdout_bytes = true;
    command.max_output_bytes = Some(max_bytes);
    let output = host.exec(command).await?;
    if output.exit_code != 0 {
        return Ok(None);
    }
    binary_stdout(output).map(Some)
}

pub(super) async fn read_dir(
    host: &dyn ExecutionHost,
    path: &str,
) -> Result<Vec<HostDirectoryEntry>, HostFilesystemError> {
    let mut entries = read_dir_raw(host, path).await?;
    entries.sort_unstable_by(|left, right| left.name.cmp(&right.name));
    Ok(entries)
}

pub(super) async fn read_dir_raw(
    host: &dyn ExecutionHost,
    path: &str,
) -> Result<Vec<HostDirectoryEntry>, HostFilesystemError> {
    let mut command = HostCommand::new("sh", ["-c", READ_DIRECTORY_SCRIPT]);
    command.capture_stdout_bytes = true;
    command.cwd = Some(path.to_owned());
    command.max_output_bytes = Some(DIRECTORY_OUTPUT_MAX_BYTES);
    let output = host.exec(command).await?;
    let bytes = successful_bytes(output, "read directory")?;
    let fields = nul_fields(&bytes)?;
    if fields.len() % 2 != 0 {
        return Err(protocol_error("directory response had an incomplete entry"));
    }
    fields
        .chunks_exact(2)
        .map(|fields| {
            Ok(HostDirectoryEntry {
                kind: parse_kind(fields[0])?,
                name: String::from_utf8_lossy(fields[1]).into_owned(),
            })
        })
        .collect::<Result<Vec<_>, HostFilesystemError>>()
}

pub(super) async fn remove(
    host: &dyn ExecutionHost,
    path: &str,
    options: HostRemoveOptions,
) -> Result<(), HostFilesystemError> {
    let mut args = Vec::new();
    if options.recursive {
        args.push("-r".to_owned());
    }
    if options.force {
        args.push("-f".to_owned());
    }
    args.extend(["--".to_owned(), path.to_owned()]);
    successful(
        host.exec(HostCommand::new("rm", args)).await?,
        "remove path",
    )
}

pub(super) async fn rename(
    host: &dyn ExecutionHost,
    from: &str,
    to: &str,
) -> Result<(), HostFilesystemError> {
    successful(
        host.exec(HostCommand::new("mv", ["--", from, to])).await?,
        "rename path",
    )
}

pub(super) async fn stat(
    host: &dyn ExecutionHost,
    path: &str,
) -> Result<Option<HostFileStat>, HostFilesystemError> {
    let mut command = HostCommand::new("sh", ["-c", STAT_SCRIPT, "sh", path]);
    command.capture_stdout_bytes = true;
    command.max_output_bytes = Some(METADATA_OUTPUT_MAX_BYTES);
    let output = host.exec(command).await?;
    if output.exit_code == EXIT_MISSING {
        return Ok(None);
    }
    let bytes = successful_bytes(output, "inspect path")?;
    let fields = nul_fields(&bytes)?;
    let [kind, size, modified] = fields.as_slice() else {
        return Err(protocol_error("stat response had an invalid shape"));
    };
    let size_bytes = String::from_utf8_lossy(size)
        .trim()
        .parse()
        .map_err(|_| protocol_error("stat response had an invalid size"))?;
    Ok(Some(HostFileStat {
        kind: parse_kind(kind)?,
        modified_at_ms: String::from_utf8_lossy(modified)
            .trim()
            .parse::<i64>()
            .ok()
            .and_then(|seconds| seconds.checked_mul(1_000)),
        size_bytes,
    }))
}

pub(super) async fn which(
    host: &dyn ExecutionHost,
    command: &str,
) -> Result<Option<String>, HostFilesystemError> {
    let output = host
        .exec(bounded_text_command(
            "sh",
            ["-lc", "command -v -- \"$1\"", "sh", command],
            METADATA_OUTPUT_MAX_BYTES,
        ))
        .await?;
    Ok((output.exit_code == 0)
        .then(|| output.stdout.lines().next().unwrap_or("").trim().to_owned())
        .filter(|path| !path.is_empty()))
}

pub(super) async fn write(
    host: &dyn ExecutionHost,
    path: &str,
    content: &[u8],
) -> Result<(), HostFilesystemError> {
    let mut command = HostCommand::new("sh", ["-c", "cat > \"$1\"", "sh", path]);
    command.stdin = Some(content.to_vec());
    successful(host.exec(command).await?, "write file")
}

fn successful(output: HostCommandOutput, operation: &str) -> Result<(), HostFilesystemError> {
    if output.exit_code == 0 {
        Ok(())
    } else {
        Err(command_failure(&output, operation))
    }
}

fn successful_bytes(
    output: HostCommandOutput,
    operation: &str,
) -> Result<Vec<u8>, HostFilesystemError> {
    if output.exit_code == 0 {
        binary_stdout(output)
    } else {
        Err(command_failure(&output, operation))
    }
}

fn command_failure(output: &HostCommandOutput, operation: &str) -> HostFilesystemError {
    let detail = if output.stderr.trim().is_empty() {
        operation
    } else {
        output.stderr.trim()
    };
    HostFilesystemError::new(HostFilesystemErrorKind::Io, detail)
}

fn binary_stdout(output: HostCommandOutput) -> Result<Vec<u8>, HostFilesystemError> {
    output
        .stdout_bytes
        .ok_or_else(|| protocol_error("binary host response was not captured"))
}

fn bounded_text_command(
    command: impl Into<String>,
    args: impl IntoIterator<Item = impl Into<String>>,
    max_output_bytes: usize,
) -> HostCommand {
    let mut command = HostCommand::new(command, args);
    command.max_output_bytes = Some(max_output_bytes);
    command
}

fn nul_fields(bytes: &[u8]) -> Result<Vec<&[u8]>, HostFilesystemError> {
    if bytes.is_empty() {
        return Ok(Vec::new());
    }
    if bytes.last() != Some(&0) {
        return Err(protocol_error("filesystem response was not NUL terminated"));
    }
    Ok(bytes[..bytes.len() - 1].split(|byte| *byte == 0).collect())
}

fn parse_kind(value: &[u8]) -> Result<HostFileKind, HostFilesystemError> {
    match value {
        b"d" => Ok(HostFileKind::Directory),
        b"f" => Ok(HostFileKind::File),
        b"l" => Ok(HostFileKind::Symlink),
        b"o" => Ok(HostFileKind::Other),
        _ => Err(protocol_error(
            "filesystem response had an invalid file kind",
        )),
    }
}

fn protocol_error(message: &str) -> HostFilesystemError {
    HostFilesystemError::new(HostFilesystemErrorKind::Protocol, message)
}
