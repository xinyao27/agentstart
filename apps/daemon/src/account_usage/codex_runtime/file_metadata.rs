use std::fs;
#[cfg(windows)]
use std::io::Read as _;
use std::path::Path;
#[cfg(any(target_os = "macos", windows))]
use std::path::PathBuf;
#[cfg(windows)]
use std::process::{Command, Stdio};
#[cfg(windows)]
use std::time::{Duration, Instant};

use super::CodexRuntimeError;
#[cfg(windows)]
use super::managed_files::verify_destination;
use super::managed_files::{ExistingFile, run_wsl};

#[cfg(windows)]
pub(super) fn verify_windows_single_link(
    path: &Path,
    expected_handle: &same_file::Handle,
) -> Result<(), CodexRuntimeError> {
    // Why: stable Rust does not expose the NTFS link count. fsutil is the system authority for
    // hard-link enumeration; failure is closed because replacing one name of a multi-link config
    // would silently detach its other names from future writes.
    const SCRIPT: &str = r#"$ErrorActionPreference = 'Stop'
$fsutil = Join-Path $env:SystemRoot 'System32\fsutil.exe'
$links = @(& $fsutil hardlink list $env:AGENTSTART_CODEX_LINK_TARGET 2>$null)
if ($LASTEXITCODE -ne 0 -or $links.Count -ne 1) { exit 2 }
"#;
    let guard = open_windows_guard(path)?;
    let handle = same_file::Handle::from_file(guard.try_clone()?)?;
    if &handle != expected_handle {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    let mut command = windows_powershell_command(SCRIPT);
    command
        .env("AGENTSTART_CODEX_LINK_TARGET", path)
        .stdout(Stdio::null());
    let status = wait_windows_child(command.spawn()?)?;
    let final_handle = same_file::Handle::from_file(guard.try_clone()?)?;
    if status.success()
        && &final_handle == expected_handle
        && verify_destination(path, Some(expected_handle)).is_ok()
    {
        Ok(())
    } else {
        Err(CodexRuntimeError::InvalidConfig)
    }
}

#[cfg(windows)]
pub(super) fn windows_security_generation(
    path: &Path,
    expected_handle: &same_file::Handle,
) -> Result<String, CodexRuntimeError> {
    // Why: owner/group/DACL changes do not update ordinary file timestamps. Hashing canonical
    // SDDL gives the snapshot a bounded generation token without moving a potentially large
    // descriptor through an environment variable or localized text.
    const SCRIPT: &str = r#"$ErrorActionPreference = 'Stop'
$acl = Get-Acl -LiteralPath $env:AGENTSTART_CODEX_SECURITY_TARGET -ErrorAction Stop
$bytes = [System.Text.Encoding]::UTF8.GetBytes($acl.Sddl)
$sha = [System.Security.Cryptography.SHA256]::Create()
try { $hash = $sha.ComputeHash($bytes) } finally { $sha.Dispose() }
[Console]::Out.Write(([System.BitConverter]::ToString($hash)).Replace('-', ''))
"#;
    let guard = open_windows_guard(path)?;
    let handle = same_file::Handle::from_file(guard.try_clone()?)?;
    if &handle != expected_handle {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    let mut command = windows_powershell_command(SCRIPT);
    command
        .env("AGENTSTART_CODEX_SECURITY_TARGET", path)
        .stdout(Stdio::piped());
    let mut child = command.spawn()?;
    let status = wait_windows_child_ref(&mut child)?;
    let mut output = Vec::new();
    child
        .stdout
        .take()
        .ok_or(CodexRuntimeError::InvalidConfig)?
        .take(65)
        .read_to_end(&mut output)?;
    if !status.success() || output.len() != 64 || !output.iter().all(u8::is_ascii_hexdigit) {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    String::from_utf8(output).map_err(|_| CodexRuntimeError::InvalidConfig)
}

#[cfg(windows)]
pub(super) fn windows_file_id(
    path: &Path,
    expected_handle: &same_file::Handle,
) -> Result<String, CodexRuntimeError> {
    // Why: ReplaceFileW requires every Rust handle to its source inodes to be closed. Capture the
    // filesystem-issued ID first so the exact displaced and promoted files can be recognized
    // after the atomic operation without retaining a handle that blocks the operation itself.
    const SCRIPT: &str = r#"$ErrorActionPreference = 'Stop'
$fsutil = Join-Path $env:SystemRoot 'System32\fsutil.exe'
$output = @(& $fsutil file queryfileid $env:AGENTSTART_CODEX_FILE_ID_TARGET 2>$null)
if ($LASTEXITCODE -ne 0) { exit 2 }
$matches = [regex]::Matches(($output -join "`n"), '0x[0-9A-Fa-f]+')
if ($matches.Count -ne 1) { exit 3 }
$id = $matches[0].Value.Substring(2).ToUpperInvariant()
if ($id.Length -lt 16 -or $id.Length -gt 64 -or ($id.Length % 2) -ne 0) { exit 4 }
[Console]::Out.Write($id)
"#;
    let guard = open_windows_guard(path)?;
    let handle = same_file::Handle::from_file(guard.try_clone()?)?;
    if &handle != expected_handle {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    let mut command = windows_powershell_command(SCRIPT);
    command
        .env("AGENTSTART_CODEX_FILE_ID_TARGET", path)
        .stdout(Stdio::piped());
    let mut child = command.spawn()?;
    let status = wait_windows_child_ref(&mut child)?;
    let mut output = Vec::new();
    child
        .stdout
        .take()
        .ok_or(CodexRuntimeError::InvalidConfig)?
        .take(65)
        .read_to_end(&mut output)?;
    let final_handle = same_file::Handle::from_file(guard.try_clone()?)?;
    if !status.success()
        || &final_handle != expected_handle
        || verify_destination(path, Some(expected_handle)).is_err()
        || !(16..=64).contains(&output.len())
        || output.len() % 2 != 0
        || !output.iter().all(u8::is_ascii_hexdigit)
    {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    String::from_utf8(output).map_err(|_| CodexRuntimeError::InvalidConfig)
}

#[cfg(windows)]
pub(super) fn create_private_windows_file(path: &Path) -> Result<(), CodexRuntimeError> {
    // Why: a normal create followed by icacls has a disclosure window because an inherited ACL is
    // already live. This FileStream overload supplies the protected owner-only DACL to CreateFile,
    // so no primary stream or metadata is ever staged under the parent directory's permissions.
    const SCRIPT: &str = r#"$ErrorActionPreference = 'Stop'
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$sid = $identity.User
$security = [System.Security.AccessControl.FileSecurity]::new()
$security.SetOwner($sid)
$security.SetAccessRuleProtection($true, $false)
$rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
  $sid,
  [System.Security.AccessControl.FileSystemRights]::FullControl,
  [System.Security.AccessControl.AccessControlType]::Allow
)
$security.AddAccessRule($rule)
$stream = [System.IO.FileStream]::new(
  $env:AGENTSTART_CODEX_PRIVATE_FILE,
  [System.IO.FileMode]::CreateNew,
  [System.Security.AccessControl.FileSystemRights]::FullControl,
  [System.IO.FileShare]::Read,
  4096,
  [System.IO.FileOptions]::None,
  $security
)
$stream.Dispose()
"#;
    let mut command = windows_powershell_command(SCRIPT);
    command
        .env("AGENTSTART_CODEX_PRIVATE_FILE", path)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let status = wait_windows_child(command.spawn()?)?;
    if status.success() {
        Ok(())
    } else {
        Err(CodexRuntimeError::InvalidConfig)
    }
}

#[cfg(windows)]
pub(super) fn exchange_windows_files(
    source: &Path,
    destination: &Path,
    backup: &Path,
) -> Result<(), CodexRuntimeError> {
    // Why: File.Replace maps to ReplaceFileW and creates the displaced destination backup in the
    // same atomic operation. Keeping that exact inode makes a post-commit CAS identity check and
    // rollback possible; MoveFileEx would destroy the file whose generation must be verified.
    const SCRIPT: &str = r#"$ErrorActionPreference = 'Stop'
[System.IO.File]::Replace(
  $env:AGENTSTART_CODEX_EXCHANGE_SOURCE,
  $env:AGENTSTART_CODEX_EXCHANGE_DESTINATION,
  $env:AGENTSTART_CODEX_EXCHANGE_BACKUP,
  $false
)
"#;
    let mut command = windows_powershell_command(SCRIPT);
    command
        .env("AGENTSTART_CODEX_EXCHANGE_SOURCE", source)
        .env("AGENTSTART_CODEX_EXCHANGE_DESTINATION", destination)
        .env("AGENTSTART_CODEX_EXCHANGE_BACKUP", backup)
        .stdout(Stdio::null());
    let status = wait_windows_child(command.spawn()?)?;
    if status.success() {
        Ok(())
    } else {
        Err(CodexRuntimeError::InvalidConfig)
    }
}

#[cfg(target_os = "linux")]
pub(super) fn prepare_local(
    _source_path: &Path,
    _temporary_path: &Path,
    _temporary: &fs::File,
    _original: &ExistingFile,
) -> Result<(), CodexRuntimeError> {
    // Why: the staging inode stays private until its full ACL/xattr policy is installed after the
    // new contents are durable. Applying a permissive source mode before its restrictive named
    // ACLs would expose a short-lived but observable copy in the user-owned parent directory.
    Ok(())
}

#[cfg(target_os = "macos")]
pub(super) fn prepare_local(
    _source_path: &Path,
    _temporary_path: &Path,
    temporary: &fs::File,
    original: &ExistingFile,
) -> Result<(), CodexRuntimeError> {
    use std::os::fd::AsRawFd as _;

    // Why: Apple's `fcopyfile(COPYFILE_METADATA | COPYFILE_DATA)`, which backs `fs::copy`, is the
    // platform operation that carries ACLs, extended attributes/resource forks, and BSD flags.
    // `/dev/fd` keeps both sides tied to the nofollow handles instead of reopening attacker-raced
    // paths. Quarantine is deliberately retained: it is provenance policy, not disposable data.
    let source = PathBuf::from(format!("/dev/fd/{}", original.file.as_raw_fd()));
    let destination = PathBuf::from(format!("/dev/fd/{}", temporary.as_raw_fd()));
    fs::copy(source, destination)?;
    Ok(())
}

#[cfg(windows)]
pub(super) fn prepare_local(
    source_path: &Path,
    temporary_path: &Path,
    temporary: &fs::File,
    original: &ExistingFile,
) -> Result<(), CodexRuntimeError> {
    // Why: Rust's Windows copy is CopyFileExW. On supported Windows it preserves EAs, alternate
    // data streams (including Zone.Identifier), file attributes, encryption, and security resource
    // attributes. Bracketing its path-only API with both held nofollow identities rejects a
    // replaced or reparse-point source or destination before any staged file can be promoted.
    let source_guard = open_windows_guard(source_path)?;
    let temporary_guard = open_windows_guard(temporary_path)?;
    let source_handle = same_file::Handle::from_file(source_guard.try_clone()?)?;
    let temporary_handle = same_file::Handle::from_file(temporary_guard.try_clone()?)?;
    let held_temporary_handle = same_file::Handle::from_file(temporary.try_clone()?)?;
    if &source_handle != &original.handle || &temporary_handle != &held_temporary_handle {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    verify_destination(source_path, Some(&original.handle))?;
    verify_destination(temporary_path, Some(&temporary_handle))?;
    fs::copy(source_path, temporary_path)?;
    verify_destination(source_path, Some(&original.handle))?;
    verify_destination(temporary_path, Some(&temporary_handle))?;
    Ok(())
}

#[cfg(all(unix, not(any(target_os = "linux", target_os = "macos"))))]
pub(super) fn prepare_local(
    _source_path: &Path,
    _temporary_path: &Path,
    temporary: &fs::File,
    original: &ExistingFile,
) -> Result<(), CodexRuntimeError> {
    preserve_permissions(temporary, &original.metadata)
}

#[cfg(not(any(unix, windows)))]
pub(super) fn prepare_local(
    _source_path: &Path,
    _temporary_path: &Path,
    temporary: &fs::File,
    original: &ExistingFile,
) -> Result<(), CodexRuntimeError> {
    preserve_permissions(temporary, &original.metadata)
}

#[cfg(target_os = "linux")]
pub(super) fn finish_local(
    _source_path: &Path,
    _temporary_path: &Path,
    temporary: &fs::File,
    original: &ExistingFile,
) -> Result<(), CodexRuntimeError> {
    // Why: keep mode 0600 until the source ACL is installed. Applying a permissive source mode
    // before its restrictive named ACL would briefly expose the staged contents.
    preserve_owner(temporary, &original.metadata)?;
    preserve_linux_xattrs(&original.file, temporary)?;
    temporary.set_permissions(original.metadata.permissions())?;
    verify_linux_xattrs(&original.file, temporary)?;
    preserve_linux_flags(&original.file, temporary)?;
    verify_linux_flags(&original.file, temporary)?;
    verify_permissions(temporary, &original.metadata)
}

#[cfg(target_os = "macos")]
pub(super) fn finish_local(
    _source_path: &Path,
    _temporary_path: &Path,
    temporary: &fs::File,
    original: &ExistingFile,
) -> Result<(), CodexRuntimeError> {
    // Why: rewriting content can clear set-id mode bits, while the copied ACLs, xattrs, resource
    // forks, quarantine, and BSD flags remain attached to this staging inode.
    preserve_permissions(temporary, &original.metadata)?;
    verify_permissions(temporary, &original.metadata)
}

#[cfg(windows)]
pub(super) fn finish_local(
    source_path: &Path,
    temporary_path: &Path,
    temporary: &fs::File,
    original: &ExistingFile,
) -> Result<(), CodexRuntimeError> {
    preserve_permissions(temporary, &original.metadata)?;
    let source_guard = open_windows_guard(source_path)?;
    let temporary_guard = open_windows_guard(temporary_path)?;
    let source_handle = same_file::Handle::from_file(source_guard.try_clone()?)?;
    let temporary_handle = same_file::Handle::from_file(temporary_guard.try_clone()?)?;
    let held_temporary_handle = same_file::Handle::from_file(temporary.try_clone()?)?;
    if &source_handle != &original.handle || &temporary_handle != &held_temporary_handle {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    verify_destination(source_path, Some(&original.handle))?;
    verify_destination(temporary_path, Some(&temporary_handle))?;
    preserve_windows_metadata(source_path, temporary_path)?;
    verify_destination(source_path, Some(&original.handle))?;
    verify_destination(temporary_path, Some(&temporary_handle))?;
    verify_windows_attributes(temporary, &original.metadata)
}

#[cfg(all(unix, not(any(target_os = "linux", target_os = "macos"))))]
pub(super) fn finish_local(
    _source_path: &Path,
    _temporary_path: &Path,
    temporary: &fs::File,
    original: &ExistingFile,
) -> Result<(), CodexRuntimeError> {
    preserve_permissions(temporary, &original.metadata)?;
    verify_permissions(temporary, &original.metadata)
}

#[cfg(not(any(unix, windows)))]
pub(super) fn finish_local(
    _source_path: &Path,
    _temporary_path: &Path,
    temporary: &fs::File,
    original: &ExistingFile,
) -> Result<(), CodexRuntimeError> {
    preserve_permissions(temporary, &original.metadata)
}

#[cfg(not(target_os = "linux"))]
fn preserve_permissions(file: &fs::File, original: &fs::Metadata) -> Result<(), CodexRuntimeError> {
    #[cfg(unix)]
    preserve_owner(file, original)?;
    file.set_permissions(original.permissions())?;
    Ok(())
}

#[cfg(unix)]
fn preserve_owner(file: &fs::File, original: &fs::Metadata) -> Result<(), CodexRuntimeError> {
    use rustix::fs::{Gid, Uid};
    use std::os::unix::fs::MetadataExt as _;

    let mut created = file.metadata()?;
    if created.uid() != original.uid() || created.gid() != original.gid() {
        rustix::fs::fchown(
            file,
            Some(Uid::from_raw(original.uid())),
            Some(Gid::from_raw(original.gid())),
        )
        .map_err(std::io::Error::from)?;
        created = file.metadata()?;
        if created.uid() != original.uid() || created.gid() != original.gid() {
            return Err(CodexRuntimeError::InvalidConfig);
        }
    }
    Ok(())
}

#[cfg(unix)]
fn verify_permissions(file: &fs::File, original: &fs::Metadata) -> Result<(), CodexRuntimeError> {
    use std::os::unix::fs::MetadataExt as _;

    let staged = file.metadata()?;
    if staged.uid() != original.uid()
        || staged.gid() != original.gid()
        || staged.mode() & 0o7777 != original.mode() & 0o7777
    {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    Ok(())
}

#[cfg(windows)]
fn verify_windows_attributes(
    file: &fs::File,
    original: &fs::Metadata,
) -> Result<(), CodexRuntimeError> {
    use std::os::windows::fs::MetadataExt as _;

    if file.metadata()?.file_attributes() != original.file_attributes() {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn preserve_linux_flags(
    original: &fs::File,
    temporary: &fs::File,
) -> Result<(), CodexRuntimeError> {
    use rustix::fs::IFlags;

    let Some(original_flags) = read_linux_flags(original)? else {
        return Ok(());
    };
    let temporary_flags = read_linux_flags(temporary)?.ok_or(CodexRuntimeError::InvalidConfig)?;
    let mask = linux_copyable_flags();
    let expected = original_flags.bits() & mask.bits();
    let updated = IFlags::from_bits_retain((temporary_flags.bits() & !mask.bits()) | expected);
    if updated != temporary_flags {
        rustix::fs::ioctl_setflags(temporary, updated).map_err(std::io::Error::from)?;
    }
    verify_linux_flags(original, temporary)
}

#[cfg(target_os = "linux")]
fn verify_linux_flags(original: &fs::File, temporary: &fs::File) -> Result<(), CodexRuntimeError> {
    let original_flags = read_linux_flags(original)?;
    let temporary_flags = read_linux_flags(temporary)?;
    match (original_flags, temporary_flags) {
        (None, None) => Ok(()),
        (Some(original), Some(temporary))
            if original.bits() & linux_copyable_flags().bits()
                == temporary.bits() & linux_copyable_flags().bits() =>
        {
            Ok(())
        }
        _ => Err(CodexRuntimeError::InvalidConfig),
    }
}

#[cfg(target_os = "linux")]
fn read_linux_flags(file: &fs::File) -> Result<Option<rustix::fs::IFlags>, CodexRuntimeError> {
    match rustix::fs::ioctl_getflags(file) {
        Ok(flags) => Ok(Some(flags)),
        Err(rustix::io::Errno::NOTTY | rustix::io::Errno::OPNOTSUPP) => Ok(None),
        Err(error) => Err(std::io::Error::from(error).into()),
    }
}

#[cfg(target_os = "linux")]
fn linux_copyable_flags() -> rustix::fs::IFlags {
    use rustix::fs::IFlags;

    // Why: rustix exposes the Linux flags intended for FS_IOC_SETFLAGS. NOCOMP and DAX are also
    // mutable UAPI policy flags but are not named by rustix yet. Kernel-maintained layout/state
    // bits (extents, inline data, encryption, verity, and EA-inode) deliberately remain those of
    // the new same-directory inode: they cannot be synthesized safely and immutable verity files
    // already fail the write-authority open above.
    const FS_NOCOMP_FL: u32 = 0x0000_0400;
    const FS_DAX_FL: u32 = 0x0200_0000;
    IFlags::from_bits_retain(IFlags::all().bits() | FS_NOCOMP_FL | FS_DAX_FL)
}

#[cfg(target_os = "linux")]
fn preserve_linux_xattrs(
    original: &fs::File,
    temporary: &fs::File,
) -> Result<(), CodexRuntimeError> {
    use rustix::fs::XattrFlags;

    let original_attributes = read_linux_xattrs(original)?;
    let temporary_attributes = read_linux_xattrs(temporary)?;
    for (name, _) in temporary_attributes {
        if !original_attributes
            .iter()
            .any(|(original_name, _)| original_name == &name)
        {
            rustix::fs::fremovexattr(temporary, &name).map_err(std::io::Error::from)?;
        }
    }
    for (name, value) in &original_attributes {
        rustix::fs::fsetxattr(temporary, name, value, XattrFlags::empty())
            .map_err(std::io::Error::from)?;
    }
    verify_linux_xattrs_from_snapshot(&original_attributes, temporary)
}

#[cfg(target_os = "linux")]
fn verify_linux_xattrs(original: &fs::File, temporary: &fs::File) -> Result<(), CodexRuntimeError> {
    let original_attributes = read_linux_xattrs(original)?;
    verify_linux_xattrs_from_snapshot(&original_attributes, temporary)
}

#[cfg(target_os = "linux")]
fn verify_linux_xattrs_from_snapshot(
    original_attributes: &[(std::ffi::OsString, Vec<u8>)],
    temporary: &fs::File,
) -> Result<(), CodexRuntimeError> {
    let staged_attributes = read_linux_xattrs(temporary)?;
    if staged_attributes.len() != original_attributes.len()
        || original_attributes
            .iter()
            .any(|attribute| !staged_attributes.iter().any(|staged| staged == attribute))
    {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn read_linux_xattrs(
    file: &fs::File,
) -> Result<Vec<(std::ffi::OsString, Vec<u8>)>, CodexRuntimeError> {
    use std::os::unix::ffi::OsStringExt as _;

    let names = read_linux_xattr_buffer(file, None)?;
    if !names.is_empty() && !names.ends_with(&[0]) {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    names
        .split(|byte| *byte == 0)
        .filter(|name| !name.is_empty())
        .map(|name| {
            let name = std::ffi::OsString::from_vec(name.to_vec());
            let value = read_linux_xattr_buffer(file, Some(name.as_os_str()))?;
            Ok((name, value))
        })
        .collect()
}

#[cfg(target_os = "linux")]
fn read_linux_xattr_buffer(
    file: &fs::File,
    name: Option<&std::ffi::OsStr>,
) -> Result<Vec<u8>, CodexRuntimeError> {
    const ATTRIBUTE_READ_ATTEMPTS: usize = 3;

    for _ in 0..ATTRIBUTE_READ_ATTEMPTS {
        let mut empty = [0_u8; 0];
        let size = match name {
            Some(name) => rustix::fs::fgetxattr(file, name, &mut empty),
            None => rustix::fs::flistxattr(file, &mut empty),
        };
        let size = match size {
            Ok(size) => size,
            Err(rustix::io::Errno::OPNOTSUPP) if name.is_none() => {
                return Ok(Vec::new());
            }
            Err(error) => return Err(std::io::Error::from(error).into()),
        };
        let mut buffer = vec![0_u8; size];
        let read = match name {
            Some(name) => rustix::fs::fgetxattr(file, name, &mut buffer),
            None => rustix::fs::flistxattr(file, &mut buffer),
        };
        match read {
            Ok(read) => {
                buffer.truncate(read);
                return Ok(buffer);
            }
            Err(rustix::io::Errno::RANGE) => continue,
            Err(error) => return Err(std::io::Error::from(error).into()),
        }
    }
    Err(CodexRuntimeError::InvalidConfig)
}

pub(super) fn preserve_wsl(source: &Path, temporary: &Path) -> Result<(), CodexRuntimeError> {
    let (source_distro, source_path) =
        super::managed_files::wsl_location(source).ok_or(CodexRuntimeError::InvalidManagedHome)?;
    let (temporary_distro, temporary_path) = super::managed_files::wsl_location(temporary)
        .ok_or(CodexRuntimeError::InvalidManagedHome)?;
    if source_distro != temporary_distro {
        return Err(CodexRuntimeError::InvalidManagedHome);
    }
    // Why: Linux security labels, ACLs, and capabilities live in xattrs. The fd-backed copy and
    // independent exact xattr readback reject a `cp` build that silently omits them, while inode
    // identity checks keep every metadata operation on the admitted files.
    run_wsl(
        &source_distro,
        &[
            "sh",
            "-c",
            WSL_PRESERVE_METADATA_SCRIPT,
            "agentstart-codex-metadata",
            &source_path,
            &temporary_path,
        ],
    )
}

const WSL_PRESERVE_METADATA_SCRIPT: &str = r#"set -eu
source_path=$1
temporary_path=$2
[ -f "$source_path" ] && [ ! -L "$source_path" ]
[ -f "$temporary_path" ] && [ ! -L "$temporary_path" ]
cp=/usr/bin/cp; [ -x "$cp" ] || cp=/bin/cp; [ -x "$cp" ]
stat=/usr/bin/stat; [ -x "$stat" ] || stat=/bin/stat; [ -x "$stat" ]
lsattr=/usr/bin/lsattr; [ -x "$lsattr" ] || lsattr=/bin/lsattr; [ -x "$lsattr" ]
chattr=/usr/bin/chattr; [ -x "$chattr" ] || chattr=/bin/chattr; [ -x "$chattr" ]
getfattr=/usr/bin/getfattr; [ -x "$getfattr" ] || getfattr=/bin/getfattr
python=/usr/bin/python3; [ -x "$python" ] || python=/bin/python3
[ -x "$getfattr" ] || [ -x "$python" ]
sed=/usr/bin/sed; [ -x "$sed" ] || sed=/bin/sed; [ -x "$sed" ]
xattr_snapshot() {
  if [ -x "$getfattr" ]; then
    raw=$("$getfattr" --absolute-names -d -m - -e hex -- "$1" 2>/dev/null) || return 1
    printf '%s\n' "$raw" | "$sed" '/^# file:/d; /^$/d'
  else
    "$python" - "$1" <<'PY'
import os
import sys
path = sys.argv[1]
for name in sorted(os.listxattr(path)):
    encoded_name = os.fsencode(name).hex()
    print(f'{encoded_name}={os.getxattr(path, name).hex()}')
PY
  fi
}
source_identity=$("$stat" -c '%d:%i' -- "$source_path")
temporary_identity=$("$stat" -c '%d:%i' -- "$temporary_path")
exec 3<> "$source_path"
exec 4<> "$temporary_path"
[ "$("$stat" -Lc '%d:%i' -- /proc/self/fd/3)" = "$source_identity" ]
[ "$("$stat" -Lc '%d:%i' -- /proc/self/fd/4)" = "$temporary_identity" ]
[ "$("$stat" -Lc '%h' -- /proc/self/fd/3)" = 1 ]
[ "$("$stat" -Lc '%h' -- /proc/self/fd/4)" = 1 ]
"$cp" --attributes-only --preserve=mode,ownership,xattr -- /proc/self/fd/3 /proc/self/fd/4
[ "$("$stat" -c '%d:%i' -- "$source_path")" = "$source_identity" ]
[ "$("$stat" -c '%d:%i' -- "$temporary_path")" = "$temporary_identity" ]
source_xattrs=$(xattr_snapshot /proc/self/fd/3)
temporary_xattrs=$(xattr_snapshot /proc/self/fd/4)
[ "$source_xattrs" = "$temporary_xattrs" ]
source_attributes=$("$lsattr" -d -- /proc/self/fd/3)
source_attributes=${source_attributes%% *}
temporary_attributes=$("$lsattr" -d -- /proc/self/fd/4)
temporary_attributes=${temporary_attributes%% *}
attributes=aAcCdDijmPsStTux
add=
remove=
while [ -n "$attributes" ]; do
  attribute=${attributes%"${attributes#?}"}
  attributes=${attributes#?}
  case "$source_attributes" in *"$attribute"*) source_has=true;; *) source_has=false;; esac
  case "$temporary_attributes" in *"$attribute"*) temporary_has=true;; *) temporary_has=false;; esac
  if [ "$source_has" = true ] && [ "$temporary_has" = false ]; then add=$add$attribute; fi
  if [ "$source_has" = false ] && [ "$temporary_has" = true ]; then remove=$remove$attribute; fi
done
[ -z "$remove" ] || "$chattr" "-$remove" -- /proc/self/fd/4
[ -z "$add" ] || "$chattr" "+$add" -- /proc/self/fd/4
temporary_attributes=$("$lsattr" -d -- /proc/self/fd/4)
temporary_attributes=${temporary_attributes%% *}
attributes=aAcCdDijmPsStTux
while [ -n "$attributes" ]; do
  attribute=${attributes%"${attributes#?}"}
  attributes=${attributes#?}
  case "$source_attributes" in
    *"$attribute"*) case "$temporary_attributes" in *"$attribute"*) :;; *) exit 1;; esac;;
    *) case "$temporary_attributes" in *"$attribute"*) exit 1;; *) :;; esac;;
  esac
done
[ "$("$stat" -Lc '%u:%g:%a' -- /proc/self/fd/3)" = "$("$stat" -Lc '%u:%g:%a' -- /proc/self/fd/4)" ]
source_xattrs_final=$(xattr_snapshot /proc/self/fd/3)
temporary_xattrs_final=$(xattr_snapshot /proc/self/fd/4)
[ "$source_xattrs_final" = "$source_xattrs" ]
[ "$temporary_xattrs_final" = "$source_xattrs" ]
source_attributes_final=$("$lsattr" -d -- /proc/self/fd/3)
source_attributes_final=${source_attributes_final%% *}
[ "$source_attributes_final" = "$source_attributes" ]
[ "$("$stat" -Lc '%h' -- /proc/self/fd/3)" = 1 ]
[ "$("$stat" -Lc '%h' -- /proc/self/fd/4)" = 1 ]
[ "$("$stat" -c '%d:%i' -- "$source_path")" = "$source_identity" ]
[ "$("$stat" -c '%d:%i' -- "$temporary_path")" = "$temporary_identity" ]
"#;

#[cfg(windows)]
fn preserve_windows_metadata(source: &Path, temporary: &Path) -> Result<(), CodexRuntimeError> {
    // Why: CopyFileExW does not promise to carry the file's DACL, and rewriting the primary stream
    // unconditionally sets Archive. The standard .NET security and attribute APIs restore owner,
    // group, explicit/inherited ACEs, DACL protection, and the stream-mutated Archive bit, then
    // verify the exact original attribute word without parsing localized command output. We
    // intentionally do not request `-Audit`: SACL audit entries and mandatory-integrity labels
    // require SeSecurityPrivilege, and elevating the daemon would be a larger security regression.
    // The same-directory staging file therefore keeps current parent/token integrity policy while
    // CopyFileExW retains EAs and ADS provenance.
    const SCRIPT: &str = r#"$ErrorActionPreference = 'Stop'
$source = Get-Item -LiteralPath $env:AGENTSTART_CODEX_METADATA_SOURCE -Force
$temporary = Get-Item -LiteralPath $env:AGENTSTART_CODEX_METADATA_TEMPORARY -Force
$reparse = [System.IO.FileAttributes]::ReparsePoint
if (($source.Attributes -band $reparse) -ne 0 -or ($temporary.Attributes -band $reparse) -ne 0) {
  exit 2
}
$acl = Get-Acl -LiteralPath $source.FullName -ErrorAction Stop
$archive = [System.IO.FileAttributes]::Archive
$sourceAttributes = [System.IO.File]::GetAttributes($source.FullName)
Set-Acl -LiteralPath $temporary.FullName -AclObject $acl -ErrorAction Stop
$stagedAcl = Get-Acl -LiteralPath $temporary.FullName -ErrorAction Stop
if ($acl.Sddl -cne $stagedAcl.Sddl) {
  exit 3
}
$stagedAttributes = [System.IO.File]::GetAttributes($temporary.FullName)
if (($sourceAttributes -band $archive) -ne 0) {
  $stagedAttributes = $stagedAttributes -bor $archive
} else {
  $stagedAttributes = $stagedAttributes -band (-bnot [int]$archive)
}
if ([int]$stagedAttributes -eq 0) {
  $stagedAttributes = [System.IO.FileAttributes]::Normal
}
[System.IO.File]::SetAttributes(
  $temporary.FullName,
  [System.IO.FileAttributes]$stagedAttributes
)
$finalAttributes = [System.IO.File]::GetAttributes($temporary.FullName)
if ([int]$sourceAttributes -ne [int]$finalAttributes) {
  exit 4
}
"#;

    let mut command = windows_powershell_command(SCRIPT);
    command
        .env("AGENTSTART_CODEX_METADATA_SOURCE", source)
        .env("AGENTSTART_CODEX_METADATA_TEMPORARY", temporary)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let status = wait_windows_child(command.spawn()?)?;
    if status.success() {
        Ok(())
    } else {
        Err(CodexRuntimeError::InvalidConfig)
    }
}

#[cfg(windows)]
fn windows_powershell_command(script: &str) -> Command {
    let mut command = Command::new(windows_powershell_executable());
    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .stdin(Stdio::null())
        .stderr(Stdio::null());
    command
}

#[cfg(windows)]
fn wait_windows_child(
    mut child: std::process::Child,
) -> Result<std::process::ExitStatus, CodexRuntimeError> {
    wait_windows_child_ref(&mut child)
}

#[cfg(windows)]
fn wait_windows_child_ref(
    child: &mut std::process::Child,
) -> Result<std::process::ExitStatus, CodexRuntimeError> {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(status);
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(CodexRuntimeError::InvalidConfig);
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

#[cfg(windows)]
fn windows_powershell_executable() -> PathBuf {
    std::env::var("SystemRoot")
        .ok()
        .map(|root| root.trim().to_owned())
        .filter(|root| !root.is_empty())
        .map(|root| {
            PathBuf::from(root)
                .join("System32")
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe")
        })
        .unwrap_or_else(|| PathBuf::from("powershell.exe"))
}

#[cfg(windows)]
fn open_windows_guard(path: &Path) -> Result<fs::File, CodexRuntimeError> {
    use std::os::windows::fs::{MetadataExt as _, OpenOptionsExt as _};

    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    const FILE_SHARE_READ: u32 = 0x0000_0001;
    const FILE_SHARE_WRITE: u32 = 0x0000_0002;
    let mut options = fs::OpenOptions::new();
    options
        .read(true)
        .write(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    let file = options.open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    {
        return Err(CodexRuntimeError::InvalidConfig);
    }
    Ok(file)
}
